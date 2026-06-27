# 스쿱포지 Phase 5-B (R5b) 비전 분석 작업큐 MVP — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `☁ 분석 요청` 버튼 → forge-api.php 작업큐 → Claude 워커(`/forge-analyze`)가 대표 이미지+전략을 읽어 분석 → 폴링 반영(series 주입 + visionBias 보정)으로 R5a 예측/재생을 진짜 데이터로 구동.

**Architecture:** 큐는 forge-api.php에 op 3종(POST: enqueue/claim/result) + GET `?jobs`로 추가하고 별도 파일 `forge_jobs.json`에 보관(이미지/보드는 imgId·board 스냅샷 참조). 워커는 결정적 코드가 아니라 `.claude/commands/forge-analyze.md` 런북을 따르는 Claude 세션(이미지는 내장 비전 `Read`, 결과는 curl POST). 엔진은 R5a `run`/`runSteps`를 그대로 쓰되 `opts.visionBias` 한 줄만 추가하고, 비전 series는 클라이언트가 `data`로 주입한다.

**Tech Stack:** 바닐라 JS(무빌드 단일 파일 `forge.html`), 순수 함수 모듈 `forge-core.js`(node:test), PHP 8.4 파일 저장 API `forge-api.php`(cafe24), Claude Code 슬래시 커맨드.

## Global Constraints

- 바닐라 JS · 빌드 도구/번들러/프레임워크 금지 · 단일 HTML(`forge.html`) 유지.
- 외부 라이브러리 금지(Pretendard 폰트 CDN 1개만 허용).
- UI 텍스트 한국어. 다크 테마 + 골드 토큰(`--gold`).
- **Claude API 직접 호출 금지**(영구 비범위). forge-api.php는 Anthropic을 호출하지 않는다. cafe24에 API 키를 두지 않는다.
- 모든 POST 본문 <128KB(cafe24 openresty 131072B 상한). 이미지 dataURL을 잡/문서 JSON에 넣지 말 것 — imgId 참조만.
- 클라이언트는 상대경로 `FORGE_API = "forge-api.php"` 사용.
- 배포(cafe24 `www/map/`) 시 `forge_data.json` / `forge_images.json` / `forge_jobs.json` **덮어쓰기 금지**(사용자 데이터). `map.html` 등 기존 자산 불가침.
- 들여쓰기 2 spaces · 큰따옴표 · 케밥케이스.
- 좌표/데이터 모델은 설계 문서 `docs/superpowers/specs/2026-06-27-scoopforge-phase5b-vision-queue-design.md` 기준.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `forge-core.js` | 순수 분석 엔진 | `run`에 `opts.visionBias` 결합 + 순수 헬퍼 `visionBiasFrom(bias)` export |
| `forge-core.test.js` | 엔진 node 테스트 | visionBias no-op/tilt + visionBiasFrom + runSteps 전달 테스트 |
| `forge-api.php` | 잡 큐 저장 API | POST `enqueue`/`claim`/`result` + GET `?jobs` + `forge_jobs.json` + GC |
| `forge.html` | 클라이언트 | 비전 상태 + `applyVision` + `runForge`/`playAnalysis` 결합 + `doc.vision` 영속 + `☁ 분석 요청` 버튼 + 폴링 |
| `.claude/commands/forge-analyze.md` | 워커 런북(신규) | claim→이미지 Read→C 스키마 결과 생산→result POST |

---

## Task 1: forge-core 엔진 결합 (visionBias)

**Files:**
- Modify: `forge-core.js:300` (bias 합산), 그리고 `return { version, ... }` 블록(약 `forge-core.js:353`)에 `visionBiasFrom` 추가
- Modify: `forge-core.js` 끝부분에 `visionBiasFrom` 함수 정의
- Test: `forge-core.test.js` (맨 끝에 테스트 추가)

**Interfaces:**
- Consumes: 기존 `run(graph, data, opts)`, `runSteps(graph, data, opts)`, `makeDemoSeries(opts)`, `aggregateConviction(graph)`.
- Produces:
  - `run(graph, data, opts)` — `opts.visionBias`(number, optional) 인식. 미지정/0이면 기존과 동일.
  - `runSteps(graph, data, opts)` — `opts`를 `run`에 그대로 전달(이미 그러함, 확인만).
  - `visionBiasFrom(bias)` — `bias = {dir:"bull"|"bear"|"neutral", strength:0..1}` → number. `bull→+`, `bear→−`, `neutral/누락→0`. `strength`는 0..1로 clamp, `SCALE=60`. 반환 = `dir부호 * strength * 60`.

- [ ] **Step 1: 실패하는 테스트 작성** (`forge-core.test.js` 끝에 추가)

