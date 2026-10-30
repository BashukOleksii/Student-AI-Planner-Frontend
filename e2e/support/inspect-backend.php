<?php
// Read-only metadata probe. Never clears config, migrates, dispatches or reads user records.
$root = $argv[1] ?? '';
try {
    require $root.'/vendor/autoload.php';
    $app = require $root.'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $connection = Illuminate\Support\Facades\DB::connection();
    if ($connection->getDriverName() !== 'mysql') throw new RuntimeException();
    $applied = Illuminate\Support\Facades\DB::table('migrations')->pluck('migration')->all();
    $files = array_map(fn ($file) => basename($file, '.php'), glob($root.'/database/migrations/*.php'));
    // Metadata only: never query account, session, notification or application rows.
    $required = [
        'users' => ['id', 'timezone'],
        'sessions' => ['id', 'user_id', 'payload', 'last_activity'],
        'planning_preferences' => ['user_id', 'max_daily_study_minutes', 'max_weekly_study_minutes', 'preferred_break_minutes', 'min_session_minutes', 'max_session_minutes'],
        'study_availability_windows' => ['user_id', 'day_of_week', 'starts_at', 'ends_at'],
        'tasks' => ['user_id', 'status', 'deadline_at', 'completed_at', 'estimated_minutes'],
        'subtasks' => ['task_id', 'status', 'deadline_at', 'completed_at', 'estimated_minutes'],
        'study_sessions' => ['user_id', 'task_id', 'subtask_id', 'starts_at', 'ends_at', 'status', 'completed_at', 'actual_minutes', 'rescheduled_from_session_id'],
        'lessons' => ['user_id', 'subject_id', 'teacher_id', 'academic_period_id', 'starts_at', 'ends_at', 'status', 'replaces_lesson_id', 'import_fingerprint'],
        'schedule_import_batches' => ['user_id', 'academic_period_id', 'status', 'committed_at'],
        'schedule_import_rows' => ['schedule_import_batch_id', 'raw_data', 'normalized_data', 'validation_errors'],
        'reminders' => ['user_id', 'task_id', 'subtask_id', 'study_session_id', 'trigger_at', 'anchor', 'offset_minutes', 'status', 'sent_at'],
        'notifications' => ['id', 'notifiable_type', 'notifiable_id', 'reminder_id', 'data', 'read_at'],
    ];
    $columns = [];
    foreach ($required as $table => $names) {
        $present = Illuminate\Support\Facades\Schema::getColumnListing($table);
        $columns[$table] = array_combine($names, array_map(fn ($name) => in_array($name, $present, true), $names));
    }
    echo json_encode([
        'environment' => $app->environment(),
        'framework_version' => $app->version(),
        'app_url' => config('app.url'),
        'app_timezone' => config('app.timezone'),
        'connection' => $connection->getName(),
        'driver' => $connection->getDriverName(),
        'database' => $connection->selectOne('SELECT DATABASE() AS name')->name,
        'pending_migrations' => array_values(array_diff($files, $applied)),
        'applied_migration_count' => count($applied),
        'timezone_column' => Illuminate\Support\Facades\Schema::hasColumn('users', 'timezone'),
        'required_columns' => $columns,
        'session' => array_intersect_key(config('session'), array_flip(['driver', 'domain', 'path', 'secure', 'http_only', 'same_site'])),
        'sanctum_stateful' => config('sanctum.stateful'),
        'cors' => array_intersect_key(config('cors'), array_flip(['allowed_origins', 'supports_credentials', 'paths'])),
    ], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    fwrite(STDERR, "Read-only backend identity probe failed; inspect configuration locally.\n");
    exit(1);
}
