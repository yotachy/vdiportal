<?php
// 머니스쿱 앱 서버 API — 채점 원장(P3). wallet-api 와 같은 규율: 데이터는 웹루트 밖,
// POST JSON {op,...}, 서버가 판정. 지연 채점: list 요청 처리 시 만기 지난 대기 건을
// forge OHLC 캐시(forge_ohlc_cache_*.json — forge-api 가 생성)로 판정한다.
// 캐시가 없으면 그 행은 다음 기회에 채점(앱 클라이언트가 차트를 볼 때마다 캐시가 갱신된다).
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { exit; }

$AL_DIR = dirname(dirname(__DIR__)) . "/data";   // 웹루트 밖(wallet 과 동일 관례)
require_once __DIR__ . "/app-ledger-lib.php";

// ── 지갑 브리지(P5) — wallet-lib 재사용, 앱 정책만 가드형 상수로 주입 ──
// 시안 정책: 가입 15 · 게스트 상한 15(레벨 상한은 P8 로그인+XP 와 함께) · 심화 2 · 커스텀 3 ·
// 출석 +1/일(주기 6h 는 §15 협의 고정점 Q13 — 지갑의 검증된 일 단위+연속 7일 +5 를 기준선으로).
// 새 앱은 이 브리지만 쓴다 — wallet-api.php(구 앱 경로)는 기본 상수 그대로라 서로 안 섞인다.
define("W_SEED", 15);
define("W_CAP", 15);
define("W_COSTS_JSON", json_encode(array("deep" => 2, "custom" => 3)));
define("W_ENTITLED_JSON", json_encode(array("deep", "custom")));
require_once __DIR__ . "/wallet-lib.php";
require_once __DIR__ . "/app-wallet-bridge.php";


