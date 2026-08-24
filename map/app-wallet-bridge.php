<?php
// 앱 지갑 브리지 — 순수 함수(HTTP 무관, 테스트에서 직접 로드). app-api.php 가 require 한다.
// 전제: wallet-lib.php · app-ledger-lib.php 가 먼저 로드되어 있다(상수 주입 포함).

// IP 해시 — wallet-api 의 w_ip_hash 와 동일 규칙(HMAC·비밀키). 그 함수는 디스패처 파일에
// 있어 여기서 재구현한다(같은 w_secret 을 쓰므로 두 API 의 IP 상한 카운트가 합산된다 — 의도).
function app_ip_hash($dir) {
  $ip = isset($_SERVER["REMOTE_ADDR"]) ? $_SERVER["REMOTE_ADDR"] : "";
  if ($ip === "") return null;
  return substr(hash_hmac("sha256", $ip, w_secret($dir)), 0, 32);
}

function app_wallet_acct($db, $dir, $device) {
  $acct = w_get_account($db, $device);
  if ($acct) return $acct;
  $iph = app_ip_hash($dir);
  try { $acct = w_create_account($db, $device, $iph); }
  catch (WalletRateLimitException $e) {
    $acct = w_get_account($db, $device);
    if (!$acct) throw new WalletRateLimitException("rate-limited");
  } catch (Throwable $e) { $acct = w_get_account($db, $device); }
  if (!$acct) throw new Exception("wallet-storage");
  return $acct;
}

// 계정 해석(P8) — 기기가 구글에 연결됐으면 그 계정을 본다. 세 갈래:
// ① 기기 계정에 google_sub 가 있다(최초 링크 기기 = 그 계정이 곧 구글 계정) ② 기기 계정이
// merge_discard 표식으로 "넘어감"(두 번째 기기 — 표식의 ref 에 적힌 sub 로 실계정 조회)
// ③ 게스트. 새 앱은 토큰이 없고 device 문자열(64자 랜덤 = 비밀) 기반이라, 구 앱의 계정
// 토큰 역할을 이 해석이 대신한다.
function app_acct_resolve($db, $dir, $device, $create = true) {
  $acct = $create ? app_wallet_acct($db, $dir, $device) : w_get_account($db, $device);
  if (!$acct) return array("acct" => null, "linked" => false, "sub" => null);   // 계정 없음 = 게스트
  if ($acct["google_sub"] !== null) {
    return array("acct" => $acct, "linked" => true, "sub" => $acct["google_sub"]);
  }
  if (w_is_merged_away($db, $acct["id"])) {
    $st = $db->prepare("select ref from ledger where account_id = ? and reason = 'merge_discard' order by id desc limit 1");
    $st->execute(array($acct["id"]));
    $r = $st->fetch();
    if ($r && $r["ref"] !== null) {
      $st = $db->prepare("select * from accounts where google_sub = ?");
      $st->execute(array($r["ref"]));
      $g = $st->fetch();
      if ($g) return array("acct" => $g, "linked" => true, "sub" => $g["google_sub"]);
    }
  }
  return array("acct" => $acct, "linked" => false, "sub" => null);
}

// 적중 환급 실지급(Q1) — 원장 refund_due 를 지갑 +1 로. 멱등키 hitref:<id> 라 재실행 안전:
// 지급을 먼저(멱등), 표시 플래그를 나중에 — 중간에 죽어도 다음 호출이 이어서 마킹만 한다.
function app_wallet_sweep_refunds($wdb, $aldb, $device, $acctId) {
  $st = $aldb->prepare("select id from predictions where device=:d and refund_due=1 and refund_paid=0");
  $st->execute(array(":d" => $device));
  $rows = $st->fetchAll();
  $granted = 0;
  foreach ($rows as $r) {
    $idem = "hitref:" . $device . ":" . $r["id"];
    try {
      $wdb->exec("begin immediate");
      $dup = $wdb->prepare("select id from ledger where idem = ?");
      $dup->execute(array($idem));
      if (!$dup->fetch()) {
        $bal = w_true_balance($wdb, $acctId);
        $give = min(1, max(0, W_CAP - $bal));   // 적립은 상한 캡(지침서 §8)
        if ($give > 0) {
          $wdb->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at) values (?, ?, 'hit-refund', ?, ?, ?)")
              ->execute(array($acctId, $give, "pred:" . $r["id"], $idem, w_now()));
          $wdb->prepare("update accounts set balance = balance + ? where id = ?")->execute(array($give, $acctId));
          $granted += $give;
        }
      }
      $wdb->exec("commit");
    } catch (Throwable $e) { try { $wdb->exec("rollback"); } catch (Throwable $e2) {} continue; }
    $aldb->prepare("update predictions set refund_paid=1 where id=?")->execute(array($r["id"]));
  }
  return $granted;
}
