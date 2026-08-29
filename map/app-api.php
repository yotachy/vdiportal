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
// IP당 하루 신규 계정 상한 — 기본 3은 재설치·NAT(공유 IP)·테스트에 너무 빡빡해 정상 사용자가
// wallet_state 부터 429 로 막혔다(차감 실패의 실제 원인, 2026-08-25). 앱은 상향한다.
// ⚠ 여전히 시드(가입 15스쿱) 남용 방어선이다 — 출시 전 실사용 데이터로 재조정(§15·리모트 컨피그).
define("W_IP_DAILY", 30);
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
// ── 스캐너 ops(설계서 2026-08-26 §4.3) — 디바이스가 아니라 스캐너 키로 인증한다.
// device 검증 앞에 둔다: 외부 스캐너는 기기가 아니다. 키 파일 부재 = 전부 403(fail-closed).
$opRaw = (string)$in["op"];
if ($opRaw === "scan_registry" || $opRaw === "push_send") {
  require_once __DIR__ . "/app-push-lib.php";
  $realKey = pl_scan_key($AL_DIR);
  $gotKey = isset($_SERVER["HTTP_X_SCAN_KEY"]) ? (string)$_SERVER["HTTP_X_SCAN_KEY"] : "";
  if ($realKey === null || $gotKey === "" || !hash_equals($realKey, $gotKey)) {
    al_out(array("ok" => false, "error" => "scan-key"), 403);
  }
  try {
    $pdb = pl_db($AL_DIR);
    if ($opRaw === "scan_registry") al_out(array("ok" => true, "registry" => pl_registry($pdb)));
    $sends = isset($in["sends"]) && is_array($in["sends"]) ? array_slice($in["sends"], 0, 50) : array();
    $conf = pl_fcm_conf($AL_DIR);
    al_out(pl_send($pdb, $sends, time(), $conf ? pl_fcm_sender($conf) : null));
  } catch (Throwable $e) {
    al_out(array("ok" => false, "error" => "server"), 500);
  }
}
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
  // 푸시 등록(앱) — 토큰은 Phase 2(네이티브 셸)부터 실린다. 지금은 종목·설정만으로도 등록된다.
  if ($op === "push_register") {
    require_once __DIR__ . "/app-push-lib.php";
    $pdb = pl_db($AL_DIR);
    al_out(pl_register($pdb, $device, array(
      "token" => isset($in["token"]) ? $in["token"] : null,
      "picks" => isset($in["picks"]) ? $in["picks"] : array(),
      "on" => isset($in["on"]) ? (bool)$in["on"] : true
    ), time()));
  }
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
    // 레벨 보드(활동 XP — 원장 파생: 통산 등록×3 + 적중×2). §15 'XP 서버 검증' 조건 충족 → 해금.
    // leads/vols 와 동일: 구글 연결+닉네임만, 기기 id 비노출, 최소 등록(AL_LV_MINREG)으로 스팸 컷.
    $lvRanks = al_level_ranks($db);
    $levels = array();
    foreach ($lvRanks as $lr) {
      $nick = $nickOf($lr["device"]);
      if ($nick === null) continue;
      $levels[] = array("nick" => $nick, "xp" => $lr["xp"], "level" => $lr["level"]);
      if (count($levels) >= 4) break;
    }
    $mrow = $db->prepare("select count(*) reg, sum(case when status='hit' then 1 else 0 end) hits from predictions where device=:d");
    $mrow->execute(array(":d" => $device));
    $mr = $mrow->fetch();
    $myReg = (int)$mr["reg"]; $myXp = al_level_xp($myReg, (int)$mr["hits"]); $myRank = null;
    if ($myReg >= AL_LV_MINREG) {   // 자격 있을 때만 순위(미달이면 xp·레벨은 보이되 순위는 null)
      $better = 0; foreach ($lvRanks as $lr) { if ($lr["xp"] > $myXp) $better++; }
      $myRank = $better + 1;
    }
    $ps["levels"] = $levels;
    $ps["myLevel"] = array("xp" => $myXp, "level" => al_activity_level($myXp), "reg" => $myReg, "rank" => $myRank, "minReg" => AL_LV_MINREG);
    // 페르소나 성향 분포(익명 집계 — 클라 파생 personaGroups 평균). 표본 미달이면 null → 화면은 '집계 준비 중'.
    $ps["personaDist"] = sync_persona_dist($db);
    // 가중치 인기(익명 집계 — 커스텀 슬라이더 지표별 평균 배율). 표본 미달이면 null.
    $ps["weightPop"] = sync_weights_pop($db);
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
    $base = "https://" . $_SERVER["HTTP_HOST"] . rtrim(dirname($_SERVER["SCRIPT_NAME"]), "/");
    // 이미 구글 인증이 끝난 논스가 있으면 새로 시작하지 않는다 — 앱은 구글을 거치지 않고 바로 폴링해
    // 병합한다(2026-08-28 원장 실측: 반응 없다고 다시 누를 때마다 완료된 논스가 버려지고 있었다).
    $done = app_nonce_completed($wdb, $device);
    if ($done) al_out(array("ok" => true, "nonce" => $done["nonce"], "completed" => true,
                            "authUrl" => $base . "/wallet-auth.php?nonce=" . urlencode($done["nonce"])));
    $n = w_nonce_make($wdb, $device);
    al_out(array("ok" => true, "nonce" => $n, "authUrl" => $base . "/wallet-auth.php?nonce=" . urlencode($n)));
  }
  if ($op === "auth_poll") {
    $wdb = w_db($AL_DIR);
    $nonce = isset($in["nonce"]) ? (string)$in["nonce"] : "";
    $row = $nonce !== "" ? w_nonce_read($wdb, $nonce) : null;
    if ($row && $row["device_id"] !== $device) $row = null;   // 남의 논스는 모르는 것과 같다
    // 들고 온 논스가 아직 대기 중이거나 모르는 것이어도, 이 기기에 '구글 인증이 끝난' 논스가 있으면
    // 그걸 병합한다 — 클라가 어느 논스를 폴링하든 결과가 같아야 연타·탭 수명에 흔들리지 않는다.
    if (!$row || $row["google_sub"] === null) {
      $done = app_nonce_completed($wdb, $device);
      if ($done) { $row = $done; $nonce = $done["nonce"]; }
    }
    // 모르는·만료된·남의 논스는 같은 401(wallet-api 와 동일 판단 — 존재 여부를 캐낼 수 없게)
    if (!$row) al_out(array("ok" => false, "error" => "unauthorized"), 401);
    if ($row["google_sub"] === null) al_out(array("ok" => true, "pending" => true));
    $m = w_merge($wdb, $device, $row["google_sub"]);
    if (!$m["ok"]) {
      if ($m["reason"] === "device-claimed") { w_nonce_burn($wdb, $nonce); al_out(array("ok" => false, "error" => "device-claimed"), 409); }
      // busy = SQLite 경합. w_merge 가 논스를 안 태우고 물러난 것이므로 **재시도가 정답**이다
      // (그렇게 설계돼 있는데 클라가 500 을 종료로 읽어 로그인이 통째로 죽었다 — 2026-08-28).
      if ($m["reason"] === "busy") al_out(array("ok" => true, "pending" => true, "retry" => "busy"));
      al_out(array("ok" => false, "error" => "server", "reason" => $m["reason"]), 500);
    }
    w_nonce_burn($wdb, $nonce);
    if (isset($row["google_name"])) w_set_google_name($wdb, $m["acct"]["id"], $row["google_name"]);   // 구글 표시 이름(v4)
    require_once __DIR__ . "/app-sync-lib.php";
    sync_migrate($db);
    // 게스트 로컬 상태를 즉시 병합 저장(최초 닉네임 생성 포함) — 클라 왕복을 아낀다
    $push = isset($in["state"]) && is_array($in["state"]) ? $in["state"] : array();
    $r = sync_put($db, $row["google_sub"], $push, time());
    // 이름은 방금 적었으므로 계정 행을 다시 읽는다 — w_merge 가 돌려준 행은 이름 저장 전 스냅샷이라 gname 이 비었다.
    $acctFresh = $wdb->prepare("select * from accounts where id = ?"); $acctFresh->execute(array($m["acct"]["id"])); $acctFresh = $acctFresh->fetch() ?: $m["acct"];
    $stt = w_state($wdb, $acctFresh);
    al_out(array("ok" => true, "pending" => false, "linked" => true, "nick" => $r["nick"], "gname" => $stt["gname"],
      "state" => $r["state"], "discarded" => $m["discarded"], "wallet" => $stt));
  }
  // 로그아웃 — 이 기기의 구글 연결만 끊는다(동기화 데이터·원장·잔액은 보존, 재로그인이면 복구).
  // 서버에 알리지 않으면 부팅 때 wallet_state 가 linked:1 을 돌려줘 로그아웃이 되살아난다
  // (2026-08-28 사용자 제보: '로그아웃 후 새로고침하면 계속 로그인 상태').
  // ⚠ 다기기: 해석된 계정의 google_sub 을 지우므로 같은 구글 계정을 쓰던 다른 기기도 게스트가
  // 된다. 데이터는 남고 재로그인으로 복구된다(탈퇴와 달리 sync_delete 를 하지 않는다).
  if ($op === "auth_logout") {
    $wdb = w_db($AL_DIR);
    $res = app_acct_resolve($wdb, $AL_DIR, $device, false);
    if (!$res["linked"]) al_out(array("ok" => true, "linked" => false));   // 이미 게스트 — 멱등
    $wdb->prepare("update accounts set google_sub = null where id = ?")->execute(array($res["acct"]["id"]));
    al_out(array("ok" => true, "linked" => false));
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
  if ($op === "wallet_state" || $op === "wallet_spend" || $op === "wallet_refund" || $op === "wallet_checkin" || $op === "wallet_levelup") {
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
    // 레벨업 풀충전(2026-08-29): 클라가 레벨업을 감지하면 부른다. 레벨당 1회·로그인만(w_levelup_fill).
    if ($op === "wallet_levelup") {
      $r = w_levelup_fill($wdb, $acct, isset($in["level"]) ? (int)$in["level"] : 0);
      $r["balance"] = w_true_balance($wdb, $acct["id"]);
      $r["cap"] = W_CAP;
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
} catch (WalletRateLimitException $e) {
  // IP 당 하루 신규 계정 상한(W_IP_DAILY) — 서버 오류가 아니라 정책 거절. 클라는 로컬 폴백으로 계속 쓴다.
  al_out(array("ok" => false, "error" => "rate-limited"), 429);
} catch (Throwable $e) {
  al_out(array("ok" => false, "error" => "server"), 500);
}
