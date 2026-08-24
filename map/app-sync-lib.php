<?php
// 머니스쿱 앱 — 계정 동기화 순수 로직(P8). app_ledger.db 에 편승(al_db 로 열어 전달).
// 스코프 = 구글 sub("g:" 접두 없이 sub 원문) — 게스트는 서버 동기화 없음(시안 정신:
// "로그아웃했어요. 기록은 이 기기에만 남습니다"). 스쿱 잔액·출석은 지갑(wallet-lib)이
// 정본이라 여기 상태에 싣지 않는다. XP 는 클라 적립 + 서버 보존(max 병합) — 서버 검증
// 강화는 P9+ 협의(리더보드 공개 전 필수 항목으로 §15 에 기록).

function sync_migrate($db) {
  $db->exec("create table if not exists app_sync (
    sub text primary key,           -- 구글 계정 sub
    nick text unique,               -- 자동 생성 닉네임(리더보드용)
    state text not null,            -- 동기화 상태 JSON
    updated_at text not null
  )");
}

// ── 닉네임 자동 생성 — 프로토 리더보드 풍(2부 조합), 충돌 시 숫자 접미 ──
function sync_nick_pool() {
  return array(
    array("이평선", "새벽두시", "거래량", "눌림목", "캔들", "장대양봉", "박스권", "돌파", "역추세", "골든크로스",
      "월봉", "스윙", "반등", "저점", "고점"),
    array("순례자", "반등러", "관측러", "수집가", "장인", "추적자", "연구가", "성애자", "지킴이", "농사꾼",
      "감별사", "기록가", "탐험가", "채점러", "공방장")
  );
}

function sync_nick_make($db) {
  $pool = sync_nick_pool();
  for ($try = 0; $try < 40; $try++) {
    $nick = $pool[0][random_int(0, count($pool[0]) - 1)] . $pool[1][random_int(0, count($pool[1]) - 1)];
    if ($try >= 20) $nick .= random_int(2, 99);   // 조합이 말라가면 숫자 접미
    $st = $db->prepare("select 1 from app_sync where nick = ?");
    $st->execute(array($nick));
    if (!$st->fetch()) return $nick;
  }
  return "스쿱러" . random_int(1000, 9999);
}

// ── 병합 규칙(정본) — 게스트→계정·기기 간 충돌을 서버가 판정 ──
// xp/personaIdx: max(래칫 아님 — 진행도) · personaAns: 더 긴 쪽(답은 append 만 된다) ·
// sigRead: 합집합 · picks: 합집합(선두 유지·상한) · 그 외 스칼라(테마 등): 푸시(최신) 우선.
function sync_merge_state($server, $incoming, $picksMax = 12) {
  $s = is_array($server) ? $server : array();
  $c = is_array($incoming) ? $incoming : array();
  $out = $c;   // 기본: 클라 최신 우선
  $num = function ($a, $k) { return isset($a[$k]) && is_numeric($a[$k]) ? (float)$a[$k] : 0; };
  $out["xp"] = (int)max($num($s, "xp"), $num($c, "xp"));
  $out["personaIdx"] = (int)max($num($s, "personaIdx"), $num($c, "personaIdx"));
  $sa = isset($s["personaAns"]) && is_array($s["personaAns"]) ? $s["personaAns"] : array();
  $ca = isset($c["personaAns"]) && is_array($c["personaAns"]) ? $c["personaAns"] : array();
  $out["personaAns"] = count($sa) > count($ca) ? $sa : $ca;
  $sr = isset($s["sigRead"]) && is_array($s["sigRead"]) ? $s["sigRead"] : array();
  $cr = isset($c["sigRead"]) && is_array($c["sigRead"]) ? $c["sigRead"] : array();
  $out["sigRead"] = array_merge($sr, $cr);
  $sp = isset($s["picks"]) && is_array($s["picks"]) ? $s["picks"] : array();
  $cp = isset($c["picks"]) && is_array($c["picks"]) ? $c["picks"] : array();
  $picks = array();
  foreach (array_merge($cp, $sp) as $p) {
    if (is_string($p) && $p !== "" && !in_array($p, $picks, true) && count($picks) < $picksMax) $picks[] = $p;
  }
  $out["picks"] = $picks;
  return $out;
}

// 읽기 — 없으면 null
function sync_get($db, $sub) {
  $st = $db->prepare("select * from app_sync where sub = ?");
  $st->execute(array($sub));
  $r = $st->fetch();
  if (!$r) return null;
  $r["state"] = json_decode($r["state"], true);
  if (!is_array($r["state"])) $r["state"] = array();
  return $r;
}

// 쓰기 — 서버 보관본과 병합해 저장하고 병합 결과를 돌려준다(클라는 이 결과로 로컬 갱신).
// 최초 쓰기에서 닉네임을 만든다.
function sync_put($db, $sub, $incoming, $now) {
  $db->exec("begin immediate");
  try {
    $st = $db->prepare("select * from app_sync where sub = ?");
    $st->execute(array($sub));
    $row = $st->fetch();
    $server = $row ? json_decode($row["state"], true) : null;
    $merged = sync_merge_state($server, $incoming);
    $nick = $row ? $row["nick"] : sync_nick_make($db);
    $st = $db->prepare("insert into app_sync (sub, nick, state, updated_at) values (:s,:n,:st,:u)
      on conflict(sub) do update set state=excluded.state, updated_at=excluded.updated_at");
    $st->execute(array(":s" => $sub, ":n" => $nick,
      ":st" => json_encode($merged, JSON_UNESCAPED_UNICODE), ":u" => gmdate("c", $now)));
    $db->exec("commit");
    return array("nick" => $nick, "state" => $merged);
  } catch (Throwable $e) { $db->exec("rollback"); throw $e; }
}

// 탈퇴 — 동기화 데이터 완전 삭제(잔액·원장은 각 정본의 규칙을 따른다: 지갑은 구글 연결 해제,
// 채점 원장은 기기 키 익명 데이터라 통계 무결성을 위해 보존).
function sync_delete($db, $sub) {
  $st = $db->prepare("delete from app_sync where sub = ?");
  $st->execute(array($sub));
  return $st->rowCount();
}
