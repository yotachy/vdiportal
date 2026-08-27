<?php
// 머니스쿱 앱 — 푸시 등록부·발송로그(설계서 2026-08-26 Phase 1).
// 규율: 웹루트 밖 SQLite · 서버는 '감지 시그널'을 저장하지 않는다(감지는 봉 위 결정적 함수라
// 앱이 재현한다 — 서버의 고유 가치는 닫힌 앱에 닿는 것 하나뿐) · 실발송은 자격증명이 있을 때만.
// 하루 1회 캡은 발송로그의 unique(device, day)가 강제한다(스캐너가 두 번 돌아도 재발송 없음).

function pl_db($dir) {
  if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    throw new Exception("푸시 데이터 디렉토리를 만들 수 없다: " . $dir);
  }
  if (!is_writable($dir)) throw new Exception("푸시 데이터 디렉토리에 쓸 수 없다: " . $dir);
  $db = new PDO("sqlite:" . $dir . "/app_push.db");
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $db->exec("pragma busy_timeout = 5000");
  for ($i = 0; $i < 5; $i++) {
    try { $db->exec("pragma journal_mode = WAL"); break; }
    catch (Throwable $e) { usleep(20000 * ($i + 1)); }
  }
  @chmod($dir . "/app_push.db", 0600);
  pl_migrate($db);
  return $db;
}

function pl_migrate($db) {
  $db->exec("create table if not exists devices (
    device text primary key,
    token text,                     -- FCM 등록 토큰(없으면 null — 웹·권한 미허용)
    picks text not null default '[]',
    on_flag integer not null default 1,
    upd_at text not null
  )");
  $db->exec("create table if not exists sends (
    id integer primary key autoincrement,
    device text not null,
    day text not null,              -- 다이제스트 날짜(KST) — 하루 1회 키
    title text not null, body text not null, data text,
    state text not null,            -- queued|sent|failed
    at text not null,
    unique(device, day)
  )");
  $db->exec("create index if not exists idx_send_day on sends(day)");
}