```js
test("visionBias: zero/absent is no-op, positive tilts up, negative down", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 5, period: 48 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }]
  };
  const r0 = ForgeCore.run(g, data, { futW: 60 });
  const rz = ForgeCore.run(g, data, { futW: 60, visionBias: 0 });
  assert.deepStrictEqual(rz.signal, r0.signal);
  assert.strictEqual(rz.verdict.score, r0.verdict.score);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const rp = ForgeCore.run(g, data, { futW: 60, visionBias: 60 });
  assert.ok(mean(rp.signal) > mean(r0.signal));
  assert.ok(rp.verdict.score >= r0.verdict.score);
  assert.ok(rp.signal.every(v => v >= -100 && v <= 100));
  const rn = ForgeCore.run(g, data, { futW: 60, visionBias: -60 });
  assert.ok(mean(rn.signal) < mean(r0.signal));
  // prediction.path는 conviction/visionBias 영향 없음(가격 외삽만)
  assert.deepStrictEqual(rp.prediction.path, r0.prediction.path);
});

test("visionBiasFrom: dir/strength → conviction-scale number", () => {
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "bull", strength: 1 }), 60);
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "bear", strength: 0.5 }), -30);
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "neutral", strength: 1 }), 0);
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "bull", strength: 5 }), 60); // clamp
  assert.strictEqual(ForgeCore.visionBiasFrom(null), 0);
  assert.strictEqual(ForgeCore.visionBiasFrom({}), 0);
});

test("runSteps forwards opts.visionBias (last step === run(full))", () => {
  const data = ForgeCore.makeDemoSeries({ n: 240, seed: 3, period: 40 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 16, pmax: 80 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }]
  };
  const steps = ForgeCore.runSteps(g, data, { futW: 60, visionBias: 40 });
  const full = ForgeCore.run(g, data, { futW: 60, visionBias: 40 });
  assert.deepStrictEqual(steps[steps.length - 1].signal, full.signal);
  assert.deepStrictEqual(steps[steps.length - 1].prediction.path, full.prediction.path);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: 새 테스트 3건 FAIL — `visionBiasFrom is not a function` 및 visionBias 미반영(`rp.signal` 평균이 `r0`과 동일).

- [ ] **Step 3: `run`의 bias 합산 수정** (`forge-core.js:300`)

기존:
```js
    const bias = aggregateConviction(graph), K = 0.5;
```
변경:
```js
    const vbias = (opts && typeof opts.visionBias === "number" && isFinite(opts.visionBias)) ? opts.visionBias : 0;
    const bias = aggregateConviction(graph) + vbias, K = 0.5;
```

- [ ] **Step 4: `visionBiasFrom` 헬퍼 정의 + export** (`forge-core.js`, `return { version, ... }` 직전에 함수 추가)

```js
  function visionBiasFrom(b) {
    if (!b || typeof b !== "object") return 0;
    const SCALE = 60;
    const s = (typeof b.strength === "number" && isFinite(b.strength)) ? Math.max(0, Math.min(1, b.strength)) : 0;
    const dir = b.dir === "bull" ? 1 : b.dir === "bear" ? -1 : 0;
    return dir * s * SCALE;
  }
```

export 라인(`forge-core.js:353`)에 추가:
```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom };
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS — 전체 23건(기존 20 + 신규 3), `fail 0`.

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): run에 visionBias 결합 + visionBiasFrom 헬퍼(R5b 엔진)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: forge-api.php 작업큐 (enqueue/claim/result + GET ?jobs)

**Files:**
- Modify: `forge-api.php` — GET 블록에 `?jobs` 추가(약 `forge-api.php:30` 뒤), POST `putimg` 블록 뒤(약 `forge-api.php:56`)에 큐 op 블록 추가
- 신규 런타임 파일: `forge_jobs.json`(서버가 생성, 커밋/배포 대상 아님)

**Interfaces:**
- Produces (HTTP 계약):
  - `POST {op:"enqueue", docId, imgId, board}` → `{ok:true, job}`. 같은 docId의 `pending`/`working` 잡 있으면 그 잡 반환(중복 적재 X). docId/board 누락 → 400.
  - `POST {op:"claim"}` → `{ok:true, job, token}` (가장 오래된 pending 1건 → working). 없으면 `{ok:true, job:null, token:null}`.
  - `POST {op:"result", jobId, token, result}` 또는 `{...error}` → `{ok:true}`. jobId 없음 → 404, token 불일치 → 409.
  - `GET ?jobs[&docId=...]` → `{ok:true, jobs:[...]}` (쓰기 없음, 폴링용).
  - job 구조: `{id, docId, imgId, board, status, token, created, claimed, finished, result, error}`.
