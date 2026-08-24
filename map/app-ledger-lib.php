<?php
// 머니스쿱 앱 — 채점 원장(예측 기록·자동 채점·집계) 순수 로직.
// wallet-lib 와 같은 규율: 웹루트 밖 SQLite · BEGIN IMMEDIATE · 서버가 판정(클라 신고 금지).
// 규칙(지침서 §6·Q1·Q6): 심화·커스텀만 적재 · 종목×주기×등록일(KST) 그날 마지막 1건(교체) ·
// 만기 = 다음 봉 마감(base_t 다음 봉이 '닫히면' 채점) · 판정 = 방향 2분법(무변동은 빗나감 — 보수,
// PC 백테스트 규칙과의 정밀 합치는 Q6 협의 고정점) · 적중 환급 +1 은 지갑 통합(P5)에서 지급,
// 여기서는 refund_due 플래그만 기록 · 원장 영구 보존 · 화면 노출 90일.

function al_db($dir) {
  if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    throw new Exception("원장 데이터 디렉토리를 만들 수 없다: " . $dir);
  }
  if (!is_writable($dir)) {
    throw new Exception("원장 데이터 디렉토리에 쓸 수 없다: " . $dir);
  }
  $db = new PDO("sqlite:" . $dir . "/app_ledger.db");
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $db->exec("pragma busy_timeout = 5000");
  for ($i = 0; $i < 5; $i++) {
    try { $db->exec("pragma journal_mode = WAL"); break; }
    catch (Throwable $e) { usleep(20000 * ($i + 1)); }
  }
  @chmod($dir . "/app_ledger.db", 0600);
  al_migrate($db);
  return $db;
}

function al_migrate($db) {
  $db->exec("create table if not exists predictions (
    id integer primary key autoincrement,
    device text not null,
    sym text not null,
    tf text not null,               -- '일'|'주'|'월'
    day text not null,              -- 등록일(KST YYYY-MM-DD) — 그날 마지막 1건 키
    base_t text not null,           -- 등록 당시 마지막 봉 날짜(만기 기준)
    tier text not null,             -- 'deep'|'custom'
    dir text not null,              -- 'up'|'down'|'neutral'
    prob integer, target real, invalid real, anchor real,
    preset text, agree integer, total integer,
    opp text,                       -- 반대 의견 지표 스냅샷(JSON — 복기 힌트)
    engine text, reg_at text not null,
    status text not null default 'wait',   -- wait|hit|miss
    settle_close real, settle_t text, scored_at text,
    refund_due integer not null default 0, refund_paid integer not null default 0,
    unique(device, sym, tf, day)
  )");
  $db->exec("create index if not exists idx_pred_device on predictions(device, reg_at desc)");
  $db->exec("create index if not exists idx_pred_wait on predictions(status) where status='wait'");
}

function al_kst_day($ts) { return gmdate("Y-m-d", $ts + 9 * 3600); }

