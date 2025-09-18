<?php
declare(strict_types=1);

set_time_limit(0);

function respondError(string $message, int $status = 400): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

if (!function_exists('imagecreatefrompng')) {
    respondError('PHP GD extension with PNG support is required.', 500);
}

function recursiveRemove(string $path): void
{
    if (!is_dir($path)) {
        if (is_file($path)) {
            @unlink($path);
        }
        return;
    }
    $items = scandir($path);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $full = $path . DIRECTORY_SEPARATOR . $item;
        if (is_dir($full)) {
            recursiveRemove($full);
        } else {
            @unlink($full);
        }
    }
    @rmdir($path);
}

function buildCommand(array $args): string
{
    $parts = [];
    foreach ($args as $index => $arg) {
        $parts[] = $index === 0 ? escapeshellcmd((string)$arg) : escapeshellarg((string)$arg);
    }
    return implode(' ', $parts);
}

function runCommand(string $command, string $errorMessage): void
{
    $descriptor = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open($command, $descriptor, $pipes);
    if (!is_resource($process)) {
        respondError($errorMessage, 500);
    }
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);
    if ($status !== 0) {
        respondError($errorMessage . ($stderr ? "\n" . trim($stderr) : ''), 500);
    }
}

function runCommandOutput(string $command, string $errorMessage): string
{
    $descriptor = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open($command, $descriptor, $pipes);
    if (!is_resource($process)) {
        respondError($errorMessage, 500);
    }
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);
    if ($status !== 0) {
        respondError($errorMessage . ($stderr ? "\n" . trim($stderr) : ''), 500);
    }
    return trim((string)$stdout);
}

function clamp(float $value, float $min, float $max): float
{
    return max($min, min($max, $value));
}

function detectBinary(string $binary): string
{
    $path = trim((string)shell_exec('command -v ' . escapeshellarg($binary)));
    if ($path === '') {
        respondError(sprintf('Unable to find %s in PATH.', $binary), 500);
    }
    return $path;
}

function detectFps(string $ffprobe, string $inputPath): float
{
    $command = buildCommand([
        $ffprobe,
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=avg_frame_rate',
        '-of', 'default=nokey=1:noprint_wrappers=1',
        $inputPath,
    ]);
    $rate = runCommandOutput($command, 'Failed to detect frame rate.');
    if ($rate === '') {
        return 15.0;
    }
    if (strpos($rate, '/') !== false) {
        [$num, $den] = explode('/', $rate, 2);
        $num = (float)$num;
        $den = (float)$den;
        if ($den <= 0.000001) {
            return 15.0;
        }
        $value = $num / $den;
        return $value > 0 ? $value : 15.0;
    }
    $value = (float)$rate;
    return $value > 0 ? $value : 15.0;
}

function formatFps(float $fps): string
{
    return rtrim(rtrim(sprintf('%.6f', $fps), '0'), '.');
}

function normalizeBounceSettings(array $input): array
{
    $defaults = [
        'horizontal' => ['style' => 'none', 'speed' => 10, 'staticSize' => 100, 'min' => 70, 'max' => 130],
        'vertical' => ['style' => 'sin', 'speed' => 10, 'staticSize' => 100, 'min' => 70, 'max' => 130],
    ];
    $result = [];
    foreach (['horizontal', 'vertical'] as $axis) {
        $source = $input[$axis] ?? [];
        $style = $source['style'] ?? $defaults[$axis]['style'];
        if (!in_array($style, ['sin', 'cos', 'none'], true)) {
            $style = $defaults[$axis]['style'];
        }
        $speed = clamp((float)($source['speed'] ?? $defaults[$axis]['speed']), 1, 200);
        $static = clamp((float)($source['staticSize'] ?? $defaults[$axis]['staticSize']), 1, 400);
        $min = clamp((float)($source['min'] ?? $defaults[$axis]['min']), 1, 400);
        $max = clamp((float)($source['max'] ?? $defaults[$axis]['max']), 1, 400);
        if ($min > $max) {
            [$min, $max] = [$max, $min];
        }
        $result[$axis] = [
            'style' => $style,
            'speed' => $speed,
            'staticSize' => $static,
            'min' => $min,
            'max' => $max,
        ];
    }
    return $result;
}