- Consumes: 기존 `check_key`, `jout`, flock+tmp rename 패턴.

- [ ] **Step 1: GET `?jobs` 핸들러 추가** (`forge-api.php`, 기존 `if (isset($_GET["images"])) {...}` 블록 바로 뒤, GET 블록 안)

```php
  if (isset($_GET["jobs"])) {
    $jf = __DIR__ . "/forge_jobs.json";
    $jdoc = is_file($jf) ? json_decode(file_get_contents($jf), true) : null;
    if (!is_array($jdoc) || !isset($jdoc["jobs"]) || !is_array($jdoc["jobs"])) $jdoc = ["jobs"=>[]];
    $list = $jdoc["jobs"];
    $docId = isset($_GET["docId"]) ? $_GET["docId"] : null;
    if ($docId !== null) $list = array_values(array_filter($list, function($j) use ($docId){ return isset($j["docId"]) && $j["docId"] === $docId; }));
    echo json_encode(["ok"=>true, "jobs"=>$list], JSON_UNESCAPED_UNICODE);
    exit;
  }
```

- [ ] **Step 2: POST 큐 op 블록 추가** (`forge-api.php`, `putimg` 처리 블록의 닫는 `}` 바로 뒤, `$lock = fopen($f . ".lock", "c");` 앞)

```php
if ($op === "enqueue" || $op === "claim" || $op === "result") {
  $jf = __DIR__ . "/forge_jobs.json";
  $jlock = fopen($jf . ".lock", "c"); if ($jlock) { flock($jlock, LOCK_EX); }
  $jdoc = is_file($jf) ? json_decode(file_get_contents($jf), true) : null;
  if (!is_array($jdoc) || !isset($jdoc["jobs"]) || !is_array($jdoc["jobs"])) $jdoc = ["jobs"=>[], "_rev"=>0];
  $now = gmdate("c");
  $resp = null; $code = 0;

  if ($op === "enqueue") {
    $docId = isset($d["docId"]) ? $d["docId"] : null;
    $imgId = isset($d["imgId"]) ? $d["imgId"] : null;
    $board = isset($d["board"]) && is_array($d["board"]) ? $d["board"] : null;
    if ($docId === null || $board === null) { $code = 400; }
    else {
      $dup = null;
      foreach ($jdoc["jobs"] as $j) {
        if (isset($j["docId"]) && $j["docId"] === $docId && ($j["status"] === "pending" || $j["status"] === "working")) { $dup = $j; break; }
      }
      if ($dup) { $resp = ["ok"=>true, "job"=>$dup]; }
      else {
        $job = [
          "id" => "job_" . bin2hex(random_bytes(6)),
          "docId" => $docId, "imgId" => $imgId, "board" => $board,
          "status" => "pending", "token" => null,
          "created" => $now, "claimed" => null, "finished" => null,
          "result" => null, "error" => null
        ];
        $jdoc["jobs"][] = $job;
        // GC: done/error 잡 20개 초과 시 created 오름차순으로 초과분 제거
        $done = array_values(array_filter($jdoc["jobs"], function($j){ return $j["status"] === "done" || $j["status"] === "error"; }));
        if (count($done) > 20) {
          usort($done, function($a, $b){ return strcmp($a["created"], $b["created"]); });
          $remove = array_slice($done, 0, count($done) - 20);
          $rmids = array_map(function($j){ return $j["id"]; }, $remove);
          $jdoc["jobs"] = array_values(array_filter($jdoc["jobs"], function($j) use ($rmids){ return !in_array($j["id"], $rmids, true); }));
        }
        $resp = ["ok"=>true, "job"=>$job];
      }
    }
  } elseif ($op === "claim") {
    $picked = null;
    foreach ($jdoc["jobs"] as $i => $j) {
      if ($j["status"] === "pending") {
        $tok = bin2hex(random_bytes(8));
        $jdoc["jobs"][$i]["status"] = "working";
        $jdoc["jobs"][$i]["token"] = $tok;
        $jdoc["jobs"][$i]["claimed"] = $now;
        $picked = $jdoc["jobs"][$i];
        break;
      }
    }
    $resp = ["ok"=>true, "job"=>$picked, "token"=>($picked ? $picked["token"] : null)];
  } elseif ($op === "result") {
    $jid = isset($d["jobId"]) ? $d["jobId"] : null;
    $tok = isset($d["token"]) ? $d["token"] : null;
    $found = false;
    foreach ($jdoc["jobs"] as $i => $j) {
      if (isset($j["id"]) && $j["id"] === $jid) {
        $found = true;
        if (!isset($j["token"]) || $j["token"] !== $tok) { $code = 409; break; }
        if (isset($d["error"])) { $jdoc["jobs"][$i]["status"] = "error"; $jdoc["jobs"][$i]["error"] = $d["error"]; }
        else { $jdoc["jobs"][$i]["status"] = "done"; $jdoc["jobs"][$i]["result"] = isset($d["result"]) ? $d["result"] : null; }
        $jdoc["jobs"][$i]["finished"] = $now;
        $resp = ["ok"=>true];
        break;
      }
    }
    if (!$found) { $code = 404; }
  }

  if ($code !== 0) {
    if ($jlock) { flock($jlock, LOCK_UN); fclose($jlock); }
    http_response_code($code);
    jout(["ok"=>false, "error"=>($code === 404 ? "nojob" : ($code === 409 ? "token" : "invalid"))]);
  }
  $jdoc["_rev"] = (isset($jdoc["_rev"]) ? intval($jdoc["_rev"]) : 0) + 1;
  $jtmp = $jf . ".tmp." . getmypid();
  $okw = file_put_contents($jtmp, json_encode($jdoc, JSON_UNESCAPED_UNICODE)) !== false && rename($jtmp, $jf);
  if ($jlock) { flock($jlock, LOCK_UN); fclose($jlock); }
  if (!$okw) { http_response_code(500); jout(["ok"=>false, "error"=>"write"]); }
  jout($resp);
}
```