// 등록(그날 마지막 1건 — 같은 키는 교체). basic 거절.
function al_register($db, $p) {
  foreach (array("device","sym","tf","tier","dir","base_t") as $k) {
    if (!isset($p[$k]) || $p[$k] === "") return array("ok" => false, "error" => "missing:" . $k);
  }
  if (!in_array($p["tier"], array("deep", "custom"), true)) {
    return array("ok" => false, "error" => "tier");   // 기본 분석은 적재·채점 제외(지침서 §6)
  }
  if (!in_array($p["tf"], array("일", "주", "월"), true)) return array("ok" => false, "error" => "tf");
  $now = isset($p["_now"]) ? (int)$p["_now"] : time();
  $day = al_kst_day($now);
  $db->exec("begin immediate");
  try {
    $st = $db->prepare("insert into predictions
      (device,sym,tf,day,base_t,tier,dir,prob,target,invalid,anchor,preset,agree,total,opp,engine,reg_at,status)
      values (:device,:sym,:tf,:day,:base_t,:tier,:dir,:prob,:target,:invalid,:anchor,:preset,:agree,:total,:opp,:engine,:reg_at,'wait')
      on conflict(device,sym,tf,day) do update set
        base_t=excluded.base_t, tier=excluded.tier, dir=excluded.dir, prob=excluded.prob,
        target=excluded.target, invalid=excluded.invalid, anchor=excluded.anchor,
        preset=excluded.preset, agree=excluded.agree, total=excluded.total, opp=excluded.opp,
        engine=excluded.engine, reg_at=excluded.reg_at,
        status='wait', settle_close=null, settle_t=null, scored_at=null, refund_due=0, refund_paid=0");
    $st->execute(array(
      ":device" => $p["device"], ":sym" => $p["sym"], ":tf" => $p["tf"], ":day" => $day,
      ":base_t" => $p["base_t"], ":tier" => $p["tier"], ":dir" => $p["dir"],
      ":prob" => isset($p["prob"]) ? (int)$p["prob"] : null,
      ":target" => isset($p["target"]) ? (float)$p["target"] : null,
      ":invalid" => isset($p["invalid"]) ? (float)$p["invalid"] : null,
      ":anchor" => isset($p["anchor"]) ? (float)$p["anchor"] : null,
      ":preset" => isset($p["preset"]) ? $p["preset"] : null,
      ":agree" => isset($p["agree"]) ? (int)$p["agree"] : null,
      ":total" => isset($p["total"]) ? (int)$p["total"] : null,
      ":opp" => isset($p["opp"]) ? json_encode($p["opp"], JSON_UNESCAPED_UNICODE) : null,
      ":engine" => isset($p["engine"]) ? $p["engine"] : null,
      ":reg_at" => gmdate("c", $now)
    ));
    $db->exec("commit");
  } catch (Throwable $e) { $db->exec("rollback"); throw $e; }
  return array("ok" => true, "day" => $day);
}

// 지연 채점 — 대기 행에 캔들을 대 주면 만기 지난 것을 판정한다.
// $candles: [{t,o,h,l,c,...}] 오름차순(해당 sym·tf). $todayT: '오늘'의 봉 날짜 경계(이 값 미만의
// t 를 가진 봉만 '닫힘'으로 본다 — 진행 중 봉으로 채점하지 않기 위함).
function al_score_row($row, $candles, $todayT) {
  $settle = null;
  foreach ($candles as $c) {
    if (!isset($c["t"]) || !isset($c["c"])) continue;
    $t = substr((string)$c["t"], 0, 10);
    if ($t > $row["base_t"]) { $settle = array("t" => $t, "c" => (float)$c["c"]); break; }
  }
  if ($settle === null) return null;                    // 다음 봉이 아직 없다
  $closed = false;
  foreach ($candles as $c) {                            // 그 뒤 봉이 있으면 확정
    $t = substr((string)$c["t"], 0, 10);
    if ($t > $settle["t"]) { $closed = true; break; }
  }
  if (!$closed && $settle["t"] >= $todayT) return null; // 진행 중 봉 — 기다린다
  $anchor = (float)$row["anchor"];
  $up = $settle["c"] > $anchor;
  $flat = ($settle["c"] === $anchor);
  $hit = !$flat && (($row["dir"] === "up" && $up) || ($row["dir"] === "down" && !$up));
  // 중립 예측은 절대변화 0.5% 미만이면 적중(보수적 정의 — Q6 협의 고정점)
  if ($row["dir"] === "neutral") {
    $hit = $anchor > 0 && abs($settle["c"] / $anchor - 1) < 0.005;
  }
  return array("status" => $hit ? "hit" : "miss", "settle_close" => $settle["c"], "settle_t" => $settle["t"]);
}

function al_score_pending($db, $device, $candleProvider, $now) {
  $todayT = gmdate("Y-m-d", $now);   // UTC 날짜 경계(주식 t=거래소일·암호화폐 t=UTC일 — 보수적 공통 경계)
  $st = $db->prepare("select * from predictions where device=:d and status='wait'");
  $st->execute(array(":d" => $device));
  $rows = $st->fetchAll();
  $scored = 0;
  foreach ($rows as $row) {
    $candles = call_user_func($candleProvider, $row["sym"], $row["tf"]);
    if (!is_array($candles) || !count($candles)) continue;
    $r = al_score_row($row, $candles, $todayT);
    if ($r === null) continue;
    $up = $db->prepare("update predictions set status=:s, settle_close=:c, settle_t=:t, scored_at=:a,
      refund_due=case when :s2='hit' then 1 else 0 end where id=:id and status='wait'");
    $up->execute(array(":s" => $r["status"], ":c" => $r["settle_close"], ":t" => $r["settle_t"],
      ":a" => gmdate("c", $now), ":s2" => $r["status"], ":id" => $row["id"]));
    $scored++;
  }
  return $scored;
}

// 목록 + 집계(화면 노출 90일 — 원장은 영구 보존)
function al_list($db, $device, $limit, $now) {
  $cut = gmdate("c", $now - 90 * 86400);
  $st = $db->prepare("select * from predictions where device=:d and reg_at>=:cut order by reg_at desc limit :lim");
  $st->bindValue(":d", $device);
  $st->bindValue(":cut", $cut);
  $st->bindValue(":lim", max(1, min(200, (int)$limit)), PDO::PARAM_INT);
  $st->execute();
  $rows = $st->fetchAll();
  $today = al_kst_day($now);
  $cnt = array("all" => 0, "due" => 0, "hit" => 0, "miss" => 0, "wait" => 0);
  $byTf = array();
  $day14 = array();
  foreach ($rows as &$r) {
    $r["opp"] = $r["opp"] ? json_decode($r["opp"], true) : null;
    $r["today"] = ($r["scored_at"] && al_kst_day(strtotime($r["scored_at"])) === $today) ? 1 : 0;
    $cnt["all"]++;
    if ($r["status"] === "wait") $cnt["wait"]++;
    else {
      $cnt[$r["status"]]++;
      if ($r["today"]) $cnt["due"]++;
      $sd = al_kst_day(strtotime($r["scored_at"]));
      if (strtotime($sd) >= $now - 14 * 86400) {
        if (!isset($day14[$sd])) $day14[$sd] = array("hit" => 0, "miss" => 0);
        $day14[$sd][$r["status"]]++;
      }
    }
    if (!isset($byTf[$r["tf"]])) $byTf[$r["tf"]] = array("n" => 0, "hit" => 0);
    if ($r["status"] !== "wait") { $byTf[$r["tf"]]["n"]++; if ($r["status"] === "hit") $byTf[$r["tf"]]["hit"]++; }
  }
  unset($r);
  $done = $cnt["hit"] + $cnt["miss"];
  return array("ok" => true, "rows" => $rows, "cnt" => $cnt,
    "hitRate" => $done ? (int)round($cnt["hit"] / $done * 100) : null,
    "byTf" => $byTf, "day14" => $day14, "today" => $today);
}

// 적중 환급 지급 대상 조회·소진(P5 지갑 통합에서 실지급 — 여기서는 상태만 원자적으로 넘긴다)
function al_claim_refunds($db, $device) {
  $db->exec("begin immediate");
  try {
    $st = $db->prepare("select id from predictions where device=:d and refund_due=1 and refund_paid=0");
    $st->execute(array(":d" => $device));
    $ids = array_map(function ($r) { return $r["id"]; }, $st->fetchAll());
    if (count($ids)) {
      $in = implode(",", array_map("intval", $ids));
      $db->exec("update predictions set refund_paid=1 where id in (" . $in . ")");
    }
    $db->exec("commit");
    return count($ids);
  } catch (Throwable $e) { $db->exec("rollback"); throw $e; }
}