function normalizeRandomSettings(array $input): array
{
    $defaults = [
        'horizontal' => ['enabled' => true, 'min' => 60, 'max' => 140],
        'vertical' => ['enabled' => true, 'min' => 60, 'max' => 140],
    ];
    $result = [];
    foreach (['horizontal', 'vertical'] as $axis) {
        $source = $input[$axis] ?? [];
        $enabled = array_key_exists('enabled', $source) ? (bool)$source['enabled'] : $defaults[$axis]['enabled'];
        $min = clamp((float)($source['min'] ?? $defaults[$axis]['min']), 1, 400);
        $max = clamp((float)($source['max'] ?? $defaults[$axis]['max']), 1, 400);
        if ($min > $max) {
            [$min, $max] = [$max, $min];
        }
        $result[$axis] = ['enabled' => $enabled, 'min' => $min, 'max' => $max];
    }
    return $result;
}

function normalizeTrimSettings(array $input): array
{
    $fuzz = clamp((float)($input['fuzz'] ?? 3), 0, 100);
    $padding = clamp((float)($input['padding'] ?? 1), 0, 50);
    return ['fuzz' => $fuzz, 'padding' => $padding];
}

function normalizeTimeline(array $input): array
{
    $clean = [];
    foreach ($input as $row) {
        if (!is_array($row)) {
            continue;
        }
        $time = clamp((float)($row['time'] ?? 0), 0, 100);
        $width = clamp((float)($row['width'] ?? 100), 1, 400);
        $height = clamp((float)($row['height'] ?? 100), 1, 400);
        $easing = $row['easing'] ?? 'linear';
        if (!in_array($easing, ['linear', 'easeIn', 'easeOut', 'easeInOut'], true)) {
            $easing = 'linear';
        }
        $clean[] = ['time' => $time, 'width' => $width, 'height' => $height, 'easing' => $easing];
    }
    usort($clean, static fn($a, $b) => $a['time'] <=> $b['time']);
    $deduped = [];
    foreach ($clean as $entry) {
        if (!$deduped) {
            $deduped[] = $entry;
            continue;
        }
        $lastIndex = count($deduped) - 1;
        if (abs($entry['time'] - $deduped[$lastIndex]['time']) < 0.0001) {
            $deduped[$lastIndex] = $entry;
        } else {
            $deduped[] = $entry;
        }
    }
    return $deduped;
}

function easingValue(string $type, float $t): float
{
    $t = clamp($t, 0.0, 1.0);
    return match ($type) {
        'easeIn' => $t * $t,
        'easeOut' => 1 - pow(1 - $t, 2),
        'easeInOut' => $t < 0.5 ? 2 * $t * $t : 1 - pow(-2 * $t + 2, 2) / 2,
        default => $t,
    };
}

function computeTimelinePercent(int $frameIndex, int $frameCount, array $keyframes): array
{
    if (!$keyframes) {
        return [100.0, 100.0];
    }
    if (count($keyframes) === 1) {
        $only = $keyframes[0];
        return [$only['width'], $only['height']];
    }
    $total = max(1, $frameCount - 1);
    $progress = (($frameIndex - 1) / $total) * 100;
    $previous = $keyframes[0];
    for ($i = 1, $len = count($keyframes); $i < $len; $i++) {
        $current = $keyframes[$i];
        if ($progress <= $current['time'] || $i === $len - 1) {
            $span = max(1, $current['time'] - $previous['time']);
            $local = ($progress - $previous['time']) / $span;
            $eased = easingValue($current['easing'], clamp($local, 0.0, 1.0));
            $width = $previous['width'] + ($current['width'] - $previous['width']) * $eased;
            $height = $previous['height'] + ($current['height'] - $previous['height']) * $eased;
            return [max(1.0, round($width)), max(1.0, round($height))];
        }
        $previous = $current;
    }
    $last = $keyframes[count($keyframes) - 1];
    return [max(1.0, round($last['width'])), max(1.0, round($last['height']))];
}

function computeBouncePercent(int $frameIndex, float $fps, array $axis): float
{
    if ($axis['style'] === 'none') {
        return max(1.0, round($axis['staticSize']));
    }
    $min = min($axis['min'], $axis['max']);
    $max = max($axis['min'], $axis['max']);
    $amplitude = ($max - $min) / 2.0;
    $center = $min + $amplitude;
    $speed = max(0.0, (float)$axis['speed']);
    $t = ($frameIndex * $speed) / max($fps, 0.0001);
    $wave = $axis['style'] === 'cos' ? cos($t) : sin($t);
    $value = $center + $wave * $amplitude;
    return max(1.0, round($value));
}