- [ ] **Step 3: PHP 문법 검토(로컬 php 부재 — 정적 확인)**

로컬에 `php`가 없으므로(`php -l` 불가) 다음을 육안 확인:
- 모든 `{`/`}` 짝, 모든 op 분기가 `jout()`로 종료, lock 해제 경로 누락 없음.
- `bin2hex(random_bytes(...))`(PHP 7+), `gmdate("c")` 사용 — cafe24 PHP 8.4 지원.
- 기존 doc op 블록(`replace`/`upsert`/...)은 큐 블록 뒤 그대로 — 큐 op는 모두 `jout()`로 빠지므로 도달하지 않음.

- [ ] **Step 4: 배포 후 라이브 curl 왕복 검증**

> forge-api.php는 추가(additive)라 라이브 클라이언트에 영향 없음(client는 Task 4까지 큐 미사용). 배포 후 검증한다. 배포 스크립트는 기존 cafe24 SFTP 절차(`forge-api.php`만 업로드, `forge_*.json` 미전송).

```bash
API="https://parksvc.mycafe24.com/map/forge-api.php"
TESTDOC="test_$(date +%s)"
# enqueue
curl -s -X POST "$API" -H "Content-Type: application/json" \
  -d "{\"op\":\"enqueue\",\"docId\":\"$TESTDOC\",\"imgId\":\"img_x\",\"board\":{\"nodes\":[],\"edges\":[]}}"
# → {"ok":true,"job":{...,"status":"pending","id":"job_..."}}
# enqueue 재호출(중복 가드) → 같은 job 반환
curl -s -X POST "$API" -H "Content-Type: application/json" \
  -d "{\"op\":\"enqueue\",\"docId\":\"$TESTDOC\",\"imgId\":\"img_x\",\"board\":{\"nodes\":[],\"edges\":[]}}"
# → 동일 id (새 잡 안 생김)
# claim → working + token
CLAIM=$(curl -s -X POST "$API" -d '{"op":"claim"}'); echo "$CLAIM"
# → {"ok":true,"job":{...,"status":"working"},"token":"..."}
# (위 응답에서 jobId/token 추출해 아래에 대입)
# result with WRONG token → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API" \
  -d '{"op":"result","jobId":"<JOBID>","token":"WRONG","result":{}}'   # → 409
# result with correct token → ok, done
curl -s -X POST "$API" \
  -d '{"op":"result","jobId":"<JOBID>","token":"<TOKEN>","result":{"series":[1,2,3],"bias":{"dir":"bull","strength":0.5},"waves":[],"note":"t","coords":null}}'
# → {"ok":true}
# GET ?jobs&docId → done 잡 1건
curl -s "$API?jobs&docId=$TESTDOC"
# → {"ok":true,"jobs":[{...,"status":"done","result":{...}}]}
```

Expected: enqueue=pending, 재호출=동일 id, claim=working+token, 잘못된 token=409, 올바른 token=done, `?jobs`에 done 결과 포함.

- [ ] **Step 5: 커밋 (+ 배포)**

