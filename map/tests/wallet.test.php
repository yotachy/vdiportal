<?php
// 지갑 원장 단위 테스트. 프레임워크 없이 돌린다 — 이 저장소엔 컴포저가 없다.
// 출력은 node --test 와 같은 'ℹ pass N' / 'ℹ fail N' 형식이다. run.sh 가 그 형식만 읽는다.

// ⚠ SSV 키 서버 URL 을 require 보다 먼저 못박는다 — 이 스위트는 구글에 절대 접속하지 않는다.
//
// 가짜 키 서버를 '세는' 스트림 래퍼로 만든다. 파일(file://)로도 키 교체 경로는 밟을 수 있지만
// **몇 번 나갔는지**는 알 수 없고, 증폭 방어에서 실제로 물어야 할 질문이 정확히 그것이다
// (리뷰 실측: 키 서버가 죽은 상태에서 100요청 → 100회 재요청이 나가고 있었는데, 살아 있는
// 원격만 가지고 테스트해서 초록이었다). 여기서는 연결 시도 자체를 센다 — 성공이든 실패든.
class SsvNet {
  public static $count = 0;
  public static $body = null;   // null = 키 서버가 죽어 있다(연결 실패)
  public $context;
  private $pos = 0;
  public function stream_open($path, $mode, $opts, &$opened) {
    self::$count++;
    if (self::$body === null) return false;
    $this->pos = 0;
    return true;
  }
  public function stream_read($n) {
    $r = substr(self::$body, $this->pos, $n);
    $this->pos += strlen($r);
    return $r;
  }
  public function stream_eof() { return $this->pos >= strlen(self::$body); }
  public function stream_stat() { return array(); }
  public function url_stat($path, $flags) { return array(); }
}
stream_wrapper_register("ssvtest", "SsvNet");
define("W_SSV_KEYS_URL", "ssvtest://keys");

require_once __DIR__ . "/../wallet-lib.php";

$PASS = 0; $FAIL = 0; $MSGS = [];
function t($name, $fn) {
  global $PASS, $FAIL, $MSGS;
  try { $fn(); $PASS++; }
  catch (Throwable $e) { $FAIL++; $MSGS[] = "not ok - " . $name . ": " . $e->getMessage(); }
}
function ok($cond, $msg) { if (!$cond) throw new Exception($msg); }
function eq($a, $b, $msg) {
  if ($a !== $b) throw new Exception($msg . " — got " . var_export($a, true) . ", want " . var_export($b, true));
}

// 테스트마다 새 임시 디렉토리. 상태가 새면 순서 의존이 생긴다.
function tmpdir() {
  $d = sys_get_temp_dir() . "/wtest-" . bin2hex(random_bytes(6));
  mkdir($d, 0700, true);
  return $d;
}
function rmrf($d) {
  foreach (glob($d . "/*") as $f) { is_dir($f) ? rmrf($f) : @unlink($f); }
  @rmdir($d);
}

t("스키마가 생성되고 버전이 기록된다", function () {
  $d = tmpdir();
  $db = w_db($d);
  ok(is_file($d . "/wallet.db"), "wallet.db 가 안 생겼다");
  ok(w_schema_version($db) >= 1, "schema_version 이 0 이다");
  $names = [];
  foreach ($db->query("select name from sqlite_master where type='table'") as $r) { $names[] = $r["name"]; }
  // ad_grants 는 8d(스키마 v4)에서 들어왔다 — 새 db 는 마이그레이션이 끝까지 굴러가므로
  // 처음부터 존재한다. 8d 전에는 이 목록에 없어야 한다는 반대 방향 가드였다.
  foreach (["accounts", "ledger", "runs", "schema_version", "ad_grants"] as $want) {
    ok(in_array($want, $names, true), "테이블 없음: " . $want);
  }
  $db = null; rmrf($d);
});

t("두 번 열어도 마이그레이션이 다시 돌지 않는다", function () {
  $d = tmpdir();
  $db1 = w_db($d); $v1 = w_schema_version($db1); $db1 = null;
  $db2 = w_db($d); $v2 = w_schema_version($db2);
  eq($v2, $v1, "재실행에서 버전이 움직였다");
  $db2 = null; rmrf($d);
});

t("ledger.idem 은 UNIQUE 다 — DB 층에서 막아야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $ins = "insert into ledger (account_id, delta, reason, ref, idem, created_at) values ('a', -3, 'spend', 'AAPL', 'k1', '2026-01-01T00:00:00+00:00')";
  $db->exec($ins);
  $threw = false;
  try { $db->exec($ins); } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 idem 두 번이 들어갔다 — 이중 과금이 가능해진다");
  $db = null; rmrf($d);
});

// "무엇이든 던졌다"만 보면 가드를 지워도 초록이다 — PDO 가 알아서 던지기 때문이다(최종 리뷰
// 실측: is_writable 가드를 지워도 이 검사가 통과했다). 그래서 "우리 가드가 던졌는가"를 못박는다:
// 메시지로 분기를 특정하고, 그 예외가 PDOException(= 우리가 아니라 드라이버가 던진 것)이
// 아님을 함께 확인한다. 웹루트 폴백을 막는 것은 PDO 가 아니라 이 가드다.
t("쓸 수 없는 디렉토리면 예외를 던진다 — 조용히 폴백하지 않는다", function () {
  $e = null;
  try { w_db("/proc/nonexistent-wallet-dir"); } catch (Throwable $x) { $e = $x; }
  ok($e !== null, "못 쓰는 경로에서 조용히 성공했다");
  ok(!($e instanceof PDOException),
     "PDO 가 던진 것이지 w_db 의 디렉토리 가드가 던진 게 아니다 — 가드를 지워도 이 검사는 통과한다");
  ok(strpos($e->getMessage(), "만들 수 없다") !== false,
     "디렉토리 생성 실패 메시지가 아니다: " . $e->getMessage());
});

// 리뷰 라운드 2 진행 중 자체 발견: mkdir 은 "이미 있어서 실패"와 "정말 못 만들어서
// 실패"를 구분하지 않는다. 이 라운드에서 Probe 1(진짜로 빈 디렉토리에서 12-way 동시
// hello)을 증명하려다 실측 — 원래 코드는 첫 부팅 12-way 중 6~10개가 이 경로로 죽었다
// (승자가 mkdir 에 성공해 디렉토리가 이미 생겼는데, 나머지는 자기 mkdir 실패만 보고
// "못 만든다"며 던졌다). 단일 프로세스로는 이 race 자체가 안 잡혀 소스 모양으로 고정한다.
t("w_db 의 디렉토리 생성은 mkdir 실패만으로 곧장 던지지 않는다 — 동시 첫 부팅에서 이미 생겼을 수 있다", function () {
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);
  $i = strpos($src, "function w_db(");
  ok($i !== false, "w_db 를 못 찾았다");
  $body = substr($src, $i, 400);
  ok(preg_match('/!is_dir\(\$dir\)\s*&&\s*!@?mkdir\([^)]*\)\s*&&\s*!is_dir\(\$dir\)/', $body) === 1,
     "w_db 가 mkdir 실패 뒤에 is_dir 을 다시 확인하지 않는다 — 동시에 다른 프로세스가 막 만든 " .
     "디렉토리인데도 \"못 만든다\"며 던진다(12-way 실측: 6~10개가 이 경로로 죽었다)");
});

t("이미 있는 디렉토리가 쓰기 불가면 예외를 던진다 — 웹루트로 폴백하지 않는다", function () {
  // 노출 사고가 난 모양은 "만들 수 없는 경로"가 아니라 "있는데 권한이 틀린 경로"다.
  // w_db 의 두 번째 분기(is_writable)가 그 자리이고, /proc 케이스는 거기까지 못 간다.
  if (function_exists("posix_geteuid") && posix_geteuid() === 0) return;   // root 는 is_writable 이 무의미하다
  $d = tmpdir();
  chmod($d, 0500);
  $e = null;
  try { w_db($d); } catch (Throwable $x) { $e = $x; }
  chmod($d, 0700);
  rmrf($d);
  ok($e !== null, "쓰기 불가 디렉토리에서 조용히 성공했다 — 원장이 웹루트로 갈 수 있다");
  // 여기서도 "무엇이든 던졌다"로는 부족하다 — is_writable 가드를 지우면 PDO 가 대신 던져
  // 초록이 유지된다(최종 리뷰 실측). fail-closed 를 지키는 주체가 우리 가드임을 못박는다.
  ok(!($e instanceof PDOException),
     "PDO 가 던진 것이지 is_writable 가드가 던진 게 아니다 — 가드를 지워도 이 검사는 통과한다");
  ok(strpos($e->getMessage(), "쓸 수 없다") !== false,
     "쓰기 불가 분기의 메시지가 아니다: " . $e->getMessage());
});

t("시각은 UTC 다", function () {
  eq(strlen(w_today()), 10, "w_today 형식이 YYYY-MM-DD 가 아니다");
  eq(w_today(), gmdate("Y-m-d"), "w_today 가 UTC 가 아니다");
  ok(strpos(w_now(), gmdate("Y-m-d")) === 0, "w_now 가 UTC 날짜로 시작하지 않는다");
});

// 로컬은 SQLite 3.45.1 이고 서버는 3.26.0 이다. 아래 셋은 로컬에서 멀쩡히 돌고
// 서버에서만 깨진다 — 그 격차를 테스트가 대신 지킨다. 이 검사는 소스를 읽는다.
t("서버 SQLite 3.26.0 에 없는 기능을 쓰지 않는다", function () {
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);   // 블록 주석 — 이 파일 머리가 그 키워드를 설명한다
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);   // 줄 주석
  // 문자열 이어붙이기로 키워드를 쪼개는 회피는 방어하지 않는다 — 고의가 아니고서야 못 한다.
  // 이 가드의 목적은 실수를 잡는 것이지 의도적 우회를 막는 것이 아니다.
  foreach (array("returning", "strict", "drop column") as $bad) {
    ok(stripos($src, $bad) === false,
       "서버 SQLite 3.26.0 이 모르는 구문: " . $bad . " — 로컬(3.45.1)에서만 돈다");
  }
});

t("금액 상수가 시안 값과 같다", function () {
  $c = w_costs();
  eq($c["full"], 3, "full");
  eq($c["custom"], 5, "custom");
  eq($c["slot"], 1, "slot");
  eq($c["scan"], 2, "scan");
  eq(W_SEED, 5, "SEED"); eq(W_CAP, 20, "CAP");
  eq(W_CHECKIN, 1, "CHECKIN"); eq(W_CHEST, 5, "CHEST"); eq(W_CHEST_EVERY, 7, "CHEST_EVERY");
});

// 리뷰 3라운드: w_refund 가 run_type=NULL 행의 등급을 delta(가격)로 복구한다 — 그게
// 되려면 가격이 서로 달라야 한다. 언젠가 custom 을 3으로 내리면(full 과 겹치면) 그 복구가
// 조용히 엉뚱한 등급을 골라 잘못된 권리를 지우거나 살릴 수 있다 — 여기서 미리 잡는다.
t("가격은 서로 달라야 한다 — 환급이 delta 로 등급을 복구하는 전제다", function () {
  $c = w_costs();
  eq(count(array_unique(array_values($c))), count($c),
     "두 등급의 가격이 같다 — w_refund 의 delta→tier 복구가 등급을 잘못 고를 수 있다");
});

t("새 기기는 계정이 생기고 5개를 받는다 — 원장에도 남는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  eq($a["balance"], 5, "시드 잔량");
  eq(w_true_balance($db, $a["id"]), 5, "원장 합계");
  $r = $db->query("select reason, delta from ledger where account_id='" . $a["id"] . "'")->fetch();
  eq($r["reason"], "seed", "원장 사유");
  eq((int)$r["delta"], 5, "원장 델타");
  $db = null; rmrf($d);
});

t("같은 device_id 로 두 번 만들면 두 번째는 실패한다 — 시드 재지급 금지", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", null);
  $threw = false;
  try { w_create_account($db, "dev-1", null); } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 기기에 두 번 지급됐다");
  eq(w_true_balance($db, w_account_id("dev-1")), 5, "잔량이 늘었다");
  $db = null; rmrf($d);
});

t("account_id 는 device_id 에서 결정적으로 나온다", function () {
  eq(w_account_id("dev-1"), w_account_id("dev-1"), "같은 입력에 다른 id");
  ok(w_account_id("dev-1") !== w_account_id("dev-2"), "다른 입력에 같은 id");
  eq(strlen(w_account_id("dev-1")), 16, "id 길이");
});

t("balance 캐시가 위로 어긋나면 원장 기준으로 고친다 — 캐시행이 원장 합계와 정확히 같아야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $db->exec("update accounts set balance = 999 where id = '" . $a["id"] . "'");
  $a2 = w_get_account($db, "dev-1");
  $st = w_state($db, $a2);
  $truth = w_true_balance($db, $a["id"]);
  eq($st["balance"], $truth, "원장 기준으로 안 고쳤다");
  $row = $db->query("select balance from accounts where id='" . $a["id"] . "'")->fetch();
  // 이 케이스가 잡는 것: 위로 어긋난 캐시가 w_state 호출 한 번으로 원장 합계까지
  // 고쳐지고, 그 값이 디스크(캐시행)에도 남는다는 것. 단일 프로세스라 SELECT 와
  // UPDATE 사이에 원장이 바뀌는 상황을 만들 수 없으므로, 두 문장(SELECT 후 UPDATE)
  // 형태와 한 문장(서브쿼리) 형태를 이 어서션은 구분하지 못한다 — 그 원자성은
  // 아래 "한 문장이어야 한다" 소스 검사가 별도로 지킨다.
  eq((int)$row["balance"], $truth, "캐시가 디스크에서도 원장과 안 맞았다");
  $db = null; rmrf($d);
});

t("balance 캐시가 아래로 어긋나도 원장 기준으로 고친다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $db->exec("update accounts set balance = 1 where id = '" . $a["id"] . "'");   // 원장(5)보다 낮게 손상
  $a2 = w_get_account($db, "dev-1");
  $st = w_state($db, $a2);
  $truth = w_true_balance($db, $a["id"]);
  eq($st["balance"], $truth, "아래로 어긋난 캐시를 원장 기준으로 안 고쳤다");
  $row = $db->query("select balance from accounts where id='" . $a["id"] . "'")->fetch();
  eq((int)$row["balance"], $truth, "캐시행이 디스크에서 원장과 안 맞았다");
  $db = null; rmrf($d);
});

t("w_state 의 캐시 수리는 한 문장이어야 한다 — 행동으로는 관찰할 수 없다", function () {
  // 두 문장(SELECT 후 UPDATE)과 한 문장(서브쿼리)은 그 사이에 다른 트랜잭션이 끼어들 때만
  // 갈린다. 단일 프로세스 하네스에는 끼어들 지점이 없어 어떤 어서션으로도 구분되지 않는다
  // — 실제로 두 문장으로 되돌려도 전 테스트가 통과한다. 그래서 소스 모양으로 지킨다.
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);
  $i = strpos($src, "function w_state");
  ok($i !== false, "w_state 를 못 찾았다");
  $body = substr($src, $i);
  $end = strpos($body, "\n}");
  if ($end !== false) $body = substr($body, 0, $end);
  ok(preg_match('/update\s+accounts\s+set\s+balance\s*=\s*\(\s*select/i', $body) === 1,
     "w_state 의 캐시 수리가 서브쿼리 한 문장이 아니다 — 읽기와 쓰기가 갈라지면 그 사이 원장 변경이 캐시에 낡은 값을 새긴다");
  ok(preg_match('/set\s+balance\s*=\s*\?/i', $body) !== 1,
     "w_state 가 미리 읽은 값을 그대로 쓰고 있다(set balance = ?) — 두 문장 형태로 되돌아갔다");
});

t("state 는 클라이언트 계약대로 네 칸을 준다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $st = w_state($db, $a);
  foreach (["balance", "cap", "streakDays", "canCheckin"] as $k) {
    ok(array_key_exists($k, $st), "state 에 " . $k . " 가 없다");
  }
  eq($st["cap"], W_CAP, "cap");
  eq($st["canCheckin"], true, "새 계정은 출석 가능해야 한다");
  $db = null; rmrf($d);
});