function pl_register($db, $device, $p, $now) {
  $picks = array();
  if (isset($p["picks"]) && is_array($p["picks"])) {
    foreach ($p["picks"] as $s) {
      if (is_string($s) && $s !== "" && strlen($s) <= 16) $picks[] = $s;
      if (count($picks) >= 24) break;
    }
  }
  $token = (isset($p["token"]) && is_string($p["token"]) && $p["token"] !== "") ? substr($p["token"], 0, 512) : null;
  $on = (isset($p["on"]) && !$p["on"]) ? 0 : 1;
  $st = $db->prepare("insert into devices (device, token, picks, on_flag, upd_at) values (?,?,?,?,?)
    on conflict(device) do update set token = coalesce(excluded.token, devices.token),
      picks = excluded.picks, on_flag = excluded.on_flag, upd_at = excluded.upd_at");
  $st->execute(array($device, $token, json_encode($picks, JSON_UNESCAPED_UNICODE), $on, gmdate("c", $now)));
  return array("ok" => true);
}

function pl_registry($db) {
  $rows = $db->query("select device, token, picks, on_flag from devices where on_flag = 1 order by device")->fetchAll();
  $out = array();
  foreach ($rows as $r) {
    $picks = json_decode($r["picks"], true);
    $out[] = array("device" => $r["device"], "token" => $r["token"],
      "picks" => is_array($picks) ? $picks : array(), "on" => true);
  }
  return $out;
}

// $sender = function($token, $title, $body, $data) : bool — null 이면 발송하지 않고 큐로만 기록(Phase 1).
function pl_send($db, $sends, $now, $sender = null) {
  $sent = 0; $skipped = 0; $queued = 0; $failed = 0;
  foreach (($sends === null ? array() : $sends) as $s) {
    if (!isset($s["device"], $s["title"], $s["body"])) continue;
    $day = (isset($s["data"]["day"]) && $s["data"]["day"] !== "") ? (string)$s["data"]["day"] : gmdate("Y-m-d", $now + 9 * 3600);
    $dev = $db->prepare("select token from devices where device = ? and on_flag = 1");
    $dev->execute(array($s["device"]));
    $row = $dev->fetch();
    if (!$row) continue;                       // 미등록·알림 끈 기기
    $state = "queued";
    if ($sender !== null && $row["token"]) {
      $okSend = false;
      try { $okSend = (bool)$sender($row["token"], $s["title"], $s["body"], isset($s["data"]) ? $s["data"] : array()); }
      catch (Throwable $e) { $okSend = false; }
      $state = $okSend ? "sent" : "failed";
    }
    try {
      $ins = $db->prepare("insert into sends (device, day, title, body, data, state, at) values (?,?,?,?,?,?,?)");
      $ins->execute(array($s["device"], $day, $s["title"], $s["body"],
        json_encode(isset($s["data"]) ? $s["data"] : array(), JSON_UNESCAPED_UNICODE), $state, gmdate("c", $now)));
    } catch (Throwable $e) {
      $skipped++;                              // unique(device, day) — 같은 날 재발송 차단(멱등)
      continue;
    }
    if ($state === "sent") $sent++;
    else if ($state === "failed") $failed++;
    else $queued++;
  }
  return array("ok" => true, "sent" => $sent, "skipped" => $skipped, "queued" => $queued, "failed" => $failed);
}

function pl_scan_key($dir) {
  $f = $dir . "/app_scan_key.txt";
  if (!is_file($f)) return null;               // fail-closed — 키 없으면 스캐너 ops 전부 403
  $v = trim((string)@file_get_contents($f));
  return $v === "" ? null : $v;
}

function pl_fcm_conf($dir) {
  $f = $dir . "/app_fcm.json";                 // 킬스위치 — 부재 = 푸시 전체 꺼짐
  if (!is_file($f)) return null;
  $j = json_decode((string)@file_get_contents($f), true);
  if (!is_array($j) || empty($j["client_email"]) || empty($j["private_key"]) || empty($j["project_id"])) return null;
  return $j;
}

// FCM HTTP v1 발송기 — 자격증명이 있을 때만 만들어진다(Phase 2 에서 켜짐).
// 서비스 계정 JWT → OAuth2 액세스 토큰 → messages:send. legacy 서버키 아님(2024 폐지).
function pl_fcm_sender($conf) {
  if (!$conf || !function_exists("curl_init") || !function_exists("openssl_sign")) return null;
  $tokenCache = array("v" => null, "exp" => 0);
  return function ($token, $title, $body, $data) use ($conf, &$tokenCache) {
    $now = time();
    if (!$tokenCache["v"] || $tokenCache["exp"] < $now + 60) {
      $head = rtrim(strtr(base64_encode(json_encode(array("alg" => "RS256", "typ" => "JWT"))), "+/", "-_"), "=");
      $claim = array("iss" => $conf["client_email"], "scope" => "https://www.googleapis.com/auth/firebase.messaging",
        "aud" => "https://oauth2.googleapis.com/token", "iat" => $now, "exp" => $now + 3600);
      $payload = rtrim(strtr(base64_encode(json_encode($claim)), "+/", "-_"), "=");
      $sig = "";
      if (!openssl_sign($head . "." . $payload, $sig, $conf["private_key"], "sha256")) return false;
      $jwt = $head . "." . $payload . "." . rtrim(strtr(base64_encode($sig), "+/", "-_"), "=");
      $ch = curl_init("https://oauth2.googleapis.com/token");
      curl_setopt_array($ch, array(CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => http_build_query(array("grant_type" => "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion" => $jwt))));
      $res = json_decode((string)curl_exec($ch), true); curl_close($ch);
      if (!is_array($res) || empty($res["access_token"])) return false;
      $tokenCache = array("v" => $res["access_token"], "exp" => $now + (int)(isset($res["expires_in"]) ? $res["expires_in"] : 3600));
    }
    $flat = array();
    if (is_array($data)) foreach ($data as $k => $v) $flat[$k] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string)$v;
    $msg = array("message" => array("token" => $token,
      "notification" => array("title" => $title, "body" => $body), "data" => $flat));
    $ch = curl_init("https://fcm.googleapis.com/v1/projects/" . rawurlencode($conf["project_id"]) . "/messages:send");
    curl_setopt_array($ch, array(CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
      CURLOPT_HTTPHEADER => array("Authorization: Bearer " . $tokenCache["v"], "Content-Type: application/json"),
      CURLOPT_POSTFIELDS => json_encode($msg, JSON_UNESCAPED_UNICODE)));
    $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return $code >= 200 && $code < 300 && $out !== false;
  };
}