```bash
git add forge-api.php docs/superpowers/plans/2026-06-27-scoopforge-phase5b-vision-queue.md
git commit -m "feat(forge): 작업큐 API — enqueue/claim/result + GET ?jobs(R5b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
> 이어서 cafe24 배포(forge-api.php만). `forge_data.json`/`forge_images.json`/`forge_jobs.json` 미전송.

---

## Task 3: forge.html 비전 결합·반영·영속 (applyVision)

**Files:**
- Modify: `forge.html:1799` 부근(전역 선언), `forge.html:1843` `playAnalysis`, `forge.html:1883` `runForge`, `forge.html:547-552` `serializeActive`, `forge.html:564-573` `loadDoc`
- Modify: `forge.html` 스크립트에 `applyVision` 신규 함수

**Interfaces:**
- Consumes: `ForgeCore.run`/`runSteps`/`visionBiasFrom`(Task 1), 전역 `data`/`lastResult`/`runForge`/`boardToGraph`/`renderChart`/`bToast`/`markDirty`/`activeDoc`.
- Produces:
  - 전역 `_visionData`(`{price,n}`|null), `_visionBias`(number), `_visionNote`(string), `_visionWaves`(array).
  - `applyVision(result)` — `result.series`(배열, 길이≥2)면 `_visionData` 설정, `_visionBias = ForgeCore.visionBiasFrom(result.bias)`, note/waves 저장 → `activeDoc().vision` 영속 + `runForge()`. series 없으면 비전 해제(데모 복귀).
  - `currentData()` — `_visionData || data` 반환(runForge/playAnalysis 공용).
  - `serializeActive`가 `dc.vision`를 저장, `loadDoc`가 복원.

- [ ] **Step 1: 전역 비전 상태 + currentData 추가** (`forge.html:1799` `let data = ...` 바로 뒤)

```js
  let _visionData = null, _visionBias = 0, _visionNote = "", _visionWaves = [];
  function currentData() { return _visionData || data; }
```

- [ ] **Step 2: `runForge`가 비전 데이터/바이어스 사용** (`forge.html:1887`)

기존:
```js
      lastResult = ForgeCore.run(g, data, { futW: 120 });
      renderChart(lastResult, data);
```
변경:
```js
      const d = currentData();
      lastResult = ForgeCore.run(g, d, { futW: 120, visionBias: _visionBias });
      renderChart(lastResult, d);
```

- [ ] **Step 3: `playAnalysis`가 비전 데이터/바이어스 사용** (`forge.html:1847` 부근 `runSteps` 호출)

`playAnalysis` 안의 steps 계산을 찾아 변경:
기존:
```js
    try { steps = ForgeCore.runSteps(boardToGraph(), data, { futW: 120 }); }
```
변경:
```js
    try { steps = ForgeCore.runSteps(boardToGraph(), currentData(), { futW: 120, visionBias: _visionBias }); }
```

- [ ] **Step 4: `applyVision` 함수 추가** (`forge.html`, `runForge` 함수 정의 바로 뒤)

```js
  function applyVision(result) {
    if (result && Array.isArray(result.series) && result.series.length >= 2) {
      const px = result.series.map(Number).filter(v => isFinite(v));
      _visionData = px.length >= 2 ? { price: px, n: px.length } : null;
    } else {
      _visionData = null;
    }
    _visionBias = (result && result.bias) ? ForgeCore.visionBiasFrom(result.bias) : 0;
    _visionNote = (result && typeof result.note === "string") ? result.note : "";
    _visionWaves = (result && Array.isArray(result.waves)) ? result.waves : [];
    const dc = activeDoc();
    if (dc) {
      dc.vision = _visionData
        ? { series: _visionData.price, bias: result.bias || null, note: _visionNote, waves: _visionWaves }
        : null;
      markDirty();
    }
    runForge();
    bToast(_visionData ? ("AI 분석 반영" + (_visionNote ? " · " + _visionNote : "")) : "분석 데이터 없음");
  }
```

- [ ] **Step 5: `serializeActive`에 vision 저장** (`forge.html:549` `dc.themeImgId = ...` 줄 뒤)

추가:
```js
    dc.vision = _visionData
      ? { series: _visionData.price, bias: dc.vision && dc.vision.bias || null, note: _visionNote, waves: _visionWaves }
      : null;
```
> 주: `applyVision`에서 `dc.vision.bias`를 이미 채워두므로 직렬화 시 그 값을 보존한다. series는 숫자 배열이라 본문 <128KB.

- [ ] **Step 6: `loadDoc`에서 vision 복원** (`forge.html:569` `themeState.imgId = ...` 줄 뒤)

```js
    const vz = dc.vision;
    if (vz && Array.isArray(vz.series) && vz.series.length >= 2) {
      _visionData = { price: vz.series, n: vz.series.length };
      _visionBias = vz.bias ? ForgeCore.visionBiasFrom(vz.bias) : 0;
      _visionNote = vz.note || ""; _visionWaves = vz.waves || [];
    } else {
      _visionData = null; _visionBias = 0; _visionNote = ""; _visionWaves = [];
    }