t("IP 해시당 하루 신규 계정이 세어진다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", "iphash");
  w_create_account($db, "dev-2", "iphash");
  eq(w_seed_count_today($db, "iphash"), 2, "카운트");
  eq(w_seed_count_today($db, "other"), 0, "다른 IP 는 안 세야 한다");
  $db = null; rmrf($d);
});

function mkacct($db, $dev) { return w_create_account($db, $dev, null); }

t("spend 가 차감하고 원장·권리를 남긴다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "full", "k1", "AAPL", "1.11.0");
  eq($r["ok"], true, "ok");
  eq($r["charged"], true, "charged");
  eq(w_true_balance($db, $a["id"]), 2, "5 - 3");
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "권리가 안 생겼다");
  $db = null; rmrf($d);
});

t("같은 idem 두 번이면 한 번만 수금하고 같은 결과를 재생한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r1 = w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r2 = w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq($r2["ok"], true, "두 번째 ok");
  eq($r2["charged"], $r1["charged"], "재생 결과가 다르다");
  eq(w_true_balance($db, $a["id"]), 2, "두 번 수금됐다");
  $n = $db->query("select count(*) c from ledger where idem='k1'")->fetch();
  eq((int)$n["c"], 1, "원장 행이 둘이다");
  $db = null; rmrf($d);
});

t("24h 안 같은 종목은 charged:false 이고 delta 0 행이 남는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r = w_spend($db, $a["id"], "full", "k2", "AAPL", null);
  eq($r["ok"], true, "ok");
  eq($r["charged"], false, "재과금됐다");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 줄었다");
  $row = $db->query("select delta, reason from ledger where idem='k2'")->fetch();
  ok($row !== false, "무료 경로에 원장 행이 없다 — 멱등키가 기록되지 않는다");
  eq((int)$row["delta"], 0, "delta");
  eq($row["reason"], "spend-cached", "reason");
  $db = null; rmrf($d);
});

t("권리가 만료되면 다시 과금한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  // 5 로는 3 을 두 번 못 낸다 — 만료 재과금을 보려면 잔량을 먼저 채운다.
  // 원장에 직접 넣는다: 이 검사의 대상은 spend 이지 지급 경로가 아니다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,5,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 10 → 7
  $db->exec("update runs set expiry = '2000-01-01T00:00:00+00:00'");
  $r = w_spend($db, $a["id"], "full", "k2", "AAPL", null);  // 만료 → 재과금 7 → 4
  eq($r["ok"], true, "ok");
  eq($r["charged"], true, "만료 후에도 무료였다");
  eq(w_true_balance($db, $a["id"]), 4, "재과금 후 잔량");
  $db = null; rmrf($d);
});

t("종목이 다르면 별개 권리다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  // 이 검사의 대상은 "다른 종목은 캐시 적중이 아니다" 이지 잔량 한도가 아니다 —
  // 5 로는 3 을 두 번 못 내므로 두 번째 spend 를 위해 미리 채워 둔다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,5,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));                 // 2 → 7
  $r = w_spend($db, $a["id"], "full", "k2", "NVDA", null);
  eq($r["charged"], true, "다른 종목이 무료였다");
  $db = null; rmrf($d);
});

// w_active_run 의 `account_id = ?` 를 항진식으로 바꿔도 66건 스위트는 초록이었다(최종 리뷰
// 실측) — 그 상태에선 누구든 한 명이 full/AAPL 을 사면 24시간 동안 전 계정이 같은 종목을
// 공짜로 본다. 이 브랜치가 idem 재생에서 막은 것과 같은 종류의 구멍이 테이블 하나 옆에 있었다.
t("권리는 계정 소유다 — 남이 산 Full 을 타고 공짜로 받지 못한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = mkacct($db, "dev-a"); $b = mkacct($db, "dev-b");
  $ra = w_spend($db, $a["id"], "full", "ka", "AAPL", null);
  eq($ra["charged"], true, "A 가 과금되지 않았다");
  $rb = w_spend($db, $b["id"], "full", "kb", "AAPL", null);   // 다른 계정·새 idem·같은 종목
  eq($rb["ok"], true, "ok");
  eq($rb["charged"], true, "B 가 A 의 권리를 타고 공짜로 받았다 — w_active_run 이 계정 범위가 아니다");
  eq(w_true_balance($db, $b["id"]), 2, "B 잔량이 안 줄었다");
  $row = $db->query("select delta, reason from ledger where idem='kb'")->fetch();
  eq((int)$row["delta"], -3, "B 원장 델타");
  eq($row["reason"], "spend", "B 원장 사유 — spend-cached 면 공짜로 받은 것이다");
  $db = null; rmrf($d);
});

t("잔량이 모자라면 롤백하고 원장에 아무 것도 안 남는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  $r = w_spend($db, $a["id"], "full", "k2", "NVDA", null);   // 2 < 3
  eq($r["ok"], false, "ok");
  eq($r["reason"], "insufficient", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 움직였다");
  $n = $db->query("select count(*) c from ledger where idem='k2'")->fetch();
  eq((int)$n["c"], 0, "실패한 spend 가 원장에 남았다");
  $n = $db->query("select count(*) c from runs where symbol='NVDA'")->fetch();
  eq((int)$n["c"], 0, "실패했는데 권리가 생겼다");
  $db = null; rmrf($d);
});

t("scan·slot 은 권리를 만들지 않는다 — 단순 차감", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "scan", "k1", null, null);
  eq($r["charged"], true, "charged");
  eq(w_true_balance($db, $a["id"]), 3, "5 - 2");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "scan 이 권리를 만들었다");
  $r2 = w_spend($db, $a["id"], "scan", "k2", null, null);
  eq($r2["charged"], true, "두 번째 스캔이 무료였다 — scan 은 권리가 없다");
  $db = null; rmrf($d);
});

t("모르는 runType 과 빈 idem 은 거절한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  eq(w_spend($db, $a["id"], "nope", "k1", null, null)["reason"], "unknown-runtype", "runtype");
  eq(w_spend($db, $a["id"], "full", "", "AAPL", null)["reason"], "bad-idem", "idem");
  eq(w_true_balance($db, $a["id"]), 5, "거절인데 잔량이 움직였다");
  $db = null; rmrf($d);
});

t("잔량은 음수가 되지 않는다 — 연속 spend", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  for ($i = 0; $i < 5; $i++) { w_spend($db, $a["id"], "scan", "k" . $i, null, null); }
  ok(w_true_balance($db, $a["id"]) >= 0, "잔량이 음수다");
  $db = null; rmrf($d);
});

// ── 리뷰 1라운드: C1+C2(멱등 재생이 계정·등급·대상을 안 봤다) + I1·I4·I5 ──────────

t("다른 계정의 idem 을 재생할 수 없다 — 계정 범위여야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = mkacct($db, "dev-a"); $b = mkacct($db, "dev-b");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r = w_spend($db, $b["id"], "full", "k1", "AAPL", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $b["id"]), 5, "다른 계정 잔량이 움직였다");
  // account_id='b' 전체가 아니라 idem='k1' 로 좁힌다 — 계정 생성 자체가 seed 원장 행을
  // 남기므로 전체 카운트는 항상 1 이상이다. 이 검사가 잡으려는 건 k1 재사용이 b 에
  // 새 행을 만들었는가이다.
  $n = $db->query("select count(*) c from ledger where account_id='" . $b["id"] . "' and idem='k1'")->fetch();
  eq((int)$n["c"], 0, "다른 계정에 k1 원장 행이 생겼다");
  $db = null; rmrf($d);
});

// ⚠ ref 는 반드시 고정한다(둘 다 AAPL). 예전엔 full/AAPL → custom/NVDA 로 등급과 대상을 함께
// 바꿨는데, 그러면 ref 검사만으로도 거절돼서 등급 검사(`$prev["run_type"] === $runType`)를
// 통째로 지워도 초록이었다(최종 리뷰 실측). 등급 하나만 바꿔야 이 가드가 대상이 된다.
t("같은 idem 이라도 runType 이 다르면 재생이 아니라 거절이다 — 싼 등급 값으로 비싼 등급을 못 받는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 5 → 2 (full=3)
  $r = w_spend($db, $a["id"], "custom", "k1", "AAPL", null);   // 같은 대상, 비싼 등급(custom=5)
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 움직였다");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") === null,
     "full 값(3)만 내고 custom 권리(5)를 받아갔다 — 등급 검사가 없다");
  $n = $db->query("select count(*) c from ledger where idem='k1'")->fetch();
  eq((int)$n["c"], 1, "거절인데 원장 행이 늘었다");
  $db = null; rmrf($d);
});

t("같은 idem 이라도 ref 가 다르면 재생이 아니라 거절이다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 5 → 2
  $r = w_spend($db, $a["id"], "full", "k1", "NVDA", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 움직였다");
  $db = null; rmrf($d);
});

t("시드 idem(seed:<계정id>) 재사용으로 무한 결제를 받을 수 없다 — 실제 익스플로잇", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $seedIdem = "seed:" . $a["id"];   // 클라이언트가 스스로 고른 device_id 에서 오프라인으로 계산 가능
  $r = w_spend($db, $a["id"], "custom", $seedIdem, "AAPL", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "시드 idem 재생으로 잔량이 움직였다");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") === null, "시드 idem 재생으로 권리가 생겼다");
  $db = null; rmrf($d);
});

t("scan 은 ref 가 있어도 권리를 만들지 않는다 — 등급 자체가 권리가 없다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "scan", "k1", "AAPL", null);
  eq($r["charged"], true, "charged");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "scan 이 ref 를 받았다고 권리를 만들었다");
  $db = null; rmrf($d);
});

t("slot 은 ref 가 있어도 권리를 만들지 않는다 — 등급 자체가 권리가 없다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "slot", "k1", "AAPL", null);
  eq($r["charged"], true, "charged");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "slot 이 ref 를 받았다고 권리를 만들었다");
  $db = null; rmrf($d);
});

t("full·custom 은 ref 가 없으면 과금하지 않고 거절한다 — bad-ref", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r1 = w_spend($db, $a["id"], "full", "k1", null, null);
  eq($r1["ok"], false, "ok(null ref)");
  eq($r1["reason"], "bad-ref", "reason(null ref)");
  $r2 = w_spend($db, $a["id"], "custom", "k2", "", null);
  eq($r2["ok"], false, "ok(빈 ref)");
  eq($r2["reason"], "bad-ref", "reason(빈 ref)");
  eq(w_true_balance($db, $a["id"]), 5, "거절인데 잔량이 움직였다");
  $db = null; rmrf($d);
});

// I1: BEGIN IMMEDIATE 를 평범한 BEGIN 으로 되돌려도 25개짜리 스위트는 여전히 초록이다
// (w_state 캐시 수리 때와 같은 모양의 구멍) — 그래서 행동이 아니라 소스 모양으로 지킨다.
// 소스에서 함수 하나의 "본문"을 잘라내는 공용 헬퍼 — w_spend/w_refund/w_checkin 셋 다에 쓴다.
// 어느 함수가 파일의 마지막인지는 상관없다: 다음 최상위 "function " 선언 앞까지를
// 본문으로 본다(중첩 { } 가 많아 첫 "\n}" 로는 못 자르는 함수들이라 이 방식이 필요하다).
function wtest_fn_body($src, $fnName) {
  $i = strpos($src, "function " . $fnName);
  if ($i === false) return false;
  $body = substr($src, $i);
  $end = strpos($body, "\nfunction ", 1);
  return ($end !== false) ? substr($body, 0, $end) : $body;
}
function wtest_source_no_comments() {
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);
  return $src;
}

foreach (array("w_spend", "w_refund", "w_checkin", "w_create_account") as $fn) {
  t($fn . " 은 begin immediate 로 열어야 한다 — 동시성 보장은 행동으로 관찰되지 않는다", function () use ($fn) {
    $body = wtest_fn_body(wtest_source_no_comments(), $fn);
    ok($body !== false, $fn . " 를 못 찾았다");
    ok(strpos($body, "begin immediate") !== false,
       $fn . " 가 begin immediate 를 쓰지 않는다 — 두 요청이 같은 잔량/출석 상태를 읽고 각자 갱신할 수 있다");
    ok(preg_match('/exec\s*\(\s*["\']begin(?!\s*immediate)/i', $body) !== 1,
       $fn . " 안에 immediate 없는 맨 begin 이 있다");
    ok(strpos($body, "beginTransaction(") === false,
       $fn . " 가 beginTransaction() 을 쓴다 — SQLite 기본 DEFERRED 트랜잭션은 쓰기 락을 먼저 안 잡는다");
  });
}

// I3: w_refund 의 권리 삭제에서 created_at(및 tier) 조건을 통째로 빼도 행동 검사만으로는
// 안 잡힌다 — 삭제가 "더" 되는 실패라 기존 데이터 상태에 우연히 가려질 수 있다. symbol 만
// 남기고 tier·created_at 을 뺀 버전으로 리뷰가 실측: 43개가 그대로 초록이었다. 소스 모양으로 고정한다.
t("w_refund 의 권리 삭제는 symbol·tier·created_at 세 조건을 모두 써야 한다", function () {
  $body = wtest_fn_body(wtest_source_no_comments(), "w_refund");
  ok($body !== false, "w_refund 를 못 찾았다");
  ok(preg_match('/delete\s+from\s+runs\s+where\s+account_id\s*=\s*\?\s+and\s+symbol\s*=\s*\?\s+and\s+tier\s*=\s*\?\s+and\s+created_at\s*=\s*\?/i', $body) === 1,
     "w_refund 의 runs 삭제가 account_id·symbol·tier·created_at 네 조건을 모두 쓰지 않는다 — " .
     "빠지면 같은 계정·같은 종목의 다른 등급/다른 시점 권리까지 같이 지워진다");
});

// ── Task 4: refund · checkin — 스트릭 · 상한 · capped ──────────────────────

t("refund 가 되돌리고 두 번 불러도 한 번만 돌려준다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq(w_true_balance($db, $a["id"]), 2, "차감 전제");
  eq(w_refund($db, $a["id"], "k1")["ok"], true, "첫 환급");
  eq(w_true_balance($db, $a["id"]), 5, "환급 후 잔량");
  $r2 = w_refund($db, $a["id"], "k1");
  eq($r2["ok"], false, "두 번째가 성공했다");
  eq($r2["reason"], "already-refunded", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "두 번 환급됐다");
  $db = null; rmrf($d);
});

t("환급은 지갑 상한을 넘겨도 깎지 않는다 — 가져간 것을 돌려주는 것이다", function () {
  // I4: 스펜드 직후(잔량이 상한보다 정확히 3 모자란 상태)에 곧장 환급하면, 상한을 무시하는
  // 구현(min(back, W_CAP-bal))도 room 이 딱 3이라 우연히 3을 그대로 돌려줘 이 테스트를
  // 통과시킨다(리뷰에서 실측: 캡을 심어도 0개 실패). 그래서 환급 "전에" 다시 상한까지
  // 채운다 — room 이 0인 채로 3을 돌려받아야 하므로, 캡을 적용하면 반드시 실패한다.
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup1',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));   // 상한까지 채운다
  eq(w_true_balance($db, $a["id"]), W_CAP, "상한 전제");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);       // W_CAP → W_CAP-3
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,3,'seed',NULL,'topup2',?)")
     ->execute(array($a["id"], w_now()));                    // 다시 상한까지 채운다 — room=0
  eq(w_true_balance($db, $a["id"]), W_CAP, "재충전 후 상한 전제");
  eq(w_refund($db, $a["id"], "k1")["ok"], true, "환급");
  eq(w_true_balance($db, $a["id"]), W_CAP + 3, "환급이 상한으로 깎였다 — 훔친 셈이다");
  $db = null; rmrf($d);
});

t("없는 idem 과 delta 0 행은 환급 대상이 아니다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  eq(w_refund($db, $a["id"], "nope")["reason"], "not-found", "없는 키");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  w_spend($db, $a["id"], "full", "k2", "AAPL", null);   // charged:false, delta 0
  eq(w_refund($db, $a["id"], "k2")["reason"], "nothing-to-refund", "delta 0 을 환급했다");
  $db = null; rmrf($d);
});