function al_out($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") al_out(array("ok" => false, "error" => "method"), 405);
$raw = file_get_contents("php://input");
if (strlen($raw) > 65536) al_out(array("ok" => false, "error" => "too-large"), 413);
$in = json_decode($raw, true);
if (!is_array($in) || !isset($in["op"])) al_out(array("ok" => false, "error" => "bad-json"), 400);
$device = isset($in["device"]) ? preg_replace("/[^A-Za-z0-9_-]/", "", (string)$in["device"]) : "";
if ($device === "" || strlen($device) > 64) al_out(array("ok" => false, "error" => "device"), 400);

// forge OHLC 캐시 리더 — forge-api 와 같은 키 규칙(md5("SYM|1day" 등))
function al_candles_from_cache($sym, $tfKo) {
  $apiTf = $tfKo === "주" ? "1week" : ($tfKo === "월" ? "1month" : "1day");
  $cf = __DIR__ . "/forge_ohlc_cache_" . md5($sym . "|" . $apiTf) . ".json";
  if (!is_readable($cf)) return null;
  $j = json_decode(@file_get_contents($cf), true);
  if (!is_array($j) || !isset($j["candles"]) || !is_array($j["candles"])) return null;
  return $j["candles"];
}

try { $db = al_db($AL_DIR); }
catch (Throwable $e) { al_out(array("ok" => false, "error" => "storage"), 500); }

$op = (string)$in["op"];
try {
  if ($op === "register") {
    $in["device"] = $device;
    al_out(al_register($db, $in));
  }
  if ($op === "list") {
    al_score_pending($db, $device, "al_candles_from_cache", time());
    al_out(al_list($db, $device, isset($in["limit"]) ? (int)$in["limit"] : 120, time()));
  }
  // ── 익명 통계(P7) — 원장 실값 파생. 내 대기 건 채점을 먼저 스위프해 집계에 반영 ──
  if ($op === "peers") {
    al_score_pending($db, $device, "al_candles_from_cache", time());
    $ps = al_peers_stats($db, $device, time());
    // 닉네임 리더보드(P9 해금 — P7 이월): 원장 실값 + 구글 연결(닉네임 있는) 사용자만.
    // 적중 보드는 30회 이상(프로토 카피 기준) · 다작 보드는 30일 등록 수. 레벨 보드는 XP 서버
    // 검증(§15) 전까지 비공개. 기기 id 는 응답에 싣지 않는다.
    require_once __DIR__ . "/app-sync-lib.php";
    sync_migrate($db);
    $wdb = w_db($AL_DIR);
    $nickOf = function ($dev) use ($wdb, $db, $AL_DIR) {
      $r = app_acct_resolve($wdb, $AL_DIR, $dev, false);
      if (!$r["linked"]) return null;
      $row = sync_get($db, $r["sub"]);
      return $row ? $row["nick"] : null;
    };
    $cut90 = gmdate("c", time() - 90 * 86400);
    $st = $db->prepare("select device, count(*) n, sum(case when status='hit' then 1 else 0 end) hit
      from predictions where status!='wait' and scored_at>=:c group by device having count(*)>=30
      order by (hit*1.0/n) desc, n desc limit 12");
    $st->execute(array(":c" => $cut90));
    $leads = array();
    foreach ($st->fetchAll() as $r) {
      $nick = $nickOf($r["device"]);
      if ($nick === null) continue;
      $leads[] = array("nick" => $nick, "n" => (int)$r["n"], "hit" => (int)$r["hit"]);
      if (count($leads) >= 4) break;
    }
    $d30 = al_kst_day(time() - 29 * 86400);
    $st = $db->prepare("select device, count(*) n from predictions where day>=:d group by device order by n desc limit 12");
    $st->execute(array(":d" => $d30));
    $vols = array();
    foreach ($st->fetchAll() as $r) {
      $nick = $nickOf($r["device"]);
      if ($nick === null) continue;
      $vols[] = array("nick" => $nick, "n" => (int)$r["n"]);
      if (count($vols) >= 3) break;
    }
    $ps["leads"] = $leads;
    $ps["vols"] = $vols;
    al_out($ps);
  }
  // ── 페르소나 질문(P6) — 인덱스로 다음 질문만, 총량은 절대 싣지 않는다(Q4) ──
  if ($op === "persona_q") {
    require_once __DIR__ . "/app-persona-bank.php";
    $bank = persona_bank();
    $i = isset($in["i"]) ? (int)$in["i"] : 0;
    if ($i < 0 || $i >= count($bank)) al_out(array("ok" => true, "q" => null, "more" => false));
    $item = $bank[$i];
    al_out(array("ok" => true, "i" => $i,
      "q" => $item[0],
      "opts" => array_map(function ($o) { return array("n" => $o[0], "d" => $o[1], "l" => $o[2]); }, $item[1]),
      "more" => ($i + 1) < count($bank)));
  }

  // ── 계정·동기화 ops(P8) — 실 구글 OAuth 는 wallet-auth.php(브라우저 구간)·w_merge(병합) 재사용 ──
  if ($op === "auth_start") {
    if (!w_oauth_conf()) al_out(array("ok" => false, "error" => "auth-disabled"));
    $wdb = w_db($AL_DIR);
    app_wallet_acct($wdb, $AL_DIR, $device);   // 계정 보장 — 병합(w_merge)이 no-account 로 늦게 죽지 않게
    $n = w_nonce_make($wdb, $device);
    $base = "https://" . $_SERVER["HTTP_HOST"] . rtrim(dirname($_SERVER["SCRIPT_NAME"]), "/");
    al_out(array("ok" => true, "nonce" => $n, "authUrl" => $base . "/wallet-auth.php?nonce=" . urlencode($n)));
  }
  if ($op === "auth_poll") {
    $wdb = w_db($AL_DIR);
    $nonce = isset($in["nonce"]) ? (string)$in["nonce"] : "";
    $row = $nonce !== "" ? w_nonce_read($wdb, $nonce) : null;
    // 모르는·만료된·남의 논스는 같은 401(wallet-api 와 동일 판단 — 존재 여부를 캐낼 수 없게)
    if (!$row || $row["device_id"] !== $device) al_out(array("ok" => false, "error" => "unauthorized"), 401);
    if ($row["google_sub"] === null) al_out(array("ok" => true, "pending" => true));
    $m = w_merge($wdb, $device, $row["google_sub"]);
    if (!$m["ok"]) {
      if ($m["reason"] === "device-claimed") { w_nonce_burn($wdb, $nonce); al_out(array("ok" => false, "error" => "device-claimed"), 409); }
      al_out(array("ok" => false, "error" => "server"), 500);
    }
    w_nonce_burn($wdb, $nonce);
    require_once __DIR__ . "/app-sync-lib.php";
    sync_migrate($db);
    // 게스트 로컬 상태를 즉시 병합 저장(최초 닉네임 생성 포함) — 클라 왕복을 아낀다
    $push = isset($in["state"]) && is_array($in["state"]) ? $in["state"] : array();
    $r = sync_put($db, $row["google_sub"], $push, time());
    $stt = w_state($wdb, $m["acct"]);
    al_out(array("ok" => true, "pending" => false, "linked" => true, "nick" => $r["nick"],
      "state" => $r["state"], "discarded" => $m["discarded"], "wallet" => $stt));
  }
  if ($op === "sync_push" || $op === "sync_pull" || $op === "withdraw") {
    $wdb = w_db($AL_DIR);
    $res = app_acct_resolve($wdb, $AL_DIR, $device, false);   // 동기화는 계정을 만들지 않는다(게스트 403)
    if (!$res["linked"]) al_out(array("ok" => false, "error" => "guest"), 403);
    require_once __DIR__ . "/app-sync-lib.php";
    sync_migrate($db);
    if ($op === "sync_push") {
      $r = sync_put($db, $res["sub"], isset($in["state"]) && is_array($in["state"]) ? $in["state"] : array(), time());
      al_out(array("ok" => true, "nick" => $r["nick"], "state" => $r["state"]));
    }
    if ($op === "sync_pull") {
      $row = sync_get($db, $res["sub"]);
      al_out(array("ok" => true, "nick" => $row ? $row["nick"] : null, "state" => $row ? $row["state"] : null));
    }
    // withdraw — 동기화 데이터 삭제 + 지갑의 구글 연결 해제(계정·원장은 각 정본 규칙대로 보존)
    sync_delete($db, $res["sub"]);
    $wdb->prepare("update accounts set google_sub = null where id = ?")->execute(array($res["acct"]["id"]));
    al_out(array("ok" => true));
  }

  // ── 광고 ops(P10 AdMob) — 유닛 설정·잔여 횟수. 실지급은 wallet-ssv.php(구글 SSV 콜백) →
  // w_ad_grant 의 몫이고 여기서는 절대 지급하지 않는다. customData = 해석된 계정 id(w_account_id
  // 모양 그대로 — 가공하면 SSV 가 조용히 버린다, wallet-api adConfig 주석 참조).
  if ($op === "ad_config" || $op === "ad_state") {
    $wdb = w_db($AL_DIR);
    $res = app_acct_resolve($wdb, $AL_DIR, $device);
    if ($op === "ad_config") {
      $u = w_ad_units($AL_DIR);
      if (!$u) al_out(array("ok" => false, "error" => "ads-disabled"));   // ad_units.json 부재 = 킬 스위치
      al_out(array("ok" => true, "quick" => $u["quick"], "full" => $u["full"], "customData" => $res["acct"]["id"]));
    }
    $st = w_ad_state($wdb, $res["acct"]["id"]);
    al_out(array("ok" => true, "remaining" => $st["remaining"], "nextAt" => $st["nextAt"]));
  }

  // ── 지갑 ops(P5 — P8 부터 구글 연결 기기는 병합된 계정을 본다) ──
  if ($op === "wallet_state" || $op === "wallet_spend" || $op === "wallet_refund" || $op === "wallet_checkin") {
    $wdb = w_db($AL_DIR);
    $res = app_acct_resolve($wdb, $AL_DIR, $device);
    $acct = $res["acct"];
    if ($op === "wallet_state") {
      $granted = app_wallet_sweep_refunds($wdb, $db, $device, $acct["id"]);
      $stt = w_state($wdb, $acct);
      $stt["ok"] = true;
      $stt["hitRefunds"] = $granted;
      $stt["linked"] = $res["linked"] ? 1 : 0;
      if ($res["linked"]) {
        require_once __DIR__ . "/app-sync-lib.php";
        sync_migrate($db);
        $srow = sync_get($db, $res["sub"]);
        $stt["nick"] = $srow ? $srow["nick"] : null;
      }
      al_out($stt);
    }
    if ($op === "wallet_spend") {
      $tier = isset($in["tier"]) ? (string)$in["tier"] : "";
      $idem = isset($in["idem"]) ? (string)$in["idem"] : "";
      $ref = isset($in["ref"]) ? (string)$in["ref"] : "";
      $r = w_spend($wdb, $acct["id"], $tier, $idem, $ref, isset($in["engine"]) ? (string)$in["engine"] : "");
      $r["balance"] = w_true_balance($wdb, $acct["id"]);
      al_out($r, $r["ok"] ? 200 : ($r["reason"] === "insufficient" ? 402 : 400));
    }
    if ($op === "wallet_refund") {
      $idem = isset($in["idem"]) ? (string)$in["idem"] : "";
      $r = w_refund($wdb, $acct["id"], $idem);
      $r["balance"] = w_true_balance($wdb, $acct["id"]);
      al_out($r);
    }
    if ($op === "wallet_checkin") {
      $r = w_checkin($wdb, $acct, null);
      $r["balance"] = w_true_balance($wdb, $acct["id"]);
      $r["streakDays"] = null;
      $st2 = $wdb->prepare("select streak_days from accounts where id = ?");   // 해석된 계정 기준(P8)
      $st2->execute(array($acct["id"]));
      $a2 = $st2->fetch();
      if ($a2) $r["streakDays"] = (int)$a2["streak_days"];
      al_out($r);
    }
  }
  al_out(array("ok" => false, "error" => "op"), 400);
} catch (Throwable $e) {
  al_out(array("ok" => false, "error" => "server"), 500);
}