```

- [ ] **Step 7: 헤드리스/브라우저 검증 (applyVision 동작)**

`forge.html`을 브라우저로 직접 연다(메모리 모드, SERVER_OK=false). DevTools 콘솔에서:
```js
// 1) 데모 기준 예측 캡처
const base = lastResult.verdict.score;
// 2) 강한 bull 비전 주입
applyVision({ series: Array.from({length:120}, (_,i)=> 100 + i*0.6), bias:{dir:"bull",strength:1}, waves:[], note:"테스트", coords:null });
// 3) 검증
console.assert(_visionData && _visionData.n === 120, "visionData set");
console.assert(_visionBias === 60, "visionBias 60");
console.assert(lastResult.verdict.score >= base, "score tilted up");
// 4) 해제
applyVision({ series: [], bias:null });
console.assert(_visionData === null, "vision cleared");
```
Expected: 모든 `console.assert` 통과, 콘솔 에러 0, 차트(`fcDrawFuture`)가 주입 시 갱신.

- [ ] **Step 8: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): applyVision — 비전 series 주입 + visionBias 보정 + doc.vision 영속(R5b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: forge.html 분석 요청 버튼 + 폴링

**Files:**
- Modify: `forge.html:222` 부근(헤더 버튼), `forge.html` 스크립트(요청/폴링 함수), `forge.html` CSS(`<style>`)에 배지 클래스
- Modify: `forge.html` `boot()` 끝(재방문 폴링 복원)

**Interfaces:**
- Consumes: `apiGet`/`apiPost`/`SERVER_OK`(전역), `themeState.imgId`, `activeId`, `boardToGraph`, `runForge`, `applyVision`(Task 3), `bToast`.
- Produces:
  - `requestAnalysis()` — 대표 이미지 가드 → `enqueue` POST → `_pollJob(job.id)` 시작.
  - `_pollJob(jobId)` — 2.5s 간격 `GET ?jobs&docId=`, 상태 배지 갱신, `done`→`applyVision(result)`, `error`→토스트, 타임아웃 72회(~3분)→안내.
  - 헤더 버튼 `#reqBtn`(`☁ 분석 요청`) + 상태 표시 `#reqStat`.

- [ ] **Step 1: 헤더 버튼 추가** (`forge.html:222`, `▷ 포지 분석` 버튼 앞)

기존:
```html
    <span id="analyzeProg" class="analyze-prog"></span>
    <button class="run-btn analyze-btn" id="analyzeBtn" onclick="playAnalysis()">▷ 포지 분석</button>
```
변경:
```html
    <span id="analyzeProg" class="analyze-prog"></span>
    <span id="reqStat" class="req-stat"></span>
    <button class="export-btn" id="reqBtn" onclick="requestAnalysis()">☁ 분석 요청</button>
    <button class="run-btn analyze-btn" id="analyzeBtn" onclick="playAnalysis()">▷ 포지 분석</button>
```

- [ ] **Step 2: 배지 CSS 추가** (`forge.html` `<style>` 내, `.analyze-prog` 규칙 근처)

```css
  .req-stat{font-size:12px;color:var(--eth);letter-spacing:-0.01em;min-width:0}
  .req-stat.working{color:var(--gold)}
  .req-stat.err{color:var(--bear,#e06a6a)}
```

- [ ] **Step 3: requestAnalysis + 폴링 함수 추가** (`forge.html` 스크립트, `applyVision` 뒤)