function getPixelColor($image, int $x, int $y): array
{
    $index = imagecolorat($image, $x, $y);
    $color = imagecolorsforindex($image, $index);
    $alpha = 255 - (int)round(($color['alpha'] / 127) * 255);
    return ['r' => $color['red'], 'g' => $color['green'], 'b' => $color['blue'], 'a' => $alpha];
}

function colorDifference(array $a, array $b): float
{
    return abs($a['r'] - $b['r']) + abs($a['g'] - $b['g']) + abs($a['b'] - $b['b']) + abs($a['a'] - $b['a']);
}

function trimImage($image, array $settings, int $frameNumber): array
{
    $width = imagesx($image);
    $height = imagesy($image);
    if ($width <= 0 || $height <= 0) {
        return [$image, $width, $height];
    }
    $background = getPixelColor($image, 0, 0);
    $threshold = clamp($settings['fuzz'] / 100.0 * 1020.0, 0, 1020);

    $top = 0;
    for (; $top < $height; $top++) {
        $allMatch = true;
        for ($x = 0; $x < $width; $x++) {
            if (colorDifference(getPixelColor($image, $x, $top), $background) > $threshold) {
                $allMatch = false;
                break;
            }
        }
        if (!$allMatch) {
            break;
        }
    }

    $bottom = $height - 1;
    for (; $bottom >= $top; $bottom--) {
        $allMatch = true;
        for ($x = 0; $x < $width; $x++) {
            if (colorDifference(getPixelColor($image, $x, $bottom), $background) > $threshold) {
                $allMatch = false;
                break;
            }
        }
        if (!$allMatch) {
            break;
        }
    }

    $left = 0;
    for (; $left < $width; $left++) {
        $allMatch = true;
        for ($y = $top; $y <= $bottom; $y++) {
            if (colorDifference(getPixelColor($image, $left, $y), $background) > $threshold) {
                $allMatch = false;
                break;
            }
        }
        if (!$allMatch) {
            break;
        }
    }

    $right = $width - 1;
    for (; $right >= $left; $right--) {
        $allMatch = true;
        for ($y = $top; $y <= $bottom; $y++) {
            if (colorDifference(getPixelColor($image, $right, $y), $background) > $threshold) {
                $allMatch = false;
                break;
            }
        }
        if (!$allMatch) {
            break;
        }
    }

    if ($left >= $right || $top >= $bottom) {
        return [$image, $width, $height];
    }

    $padding = (int)round($settings['padding']);
    if ($padding > 0) {
        $left = min($right - 1, $left + $padding);
        $top = min($bottom - 1, $top + $padding);
        $right = max($left + 1, $right - $padding);
        $bottom = max($top + 1, $bottom - $padding);
    }

    $cropWidth = max(1, $right - $left + 1);
    $cropHeight = max(1, $bottom - $top + 1);

    $trimmed = imagecreatetruecolor($cropWidth, $cropHeight);
    imagesavealpha($trimmed, true);
    imagealphablending($trimmed, false);
    $transparent = imagecolorallocatealpha($trimmed, 0, 0, 0, 127);
    imagefill($trimmed, 0, 0, $transparent);
    imagecopy($trimmed, $image, 0, 0, $left, $top, $cropWidth, $cropHeight);
    imagedestroy($image);

    return [$trimmed, $cropWidth, $cropHeight];
}

function concatLine(string $path): string
{
    return "file '" . str_replace("'", "'\\''", $path) . "'\n";
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondError('Use POST to submit a video.', 405);
}

if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
    respondError('Upload failed. Ensure a video file is selected.');
}

$settingsJson = $_POST['settings'] ?? '';
$options = json_decode($settingsJson, true);
if (!is_array($options)) {
    respondError('Invalid settings payload.');
}

$ffmpeg = detectBinary('ffmpeg');
$ffprobe = detectBinary('ffprobe');

$workspace = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'weirdm_' . bin2hex(random_bytes(8));
if (!mkdir($workspace, 0777) && !is_dir($workspace)) {
    respondError('Unable to create workspace.', 500);
}
register_shutdown_function(static function () use ($workspace) {
    recursiveRemove($workspace);
});

