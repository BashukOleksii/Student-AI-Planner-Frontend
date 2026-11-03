<?php
// Read-only observer for the explicitly granted disposable Stage 11 namespace.
// No SQL writes, pending-action construction, schema changes or provider calls.
try {
    $root = $argv[1] ?? '';
    $expected = $argv[2] ?? '';
    $owner = filter_var($argv[3] ?? '', FILTER_VALIDATE_INT);
    if (!preg_match('/\Astudent_planner_isolated_stage11_[a-z0-9_]{1,24}\z/', $expected) || !$owner || $owner < 1) throw new RuntimeException();
    require $root.'/vendor/autoload.php';
    $app = require $root.'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $db = Illuminate\Support\Facades\DB::connection();
    if ($app->environment() !== 'testing' || $db->getDriverName() !== 'mysql'
        || $db->selectOne('SELECT DATABASE() AS name')->name !== $expected
        || get_class($app->make(App\Services\AI\LlmProvider::class)) !== 'Stage11Acceptance\ScriptedLlmProvider') throw new RuntimeException();
    echo json_encode([
        'lessons' => $db->table('lessons')->where('user_id', $owner)->orderBy('id')->get([
            'id', 'subject_id', 'teacher_id', 'academic_period_id', 'type', 'room', 'starts_at', 'ends_at', 'status', 'replaces_lesson_id', 'deleted_at'
        ]),
        'study_sessions' => $db->table('study_sessions')->where('user_id', $owner)->orderBy('id')->get(['id', 'status', 'starts_at', 'ends_at']),
    ], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    fwrite(STDERR, "BLOCKED: Stage 11 SQL identity/provider observer refused. Verify disposable testing database and non-network provider seam.\n");
    exit(1);
}