```js
  let _pollT = null, _pollN = 0;
  function _setReqStat(txt, cls) {
    const el = document.getElementById("reqStat"); if (el) { el.textContent = txt || ""; el.className = "req-stat" + (cls ? " " + cls : ""); }
    const b = document.getElementById("reqBtn"); if (b) b.disabled = !!cls && cls !== "err";
  }
  async function requestAnalysis() {
    if (!SERVER_OK) { bToast("서버 연결이 필요합니다(분석 요청)"); return; }
    if (!themeState.imgId) { bToast("대표 이미지를 먼저 추가하세요"); return; }
    if (_pollT) { bToast("이미 분석 요청 중입니다"); return; }
    runForge();
    const r = await apiPost({ op: "enqueue", docId: activeId, imgId: themeState.imgId, board: boardToGraph() });
    if (!r || !r.ok || !r.job) { bToast("분석 요청 실패"); return; }
    _setReqStat("분석 대기 중…", "pending");
    _startPoll(r.job.id);
  }
  function _startPoll(jobId) {
    _pollN = 0;
    clearTimeout(_pollT);
    const tick = async () => {
      _pollN++;
      if (_pollN > 72) { _stopPoll(); _setReqStat("워커 대기 중 — /forge-analyze 실행 필요", "err"); return; }
      const r = await apiGet("?jobs&docId=" + encodeURIComponent(activeId));
      const job = r && r.jobs && r.jobs.find(j => j.id === jobId);
      if (!job) { _pollT = setTimeout(tick, 2500); return; }
      if (job.status === "pending") { _setReqStat("분석 대기 중…", "pending"); _pollT = setTimeout(tick, 2500); return; }
      if (job.status === "working") { _setReqStat("분석 중…", "working"); _pollT = setTimeout(tick, 2500); return; }
      if (job.status === "done") { _stopPoll(); _setReqStat("", ""); applyVision(job.result || {}); return; }
      if (job.status === "error") { _stopPoll(); _setReqStat("분석 실패: " + (job.error || "알 수 없음"), "err"); return; }
      _pollT = setTimeout(tick, 2500);
    };
    _pollT = setTimeout(tick, 2500);
  }
  function _stopPoll() { clearTimeout(_pollT); _pollT = null; const b = document.getElementById("reqBtn"); if (b) b.disabled = false; }
```

- [ ] **Step 4: 재방문 폴링 복원** (`forge.html` `boot()` 끝, `setSaveState(...)` 줄 앞)

```js
    if (SERVER_OK && activeId) {
      const jr = await apiGet("?jobs&docId=" + encodeURIComponent(activeId));
      const live = jr && jr.jobs && jr.jobs.filter(j => j.status === "pending" || j.status === "working").sort((a, b) => strCmp(b.created, a.created))[0];
      if (live) { _setReqStat(live.status === "working" ? "분석 중…" : "분석 대기 중…", live.status); _startPoll(live.id); }
    }
```
그리고 파일 내 유틸이 없으면 `strCmp` 헬퍼 추가(스크립트 상단 유틸 근처):
```js
  function strCmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
```

- [ ] **Step 5: 헤드리스/브라우저 검증 (UI 상태·가드)**

`forge.html`을 브라우저로 연다(메모리 모드: SERVER_OK=false). 콘솔에서:
```js
// 오프라인 가드: 토스트만, 폴링 시작 안 함
requestAnalysis();
console.assert(_pollT === null, "no poll when offline");
// 버튼 존재 확인
console.assert(document.getElementById("reqBtn"), "request button present");
```
Expected: 콘솔 에러 0, 오프라인에서 `☁ 분석 요청`이 토스트만 띄우고 폴링 미시작. (서버 모드 전체 흐름은 Task 5 E2E에서 검증.)

- [ ] **Step 6: 커밋 (+ 배포)**

```bash
git add forge.html
git commit -m "feat(forge): ☁ 분석 요청 버튼 + 작업큐 폴링(R5b 클라이언트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
> 이어서 cafe24 배포(forge.html + forge-core.js). `forge_*.json` 미전송.

---

## Task 5: 워커 런북 `/forge-analyze` + 라이브 E2E

**Files:**
- Create: `.claude/commands/forge-analyze.md`

**Interfaces:**
- Consumes: 라이브 큐 API(`claim`/`result`, `GET ?images=1`)(Task 2), Claude Code 내장 도구(Bash/Read).
- Produces: `/forge-analyze` 슬래시 커맨드(온디맨드). 인자 `all`이면 잡 소진까지 반복.

- [ ] **Step 1: 커맨드 파일 작성** (`.claude/commands/forge-analyze.md`)

````markdown
---
description: 스쿱포지 비전 분석 워커 — 큐에서 잡을 claim해 대표 이미지+전략을 읽고 결과를 POST
---

# /forge-analyze

스쿱포지(Scoop Forge) 작업큐의 분석 잡을 처리하는 워커. **Claude API를 호출하지 않는다** — 너(이 세션)가 직접 비전으로 차트를 읽고 결과를 큐에 POST 한다.

설정: `FORGE_API=https://parksvc.mycafe24.com/map/forge-api.php`
인자: `$ARGUMENTS` 가 `all` 이면 잡이 없을 때까지 반복, 아니면 1건만 처리.

## 절차

1. **claim**: `curl -s -X POST "$FORGE_API" -H "Content-Type: application/json" -d '{"op":"claim"}'`
   - 응답 `job` 이 `null` 이면 "대기 중인 분석 잡 없음" 보고 후 종료.
   - 응답에서 `job.id`, `token`, `job.imgId`, `job.docId`, `job.board`(전략 nodes/edges) 확보.