$inputPath = $workspace . DIRECTORY_SEPARATOR . 'input';
if (!move_uploaded_file($_FILES['video']['tmp_name'], $inputPath)) {
    respondError('Failed to store uploaded video.', 500);
}

$framesDir = $workspace . DIRECTORY_SEPARATOR . 'frames';
$processedDir = $workspace . DIRECTORY_SEPARATOR . 'processed';
if (!mkdir($framesDir) || !mkdir($processedDir)) {
    respondError('Unable to prepare workspace.', 500);
}

$extractCommand = buildCommand([
    $ffmpeg,
    '-y',
    '-i', $inputPath,
    '-vsync', '0',
    '-f', 'image2',
    '-pix_fmt', 'rgba',
    $framesDir . DIRECTORY_SEPARATOR . '%06d.png',
]);
runCommand($extractCommand, 'Failed to extract frames from source video.');

$framePaths = glob($framesDir . DIRECTORY_SEPARATOR . '*.png');
if ($framePaths === false || !count($framePaths)) {
    respondError('No video frames were decoded.');
}
natsort($framePaths);
$framePaths = array_values($framePaths);
$frameCount = count($framePaths);

$mode = $options['mode'] ?? 'bounce';
$crf = (int)round(clamp((float)($options['crf'] ?? 42), 0, 63));
$includeAudio = !empty($options['includeAudio']);
$fpsOverride = isset($options['fpsOverride']) ? (float)$options['fpsOverride'] : null;

$fps = $fpsOverride && $fpsOverride > 0 ? $fpsOverride : detectFps($ffprobe, $inputPath);
$fpsString = formatFps($fps);

$bounceSettings = normalizeBounceSettings(is_array($options['bounce'] ?? null) ? $options['bounce'] : []);
$randomSettings = normalizeRandomSettings(is_array($options['random'] ?? null) ? $options['random'] : []);
$trimSettings = normalizeTrimSettings(is_array($options['trim'] ?? null) ? $options['trim'] : []);
$timelineSettings = normalizeTimeline(is_array($options['timeline'] ?? null) ? $options['timeline'] : []);

$segments = [];
$currentSegment = null;

foreach ($framePaths as $index => $framePath) {
    $frameNumber = $index + 1;
    $image = imagecreatefrompng($framePath);
    if (!$image) {
        respondError(sprintf('Failed to load frame %d for processing.', $frameNumber), 500);
    }
    $baseWidth = imagesx($image);
    $baseHeight = imagesy($image);
    if ($baseWidth <= 0 || $baseHeight <= 0) {
        respondError(sprintf('Frame %d has invalid dimensions.', $frameNumber), 500);
    }

    switch ($mode) {
        case 'trim':
            [$processed, $newWidth, $newHeight] = trimImage($image, $trimSettings, $frameNumber);
            break;
        case 'random':
            $widthPercent = $randomSettings['horizontal']['enabled']
                ? random_int((int)round($randomSettings['horizontal']['min']), (int)round($randomSettings['horizontal']['max']))
                : 100;
            $heightPercent = $randomSettings['vertical']['enabled']
                ? random_int((int)round($randomSettings['vertical']['min']), (int)round($randomSettings['vertical']['max']))
                : 100;
            $newWidth = max(1, (int)round($baseWidth * ($widthPercent / 100)));
            $newHeight = max(1, (int)round($baseHeight * ($heightPercent / 100)));
            $processed = imagecreatetruecolor($newWidth, $newHeight);
            imagesavealpha($processed, true);
            imagealphablending($processed, false);
            $transparent = imagecolorallocatealpha($processed, 0, 0, 0, 127);
            imagefill($processed, 0, 0, $transparent);
            imagecopyresampled($processed, $image, 0, 0, 0, 0, $newWidth, $newHeight, $baseWidth, $baseHeight);
            imagedestroy($image);
            break;
        case 'timeline':
            [$widthPercent, $heightPercent] = computeTimelinePercent($frameNumber, $frameCount, $timelineSettings);
            $newWidth = max(1, (int)round($baseWidth * ($widthPercent / 100)));
            $newHeight = max(1, (int)round($baseHeight * ($heightPercent / 100)));
            $processed = imagecreatetruecolor($newWidth, $newHeight);
            imagesavealpha($processed, true);
            imagealphablending($processed, false);
            $transparent = imagecolorallocatealpha($processed, 0, 0, 0, 127);
            imagefill($processed, 0, 0, $transparent);
            imagecopyresampled($processed, $image, 0, 0, 0, 0, $newWidth, $newHeight, $baseWidth, $baseHeight);
            imagedestroy($image);
            break;
        case 'bounce':
        default:
            $widthPercent = computeBouncePercent($frameNumber, $fps, $bounceSettings['horizontal']);
            $heightPercent = computeBouncePercent($frameNumber, $fps, $bounceSettings['vertical']);
            $newWidth = max(1, (int)round($baseWidth * ($widthPercent / 100)));
            $newHeight = max(1, (int)round($baseHeight * ($heightPercent / 100)));
            $processed = imagecreatetruecolor($newWidth, $newHeight);
            imagesavealpha($processed, true);
            imagealphablending($processed, false);
            $transparent = imagecolorallocatealpha($processed, 0, 0, 0, 127);
            imagefill($processed, 0, 0, $transparent);
            imagecopyresampled($processed, $image, 0, 0, 0, 0, $newWidth, $newHeight, $baseWidth, $baseHeight);
            imagedestroy($image);
            break;
    }

    $processedPath = $processedDir . DIRECTORY_SEPARATOR . sprintf('%06d.png', $frameNumber);
    imagepng($processed, $processedPath);
    imagedestroy($processed);

    if (!$currentSegment) {
        $currentSegment = ['width' => $newWidth, 'height' => $newHeight, 'start' => $frameNumber, 'count' => 1];
    } elseif ($currentSegment['width'] === $newWidth && $currentSegment['height'] === $newHeight) {
        $currentSegment['count']++;
    } else {
        $segments[] = $currentSegment;
        $currentSegment = ['width' => $newWidth, 'height' => $newHeight, 'start' => $frameNumber, 'count' => 1];
    }
}