// C1: 환급은 '차감'(delta<0)만 되돌려야 한다. 아니면 클라이언트가 계산할 수 있는 지급 키
// (seed:<acctId>, checkin:<acctId>:<day>) 나, 심지어 직전 환급 자신의 보상 행(<idem>:refund)
// 까지 idem 만 맞으면 그대로 받아들여 -delta 를 또 넣어 잔량이 음수로 간다(리뷰에서 실측).
t("시드 지급 행을 환급할 수 없다 — 클라이언트가 계산 가능한 idem 이다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $seedIdem = "seed:" . $a["id"];
  $r = w_refund($db, $a["id"], $seedIdem);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "nothing-to-refund", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "시드 환급으로 잔량이 움직였다");
  $db = null; rmrf($d);
});

t("환급의 보상 행 자체를 또 환급할 수 없다 — 잔량이 음수로 간다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  w_refund($db, $a["id"], "k1");                         // 2 → 5, 보상 행 idem="k1:refund"
  eq(w_true_balance($db, $a["id"]), 5, "환급 전제");
  $r = w_refund($db, $a["id"], "k1:refund");
  eq($r["ok"], false, "ok");
  eq($r["reason"], "nothing-to-refund", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "환급의 환급으로 잔량이 움직였다 — 음수로 갔어야 했다면 더 심각하다");
  $db = null; rmrf($d);
});

t("환급은 계정 범위다 — 다른 계정 idem 을 환급할 수 없다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = mkacct($db, "dev-a"); $b = mkacct($db, "dev-b");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // a: 5 → 2
  $r = w_refund($db, $b["id"], "k1");
  eq($r["ok"], false, "ok");
  eq($r["reason"], "not-found", "reason");
  eq(w_true_balance($db, $b["id"]), 5, "b 잔량이 움직였다");
  eq(w_true_balance($db, $a["id"]), 2, "a 잔량이 환급 없이 움직였다");
  $db = null; rmrf($d);
});

t("환급이 권리도 함께 지운다 — 환급받고 계속 공짜로 보면 안 된다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "권리가 안 생겼다");
  w_refund($db, $a["id"], "k1");
  ok(w_active_run($db, $a["id"], "AAPL", "full") === null, "환급했는데 권리가 남았다");
  $db = null; rmrf($d);
});

// I2: 같은 계정·같은 종목·같은 순간에 등급이 다른 두 권리(full·custom)가 있으면,
// tier 없이 symbol·created_at 만으로 지우는 삭제는 둘 다 지운다 — full 을 환급했는데
// custom 권리(5를 내고 산 것)까지 사라진다(리뷰에서 실측).
t("같은 종목·같은 순간이라도 다른 등급 권리는 건드리지 않는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,20,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));   // full(3)+custom(5) 를 같은 트랜잭션 순서로 넉넉히
  $now = w_now();
  // w_spend 가 같은 $now 를 ledger·runs 양쪽에 쓰므로, 두 spend 를 "같은 순간"으로
  // 흉내내려면 원장에 직접 같은 created_at 으로 두 쌍(ledger+runs)을 심어야 한다 —
  // w_spend 두 번 호출은 실제로도 $now 문자열이 초 단위로 같을 수 있는 정상 상황이다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-3,'spend','AAPL','kf','full',?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','full',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-5,'spend','AAPL','kc','custom',?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','custom',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "full 권리 준비 실패");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") !== null, "custom 권리 준비 실패");
  eq(w_refund($db, $a["id"], "kf")["ok"], true, "full 환급");
  ok(w_active_run($db, $a["id"], "AAPL", "full") === null, "환급한 full 권리가 안 지워졌다");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") !== null, "환급 안 한 custom 권리까지 지워졌다");
  $db = null; rmrf($d);
});

// 리뷰 2라운드: tier=? 가 run_type IS NULL 인 행(v2 마이그레이션 이전, 즉 schema v1 시절에
// 쓰인 spend)에서 아무것도 지우지 못한다 — SQL 에서 "tier = NULL" 은 절대 참이 될 수 없다.
// v1 데이터베이스를 실제로 재현해 실측(리포트 참고): 마이그레이션 후 환급하면 ok=true 인데
// 권리가 그대로 남았다. 여기선 같은 상태를 원장에 직접 심어 표준 테스트로 고정한다.
t("run_type 이 NULL 인 v1 시절 행도 환급이 권리를 지운다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $now = w_now();
  // v2 마이그레이션은 run_type 컬럼만 추가하고 기존 행을 소급 채우지 않는다 — 여기선
  // 그 상태(컬럼은 있지만 이 행만 NULL)를 그대로 흉내낸다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-3,'spend','AAPL','k1',NULL,?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','full',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "권리 준비 실패");
  $r = w_refund($db, $a["id"], "k1");
  eq($r["ok"], true, "환급");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "run_type NULL 행을 환급했는데 권리가 남았다 — 돈은 돌아오고 열람권은 유지된다");
  $db = null; rmrf($d);
});

// 리뷰 3라운드: 2라운드가 "v1 은 등급 구분이 없어 같은 초·같은 종목에 두 등급이 공존할 수
// 없다"고 주장했는데 틀렸다 — runs.tier 는 Task 3(즉 v1)부터 있었다. v2 에서 새로 생긴 건
// ledger.run_type 뿐이다. 그러니 v1 시절에도 같은 계정·같은 종목·같은 초에 full+custom 두
// 권리가 실제로 공존할 수 있고, 리뷰가 그 상태를 실제 v1 라이브러리로 재현해 실측했다:
// full 을 환급했는데 tier 조건 없이 지우면 환급 안 한 custom 권리까지 같이 지워졌다(과삭제
// — 환급하지 않았는데 5 스쿱짜리 권리를 잃는, 라운드 2보다 더 나쁜 실패).
// run_type=NULL 이어도 delta(가격)로 등급을 복구할 수 있다(full=3, custom=5 — 서로 다르다) —
// 여기선 그 상태를 원장에 직접 심어 표준 테스트로 고정한다.
t("run_type 이 NULL 이고 같은 초·같은 종목에 등급이 둘이면 델타로 등급을 가려 환급한 것만 지운다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,20,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));
  $now = w_now();
  // v1 라이브러리(run_type 컬럼 자체가 없던 시절)가 남겼을 모양 그대로: ledger 는
  // run_type 이 없으니 NULL, runs.tier 는 그때도 채워졌다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-3,'spend','AAPL','kf',NULL,?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','full',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-5,'spend','AAPL','kc',NULL,?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','custom',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "full 권리 준비 실패");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") !== null, "custom 권리 준비 실패");
  eq(w_refund($db, $a["id"], "kf")["ok"], true, "full 환급");
  ok(w_active_run($db, $a["id"], "AAPL", "full") === null, "환급한 full 권리가 안 지워졌다");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") !== null, "환급 안 한 custom 권리까지 지워졌다 — 과삭제");
  $db = null; rmrf($d);
});

t("출석은 하루 한 번이고 스트릭이 오른다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_checkin($db, $a, null);
  eq($r["ok"], true, "첫 출석");
  eq($r["granted"], 1, "지급");
  eq(w_true_balance($db, $a["id"]), 6, "잔량");
  $a2 = w_get_account($db, "dev-1");
  eq((int)$a2["streak_days"], 1, "스트릭");
  eq(w_state($db, $a2)["canCheckin"], false, "같은 날 또 가능하다고 나온다");
  $r2 = w_checkin($db, $a2, null);
  eq($r2["ok"], false, "같은 날 두 번 됐다");
  eq($r2["reason"], "already", "reason");
  eq(w_true_balance($db, $a["id"]), 6, "두 번 지급됐다");
  $db = null; rmrf($d);
});

t("7일 연속이면 상자 +5 가 함께 나온다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $day = "2026-03-01";
  $last = null;
  for ($i = 0; $i < 7; $i++) {
    $acct = w_get_account($db, "dev-1");
    $last = w_checkin($db, $acct, w_day_add($day, $i));
  }
  eq($last["granted"], W_CHECKIN + W_CHEST, "7일차 지급이 상자를 안 포함한다");
  eq((int)w_get_account($db, "dev-1")["streak_days"], 7, "스트릭");
  $db = null; rmrf($d);
});

t("하루 끊기면 스트릭이 1로 돌아간다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-01");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-02");
  eq((int)w_get_account($db, "dev-1")["streak_days"], 2, "이틀차");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-04");   // 03-03 을 건너뜀
  eq((int)w_get_account($db, "dev-1")["streak_days"], 1, "끊겼는데 이어졌다");
  $db = null; rmrf($d);
});

t("상한 초과분은 버려지고 capped 가 뜬다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));
  $r = w_checkin($db, w_get_account($db, "dev-1"), null);
  eq($r["ok"], true, "ok");
  eq($r["granted"], 0, "상한인데 지급됐다");
  eq($r["capped"], true, "capped 가 안 떴다 — 화면 안내가 조용히 사라진다");
  eq(w_true_balance($db, $a["id"]), W_CAP, "상한을 넘었다");
  $db = null; rmrf($d);
});

t("상한에 걸려도 출석일은 소비된다 — 하루가 지나가야 다시 가능하다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));
  w_checkin($db, w_get_account($db, "dev-1"), null);
  eq(w_get_account($db, "dev-1")["last_checkin"], w_today(), "capped 인데 출석일이 안 남았다");
  $r2 = w_checkin($db, w_get_account($db, "dev-1"), null);
  eq($r2["reason"], "already", "capped 였는데 같은 날 또 됐다");
  $db = null; rmrf($d);
});

// ── Task 5: 베어러 토큰 ──────────────────────────────────────────────

t("토큰은 왕복하고 변조·쓰레기·세그먼트 이상은 거부된다", function () {
  $d = tmpdir();
  $tok = w_token_make($d, "dev-1");   // 접두 없음 — 8c 이전 옛 토큰 모양
  eq(w_token_read($d, $tok), array("type" => "device", "id" => "dev-1"), "왕복");
  eq(w_token_read($d, $tok . "x"), null, "변조된 토큰이 통과했다");
  eq(w_token_read($d, "garbage"), null, "쓰레기 토큰이 통과했다");
  rmrf($d);
});

// 리뷰 라운드 1(I8): 앞선 버전은 exp 필드만 문자열로 바꿔치기하고 서명은 원래 것을
// 그대로 뒀다 — 그래서 검증이 서명 불일치로 거부했을 뿐, exp<time() 분기 자체는 한 번도
// 실행되지 않고도 스위트가 초록이었다(실측: `|| $exp < time()` 를 통째로 지워도 전부
// 통과). 진짜 만료를 증명하려면 새 exp 로 "다시" 서명한, 서명은 유효한 토큰이 필요하다.
t("서명은 유효하지만 만료된 토큰은 거부된다", function () {
  $d = tmpdir();
  $exp = time() - 10;
  $sig = _wb64e(hash_hmac("sha256", "dev-1|" . $exp, w_secret($d), true));
  $tok = _wb64e("dev-1") . "|" . $exp . "|" . $sig;
  eq(w_token_read($d, $tok), null, "만료 토큰이 통과했다");
  rmrf($d);
});

// "a|b" 나 "a|b|c|d" 같은 손으로 지어낸 쓰레기 토큰으로는 이 검사가 증명되지 않는다 —
// (int)"b" 가 0 이 되어 exp<time() 분기가 먼저 걸러버려서, count 검사를 통째로 지워도
// 그 가짜 토큰들은 여전히 거부된다(뮤테이션으로 실측: 제거해도 그 두 케이스는 안 들킨다).
// 진짜 유효한(서명까지 맞는) 토큰에 세그먼트를 더하거나 뺀 형태여야 count 검사 자체를
// 시험한다.
t("세그먼트 수가 3이 아닌 토큰은 거부된다 — 서명은 유효해도 형식이 어긋나면 거부한다", function () {
  $d = tmpdir();
  $tok = w_token_make($d, "dev-1");
  // 여분 세그먼트: 앞 세 필드(기기·만료·서명)는 전부 유효하게 서명된 채로 남아 있다 —
  // count 검사가 없으면 explode 뒤 $p[0..2] 만 보고 서명 비교까지 통과해버린다.
  eq(w_token_read($d, $tok . "|extra"), null, "여분 세그먼트가 붙은 토큰이 통과했다");
  // 세그먼트 부족(서명 필드 자체가 없음)도 함께 확인해 둔다.
  $parts = explode("|", $tok);
  eq(w_token_read($d, $parts[0] . "|" . $parts[1]), null, "서명 필드가 없는 토큰이 통과했다");
  rmrf($d);
});

// I8: hash_equals 를 !== 로 바꿔도(비상수시간 비교) 위 행동 테스트들은 여전히 초록이다 —
// 타이밍 안전성은 행동으로 관찰되지 않는다. 소스 모양으로 고정한다(이 파일의 다른 세 소스
// 가드와 같은 패턴).
t("w_token_read 는 hash_equals 로 비교해야 한다 — 문자열 비교는 타이밍 공격에 열린다", function () {
  $src = wtest_source_no_comments();
  $i = strpos($src, "function w_token_read");
  ok($i !== false, "w_token_read 를 못 찾았다");
  $body = substr($src, $i);
  $end = strpos($body, "\nfunction ", 1);
  if ($end !== false) $body = substr($body, 0, $end);
  ok(strpos($body, "hash_equals") !== false,
     "w_token_read 가 hash_equals 를 쓰지 않는다 — 서명 비교가 상수시간이 아니다");
});

t("비밀키는 자동 생성되고 파일 권한이 좁다", function () {
  $d = tmpdir();
  $s1 = w_secret($d);
  ok(strlen($s1) >= 32, "비밀키가 짧다");
  eq(w_secret($d), $s1, "호출마다 달라진다 — 토큰이 매번 무효가 된다");
  eq(substr(sprintf("%o", fileperms($d . "/wallet_secret.txt")), -3), "600", "권한");
  rmrf($d);
});

t("다른 비밀키로 만든 토큰은 거부된다", function () {
  $d1 = tmpdir(); $d2 = tmpdir();
  $tok = w_token_make($d1, "dev-1");
  eq(w_token_read($d2, $tok), null, "남의 키로 만든 토큰이 통과했다");
  rmrf($d1); rmrf($d2);
});

// ── 리뷰 라운드 2: w_secret 의 첫 생성이 원자적이지 않으면 12-way 동시 첫 부팅에서
// 프로세스마다 다른 비밀키를 쓴다(실측: 서로 다른 키 4·4·6개). w_ip_hash 가 이 키로
// IP 해시를 만들므로(I5) 키가 갈리면 같은 IP 의 상한 버킷도 그만큼 갈려 상한이 그
// 수만큼 늘어난다 — 단일 프로세스 테스트로는 이 동시성 자체가 안 잡힌다(진짜 검증은
// 아래 "Prove it" 섹션의 OS 프로세스 실측). 여기서는 이 파일의 다른 소스가드들과 같은
// 패턴으로 구현 모양을 고정한다.
//
// rename() 을 먼저 썼다가 실측으로 뒤집었다: rename 은 "덮어써도 원자적"(잘린 내용을
// 안 보여준다)이지 "한 번만 성공"이 아니다 — 목적지가 있어도 그냥 덮어써서 마지막
// 승자가 계속 바뀐다(12-way 재현: 12개 중 11개가 서로 다른 값을 읽었다). link() 는
// 목적지가 있으면 실패한다(EEXIST) — "가장 먼저 만든 사람만 남는다"를 보장하는 건 이
// 쪽이다. 그래서 이 가드는 rename 이 아니라 link 를 찾는다.

t("w_secret 의 파일 생성은 원자적 단독승자여야 한다 — link 로 옮겨야 한다", function () {
  $body = wtest_fn_body(wtest_source_no_comments(), "w_secret");
  ok($body !== false, "w_secret 를 못 찾았다");
  // "link(" 만 찾으면 "@unlink(" 안의 "link(" 부분문자열에도 우연히 걸린다(cleanup 을
  // 위해 unlink 는 항상 남아있으니 이 표현으로는 rename-only 뮤테이션이 안 잡힌다 —
  // 실측: 첫 버전으로 뮤테이션을 걸어도 초록이었다). "@link(" 로 앞의 @ 까지 함께 찾는다.
  ok(strpos($body, "@link(") !== false,
     "w_secret 가 link 를 쓰지 않는다 — rename 만으로는 목적지가 있어도 덮어써서 " .
     "여러 프로세스가 서로 다른 비밀키로 계속 갈아치운다(실측: 12개 중 11개가 서로 달랐다)");
});

