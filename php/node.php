<?php
/**
 * عُقدة سحب بنسخة PHP — تعمل على أي استضافة PHP (aaPanel / cPanel / VPS).
 * الكرون كل دقيقة:  * * * * * /usr/bin/php /path/node.php
 *
 * لا تحتاج أي مكتبة خارجية ولا تكتب في قاعدة البيانات.
 */

declare(strict_types=1);

// ── الإعدادات (تُملأ من .env أو عدّلها هنا مباشرة) ─────────────
$envFile = __DIR__ . '/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v);
    }
}
$PANEL   = rtrim((string) ($_ENV['NODE_PANEL_URL'] ?? getenv('NODE_PANEL_URL') ?: ''), '/');
$TOKEN   = (string) ($_ENV['NODE_TOKEN'] ?? getenv('NODE_TOKEN') ?: '');
$NAME    = (string) ($_ENV['NODE_NAME'] ?? getenv('NODE_NAME') ?: gethostname());
$BATCH   = max(1, (int) ($_ENV['NODE_BATCH'] ?? 50));
$CONC    = max(1, (int) ($_ENV['NODE_CONCURRENCY'] ?? 8));
$TIMEOUT = 45;

if ($PANEL === '' || $TOKEN === '') {
    fwrite(STDERR, "✖ NODE_PANEL_URL / NODE_TOKEN غير مضبوطين\n");
    exit(1);
}

// ── وضع الصحة عند الفتح بالمتصفح ────────────────────────────────
if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    if (($_GET['run'] ?? '') === '1') {
        $r = node_cycle();
        echo json_encode(['ok' => true] + $r, JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'node' => $NAME, 'mode' => 'php']);
    exit;
}

node_cycle();

// ── الدورة: نبضة → دفعة → استيراد → تقرير ──────────────────────
function node_cycle(): array
{
    global $PANEL, $TOKEN, $NAME, $BATCH, $CONC, $TIMEOUT;
    $t0 = microtime(true);

    node_call('hello', []);
    $batch = node_call('batch', ['limit' => $BATCH]);
    $items = $batch['items'] ?? [];
    if (!$items) {
        return ['handled' => 0, 'ms' => (int) ((microtime(true) - $t0) * 1000)];
    }

    $handled = 0; $errors = 0;
    $queue = array_values($items);
    $active = [];
    $mh = curl_multi_init();
    $map = [];

    // توازٍ محدود: $CONC طلب في نفس اللحظة
    $spawn = function () use (&$queue, &$active, &$map, $mh, $CONC, $TIMEOUT) {
        while (count($active) < $CONC && $queue) {
            $it = array_shift($queue);
            $ch = curl_init($it['url']);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 5,
                CURLOPT_ENCODING       => '',
                CURLOPT_TIMEOUT        => $TIMEOUT,
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                CURLOPT_HTTPHEADER     => ['Accept-Language: ar,en-US;q=0.8,en;q=0.6'],
            ]);
            curl_multi_add_handle($mh, $ch);
            $active[(int) $ch] = $ch;
            $map[(int) $ch] = $it;
        }
    };

    $spawn();
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh, 0.5);
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            $key = (int) $ch;
            $it = $map[$key] ?? null;
            $body = curl_multi_getcontent($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            unset($active[$key], $map[$key]);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);

            if ($it) {
                $ok = $code >= 200 && $code < 400;
                if ($ok) { $handled++; } else { $errors++; }
                node_call('report', [
                    'url' => $it['url'],
                    'ok'  => $ok,
                    'size' => is_string($body) ? strlen($body) : 0,
                ]);
            }
            $spawn();
        }
    } while ($running > 0);
    curl_multi_close($mh);

    $ms = (int) ((microtime(true) - $t0) * 1000);
    node_call('beat', ['stats' => ['cycles' => 1, 'jobs' => $handled, 'errors' => $errors, 'ms' => $ms]]);
    return ['handled' => $handled, 'errors' => $errors, 'ms' => $ms];
}

/** نداء واحد للوحة */
function node_call(string $action, array $extra): array
{
    global $PANEL, $TOKEN, $NAME, $TIMEOUT;
    $ch = curl_init($PANEL . '/api/node.php');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['action' => $action, 'token' => $TOKEN, 'node' => $NAME] + $extra),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => $action === 'batch' ? $TIMEOUT : 15,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    $d = json_decode((string) $raw, true);
    return is_array($d) ? $d : ['ok' => false];
}