if ($currentSegment) {
    $segments[] = $currentSegment;
}

if (!$segments) {
    respondError('No frames were processed.', 500);
}

$segmentPaths = [];
foreach ($segments as $index => $segment) {
    $segmentPath = $workspace . DIRECTORY_SEPARATOR . sprintf('segment_%03d.webm', $index);
    $encodeCommand = buildCommand([
        $ffmpeg,
        '-y',
        '-framerate', $fpsString,
        '-start_number', (string)$segment['start'],
        '-i', $processedDir . DIRECTORY_SEPARATOR . '%06d.png',
        '-frames:v', (string)$segment['count'],
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        '-b:v', '0',
        '-crf', (string)$crf,
        '-r', $fpsString,
        $segmentPath,
    ]);
    runCommand($encodeCommand, 'Failed to encode WebM segment.');
    $segmentPaths[] = $segmentPath;
}

$concatFile = $workspace . DIRECTORY_SEPARATOR . 'concat.txt';
$concatHandle = fopen($concatFile, 'w');
if (!$concatHandle) {
    respondError('Unable to prepare concatenation manifest.', 500);
}
foreach ($segmentPaths as $segmentPath) {
    fwrite($concatHandle, concatLine($segmentPath));
}
fclose($concatHandle);

$combinedPath = $workspace . DIRECTORY_SEPARATOR . 'video.webm';
$concatCommand = buildCommand([
    $ffmpeg,
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', $concatFile,
    '-c', 'copy',
    $combinedPath,
]);
runCommand($concatCommand, 'Failed to combine WebM segments.');

$outputPath = $workspace . DIRECTORY_SEPARATOR . 'out.webm';
$finalArgs = [$ffmpeg, '-y', '-i', $combinedPath];
if ($includeAudio) {
    $finalArgs = array_merge(
        $finalArgs,
        ['-i', $inputPath, '-map', '0:v', '-map', '1:a?', '-c:v', 'copy']
    );
} else {
    $finalArgs = array_merge($finalArgs, ['-c', 'copy']);
}
$finalArgs = array_merge($finalArgs, ['-metadata', 'title=WeirdM', $outputPath]);
$finalCommand = buildCommand($finalArgs);
runCommand($finalCommand, 'Failed to mux final WebM.');

header('Content-Type: video/webm');
header('Content-Disposition: attachment; filename="weirdm.webm"');
header('Content-Length: ' . filesize($outputPath));
readfile($outputPath);