t("w_secret 의 짧은 읽기는 곧장 던지지 않고 재시도해야 한다", function () {
  $body = wtest_fn_body(wtest_source_no_comments(), "w_secret");
  ok($body !== false, "w_secret 를 못 찾았다");
  ok(strpos($body, "usleep") !== false,
     "w_secret 가 짧은 읽기에서 재시도 없이 곧장 던진다 — link 로 단독승자가 보장되어도 파일이 " .
     "막 생긴 순간을 다른 프로세스가 헛읽을 수 있는 창에서 정상 요청이 곧장 500 을 맞는다");
});

// ── 리뷰 라운드 1(C1): w_secret 이 빈/읽기불가 키로 물러서면 스킴을 아는 누구나
// 임의 기기의 토큰을 위조한다. 실측: 0바이트 비밀키 파일 하나로 "any-victim" 토큰이
// 그대로 통과했다. w_db() 가 웹루트 폴백을 거부하는 것과 같은 이유로 여기서도 거부해야 한다.

t("빈 비밀키 파일은 예외를 던진다 — 빈 키로 서명하면 누구나 토큰을 위조한다", function () {
  $d = tmpdir();
  file_put_contents($d . "/wallet_secret.txt", "");
  $threw = false;
  try { w_secret($d); } catch (Throwable $e) { $threw = true; }
  ok($threw, "빈 비밀키로 조용히 성공했다 — 위조 가능한 상태다");
  rmrf($d);
});

t("읽을 수 없는 비밀키 파일은 예외를 던진다", function () {
  if (function_exists("posix_geteuid") && posix_geteuid() === 0) return;   // root 는 is_readable 이 무의미
  $d = tmpdir();
  file_put_contents($d . "/wallet_secret.txt", bin2hex(random_bytes(32)));
  chmod($d . "/wallet_secret.txt", 0000);
  $threw = false;
  try { w_secret($d); } catch (Throwable $e) { $threw = true; }
  chmod($d . "/wallet_secret.txt", 0600);
  rmrf($d);
  ok($threw, "읽기 불가 비밀키로 조용히 성공했다 — 백업 복원·uid 불일치에서 실재하는 상태다");
});

// ── 리뷰 라운드 1(C2): IP 상한은 "세고 나서 쓰는" 체크-액트였다. 락 밖에서 세면 동시
// 요청 수만큼 낡은 값을 보고 나란히 통과한다 — 실측: 같은 IP 12건 동시 hello 로 상한 3인데
// 계정 10개가 생겼다. w_create_account 안(쓰기 락 안)에서 다시 세도록 고쳤다.

t("IP 상한은 계정 생성 쓰기 락 안에서 걸린다 — 락 밖에서 세면 병렬 요청이 상한을 넘는다", function () {
  // 여기서 검증하는 성질은 "상한 밑에서는 통과하고 상한을 넘으면 막힌다"이지 "상한이
  // 3이다"가 아니다 — 개발용으로 W_IP_DAILY 를 20으로 올려도(출시 전 3으로 복귀 예정) 이
  // 테스트가 그대로 유효해야 하므로 계정 개수를 상수 W_IP_DAILY 에서 유도한다(하드코딩 금지).
  $d = tmpdir(); $db = w_db($d);
  for ($i = 1; $i <= W_IP_DAILY; $i++) {
    w_create_account($db, "dev-" . $i, "iphash");
  }
  eq(w_seed_count_today($db, "iphash"), W_IP_DAILY, "상한까지 계정 준비 실패");
  $threw = false;
  try { w_create_account($db, "dev-over", "iphash"); }
  catch (WalletRateLimitException $e) { $threw = true; }
  ok($threw, "상한을 넘겨서도 계정이 생성됐다");
  eq(w_seed_count_today($db, "iphash"), W_IP_DAILY, "상한을 넘겨 계정이 생겼다");
  ok(w_get_account($db, "dev-over") === null, "상한에 걸렸는데 계정이 남았다");
  $db = null; rmrf($d);
});

t("IP 해시가 null 이면 상한을 적용하지 않는다 — 헤드리스 호출·CLI 대비", function () {
  $d = tmpdir(); $db = w_db($d);
  for ($i = 0; $i < 5; $i++) { w_create_account($db, "dev-nullip-" . $i, null); }
  eq($db->query("select count(*) c from accounts")->fetch()["c"], 5, "null IP 인데 상한에 걸렸다");
  $db = null; rmrf($d);
});

// ── Task 1 (8c): 토큰 주체 접두 + 스키마 v3 ─────────────────────────────

t("토큰 주체 — 기기와 계정을 구별하고, 접두 없는 옛 토큰은 기기로 읽는다", function () {
  $d = tmpdir();
  $t1 = w_token_make($d, "d:dev-aaa");
  $t2 = w_token_make($d, "a:acct-bbb");
  // 접두 없는 옛 토큰을 그대로 만든다 — 배포 순간 살아 있는 토큰이 깨지면 안 된다.
  $exp = time() + 3600;
  $sig = _wb64e(hash_hmac("sha256", "dev-legacy|" . $exp, w_secret($d), true));
  $old = _wb64e("dev-legacy") . "|" . $exp . "|" . $sig;
  eq(w_token_read($d, $t1), array("type" => "device", "id" => "dev-aaa"), "기기 토큰");
  eq(w_token_read($d, $t2), array("type" => "acct", "id" => "acct-bbb"), "계정 토큰");
  eq(w_token_read($d, $old), array("type" => "device", "id" => "dev-legacy"),
     "접두 없는 옛 토큰이 안 읽힌다 — 배포 순간 로그인된 사용자가 전부 튕긴다");
  eq(w_token_read($d, substr($t1, 0, -1) . "X"), null, "변조된 토큰이 통과했다");
  rmrf($d);
});

// 핵심 방어: 접두가 서명 대상 "밖"에 있으면 d: 를 a: 로 바꿔치기해 임의 계정을 가리킬 수
// 있다. 실제로 있었던 기기 토큰의 인코딩된 주체만 접두를 바꿔치기하고 서명은 그대로 재사용해
// 위조를 흉내 낸다 — 접두가 서명 대상 안에 있어야만 이 위조가 거부된다.
t("토큰 위조 방지 — 서명된 주체의 접두를 d: 에서 a: 로 바꿔치기하면 거부된다", function () {
  $d = tmpdir();
  $tok = w_token_make($d, "d:dev-aaa");
  $p = explode("|", $tok);
  $forgedSubject = "a:" . substr(_wb64d($p[0]), 2);
  $forged = _wb64e($forgedSubject) . "|" . $p[1] . "|" . $p[2];
  eq(w_token_read($d, $forged), null,
     "d: 를 a: 로 바꿔치기한 위조 토큰이 통과했다 — 남의 계정을 가리킬 수 있다");
  rmrf($d);
});

t("스키마 v3 — auth_nonce 와 google_sub 유니크 인덱스가 생긴다", function () {
  $d = tmpdir(); $db = w_db($d);
  $names = [];
  foreach ($db->query("select name from sqlite_master where type in ('table','index')") as $r) {
    $names[] = $r["name"];
  }
  ok(in_array("auth_nonce", $names, true), "auth_nonce 테이블이 없다");
  ok(in_array("ix_accounts_gsub", $names, true), "google_sub 유니크 인덱스가 없다");
  // 정확히 3이 아니라 3 이상이다 — 새 db 는 마이그레이션이 끝까지(현재 4까지) 굴러간다.
  // 이 테스트는 v3 블록이 돌았는지를 보는 것이지 "그 뒤로 아무것도 안 늘었다"가 아니다.
  ok(w_schema_version($db) >= 3, "스키마 버전이 3 미만이다");
  $db = null; rmrf($d);
});

// SQLite 의 유니크 인덱스는 NULL 을 서로 다른 값으로 본다. 이게 성립하지 않으면
// 미연결 계정이 둘째부터 생성 실패한다 — 온보딩이 통째로 죽는다.
t("google_sub 유니크 인덱스가 미연결 계정 여럿을 막지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", "iphash");
  w_create_account($db, "dev-2", "iphash");
  eq((int)$db->query("select count(*) c from accounts")->fetch()["c"], 2,
     "google_sub 이 NULL 인 계정을 둘 이상 못 만든다");
  $db = null; rmrf($d);
});

// 인덱스가 "있다"만 보면 UNIQUE 를 떼도 초록이다(Task 2 의 존재 검사가 그렇다 — 실측).
// 동시 병합 하네스도 이걸 못 잡는다: BEGIN IMMEDIATE 가 쓰기를 직렬화해서 두 번째 병합이
// 인덱스에 닿기 전에 이미 "그 구글 계정이 있다"를 보기 때문이다(실측 — UNIQUE 를 떼고
// 8-way 를 돌려도 계정은 1개였다). 인덱스의 유일성 자체는 여기서 못박는다.
t("같은 google_sub 을 가진 계정은 둘일 수 없다 — DB 층이 막는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", null);
  w_create_account($db, "dev-2", null);
  $a1 = w_get_account($db, "dev-1"); $a2 = w_get_account($db, "dev-2");
  $db->prepare("update accounts set google_sub = 'gsub-x' where id = ?")->execute(array($a1["id"]));
  $threw = false;
  try { $db->prepare("update accounts set google_sub = 'gsub-x' where id = ?")->execute(array($a2["id"])); }
  catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 google_sub 이 계정 둘에 박혔다 — 동시 병합의 최종 방어선이 없다");
  $db = null; rmrf($d);
});

// ── Task 2 (8c): 논스 수명주기 ─────────────────────────────────────────

t("논스 — 단회용이고 10분 만료이며 기기에 묶인다", function () {
  $d = tmpdir(); $db = w_db($d);
  $n = w_nonce_make($db, "dev-aaa");
  $a = w_nonce_read($db, $n);
  // 남의 논스를 주워도 못 쓴다는 것은 device_id 로 확인한다(호출부가 대조).
  eq($a["device_id"], "dev-aaa", "논스가 기기에 안 묶였다");
  ok(strlen($n) >= 32, "논스가 너무 짧다: " . strlen($n));
  eq(w_nonce_complete($db, $n, "gsub-1"), true, "첫 완료가 실패했다");
  $b = w_nonce_read($db, $n);
  ok($b !== null, "완료된 논스를 폴링에서 읽을 수 없다");
  eq($b["google_sub"], "gsub-1", "완료된 논스의 google_sub");
  $again = w_nonce_complete($db, $n, "gsub-2");
  eq($again, false, "완료된 논스를 두 번 완료할 수 있다 — 병합이 두 번 돈다");
  // 만료: created_at 을 11분 전으로 밀어 넣는다
  $n2 = w_nonce_make($db, "dev-bbb");
  $old = gmdate("c", time() - 11 * 60);
  $db->prepare("update auth_nonce set created_at = ? where nonce = ?")->execute(array($old, $n2));
  eq(w_nonce_read($db, $n2), null, "만료된 논스가 살아 있다");
  $db = null; rmrf($d);
});

t("w_nonce_burn 뒤에는 논스를 읽을 수 없다 — 단회용", function () {
  $d = tmpdir(); $db = w_db($d);
  $n = w_nonce_make($db, "dev-aaa");
  w_nonce_burn($db, $n);
  eq(w_nonce_read($db, $n), null, "태운 논스가 살아 있다");
  $db = null; rmrf($d);
});

t("w_oauth_conf — 설정 파일이 없으면 null 이다(무중단 스위치)", function () {
  $d = tmpdir();
  ok(!is_file($d . "/forge_google_oauth.json"), "테스트 전제가 깨졌다");
  // 실제 함수는 __DIR__(map/) 의 forge_google_oauth.json 을 본다 — 여기서는
  // 저장소에 그 파일이 없다는 것 자체가 authStart 의 auth-disabled 를 보증한다.
  ok(!is_file(__DIR__ . "/../forge_google_oauth.json"), "map/forge_google_oauth.json 이 커밋됐다 — 자격증명 유출");
  eq(w_oauth_conf(), null, "설정 파일이 없는데 conf 가 null 이 아니다");
});

// authStart 는 상한도 청소도 없다 — 새로 삽입하면 로그인 버튼을 누르는 만큼 표가 불어난다.
t("논스는 살아 있는 동안 재사용된다 — authStart 반복이 표를 불리지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $n1 = w_nonce_make($db, "dev-aaa");
  $n2 = w_nonce_make($db, "dev-aaa");
  eq($n2, $n1, "authStart 를 두 번 부르면 논스 행이 두 개 생긴다 — 상한 없는 증식 경로다");
  eq((int)$db->query("select count(*) c from auth_nonce")->fetch()["c"], 1, "논스 행이 하나가 아니다");

  // 다른 기기 것은 절대 재사용하지 않는다 — 남의 논스를 받게 된다.
  $nb = w_nonce_make($db, "dev-bbb");
  ok($nb !== $n1, "다른 기기가 남의 논스를 받았다");

  // 이미 구글이 채운 논스는 재사용하지 않는다 — 같은 논스로 병합이 두 번 돌 수 있다.
  w_nonce_complete($db, $n1, "gsub-1");
  $n3 = w_nonce_make($db, "dev-aaa");
  ok($n3 !== $n1, "완료된 논스를 다시 내줬다 — 병합이 두 번 돈다");

  // 만료된 것도 재사용하지 않는다.
  $db->prepare("update auth_nonce set created_at = ? where nonce = ?")
     ->execute(array(gmdate("c", time() - 11 * 60), $n3));
  $n4 = w_nonce_make($db, "dev-aaa");
  ok($n4 !== $n3, "만료된 논스를 다시 내줬다");
  eq(w_nonce_read($db, $n4)["device_id"], "dev-aaa", "새 논스가 기기에 안 묶였다");
  $db = null; rmrf($d);
});

// 재사용 조회는 auth_nonce 를 device_id 로 뒤진다. auth_nonce 에는 청소 주기가 없어
// 만료 행이 계속 쌓이므로, 인덱스가 없으면 O(1) 삽입이던 authStart 가 표 크기에 비례해
// 느려진다(리뷰 실측: 20만 행에서 호출당 25ms, 전체 스캔 + 정렬용 임시 B-트리).
// "인덱스가 있다"가 아니라 "그 조회가 인덱스를 탄다"를 본다 — 컬럼 순서가 틀리면
// 인덱스는 있는데 계획은 그대로 SCAN 이다.
t("논스 재사용 조회가 전체 스캔이 아니다 — auth_nonce 는 청소되지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $plan = "";
  $q = "explain query plan select nonce from auth_nonce
        where device_id = 'x' and used = 0 and google_sub is null and created_at >= 'y'
        order by created_at desc limit 1";
  foreach ($db->query($q) as $row) { $plan .= $row["detail"] . " "; }
  // ⚠ 계획 문구는 SQLite 판마다 다르다. 3.26(cafe24 바닥)은 "SEARCH TABLE auth_nonce
  // USING INDEX …", 3.36+ (로컬 3.45.1)는 TABLE 을 뺀 "SEARCH auth_nonce USING INDEX …"
  // 를 낸다. 전체 스캔도 마찬가지로 "SCAN TABLE x" / "SCAN x" 로 갈린다. 문자열을 그대로
  // 맞추면 이 검사가 프로덕션 모양에서만 빨개진다 — TABLE·COVERING 을 선택적으로 둔
  // 정규식으로 본다. (이 저장소에 3.26 바이너리가 없어 3.45.1 에서만 실측했다.)
  ok(preg_match('/SEARCH\s+(TABLE\s+)?auth_nonce\s+USING\s+(COVERING\s+)?INDEX\s+ix_nonce_dev/i', $plan) === 1,
     "논스 재사용 조회가 인덱스를 안 탄다: " . $plan);
  ok(!preg_match('/\bSCAN\b/i', $plan), "논스 재사용 조회가 전체 스캔이다: " . $plan);
  // 정렬용 임시 B-트리도 없어야 한다 — (device_id, created_at) 순서라야 정렬이 공짜다.
  ok(stripos($plan, "temp b-tree") === false, "정렬용 임시 B-트리가 생긴다: " . $plan);
  // 인덱스를 "탄다"만으로는 부족하다. 컬럼 순서를 (created_at, device_id) 로 뒤집으면
  // 계획은 여전히 SEARCH … USING INDEX 지만 실제로는 created_at 범위만 좁힐 뿐이라
  // 모든 기기의 최근 행을 훑는다(실측: "SEARCH … (created_at>?)"). 그러면 표가 커질수록
  // 다시 느려져 이 인덱스를 넣은 이유가 사라진다 — device_id 로 점 조회하는지를 못박는다.
  ok(preg_match('/\bdevice_id\s*=/i', $plan) === 1,
     "device_id 로 좁히지 않는다 — 인덱스 컬럼 순서가 뒤집혔다: " . $plan);
  $db = null; rmrf($d);
});

