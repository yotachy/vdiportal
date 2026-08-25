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

// 익명 통계(P7 peers) — 원장에서 실값만 파생한다. 표본이 모자란 항목은 null 로 내려
// 클라가 '집계 준비 중'을 정직하게 표기한다(지어내지 않음). 개인 식별 없음 — device 는
// 나의 적중률·순위 계산에만 쓰고 응답에 다른 기기 식별자를 싣지 않는다.
function al_peers_stats($db, $device, $now, $minN = 5) {
  $d14 = al_kst_day($now - 13 * 86400);
  $d7 = al_kst_day($now - 6 * 86400);
  $cut90 = gmdate("c", $now - 90 * 86400);

  // 최근 14일 일별 등록 건수(전 기기) — 빈 날은 0 으로 채워 14칸 고정
  $st = $db->prepare("select day, count(*) n from predictions where day>=:d group by day");
  $st->execute(array(":d" => $d14));
  $byDay = array();
  foreach ($st->fetchAll() as $r) $byDay[$r["day"]] = (int)$r["n"];
  $trend = array();
  $regTotal14 = 0;
  for ($i = 13; $i >= 0; $i--) {
    $day = al_kst_day($now - $i * 86400);
    $n = isset($byDay[$day]) ? $byDay[$day] : 0;
    $trend[] = array("day" => $day, "n" => $n);
    $regTotal14 += $n;
  }

  // 최근 7일 최다 분석 종목 top5 + 점유율 분모
  $st = $db->prepare("select sym, count(*) n from predictions where day>=:d group by sym order by n desc, sym limit 5");
  $st->execute(array(":d" => $d7));
  $tops = array_map(function ($r) { return array("sym" => $r["sym"], "n" => (int)$r["n"]); }, $st->fetchAll());
  $st = $db->prepare("select count(*) n, count(distinct device) dev from predictions where day>=:d");
  $st->execute(array(":d" => $d7));
  $row7 = $st->fetch();
  $topsTotal = (int)$row7["n"];
  $devices7 = (int)$row7["dev"];

  // 최근 90일 채점 완료 전 기기: 표본·적중·'항상 상승' 기준선(실제 상승 비율)
  $st = $db->prepare("select count(*) n, sum(case when status='hit' then 1 else 0 end) hit,
    sum(case when settle_close>anchor then 1 else 0 end) up
    from predictions where status!='wait' and scored_at>=:c");
  $st->execute(array(":c" => $cut90));
  $sc = $st->fetch();
  $scored = array("n" => (int)$sc["n"], "hit" => (int)$sc["hit"], "up" => (int)$sc["up"]);

  // 관점(프리셋)별 적중률 — 표본 minN 이상만, 표본 많은 순 4개
  $st = $db->prepare("select coalesce(preset,'전체 종합') p, count(*) n,
    sum(case when status='hit' then 1 else 0 end) hit
    from predictions where status!='wait' and scored_at>=:c
    group by p having count(*)>=:m order by n desc limit 4");
  $st->bindValue(":c", $cut90);
  $st->bindValue(":m", (int)$minN, PDO::PARAM_INT);
  $st->execute();
  $styleFit = array_map(function ($r) {
    return array("preset" => $r["p"], "n" => (int)$r["n"], "hit" => (int)$r["hit"]);
  }, $st->fetchAll());

  // 나의 적중률 + 상위 % (표본 minN 이상 기기들의 적중률 분포에서)
  $st = $db->prepare("select count(*) n, sum(case when status='hit' then 1 else 0 end) hit
    from predictions where device=:d and status!='wait' and scored_at>=:c");
  $st->execute(array(":d" => $device, ":c" => $cut90));
  $meRow = $st->fetch();
  $me = array("n" => (int)$meRow["n"], "hit" => (int)$meRow["hit"], "rank" => null);
  if ($me["n"] >= $minN) {
    $st = $db->prepare("select device, count(*) n, sum(case when status='hit' then 1 else 0 end) hit
      from predictions where status!='wait' and scored_at>=:c group by device having count(*)>=:m");
    $st->bindValue(":c", $cut90);
    $st->bindValue(":m", (int)$minN, PDO::PARAM_INT);
    $st->execute();
    $all = $st->fetchAll();
    $mine = $me["hit"] / $me["n"];
    $better = 0;
    foreach ($all as $r) { if (((int)$r["hit"]) / ((int)$r["n"]) > $mine) $better++; }
    if (count($all)) $me["rank"] = (int)max(1, round(($better + 1) / count($all) * 100));
  }

  return array("ok" => true, "minN" => (int)$minN,
    "trend" => $trend, "regTotal14" => $regTotal14,
    "tops" => $tops, "topsTotal" => $topsTotal, "devices7" => $devices7,
    "scored" => $scored, "styleFit" => $styleFit, "me" => $me);
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

// ── 레벨(활동) XP — 원장 파생. 리더보드 레벨 보드용. 통산 활동 + 적중 가중(브레인스토밍 확정 2026-08-25).
//    참여 XP(방문·메뉴 등 클라)와 별개 — 이건 서버가 아는 실활동만 세어 위조 불가(leads/vols 와 같은 원장 기반).
if (!defined("AL_LV_BASE")) define("AL_LV_BASE", 3);    // 등록 분석 1건당
if (!defined("AL_LV_HIT")) define("AL_LV_HIT", 2);      // 적중(status=hit) 1건당 보너스
if (!defined("AL_LV_MINREG")) define("AL_LV_MINREG", 10); // 리더보드 노출 최소 등록 수(스팸 컷)

function al_level_xp($reg, $hits) {
  return AL_LV_BASE * (int)$reg + AL_LV_HIT * (int)$hits;
}
// 확장형 레벨(상한 없음) — 도달 임계 = 15·(L-1)·L/2 삼각수. L1:0 L2:15 L3:45 L4:90 L5:150 L6:225 …
function al_activity_level($xp) {
  $L = 1;
  while ($xp >= 15 * $L * ($L + 1) / 2) $L++;
  return $L;
}
// 기기별 통산 등록·적중 → levelXp 로 정렬(내림차). minReg 미달 제외. 닉네임 해석은 호출부(app-api).
function al_level_ranks($db, $minReg = AL_LV_MINREG) {
  // HAVING 에 바인딩 파라미터를 쓰면 SQLite/PDO 가 집계 비교를 잘못 처리해 0행을 낸다(실측).
  // minReg 는 내부 int 이므로 캐스팅 후 리터럴로 인라인(주입 위험 없음).
  $m = (int)$minReg;
  $st = $db->query("select device, count(*) reg, sum(case when status='hit' then 1 else 0 end) hits
    from predictions group by device having count(*) >= " . $m);
  $rows = array();
  foreach ($st->fetchAll() as $r) {
    $xp = al_level_xp((int)$r["reg"], (int)$r["hits"]);
    $rows[] = array("device" => $r["device"], "reg" => (int)$r["reg"], "hits" => (int)$r["hits"],
      "xp" => $xp, "level" => al_activity_level($xp));
  }
  usort($rows, function ($a, $b) { return ($b["xp"] - $a["xp"]) ?: strcmp($a["device"], $b["device"]); });
  return $rows;
}