2. **이미지 로드**: `curl -s "$FORGE_API?images=1"` 로 전체 이미지 맵을 받아 `job.imgId` 키의 dataURL을 꺼낸다.
   - dataURL의 base64 본문을 디코드해 스크래치패드에 임시 파일로 저장(예: `.../forge_img.jpg`).
   - 그 파일을 `Read` 로 열어 **비전으로 가격 차트를 판독**한다.
3. **전략 파악**: `job.board` 의 노드(블록 종류·메모·conviction)와 엣지를 읽어 어떤 분석 의도인지 맥락으로만 활용(결과를 좌우하진 않음).
4. **분석 생산 (C 스키마)** — 아래 JSON 을 만든다:
   - `series`: 차트의 종가 곡선을 왼→오른쪽으로 **균등 샘플링한 종가 배열**. 200~400 포인트로 다운샘플, 가격은 차트 축 스케일 기준 실제 값(정수 또는 소수 2자리). POST 본문이 128KB 미만이 되도록 길이/자릿수 제한.
   - `bias`: `{ "dir": "bull"|"bear"|"neutral", "strength": 0~1 }` — 추세·구조 종합 방향 판단.
   - `waves`: 눈에 띄는 파동/스윙 구간 `[{ "from": idx, "to": idx, "label": "..." }]`(series 인덱스 기준). 없으면 `[]`.
   - `note`: 1~2문장 한국어 판독 근거.
   - `coords`: `null` (R5b-2 예약).
5. **result POST**:
   `curl -s -X POST "$FORGE_API" -H "Content-Type: application/json" -d '{"op":"result","jobId":"<id>","token":"<token>","result":{...}}'`
   - 판독 불가/오류 시: `-d '{"op":"result","jobId":"<id>","token":"<token>","error":"<사유>"}'`.
   - 응답 `{"ok":true}` 확인.
6. **인자 `all`**: 1~5를 `claim` 이 `job:null` 을 줄 때까지 반복.

## 가드

- 쓰기 키가 설정돼 있으면 모든 POST 에 `-H "X-Write-Key: <키>"` 추가(키는 로컬에만, 커밋 금지).
- 토큰 불일치(409)·이미지 없음 → 명확히 보고하고 그 잡은 건너뛴다.
- POST 본문 <128KB 엄수(series 길이/자릿수로 조절).
- 차트 판독은 근사치임을 `note` 에 드러낸다.
````

- [ ] **Step 2: 라이브 E2E (요청→워커→반영)**

1. 브라우저로 배포된 `https://parksvc.mycafe24.com/map/forge.html` 열기 → 대표 이미지가 있는 문서에서 `☁ 분석 요청` 클릭 → 배지 "분석 대기 중…" 확인.
2. 별도 Claude Code 세션에서 `/forge-analyze` 실행 → claim→이미지 Read→result POST 완료 보고.
3. 브라우저 배지가 사라지고 "AI 분석 반영 · {note}" 토스트 + `fcDrawFuture`(미래 존)가 갱신되는지 확인. `▷ 포지 분석` 재생이 실데이터로 도는지 확인.
4. 새로고침 후에도 비전 반영 유지(`doc.vision` 영속) 확인.

Expected: 요청→처리→반영 1회 왕복 성공, 콘솔 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add .claude/commands/forge-analyze.md
git commit -m "feat(forge): /forge-analyze 워커 런북 — 비전 분석 큐 처리(R5b)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 최종 검증 체크리스트

- [ ] `node --test forge-core.test.js` → 23 pass, 0 fail.
- [ ] 라이브 큐 curl 왕복(enqueue/중복가드/claim/409/result/?jobs) 정상.
- [ ] `forge.html` 콘솔 에러 0, `applyVision` 콘솔 검증 통과, 오프라인 가드 동작.
- [ ] 라이브 E2E: `☁ 분석 요청`→`/forge-analyze`→반영→새로고침 유지.
- [ ] 배포본에서 `forge_data.json`/`forge_images.json`/`forge_jobs.json` 미변경(사용자 데이터 보존).
- [ ] `visionBias=0` 경로가 기존 결과와 동일(회귀 없음).

## 비범위 (R5b-2 이후)

- 이미지 위 정밀 보조선(`result.coords` 활용, 픽셀 정렬).
- waves 엔진 결합(엘리어트/phasefold 투입) — 현재는 표시/보관만.
- 예약 루틴(`/schedule`) 자동 등록(`/forge-analyze all`로 대비됨).
- OHLC/거래량, 멀티 이미지, 실시간 시세, Claude API 직접 호출(영구 비범위).