// ── Task 3 (8c): 병합 ────────────────────────────────────────────────

t("첫 병합 — 익명 계정이 곧 구글 계정이 된다(잔량 그대로)", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  eq((int)$a["balance"], 5, "시드 전제가 깨졌다");
  $m = w_merge($db, "dev-A", "gsub-1");
  $after = w_get_account($db, "dev-A");
  eq($m["ok"], true, "첫 병합이 실패했다");
  eq($m["moved"], false, "첫 병합은 옮기는 게 아니라 그 계정이 구글 계정이 되는 것이다");
  eq((int)$after["balance"], 5, "첫 병합에서 잔량이 변했다");
  eq($after["google_sub"], "gsub-1", "google_sub 이 안 박혔다");
  eq($m["acct"]["id"], $a["id"], "첫 병합인데 새 계정이 생겼다");
  eq(w_true_balance($db, $after["id"]), 5, "원장 합과 캐시가 갈렸다");
  eq((int)$db->query("select count(*) c from accounts")->fetch()["c"], 1, "첫 병합이 계정을 하나 더 만들었다");
  $db = null; rmrf($d);
});

// 래칫 방지의 핵심. 이 검사가 없으면 "높은 쪽" 로직이 조용히 되살아난다.
t("두 번째 기기 — 익명 잔량은 버려지고 구글 잔량은 오르지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  $g = w_get_account($db, "dev-A");
  // 구글 계정 잔량을 3으로 낮춘다 — "높은 쪽"이면 5로 올라갈 상황을 만든다
  $sp = w_spend($db, $g["id"], "scan", "t:setup", null, null);
  eq($sp["ok"], true, "준비용 차감이 실패했다");
  $gBefore = w_true_balance($db, $g["id"]);
  eq($gBefore, 3, "준비 전제가 깨졌다 — 구글 잔량이 3 이어야 한다");

  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  $m = w_merge($db, "dev-B", "gsub-1");
  eq(w_true_balance($db, $g["id"]), 3, "두 번째 기기 병합으로 구글 잔량이 올랐다 — 래칫이 살아 있다");
  eq($m["moved"], true, "두 번째 기기 병합이 moved 가 아니다");
  eq($m["discarded"], 5, "버린 수량이 기록되지 않았다");
  eq(w_true_balance($db, $b["id"]), 0, "익명 잔량이 안 버려졌다 — 원장 합이 진실이 아니게 된다");
  eq($m["acct"]["id"], $g["id"], "기존 구글 계정이 아니라 다른 계정을 가리킨다");
  // 버린 수량은 캐시가 아니라 원장에 남아야 한다 — 캐시만 0으로 내리면 w_state 가
  // 다음 호출에서 원장을 보고 5로 되돌려 놓는다(= 버린 잔량이 부활한다).
  eq((int)$db->query("select coalesce(sum(delta), 0) s from ledger
                      where account_id = '" . $b["id"] . "' and delta < 0 and reason = 'merge_discard'")->fetch()["s"],
     -5, "버린 수량이 음수 원장 행으로 안 남았다");
  foreach ($db->query("select id, balance from accounts") as $row) {
    eq((int)$row["balance"], w_true_balance($db, $row["id"]),
       "병합 뒤 원장 합과 캐시가 갈렸다: " . $row["id"]);
  }
  $db = null; rmrf($d);
});

t("스트릭은 두 번째 기기에서도 긴 쪽을 취한다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  $g = w_get_account($db, "dev-A");
  $db->prepare("update accounts set streak_days = 2 where id = ?")->execute(array($g["id"]));
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  $db->prepare("update accounts set streak_days = 9 where id = ?")->execute(array($b["id"]));
  $m = w_merge($db, "dev-B", "gsub-1");
  eq((int)$m["acct"]["streak_days"], 9, "긴 스트릭이 안 넘어왔다");

  // 반대 방향 — 짧은 쪽이 긴 쪽을 덮어쓰면 로그인할 때마다 스트릭이 깎인다.
  w_create_account($db, "dev-C", "ip3");
  $c = w_get_account($db, "dev-C");
  $db->prepare("update accounts set streak_days = 1 where id = ?")->execute(array($c["id"]));
  $m2 = w_merge($db, "dev-C", "gsub-1");
  eq((int)$m2["acct"]["streak_days"], 9, "짧은 스트릭이 긴 쪽을 덮어썼다");
  $db = null; rmrf($d);
});

t("병합은 멱등이다 — 같은 기기·같은 구글로 두 번 불러도 원장이 두 벌 안 생긴다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  w_merge($db, "dev-B", "gsub-1");
  $n1 = (int)$db->query("select count(*) c from ledger")->fetch()["c"];
  $m2 = w_merge($db, "dev-B", "gsub-1");
  $n2 = (int)$db->query("select count(*) c from ledger")->fetch()["c"];
  $g = w_get_account($db, "dev-A");
  eq($n2, $n1, "두 번째 병합이 원장 줄을 더 만들었다");
  eq(w_true_balance($db, $g["id"]), 5, "재병합으로 잔량이 움직였다");
  eq($m2["ok"], true, "재병합이 실패로 떨어졌다 — 앱이 로그인을 못 끝낸다");
  eq($m2["acct"]["id"], $g["id"], "재병합이 다른 계정을 가리킨다");
  eq($m2["discarded"], 5, "재병합이 버린 수량을 잊었다");
  // 첫 병합(claim)도 다시 불러본다 — 이쪽은 "이미 내가 그 계정" 갈래로 떨어져야 한다.
  $m3 = w_merge($db, "dev-A", "gsub-1");
  eq($m3["ok"], true, "claim 재호출이 실패했다");
  eq($m3["moved"], false, "claim 재호출이 옮김으로 바뀌었다");
  eq((int)$db->query("select count(*) c from ledger")->fetch()["c"], $n1, "claim 재호출이 원장 줄을 더 만들었다");
  $db = null; rmrf($d);
});

// 브리프에 없던 갈래. device_id 가 UNIQUE 라 기기당 계정이 하나뿐이므로, 이미 구글 A 에
// 묶인 기기에서 구글 B 로 로그인하면 B 가 A 의 계정을 통째로 가져가게 된다.
t("이미 다른 구글에 묶인 기기 계정을 두 번째 구글이 가져가지 못한다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  $m = w_merge($db, "dev-A", "gsub-2");
  eq($m["ok"], false, "다른 구글 계정이 기기 계정을 가져갔다");
  eq($m["reason"], "device-claimed", "거절 사유가 다르다");
  $a = w_get_account($db, "dev-A");
  eq($a["google_sub"], "gsub-1", "google_sub 이 두 번째 구글로 덮였다 — 첫 사용자의 계정을 빼앗는다");
  eq(w_true_balance($db, $a["id"]), 5, "거절된 병합이 잔량을 움직였다");
  $db = null; rmrf($d);
});

// 리뷰 실측(Critical): streak_days 가 크다고 last_checkin 이 더 최근이라는 보장이 없다.
// 시계가 뒤로 가면 오늘 이미 출석한 계정이 canCheckin=true 로 되살아나고, 그 출석은
// checkin:<계정id>:<날짜> 멱등키 충돌로 예외를 던진다 → wallet-api 가 500 으로 바꾸는데
// 화면은 계속 버튼을 그린다(그날 내내 눌러도 500). W_IDEM_PREFIX 가 없앤 영구 500 의 재발이다.
t("병합은 출석 시계를 뒤로 돌리지 않는다 — 오래된 긴 스트릭이 오늘 출석을 되살리면 안 된다", function () {
  $d = tmpdir(); $db = w_db($d);
  $today = w_today();
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  $g = w_get_account($db, "dev-A");
  // 구글 계정: 스트릭 2, 오늘 이미 출석함
  $db->prepare("update accounts set streak_days = 2, last_checkin = ? where id = ?")
     ->execute(array($today, $g["id"]));
  $g = w_get_account($db, "dev-A");
  eq(w_state($db, $g)["canCheckin"], false, "전제가 깨졌다 — 오늘 이미 출석한 상태여야 한다");

  // 기기 B: 스트릭은 더 길지만(4) 시계는 사흘 전이다
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  $db->prepare("update accounts set streak_days = 4, last_checkin = ? where id = ?")
     ->execute(array(w_day_add($today, -3), $b["id"]));
  w_merge($db, "dev-B", "gsub-1");

  $after = w_get_account($db, "dev-A");
  ok($after["last_checkin"] >= $today, "병합이 출석 시계를 과거로 끌고 갔다: " . var_export($after["last_checkin"], true));
  eq(w_state($db, $after)["canCheckin"], false,
     "병합으로 canCheckin 이 false→true 로 뒤집혔다 — 오늘 출석은 멱등키 충돌로 영구 500 이 된다");
  // 그 500 을 직접 확인한다: 되살아난 출석은 예외를 던진다.
  $r = w_checkin($db, $after, null);
  eq($r["ok"], false, "오늘 이미 출석했는데 또 출석이 됐다");
  eq($r["reason"], "already", "거절 사유가 already 가 아니다");
  $db = null; rmrf($d);
});

// 같은 결함의 반대 방향 — 죽은 스트릭이 산 시계를 덮으면 스트릭이 오히려 깎이고
// 7일 상자 주기가 어긋난다.
t("병합이 스트릭을 깎지 않는다 — 죽은 스트릭이 산 시계를 덮지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $today = w_today();
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  $g = w_get_account($db, "dev-A");
  // 구글 계정: 스트릭 1, 어제 출석 → 오늘 출석하면 2가 되어야 한다
  $db->prepare("update accounts set streak_days = 1, last_checkin = ? where id = ?")
     ->execute(array(w_day_add($today, -1), $g["id"]));
  // 기기 B: 스트릭 4 지만 엿새 전에 멈췄다
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  $db->prepare("update accounts set streak_days = 4, last_checkin = ? where id = ?")
     ->execute(array(w_day_add($today, -6), $b["id"]));
  w_merge($db, "dev-B", "gsub-1");

  $after = w_get_account($db, "dev-A");
  $r = w_checkin($db, $after, null);
  eq($r["ok"], true, "병합 뒤 출석이 실패했다");
  eq((int)w_get_account($db, "dev-A")["streak_days"], 2,
     "이어지던 스트릭이 죽은 스트릭에 덮여 깎였다 — 7일 상자 주기까지 어긋난다");
  $db = null; rmrf($d);
});

// 리뷰 실측(Important 1): 병합은 잔량을 0으로 만들 뿐 계정 행을 지우지 않는다.
// 기기 토큰이 365일 살아 있으므로, 막지 않으면 구글 지갑과 나란히 도는 익명 지갑이
// 매일 1개씩 쌓인다 — 기기를 늘릴수록 수입원이 늘어난다.
t("병합으로 넘어간 기기 계정은 더 벌 수 없다 — 두 번째 지갑이 남지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  $g = w_get_account($db, "dev-A");
  w_create_account($db, "dev-B", "ip2");
  // 스트릭을 심어 둔다 — 0 인 채로 병합하면 "넘긴 쪽 스트릭을 지우는가"가 공허한 검사가 된다.
  $db->prepare("update accounts set streak_days = 3, last_checkin = ? where id = ?")
     ->execute(array(w_day_add(w_today(), -1), w_account_id("dev-B")));
  w_merge($db, "dev-B", "gsub-1");
  $b = w_get_account($db, "dev-B");

  eq(w_true_balance($db, $b["id"]), 0, "전제가 깨졌다 — 병합 뒤 잔량은 0이다");
  eq(w_state($db, $b)["canCheckin"], false, "넘긴 계정이 출석 버튼을 그린다");
  $r = w_checkin($db, $b, null);
  eq($r["ok"], false, "넘긴 계정이 출석에 성공했다 — 익명 지갑이 매일 1개씩 쌓인다");
  eq($r["reason"], "merged", "거절 사유가 merged 가 아니다");
  eq($r["granted"], 0, "넘긴 계정에 스쿱이 지급됐다");
  eq(w_true_balance($db, $b["id"]), 0, "넘긴 계정의 잔량이 올랐다");
  eq(w_true_balance($db, $g["id"]), 5, "구글 계정 잔량이 움직였다");
  // 스트릭도 복제가 아니라 이동이다 — 넘긴 쪽엔 남지 않는다.
  eq((int)$b["streak_days"], 0, "넘긴 계정에 스트릭이 남아 있다");

  // 환급도 같은 문이다 — 병합 전에 쓴 idem 을 병합 후에 환급하면 버린 잔량이 되살아난다.
  w_create_account($db, "dev-C", "ip3");
  $c = w_get_account($db, "dev-C");
  eq(w_spend($db, $c["id"], "scan", "c:pre", "AAPL", null)["ok"], true, "준비용 차감이 실패했다");
  w_merge($db, "dev-C", "gsub-1");
  $rf = w_refund($db, $c["id"], "c:pre");
  eq($rf["ok"], false, "넘긴 계정에서 환급이 성공했다 — 버린 잔량이 되살아난다");
  eq($rf["reason"], "merged", "환급 거절 사유가 merged 가 아니다");
  eq(w_true_balance($db, $c["id"]), 0, "환급으로 넘긴 계정의 잔량이 올랐다");
  $db = null; rmrf($d);
});

// 리뷰 실측(Critical, 2라운드): 버림은 google_sub 을 NULL 로 남기므로(그게 표식이 필요한
// 이유다) 같은 기기가 나중에 다른 구글로 로그인하면 claim 갈래를 탄다. 표식을 "merge_discard
// 행이 하나라도 있는가"로 물으면 그 계정은 영원히 못 번다. 기기 토큰이 365일 유효하고
// authStart/authPoll 이 기기 토큰만 받으므로 재로그인은 반드시 같은 기기를 지난다 — 정상 경로다.
t("버렸다가 다시 claim 한 계정은 다시 산다 — 표식은 마지막 사건만 센다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  w_merge($db, "dev-B", "gsub-1");           // 버림 — merge_discard 표식이 남는다
  $b = w_get_account($db, "dev-B");
  ok(w_is_merged_away($db, $b["id"]), "전제가 깨졌다 — 버린 직후엔 표식이 있어야 한다");
  eq($b["google_sub"], null, "전제가 깨졌다 — 버림은 google_sub 을 NULL 로 남긴다");

  // 같은 기기가 나중에 다른 구글로 로그인한다 → claim 갈래
  $m = w_merge($db, "dev-B", "gsub-2");
  eq($m["ok"], true, "두 번째 구글 claim 이 실패했다");
  eq($m["moved"], false, "claim 이 아니라 옮김으로 처리됐다");
  $b = w_get_account($db, "dev-B");
  eq($b["google_sub"], "gsub-2", "claim 이 google_sub 을 안 박았다");
  ok(!w_is_merged_away($db, $b["id"]),
     "다시 claim 한 계정이 낡은 표식 때문에 영구 동결됐다 — 아무것도 넘긴 적 없는 구글 계정이다");
  eq(w_state($db, $b)["canCheckin"], true, "다시 claim 한 계정이 출석 버튼을 못 그린다");
  $r = w_checkin($db, $b, null);
  eq($r["ok"], true, "다시 claim 한 계정이 출석을 못 한다 — 영구 동결이다");
  eq($r["granted"], 1, "출석 지급이 없다");
  // 버려서 0, 출석으로 1 — slot(1스쿱)이 이 잔량으로 쓸 수 있는 유일한 등급이다.
  $b = w_get_account($db, "dev-B");
  eq(w_true_balance($db, $b["id"]), 1, "전제가 깨졌다 — 버림 0 + 출석 1 이어야 한다");
  eq(w_spend($db, $b["id"], "slot", "c:rc", null, null)["ok"], true, "준비용 차감이 실패했다");
  eq(w_refund($db, $b["id"], "c:rc")["ok"], true, "다시 claim 한 계정이 환급을 못 한다");
  eq(w_true_balance($db, $b["id"]), 1, "환급이 잔량을 안 돌려놨다");
  $db = null; rmrf($d);
});

