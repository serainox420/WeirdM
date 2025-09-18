<?php
declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function parseIniSize(string $value): int
{
    $trimmed = trim($value);
    if ($trimmed === '') {
        return 0;
    }
    if (is_numeric($trimmed)) {
        return (int)max(0, round((float)$trimmed));
    }
    $unit = strtolower($trimmed[strlen($trimmed) - 1]);
    $numeric = (float)substr($trimmed, 0, -1);
    $multipliers = ['g' => 1024 ** 3, 'm' => 1024 ** 2, 'k' => 1024];
    if (isset($multipliers[$unit])) {
        return (int)max(0, round($numeric * $multipliers[$unit]));
    }
    return (int)max(0, round($numeric));
}

function gatherLimit(string $key): int
{
    $value = ini_get($key);
    if ($value === false) {
        return 0;
    }
    return parseIniSize((string)$value);
}

$uploadMax = gatherLimit('upload_max_filesize');
$postMax = gatherLimit('post_max_size');

$limits = array_filter([$uploadMax, $postMax], static fn(int $limit) => $limit > 0);
$effective = $limits ? min($limits) : 0;

$sources = [];
if ($effective > 0) {
    if ($uploadMax > 0 && $uploadMax === $effective) {
        $sources[] = 'upload_max_filesize';
    }
    if ($postMax > 0 && $postMax === $effective) {
        $sources[] = 'post_max_size';
    }
}

echo json_encode([
    'uploadMaxBytes' => $uploadMax,
    'postMaxBytes' => $postMax,
    'effectiveBytes' => $effective,
    'effectiveSources' => $sources,
], JSON_UNESCAPED_SLASHES);

