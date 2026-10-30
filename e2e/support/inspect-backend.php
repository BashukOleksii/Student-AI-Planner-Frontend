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
    echo json_encode([
        'environment' => $app->environment(),
        'app_url' => config('app.url'),
        'connection' => $connection->getName(),
        'driver' => $connection->getDriverName(),
        'database' => $connection->selectOne('SELECT DATABASE() AS name')->name,
        'pending_migrations' => array_values(array_diff($files, $applied)),
        'timezone_column' => Illuminate\Support\Facades\Schema::hasColumn('users', 'timezone'),
    ], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    fwrite(STDERR, "Read-only backend identity probe failed; inspect configuration locally.\n");
    exit(1);
}