// 같은 결함의 전염 경로 — 죽은 행이 구글 계정의 대표가 되면, 그 뒤 합류하는 기기마다
// 시드를 버리고 죽은 계정에 붙는다(버리기는 하는데 아무도 못 번다).
t("다시 claim 한 계정에 합류하는 기기도 정상이다 — 죽은 계정으로 빨려들지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  w_merge($db, "dev-B", "gsub-1");           // B 버림
  w_merge($db, "dev-B", "gsub-2");           // B 가 gsub-2 로 되살아난다
  $b = w_get_account($db, "dev-B");

  w_create_account($db, "dev-C", "ip3");
  $c = w_get_account($db, "dev-C");
  $m = w_merge($db, "dev-C", "gsub-2");
  eq($m["acct"]["id"], $b["id"], "합류 대상이 gsub-2 계정이 아니다");
  eq($m["discarded"], 5, "합류 기기의 익명 잔량이 안 버려졌다");
  eq(w_true_balance($db, $c["id"]), 0, "합류 기기 잔량이 안 버려졌다");
  // 핵심: 버리는 것은 맞지만, 받는 쪽은 살아 있어야 한다.
  $b = w_get_account($db, "dev-B");
  ok(!w_is_merged_away($db, $b["id"]), "합류를 받은 계정이 동결됐다");
  eq(w_state($db, $b)["canCheckin"], true, "합류를 받은 계정이 출석 버튼을 못 그린다");
  eq(w_checkin($db, $b, null)["ok"], true,
     "합류를 받은 계정이 못 번다 — 합류하는 기기마다 시드만 사라지는 죽은 계정이다");
  $db = null; rmrf($d);
});

// 표식이 조건부면 마침 잔량 0으로 로그인한 기기만 표식 없이 계속 벌 수 있다.
t("잔량 0으로 병합해도 표식은 남는다 — 그 기기도 더 못 번다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  // 시드 5를 전부 써서 잔량 0으로 만든 뒤 병합한다
  w_spend($db, $b["id"], "custom", "c:z", "AAPL", null);
  eq(w_true_balance($db, $b["id"]), 0, "전제가 깨졌다 — 잔량이 0이어야 한다");
  $m = w_merge($db, "dev-B", "gsub-1");
  eq($m["discarded"], 0, "버릴 것이 없는데 버렸다");
  ok(w_is_merged_away($db, $b["id"]), "잔량 0으로 병합한 기기에 표식이 안 남았다");
  eq(w_checkin($db, w_get_account($db, "dev-B"), null)["reason"], "merged",
     "잔량 0으로 병합한 기기가 계속 벌 수 있다");
  $db = null; rmrf($d);
});

t("계정 없는 기기의 병합은 조용히 성공하지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $m = w_merge($db, "dev-none", "gsub-1");
  eq($m["ok"], false, "없는 계정으로 병합이 성공했다");
  eq($m["reason"], "no-account", "거절 사유가 다르다");
  eq((int)$db->query("select count(*) c from accounts")->fetch()["c"], 0, "병합이 계정을 만들었다");
  $db = null; rmrf($d);
});

// 8d: 광고 지급은 checkin 을 거치지 않고 원장에 적립하는 첫 경로다. 병합된 계정 잔량이
// 지금까지 0이라 우연히 안전했던 w_spend 가, 광고 한 번으로 되살아나지 않는지 확인한다.
t("병합된 계정은 쓸 수도 없다 — checkin·refund 와 같은 규율", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  w_merge($db, "dev-B", "gsub-1");            // dev-B 는 잔량을 버리고 얼어붙는다

  // 얼어붙은 계정에 원장으로 직접 5를 넣어 본다 — 광고 지급이 하려는 바로 그 일이다.
  w_ledger_insert($db, $b["id"], 5, "test_credit", null, "t:credit");
  $db->prepare("update accounts set balance = 5 where id = ?")->execute(array($b["id"]));

  $r = w_spend($db, $b["id"], "scan", "t:spend", null, null);
  eq($r["ok"], false, "병합된 계정이 스쿱을 썼다");
  eq($r["reason"], "merged", "사유가 merged 가 아니다");
  eq($r["charged"], false, "차감이 일어났다");   // charged 는 불리언이다(숫자가 아니다)
  eq(w_true_balance($db, $b["id"]), 5, "원장이 움직였다");
  $db = null; rmrf($d);
});

t("정상 계정의 spend 는 그대로 된다 — 가드가 전부를 막으면 안 된다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  $r = w_spend($db, $a["id"], "scan", "t:ok", null, null);
  eq($r["ok"], true, "정상 계정이 막혔다");
  eq(w_true_balance($db, $a["id"]), 3, "5 - scan 2 = 3 이어야 한다");
  $db = null; rmrf($d);
});

t("스키마 v4 — ad_grants 와 그 인덱스가 생긴다", function () {
  $d = tmpdir(); $db = w_db($d);
  $names = array();
  foreach ($db->query("select name from sqlite_master where type in ('table','index')") as $x) { $names[] = $x["name"]; }
  ok(in_array("ad_grants", $names), "ad_grants 테이블이 없다");
  ok(in_array("ix_ad_acct", $names), "ix_ad_acct 인덱스가 없다");
  $v = $db->query("select v from schema_version")->fetch();
  eq((int)$v["v"], 4, "스키마 버전이 4 가 아니다");
  $db = null; rmrf($d);
});

t("transaction_id 가 PK 라 중복 삽입이 DB 층에서 막힌다", function () {
  $d = tmpdir(); $db = w_db($d);
  $db->exec("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
             values ('tx-1', 'a1', 'quick', 1, 1, '2026-08-15T00:00:00+00:00')");
  $threw = false;
  try {
    $db->exec("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
               values ('tx-1', 'a1', 'quick', 1, 1, '2026-08-15T00:00:01+00:00')");
  } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 transaction_id 가 두 번 들어갔다 — 앱 층 검사만으로는 경합에서 둘 다 통과한다");
  $db = null; rmrf($d);
});

// ── 광고 지급(w_ad_grant) ─────────────────────────────────────────────────────
// 구글은 콜백을 재시도한다 — 그래서 실패를 돌려주는 것이 곧 무한 재시도다. 여기 대부분의
// 거절이 ok:true + granted:0 인 이유가 그것이고, 실제 방어는 반환값이 아니라 원장이 한다.

t("정상 지급 — 원장과 캐시가 함께 오른다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  $r = w_ad_grant($db, $a["id"], "quick", "tx-1", 1);
  eq($r["ok"], true, "정상 지급이 실패했다");
  eq($r["granted"], 1, "1개가 안 들어갔다");
  eq(w_true_balance($db, $a["id"]), 6, "5 + 1 = 6 이어야 한다");
  $after = w_get_account($db, "dev-A");
  eq((int)$after["balance"], 6, "원장 합과 캐시가 갈렸다");
  $db = null; rmrf($d);
});

t("같은 transaction_id 두 번 — 한 번만 적립하고 둘 다 ok", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  w_ad_grant($db, $a["id"], "quick", "tx-1", 1);
  $r2 = w_ad_grant($db, $a["id"], "quick", "tx-1", 1);
  eq($r2["ok"], true, "재시도에 실패를 주면 구글이 영원히 재시도한다");
  eq(w_true_balance($db, $a["id"]), 6, "두 번 적립됐다");
  $n = $db->query("select count(*) c from ledger where reason = 'ad'")->fetch();
  eq((int)$n["c"], 1, "원장 줄이 두 개 생겼다");
  $db = null; rmrf($d);
});

t("일 8회를 넘으면 적립하지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  // 잔량 상한과 섞이지 않게 상한을 넉넉히 비워둔다
  w_spend($db, $a["id"], "scan", "t:1", null, null);
  for ($i = 1; $i <= 8; $i++) w_ad_grant($db, $a["id"], "quick", "tx-" . $i, 1);
  $r = w_ad_grant($db, $a["id"], "quick", "tx-9", 1);
  eq($r["ok"], true, "상한 초과도 ok 다 — 구글에 실패를 주면 재시도한다");
  eq($r["granted"], 0, "9회째가 적립됐다");
  eq($r["reason"], "daily-cap", "사유가 daily-cap 이 아니다");
  eq(w_true_balance($db, $a["id"]), 11, "3 + 8 = 11 이어야 한다");
  $db = null; rmrf($d);
});

// 상한은 계정 단위·서버 시각이다. 기기 단위로 재면 8c 이후 기기를 늘려 상한을 곱할 수 있고,
// 클라이언트 시각으로 재면 시계를 돌려 초기화한다.
t("일 상한은 어제 시청을 세지 않는다 — 날이 바뀌면 다시 볼 수 있다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  $y = gmdate("c", time() - 86400);
  for ($i = 1; $i <= 8; $i++) {
    $st = $db->prepare("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
                        values (?, ?, 'quick', 1, 1, ?)");
    $st->execute(array("old-" . $i, $a["id"], $y));
  }
  $r = w_ad_grant($db, $a["id"], "quick", "tx-today", 1);
  eq($r["granted"], 1, "어제 본 8회가 오늘 상한을 먹었다");
  $db = null; rmrf($d);
});

// w_checkin 의 "capped 여도 출석일은 소비한다"와 같은 판단이다.
t("지갑 상한에 걸리면 잘라서 넣되 일 상한은 소모한다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  // 잔량을 19 로 만든다(상한 20)
  w_ledger_insert($db, $a["id"], 14, "test_credit", null, "t:c");
  $db->prepare("update accounts set balance = 19 where id = ?")->execute(array($a["id"]));
  $r = w_ad_grant($db, $a["id"], "full", "tx-1", 3);
  eq($r["granted"], 1, "상한까지만 넣어야 한다");
  eq($r["capped"], true, "capped 가 안 떴다");
  eq(w_true_balance($db, $a["id"]), 20, "지갑 상한을 넘겼다");
  $g = $db->query("select amount, granted from ad_grants where transaction_id = 'tx-1'")->fetch();
  eq((int)$g["amount"], 3, "구글이 말한 값이 기록되지 않았다");
  eq((int)$g["granted"], 1, "실제로 넣은 값이 기록되지 않았다");
  // 소모 안 하면 상한에 걸린 사용자가 광고를 무한히 본다
  $n = $db->query("select count(*) c from ad_grants")->fetch();
  eq((int)$n["c"], 1, "일 상한 계산에 안 잡히면 무한 시청이 가능해진다");
  $db = null; rmrf($d);
});

t("병합된 계정에는 적립하지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  w_merge($db, "dev-B", "gsub-1");
  $r = w_ad_grant($db, $b["id"], "quick", "tx-1", 1);
  eq($r["granted"], 0, "죽은 지갑이 광고로 되살아났다");
  eq($r["reason"], "merged", "사유가 merged 가 아니다");
  eq(w_true_balance($db, $b["id"]), 0, "원장이 움직였다");
  $n = $db->query("select count(*) c from ad_grants")->fetch();
  eq((int)$n["c"], 0, "얼어붙은 지갑의 시청이 기록됐다 — 지급도 안 했으면서 상한만 먹는다");
  $db = null; rmrf($d);
});

// ⚠ 여기 있던 "1시간 밖 타임스탬프" 검사는 삭제했다(리뷰 지적, 계획서가 그렇게 적었던 것).
// 그것은 엔드포인트의 판정식을 테스트 자신의 픽스처에 대고 다시 계산할 뿐이라 7200 <= 3600 이
// 되지 않는 한 실패할 수 없는 항등식이었다 — 이 저장소의 "기대값은 밖에서" 규율 위반이다.
// 진짜 커버리지는 디스패처에 있다: 스큐 검사를 지우면 2시간 전·2시간 뒤·timestamp 없음
// 세 콜백이 실제로 적립돼 9건이 빨개진다(뮤테이션 M3 실측).

t("모르는 계정은 조용히 넘어간다", function () {
  $d = tmpdir(); $db = w_db($d);
  $r = w_ad_grant($db, "no-such-account", "quick", "tx-1", 1);
  eq($r["ok"], true, "구글에 실패를 주면 재시도한다");
  eq($r["granted"], 0, "없는 계정에 적립했다");
  $n = $db->query("select count(*) c from ad_grants")->fetch();
  eq((int)$n["c"], 0, "없는 계정 앞으로 시청 기록이 남았다");
  $db = null; rmrf($d);
});

// 엔드포인트가 먼저 거르지만, 원장 함수 자신도 쓰레기 금액에 잔량을 잃거나 폭발하면 안 된다.
// (엔드포인트를 우회하는 미래의 호출자 — 관리자 도구·배치 — 가 이 함수를 직접 부른다.)
t("쓰레기 reward_amount 에 잔량이 줄거나 폭발하지 않는다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  // ⚠ "granted >= 0 이고 잔량이 범위 안"만 보면 안 된다 — 그 셋은 배열이 1 로 캐스팅돼
  // 코인이 나가도, 20자리 문자열이 PHP_INT_MAX 로 포화한 뒤 room 에 깎여도 전부 참이다
  // (리뷰 실측: 타입 가드를 통째로 지워도 관문 340건이 초록이었다). 그래서 "얼마가
  // 나갔는가"를 못박는다 — 지급 0, 그리고 ad_grants 에 남는 '구글이 말한 값'도 0.
  $cases = array("음수" => -5, "문자열" => "abc", "배열" => array(9), "거대" => "99999999999999999999",
                 "널" => null, "실수" => 1.9, "불리언" => true, "지수표기" => "1e3", "앞공백" => " 1");
  $i = 0;
  foreach ($cases as $name => $amt) {
    $i++;
    // 케이스마다 새 계정을 쓴다 — 한 계정에 몰면 일 상한(8)에 걸려 9번째부터는 "지급 0" 이
    // 타입 가드 덕분인지 상한 덕분인지 갈리지 않는다(그 순간 이 검사는 스스로 눈이 먼다).
    w_create_account($db, "dev-junk-" . $i, null);
    $a = w_get_account($db, "dev-junk-" . $i);
    $tx = "tx-junk-" . $i;
    $r = w_ad_grant($db, $a["id"], "quick", $tx, $amt);
    eq($r["ok"], true, "쓰레기 금액에 실패를 돌려줬다: " . $name);
    eq($r["granted"], 0, "쓰레기 금액으로 코인이 나갔다: " . $name);
    eq($r["capped"], false, "지급도 안 했는데 capped 가 떴다: " . $name);
    $g = $db->query("select amount, granted from ad_grants where transaction_id = '" . $tx . "'")->fetch();
    ok($g !== false, "시청 기록이 없다 — 상한 계산에서 빠진다: " . $name);
    eq((int)$g["amount"], 0, "쓰레기 값이 그대로 기록됐다: " . $name);
    eq((int)$g["granted"], 0, "지급 기록이 0 이 아니다: " . $name);
    eq(w_true_balance($db, $a["id"]), 5, "잔량이 움직였다: " . $name);
  }
  $db = null; rmrf($d);
});

// 지갑이 이미 꽉 찬 사용자의 콜백은 지급이 0 이다 — 그런데도 기록해야 한다. 안 하면 일
// 상한 카운터가 영원히 안 올라가고, 상한에 걸린 사용자의 광고 시청이 무제한이 된다.
// (기존 "상한에 걸리면 잘라서 넣되" 검사는 잔량 19/상한 20 이라 give==1 이다 — give==0 인
//  바로 그 경우가 검사되지 않아, 기록을 if (give > 0) 로 감싸도 관문이 초록이었다.)
t("지갑이 꽉 차 지급이 0 이어도 시청은 기록된다 — 상한 소모의 핵심 사례", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  w_ledger_insert($db, $a["id"], W_CAP - 5, "test_credit", null, "t:c");
  $db->prepare("update accounts set balance = ? where id = ?")->execute(array(W_CAP, $a["id"]));
  eq(w_true_balance($db, $a["id"]), W_CAP, "전제가 깨졌다 — 잔량이 상한이 아니다");
  $r = w_ad_grant($db, $a["id"], "quick", "tx-full", 1);
  eq($r["granted"], 0, "꽉 찬 지갑에 들어갔다");
  eq($r["capped"], true, "capped 가 안 떴다");
  $g = $db->query("select amount, granted from ad_grants where transaction_id = 'tx-full'")->fetch();
  ok($g !== false, "지급 0 인 시청이 기록되지 않았다 — 상한에 걸린 사용자가 광고를 무한히 본다");
  eq((int)$g["granted"], 0, "지급 기록이 0 이 아니다");
  eq((int)$g["amount"], 1, "구글이 말한 값이 기록되지 않았다");
  // 그 기록이 실제로 일 상한을 소모하는가 — 기록만 남고 안 세면 의미가 없다
  eq(w_ad_count_today($db, $a["id"]), 1, "기록이 일 상한 계산에 안 잡힌다");
  $db = null; rmrf($d);
});

t("빈 transaction_id 는 거절한다 — 멱등키가 없으면 재시도마다 적립된다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  foreach (array("", null, array("x"), 7) as $bad) {
    $r = w_ad_grant($db, $a["id"], "quick", $bad, 1);
    eq($r["granted"], 0, "빈/이상한 transaction_id 로 적립됐다: " . var_export($bad, true));
    eq($r["reason"], "bad-request", "사유가 bad-request 가 아니다: " . var_export($bad, true));
  }
  eq(w_true_balance($db, $a["id"]), 5, "잔량이 움직였다");
  $db = null; rmrf($d);
});

// ── AdMob SSV 서명 검증 ───────────────────────────────────────────────────────
// 이 스위트는 구글에 접속하지 않는다. 테스트 키쌍을 만들어 우리가 직접 서명하고, 그 공개키를
// 캐시 파일(= 주입 지점)에 꽂는다. '키 서버'는 위에서 file:// 로 바꿔친 로컬 파일이다.

function _ssv_key() {
  return openssl_pkey_new(array("private_key_type" => OPENSSL_KEYTYPE_EC, "curve_name" => "prime256v1"));
}
function _ssv_pub($k) { $d = openssl_pkey_get_details($k); return $d["key"]; }
// $pairs = [[keyId, privKey], ...]
function _ssv_json($pairs) {
  $keys = array();
  foreach ($pairs as $p) { $keys[] = array("keyId" => $p[0], "pem" => _ssv_pub($p[1])); }
  return json_encode(array("keys" => $keys));
}
function _ssv_fixture($dir, $keyId) {
  $k = _ssv_key();
  file_put_contents($dir . "/ssv_keys_cache.json", _ssv_json(array(array($keyId, $k))));
  return $k;
}
// 구글이 하는 것과 같은 방식: ECDSA-SHA256 + base64url(패딩 없음).
function _ssv_sign($priv, $msg) {
  openssl_sign($msg, $sig, $priv, OPENSSL_ALGO_SHA256);
  return rtrim(strtr(base64_encode($sig), "+/", "-_"), "=");
}
// 캐시를 낡게 만든다. 재요청 간격을 넘겼다는 사실만 표현한다 — 구현 상수를 끌어오지 않는다.
function _ssv_age_cache($dir) {
  touch($dir . "/ssv_keys_cache.json", time() - 100000);
  clearstatcache();
}
function _ssv_cache_raw($dir) {
  $f = $dir . "/ssv_keys_cache.json";
  return is_file($f) ? (string)file_get_contents($f) : "";
}

// ⚠ 가짜 키 서버 상태는 각 테스트 '시작'에서 리셋한다. 끝에서만 치우면 ok() 하나가 실패한
// 순간 그 뒤 테스트 전부가 남은 상태를 물려받아, 실패 하나가 무더기 실패로 번져 원인을 가린다.
function _ssv_net_reset() { SsvNet::$count = 0; SsvNet::$body = null; }
function _ssv_net_serve($pairs) { SsvNet::$body = _ssv_json($pairs); }
function _ssv_net_raw($body) { SsvNet::$body = $body; }
function _ssv_net_down() { SsvNet::$body = null; }
function _ssv_net_count() { return SsvNet::$count; }
// 시도 표식은 지갑 디렉토리 밖(임시 디렉토리)에도 떨어질 수 있다 — 남기지 않는다.
function _ssv_cleanup($dir) {
  foreach (array($dir . "/ssv_keys_attempt",
                 sys_get_temp_dir() . "/w_ssv_attempt_" . sha1($dir)) as $m) { @unlink($m); }
  rmrf($dir);
}

t("올바르게 서명된 콜백은 검증을 통과한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "ad_network=5450213213286189855&ad_unit=123&custom_data=acct-1&reward_amount=1"
     . "&reward_item=Scoops&timestamp=" . (time() * 1000) . "&transaction_id=tx-1&user_id=acct-1";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($full, $p);
  ok(w_ssv_verify($d, $full, $p), "정상 서명이 거절됐다 — 기능이 통째로 멈춘다");
  _ssv_cleanup($d);
});

t("서명이 틀리면 거절한다 — 이 문이 열리면 잔량이 무한이 된다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&timestamp=" . (time() * 1000) . "&transaction_id=tx-2";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  // 서명은 그대로 두고 금액만 올린다 — 공격자가 실제로 할 일이다.
  $tampered = str_replace("reward_amount=1", "reward_amount=999", $full);
  parse_str($tampered, $p);
  ok(!w_ssv_verify($d, $tampered, $p), "금액을 바꿨는데 통과했다 — 공개 수도꼭지다");
  _ssv_cleanup($d);
});

t("서명 없는 콜백은 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=5&transaction_id=tx-3&key_id=77";
  parse_str($q, $p);
  ok(!w_ssv_verify($d, $q, $p), "서명 없이 통과했다");
  _ssv_cleanup($d);
});

t("모르는 key_id 는 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-4";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=99";
  parse_str($full, $p);
  ok(!w_ssv_verify($d, $full, $p), "등록되지 않은 키로 서명한 것이 통과했다");
  _ssv_cleanup($d);
});

// 서명 범위가 틀리면 두 방향으로 망가진다: 좁으면 전부 거절(기능 정지),
// 넓으면 signature 자신을 서명 대상에 넣게 되어 논리가 무너진다.
t("서명 대상은 signature 앞까지다 — 뒤 파라미터를 넣으면 깨진다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-5";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($full, $p);
  ok(w_ssv_verify($d, $full, $p), "정상 케이스");
  // 뒤에 파라미터가 더 붙어도(구글이 늘릴 수 있다) 서명 대상은 그대로여야 한다
  $more = $full . "&foo=bar";
  parse_str($more, $p2);
  ok(w_ssv_verify($d, $more, $p2), "signature 뒤에 파라미터가 붙자 검증이 깨졌다");
  _ssv_cleanup($d);
});

// ── 공격 ───────────────────────────────────────────────────────────────────────

t("파라미터 순서를 바꾸면 거절한다 — 서명은 바이트 순서에 걸려 있다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-6";
  $sig = _ssv_sign($k, $q);
  $re = "reward_amount=1&custom_data=acct-1&transaction_id=tx-6&signature=" . $sig . "&key_id=77";
  parse_str($re, $p);
  ok(!w_ssv_verify($d, $re, $p), "순서를 바꿨는데 통과했다 — 서명 대상을 파싱 후 재조립하고 있다");
  _ssv_cleanup($d);
});

t("재인코딩(%2D)만 해도 거절한다 — parse_str 이 같다고 해도 바이트가 다르다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-7";
  $sig = _ssv_sign($k, $q);
  // "acct-1" 의 '-' 를 %2D 로. parse_str 결과는 완전히 동일하다.
  $enc = "custom_data=acct%2D1&reward_amount=1&transaction_id=tx-7&signature=" . $sig . "&key_id=77";
  parse_str($enc, $a); parse_str($q, $b);
  eq($a["custom_data"], $b["custom_data"], "전제가 깨졌다 — %2D 가 '-' 로 안 풀렸다");
  ok(!w_ssv_verify($d, $enc, $a), "바이트가 다른데 통과했다 — 서명 대상을 재직렬화하고 있다");
  _ssv_cleanup($d);
});

// parse_str 은 중복 키에서 '마지막이 이긴다'. 서명 범위 뒤에 같은 키를 한 번 더 붙이면
// 서명은 원본 그대로 유효한데 $params 의 값만 공격자 것으로 바뀐다 — 서명 검증을
// '바이트가 맞나'로만 구현하면 이 문이 활짝 열린다.
t("서명 뒤에 같은 파라미터를 또 붙여 값을 덮어쓰면 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-8";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  $dup = $full . "&reward_amount=999";
  parse_str($dup, $p);
  eq($p["reward_amount"], "999", "전제가 깨졌다 — parse_str 이 마지막 값을 안 골랐다");
  ok(!w_ssv_verify($d, $dup, $p),
     "서명된 금액 1 이 999 로 덮인 채 통과했다 — 서명이 지키는 값과 코드가 읽는 값이 갈렸다");
  _ssv_cleanup($d);
});

t("서명 범위 안의 중복도 거절한다 — 앞쪽에 signature 를 심는 수법", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-9";
  $sig = _ssv_sign($k, $q);
  // 서명 필드를 앞에도 심어 자르는 위치를 흔든다.
  $evil = "signature=" . $sig . "&reward_amount=999&signature=" . $sig . "&key_id=77";
  parse_str($evil, $p);
  ok(!w_ssv_verify($d, $evil, $p), "signature 를 앞에 심어 서명 대상을 흔들었는데 통과했다");
  _ssv_cleanup($d);
});

t("빈 서명·base64 가 아닌 서명은 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-10";
  foreach (array("", "!!!!!!", "not base64 at all", "@@@@") as $bad) {
    $full = $q . "&signature=" . $bad . "&key_id=77";
    parse_str($full, $p);
    ok(!w_ssv_verify($d, $full, $p), "쓰레기 서명이 통과했다: " . var_export($bad, true));
  }
  _ssv_cleanup($d);
});

t("다른 메시지에 대한 유효 서명은 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-11";
  // 서명 자체는 이 키로 만든 진짜다 — 다만 다른 문장에 대한 것이다.
  $sig = _ssv_sign($k, "custom_data=acct-1&reward_amount=1&transaction_id=tx-OTHER");
  $full = $q . "&signature=" . $sig . "&key_id=77";
  parse_str($full, $p);
  ok(!w_ssv_verify($d, $full, $p), "다른 문장의 서명이 통과했다");
  _ssv_cleanup($d);
});

t("key_id 는 등록돼 있지만 그 키로 서명한 게 아니면 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir();
  $a = _ssv_key(); $b = _ssv_key();
  file_put_contents($d . "/ssv_keys_cache.json", _ssv_json(array(array("77", $a), array("88", $b))));
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-12";
  // 88 번 키로 서명해 놓고 key_id 는 77 이라고 말한다. key_id 대조를 빼면 88 도 시도돼 통과한다.
  $full = $q . "&signature=" . _ssv_sign($b, $q) . "&key_id=77";
  parse_str($full, $p);
  ok(!w_ssv_verify($d, $full, $p), "key_id 가 가리키지 않는 키로 통과했다 — 키 대조가 빠졌다");
  // 반대로 제대로 말하면 통과해야 한다(대조가 전부를 막으면 안 된다)
  $good = $q . "&signature=" . _ssv_sign($b, $q) . "&key_id=88";
  parse_str($good, $p2);
  ok(w_ssv_verify($d, $good, $p2), "정직한 key_id 가 거절됐다");
  _ssv_cleanup($d);
});

t("base64url 문자(-, _)가 든 서명도 통과한다 — 변환을 빼면 여기서 깨진다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $hit = false;
  for ($i = 0; $i < 200 && !$hit; $i++) {
    $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-b64-" . $i;
    $sig = _ssv_sign($k, $q);
    if (strpos($sig, "-") === false && strpos($sig, "_") === false) continue;
    $hit = true;
    $full = $q . "&signature=" . $sig . "&key_id=77";
    parse_str($full, $p);
    ok(w_ssv_verify($d, $full, $p), "base64url 문자가 든 서명이 거절됐다 — -_ → +/ 변환이 빠졌다");
  }
  ok($hit, "200회 서명에서 base64url 문자가 한 번도 안 나왔다 — 이 검사가 헛돌았다");
  _ssv_cleanup($d);
});

t("배열로 넘어온 signature·key_id 에 죽지 않고 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-13";
  foreach (array("signature[]=x&key_id=77", "signature[]=x&signature[]=y&key_id[]=77") as $tail) {
    $full = $q . "&" . $tail;
    parse_str($full, $p);
    ok(!w_ssv_verify($d, $full, $p), "배열 파라미터가 통과했다: " . $tail);
  }
  _ssv_cleanup($d);
});

// empty() 는 "0" 도 비었다고 한다. 구글 키 ID 는 숫자라 언젠가 0 이 나오면
// 그 순간부터 모든 정상 콜백이 조용히 거절된다 — 기능이 통째로 죽는다.
t("key_id 가 '0' 이어도 정상 동작한다 — empty() 함정", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "0");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-14";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=0";
  parse_str($full, $p);
  ok(w_ssv_verify($d, $full, $p), "key_id=0 인 정상 콜백이 거절됐다");
  _ssv_cleanup($d);
});

// ── 키 캐시 · 재요청 증폭 ──────────────────────────────────────────────────────

t("w_ssv_keys 는 캐시가 있으면 그걸 쓰고, force 면 키 서버를 다시 읽는다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  $remote = _ssv_key(); _ssv_net_serve(array(array("88", $remote)));
  $j = w_ssv_keys($d, false);
  eq((string)$j["keys"][0]["keyId"], "77", "캐시가 있는데 원격을 읽었다");
  eq(_ssv_net_count(), 0, "캐시가 있는데 키 서버로 나갔다");
  $j2 = w_ssv_keys($d, true);
  eq((string)$j2["keys"][0]["keyId"], "88", "force 인데 원격을 안 읽었다");
  eq(_ssv_net_count(), 1, "force 가 정확히 1회를 안 냈다");
  ok(strpos(_ssv_cache_raw($d), "88") !== false, "다시 받은 키가 캐시에 안 남았다");
  _ssv_cleanup($d);
});

t("키 서버가 응답하지 않으면 null 이다 — 닫히는 쪽으로 실패한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_net_down();
  eq(w_ssv_keys($d, false), null, "캐시도 원격도 없는데 뭔가를 돌려줬다");
  _ssv_cleanup($d);
});

// 증폭 방어의 본체. '호출당 1회' 제한만으로는 초당 1000건의 위조 서명이 초당 1000회의
// 구글 키 서버 요청이 된다. 아래 검사들은 입력이 같고 **캐시·키 서버의 상태만** 다르다.
t("캐시가 신선하면 검증 실패해도 키를 다시 받지 않는다 — 위조 폭주 = 키 서버 증폭 방지", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  $rot = _ssv_key(); _ssv_net_serve(array(array("88", $rot)));
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-15";
  $full = $q . "&signature=" . _ssv_sign($rot, $q) . "&key_id=88";
  parse_str($full, $p);
  for ($i = 0; $i < 100; $i++) { ok(!w_ssv_verify($d, $full, $p), "신선한 캐시인데 원격을 읽어 통과했다"); }
  eq(_ssv_net_count(), 0, "신선한 캐시인데 키 서버로 나갔다");
  _ssv_cleanup($d);
});

t("캐시가 낡았고 키가 교체됐으면 한 번 다시 받아 통과한다 — 기능이 멈추면 안 된다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  $rot = _ssv_key(); _ssv_net_serve(array(array("88", $rot)));
  _ssv_age_cache($d);
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-16";
  $full = $q . "&signature=" . _ssv_sign($rot, $q) . "&key_id=88";
  parse_str($full, $p);
  ok(w_ssv_verify($d, $full, $p), "키가 교체됐는데 다시 받지 않았다 — 검증이 영구히 막힌다");
  eq(_ssv_net_count(), 1, "재요청이 1회가 아니다");
  ok(strpos(_ssv_cache_raw($d), "88") !== false, "다시 받은 키가 캐시에 안 남았다");
  _ssv_cleanup($d);
});

t("다시 받은 직후에는 또 받지 않는다 — 재요청은 호출당 1회이자 간격당 1회다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  $rot = _ssv_key(); _ssv_net_serve(array(array("88", $rot)));
  _ssv_age_cache($d);
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-17";
  $full = $q . "&signature=" . _ssv_sign($rot, $q) . "&key_id=88";
  parse_str($full, $p);
  ok(w_ssv_verify($d, $full, $p), "전제가 깨졌다 — 낡은 캐시에서 재요청이 안 나갔다");
  // 이제 캐시는 방금 받아 신선하다. 키 서버를 또 갈아끼워도 읽지 않아야 한다.
  $rot2 = _ssv_key(); _ssv_net_serve(array(array("99", $rot2)));
  $q2 = "custom_data=acct-1&reward_amount=1&transaction_id=tx-18";
  $full2 = $q2 . "&signature=" . _ssv_sign($rot2, $q2) . "&key_id=99";
  parse_str($full2, $p2);
  ok(!w_ssv_verify($d, $full2, $p2), "연달아 또 다시 받았다 — 간격 제한이 없다");
  eq(_ssv_net_count(), 1, "재요청이 1회를 넘었다");
  _ssv_cleanup($d);
});

// ── 증폭: 키 서버·캐시가 정상이 아닐 때 ───────────────────────────────────────
// 여기가 리뷰에서 뚫린 자리다. 이전 구현은 **캐시 파일의 mtime** 으로 간격을 쟀는데, 그
// mtime 은 받아오기에 성공하고 문서까지 유효해야만 움직인다 — 즉 아래 네 상황(= 이 문이
// 존재해야 할 유일한 이유들)에서 전부 열려 있었다. 살아 있는 원격만으로 테스트해서 초록이었다.
// 정상 운영의 기본 상태가 '낡은 캐시'라는 점이 이걸 이론이 아니라 상시 위험으로 만든다.

t("낡은 캐시 + 키 서버 다운 — 위조 100회에도 키 서버 조회는 1회뿐", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  _ssv_age_cache($d);
  _ssv_net_down();
  $stray = _ssv_key();
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-down1";
  $full = $q . "&signature=" . _ssv_sign($stray, $q) . "&key_id=88";
  parse_str($full, $p);
  for ($i = 0; $i < 100; $i++) { ok(!w_ssv_verify($d, $full, $p), "다운된 키 서버로 통과했다"); }
  ok(_ssv_net_count() <= 1, "키 서버 조회가 " . _ssv_net_count() . "회 — 위조 폭주가 그대로 증폭됐다");
  _ssv_cleanup($d);
});

t("캐시 없음 + 키 서버 다운 — 위조 100회에도 키 서버 조회는 1회뿐", function () {
  _ssv_net_reset();
  $d = tmpdir();   // 캐시 파일 자체가 없다
  _ssv_net_down();
  $stray = _ssv_key();
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-down2";
  $full = $q . "&signature=" . _ssv_sign($stray, $q) . "&key_id=88";
  parse_str($full, $p);
  for ($i = 0; $i < 100; $i++) { ok(!w_ssv_verify($d, $full, $p), "키가 없는데 통과했다"); }
  ok(_ssv_net_count() <= 1, "키 서버 조회가 " . _ssv_net_count() . "회 — 캐시가 없으면 0회차부터 새어나간다");
  _ssv_cleanup($d);
});

t("키 서버가 JSON 이 아닌 응답(503 페이지)을 줘도 — 위조 100회에 조회는 1회뿐", function () {
  _ssv_net_reset();
  $d = tmpdir();
  _ssv_net_raw("<html><body>503 Service Unavailable</body></html>");
  $stray = _ssv_key();
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-503";
  $full = $q . "&signature=" . _ssv_sign($stray, $q) . "&key_id=88";
  parse_str($full, $p);
  for ($i = 0; $i < 100; $i++) { ok(!w_ssv_verify($d, $full, $p), "503 페이지로 통과했다"); }
  ok(_ssv_net_count() <= 1, "키 서버 조회가 " . _ssv_net_count() . "회 — 캐시가 안 써지면 새어나간다");
  _ssv_cleanup($d);
});

// 배포 후 웹 유저가 데이터 디렉토리에 못 쓰게 되는 사고. 캐시를 영원히 못 만들므로 캐시
// mtime 기반 제한은 통째로 꺼진다 — 표식을 임시 디렉토리로 물러서서라도 남겨야 하는 이유다.
t("캐시 디렉토리에 쓸 수 없어도 — 위조 50회에 키 서버 조회는 1회뿐", function () {
  _ssv_net_reset();
  $d = tmpdir();
  $rot = _ssv_key(); _ssv_net_serve(array(array("88", $rot)));
  $log = $d . "-errlog.txt"; @unlink($log);
  $oldLog = ini_get("error_log"); $oldOn = ini_get("log_errors");
  $stray = _ssv_key();
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-ro";
  $full = $q . "&signature=" . _ssv_sign($stray, $q) . "&key_id=88";
  parse_str($full, $p);
  // ⚠ 되돌리기는 finally 에 둔다. 단언 뒤에 두면 ok() 하나가 실패하는 순간 디렉토리가 0500
  // 인 채로, error_log 가 곧 지워질 경로를 가리킨 채로 남는다 — 실패 하나가 뒤 테스트까지
  // 오염시키고 /tmp 에 지울 수 없는 디렉토리를 남긴다(이번 라운드가 만든 새 누수였다).
  $n = null; $passed = true;
  try {
    ini_set("error_log", $log); ini_set("log_errors", "1");
    chmod($d, 0500);
    ok(!is_writable($d), "전제가 깨졌다 — 디렉토리가 아직 쓰기 가능하다(root 로 도는 중?)");
    for ($i = 0; $i < 50; $i++) {
      if (w_ssv_verify($d, $full, $p) !== false) { $passed = false; break; }
    }
    $n = _ssv_net_count();
  } finally {
    chmod($d, 0700);
    ini_set("error_log", $oldLog === false ? "" : $oldLog);
    ini_set("log_errors", $oldOn === false ? "" : $oldOn);
  }
  ok($passed, "못 쓰는 디렉토리에서 통과했다");
  ok($n <= 1, "키 서버 조회가 " . $n . "회 — 디렉토리를 못 쓰면 제한이 통째로 꺼진다");
  // 캐시 쓰기 실패는 조용히 넘어가면 안 된다 — 이 로그가 유일한 단서다
  ok(is_file($log) && strpos((string)file_get_contents($log), "SSV 키 캐시를 쓸 수 없다") !== false,
     "캐시 쓰기 실패가 로그에 안 남았다");
  @unlink($log);
  _ssv_cleanup($d);
});

// 엔드포인트는 이 출력 스트림을 응답 본문과 공유한다 — 진단 문구가 새면 콜백 응답이 오염된다.
t("키 항목에 배열이 들어 있어도 경고 한 줄 없이 거절한다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_key();
  file_put_contents($d . "/ssv_keys_cache.json", json_encode(array("keys" => array(
    array("keyId" => array("77"), "pem" => _ssv_pub($k)),        // keyId 가 배열
    array("keyId" => "77", "pem" => array(_ssv_pub($k))),        // pem 이 배열
  ))));
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-warn";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($full, $p);
  $warns = array();
  set_error_handler(function ($no, $str) use (&$warns) { $warns[] = $str; return true; });
  $got = w_ssv_verify($d, $full, $p);
  restore_error_handler();
  ok(!$got, "배열이 든 키 항목으로 통과했다");
  eq(count($warns), 0, "PHP 진단이 났다: " . implode(" | ", $warns));
  _ssv_cleanup($d);
});

// 간격 판정에 하한이 없으면 **미래 날짜** 표식이 영원히 신선해져 키 재요청이 얼어붙는다.
// 시계 되감김·NFS mtime 어긋남·아무 프로세스가 남긴 +10년 mtime 하나면 된다. 그러면 구글이
// 키를 교체하는 순간부터 모든 진짜 콜백이 503 이 되고 아무 로그도 남지 않는다.
t("미래 날짜 시도 표식은 재요청을 막지 못한다 — 하한이 없으면 영구 동결이다", function () {
  _ssv_net_reset();
  foreach (array(86400, 10 * 365 * 86400) as $ahead) {
    $d = tmpdir(); _ssv_fixture($d, "77");
    _ssv_age_cache($d);
    $rot = _ssv_key(); _ssv_net_serve(array(array("88", $rot)));
    touch($d . "/ssv_keys_attempt", time() + $ahead);   // 미래에서 온 표식
    clearstatcache();
    $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-future";
    $full = $q . "&signature=" . _ssv_sign($rot, $q) . "&key_id=88";
    parse_str($full, $p);
    ok(w_ssv_verify($d, $full, $p),
       "미래 표식(+" . $ahead . "초)에 재요청이 얼어붙었다 — 키 교체 후 모든 진짜 보상이 사라진다");
    _ssv_cleanup($d);
  }
});

// 임시 디렉토리는 아무나 쓸 수 있다. 지갑 디렉토리가 멀쩡한데도 거기를 본다면, /tmp 에 파일
// 하나 만들 수 있는 로컬 프로세스 아무나가 남의 키 재요청을 얼릴 수 있다.
t("지갑 디렉토리가 멀쩡하면 /tmp 표식은 쳐다보지 않는다", function () {
  _ssv_net_reset();
  $d = tmpdir(); _ssv_fixture($d, "77");
  _ssv_age_cache($d);
  $rot = _ssv_key(); _ssv_net_serve(array(array("88", $rot)));
  ok(is_writable($d), "전제가 깨졌다 — 지갑 디렉토리가 쓰기 불가다");
  // 남이 심어 놓은 폴백 표식
  $stray = sys_get_temp_dir() . "/w_ssv_attempt_" . sha1($d);
  touch($stray);
  clearstatcache();
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-stray";
  $full = $q . "&signature=" . _ssv_sign($rot, $q) . "&key_id=88";
  parse_str($full, $p);
  ok(w_ssv_verify($d, $full, $p),
     "남이 /tmp 에 심은 표식이 재요청을 막았다 — 아무나 남의 키 갱신을 얼릴 수 있다");
  @unlink($stray);
  _ssv_cleanup($d);
});

// ── 거절 이유 — '위조'와 '지금 확인할 수 없음'은 처리가 정반대다 ──────────────────
// 불리언 하나로 뭉치면 키 서버 장애 중에 **진짜** 콜백이 영구 거절된다. 광고를 본 사용자는
// 보상을 조용히 잃고, 구글에게 다시 보내라고 말할 방법도 없다(재시도는 5xx 에만 붙는다).

t("정상 콜백의 이유는 ok 다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-r1";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($full, $p);
  $why = null;
  ok(w_ssv_verify($d, $full, $p, $why), "정상 콜백이 거절됐다");
  eq($why, "ok", "이유가 ok 가 아니다");
  _ssv_cleanup($d);
});

t("서명이 틀린 것과 키를 못 얻은 것을 구분한다 — 장애 중 진짜 콜백을 영구 거절하면 안 된다", function () {
  _ssv_net_reset();
  $k = _ssv_key();
  // ① 키는 손에 있는데 서명이 틀림 → 재시도해도 소용없다
  $d = tmpdir(); _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-r2";
  $bad = $q . "&signature=" . _ssv_sign($k, "다른 문장") . "&key_id=77";
  parse_str($bad, $p);
  $why = null;
  ok(!w_ssv_verify($d, $bad, $p, $why), "틀린 서명이 통과했다");
  eq($why, "bad_signature", "키를 들고 확인했는데 이유가 bad_signature 가 아니다");
  _ssv_cleanup($d);

  // ② 키 서버가 죽었고 캐시도 없음 — 콜백 자체는 진짜다 → 재시도해야 한다
  _ssv_net_reset(); _ssv_net_down();
  $d2 = tmpdir();
  $real = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($real, $p2);
  $why2 = null;
  ok(!w_ssv_verify($d2, $real, $p2, $why2), "키도 없는데 통과했다");
  eq($why2, "keys_unavailable",
     "장애 중 진짜 콜백이 위조로 분류됐다 — 엔드포인트가 400 을 내면 보상이 영영 사라진다");
  _ssv_cleanup($d2);
});

t("키 문서는 있는데 key_id 를 모르면 unknown_key 다 — 키 교체 지연일 수 있다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-r3";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=12345";
  parse_str($full, $p);
  $why = null;
  ok(!w_ssv_verify($d, $full, $p, $why), "모르는 key_id 가 통과했다");
  eq($why, "unknown_key", "이유가 unknown_key 가 아니다");
  _ssv_cleanup($d);
});

t("모양이 틀린 콜백은 malformed 다 — 키를 보러 갈 필요조차 없다", function () {
  _ssv_net_reset();
  $d = tmpdir(); $k = _ssv_fixture($d, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-r4";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  $cases = array(
    "서명 없음"        => $q . "&key_id=77",
    "빈 서명"          => $q . "&signature=&key_id=77",
    "base64 아님"      => $q . "&signature=!!!!&key_id=77",
    "배열 서명"        => $q . "&signature[]=x&key_id=77",
    "중복 파라미터"    => $full . "&reward_amount=999",
  );
  foreach ($cases as $name => $qs) {
    parse_str($qs, $p);
    $why = null;
    ok(!w_ssv_verify($d, $qs, $p, $why), "통과했다: " . $name);
    eq($why, "malformed", "이유가 malformed 가 아니다: " . $name);
  }
  // 이유를 안 받아도(3인자 호출) 예전처럼 동작해야 한다
  parse_str($full, $pf);
  ok(w_ssv_verify($d, $full, $pf), "3인자 호출이 깨졌다");
  _ssv_cleanup($d);
});

// ── 키 서버 URL 주입 이음매 ────────────────────────────────────────────────────
// 상수는 자식 프로세스로 넘어가지 않는다. 디스패처 하네스는 wallet-lib.php 를 docroot 에
// 복사해 `php -S` 로 따로 띄우므로, 환경변수가 없으면 SSV 라우트가 붙는 순간 관문이 진짜
// 구글로 요청을 낸다. 이 검사는 그 이음매가 실제로 프로세스 경계를 넘는지를 본다.
t("W_SSV_KEYS_URL 은 환경변수로도 주입된다 — define 은 자식 프로세스에 안 넘어간다", function () {
  $lib = realpath(__DIR__ . "/../wallet-lib.php");
  ok($lib !== false, "wallet-lib.php 를 못 찾았다");
  $code = "require " . var_export($lib, true) . "; echo W_SSV_KEYS_URL;";
  $cmd = "env W_SSV_KEYS_URL=ssvtest://from-env php -r " . escapeshellarg($code) . " 2>/dev/null";
  eq(trim((string)shell_exec($cmd)), "ssvtest://from-env",
     "환경변수가 자식 PHP 프로세스에 안 닿았다 — 디스패처가 진짜 구글로 나간다");
  // 환경변수가 없으면 기본값(구글)이어야 한다 — 이음매가 기본 동작을 바꾸면 안 된다.
  // ⚠ env -u 로 주변 환경을 걷어낸다. 안 그러면 이 스위트를 W_SSV_KEYS_URL 이 설정된
  // 셸에서 돌릴 때(= 이 이음매가 존재하는 바로 그 용도) 검사가 스스로 깨진다.
  $cmd2 = "env -u W_SSV_KEYS_URL php -r " . escapeshellarg($code) . " 2>/dev/null";
  eq(trim((string)shell_exec($cmd2)), "https://www.gstatic.com/admob/reward/verifier-keys.json",
     "환경변수 없을 때의 기본 URL 이 바뀌었다");
});

t("w_ssv_signed_part 는 signature 앞까지만 돌려주고, 없으면 null 이다", function () {
  eq(w_ssv_signed_part("a=1&b=2&signature=X&key_id=7"), "a=1&b=2", "서명 앞 범위가 틀리다");
  eq(w_ssv_signed_part("a=1&b=2"), null, "signature 가 없는데 범위를 돌려줬다");
  // 뒤에 뭐가 더 붙어도 범위는 그대로다
  eq(w_ssv_signed_part("a=1&signature=X&key_id=7&foo=bar"), "a=1", "뒤 파라미터가 범위를 늘렸다");
});

foreach ($MSGS as $m) { echo $m, "\n"; }
echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
