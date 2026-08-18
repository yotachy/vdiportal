// www/** 의 실제 문법 하한을 관문으로 만든다 — "ES5 만" 은 상속된 규칙이지 이 런타임에서
// 유도된 규칙이 아니었다(2026-08-18 컨트롤러 판정, Task 1).
//
// 하한 근거(실측·출처):
//   1. mobile/android/variables.gradle → minSdkVersion = 24 (Android 7.0 Nougat).
//   2. node_modules/@capacitor/android/capacitor/build.gradle:46 → Capacitor 8(package.json
//      "@capacitor/android": "^8.5.0")의 자체 기본값도 minSdkVersion 24 다. 우리 프로젝트가
//      Capacitor 8 자체 요구보다 더 낮춘 게 아니다.
//   3. Android 7.0(Nougat, API 24)부터 Android System WebView 는 OS 와 분리된 별도 앱으로
//      Play 스토어를 통해 백그라운드 자동 업데이트된다(Chromium 기반, Chrome 과 동일 엔진) —
//      Android 플랫폼 공지 사항(developer.android.com WebView 릴리스 채널)로 잘 알려진 사실.
//      이 저장소 자체도 이미 이 전제를 쓰고 있다: mobile/docs/phase0-measurements.md 는
//      "Chrome 과 Android System WebView 는 같은 Chromium/V8 이라 순수 JS 연산 성능은 사실상
//      동일" 이라 적고, 실기기(갤럭시 Z폴드7, Chrome 150, 2026-08-10 실측) 로 검증했다.
//   4. @capacitor-community/admob(package.json)이 Google Play 서비스(AdMob 네이티브 SDK)를
//      이미 하드 의존한다(variables.gradle 의 playServicesAdsVersion 주석) — 광고가 동작하는
//      기기는 이미 Play 스토어 보유가 전제이므로 WebView 자동 업데이트 경로도 전제된다.
//   5. **실측 이중검증**: async/await(ES2017, Chrome 55·2016-12)는 이미 scan.js·wallet.js 에
//      프로덕션 배포돼 있다 — 사고 보고 없음. const/let/화살표/템플릿 리터럴(ES2015)은 이미
//      www/*.js 45개 중 14개에 쓰인다. 이 파일들이 이미 동작하는 것 자체가 "ES5 만" 규칙이
//      한 번도 진짜 관문이었던 적 없음을 보여준다.
//
// 확정한 하한: **ES2017(Chrome 55, 2016-12)까지는 실측·플랫폼 근거 둘 다로 확정 안전.**
// ES2018 이후(옵셔널 체이닝·null 병합·논리 대입·private 필드·Object.hasOwn·groupBy·배열
// 비파괴 복사 메서드 등, 전부 ES2020~2024)는 "아마 안전하지만(자동 업데이트 경로가 실제로
// 전 기기에 걸리는지는 검증 불가)" 이 저장소에 아직 필요하지도 않다 — 확실히 하한보다 나중
// 문법이면서 쓸 일이 없으므로 금지해서 잃을 게 없다. 반대로 spread/rest(`...`)는 ES2015~
// 2018 에 걸쳐 있어 하한 경계가 애매하고 지금 쓰이지도 않아 규칙에서 뺐다 — 보고서 참고.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WWW = fileURLToPath(new URL("../www/", import.meta.url));

function files() {
  const out = [];
  for (const f of readdirSync(WWW)) if (f.endsWith(".js")) out.push(f);
  for (const f of readdirSync(path.join(WWW, "screens"))) if (f.endsWith(".js")) out.push("screens/" + f);
  return out;   // vendor/ 는 생성물이라 제외(비재귀 readdir 이므로 자동으로 빠진다)
}

// 문자열·주석 안의 우연한 일치를 빼고 본다(이 저장소는 한국어 주석에 말줄임표 "..."를 쓰고,
// CSS 색상·DOM 셀렉터 문자열에 "#e8b463" 같은 리터럴을 쓴다 — 둘 다 여기서 걷어내야
// private 필드(#x)·spread(...) 류 규칙이 자기 코드에 오탐하지 않는다).
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p)
            .replace(/"(?:[^"\\]|\\.)*"/g, '""')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

// ES2018 이후 — 하한(ES2017)보다 확실히 나중이고 지금 www/** 어디에도 쓰이지 않는 문법만
// 금지한다. const/let/화살표/템플릿 리터럴/async-await(ES2015~2017)는 실측 안전이라 이미
// 여기 없다 — 다시 금지하면 이미 배포된 코드를 깨뜨린다.
const RULES = [
  { name: "옵셔널 체이닝(?.)", re: /\?\./, since: "ES2020 · Chrome 80(2020-01)" },
  { name: "null 병합(?? / ??=)", re: /\?\?/, since: "ES2020/2021 · Chrome 80/85" },
  { name: "논리 대입(||= / &&=)", re: /\|\|=|&&=/, since: "ES2021 · Chrome 85(2020-08)" },
  { name: "private 클래스 필드(this.#x)", re: /this\.#[A-Za-z_$]/, since: "ES2022 · Chrome 84(2020-07)" },
  { name: "Object.hasOwn(", re: /Object\.hasOwn\(/, since: "ES2022 · Chrome 93(2021-08)" },
  { name: "Object/Map.groupBy(", re: /\b(?:Object|Map)\.groupBy\(/, since: "ES2024 · Chrome 117(2023-09)" },
  { name: "배열 비파괴 복사(toSorted/toReversed/toSpliced)", re: /\.(?:toSorted|toReversed|toSpliced)\(/, since: "ES2023 · Chrome 110(2023-02)" }
];

test("www/** 는 확정 하한(ES2017)보다 확실히 나중인 문법을 쓰지 않는다", () => {
  const bad = [];
  for (const f of files()) {
    const src = code(readFileSync(path.join(WWW, f), "utf8"));
    for (const r of RULES) if (r.re.test(src)) bad.push(f + " → " + r.name + " (" + r.since + ")");
  }
  assert.deepStrictEqual(bad, [], "하한 초과 문법:\n  " + bad.join("\n  "));
});

test("관문이 실제로 잡는다 — 규칙마다 위반 샘플이 걸린다", () => {
  const samples = {
    "옵셔널 체이닝(?.)": "var b = a?.b;",
    "null 병합(?? / ??=)": "var b = a ?? 1;",
    "논리 대입(||= / &&=)": "a ||= 1;",
    "private 클래스 필드(this.#x)": "this.#x = 1;",
    "Object.hasOwn(": "Object.hasOwn(a, 'b');",
    "Object/Map.groupBy(": "Object.groupBy(a, f);",
    "배열 비파괴 복사(toSorted/toReversed/toSpliced)": "a.toSorted();"
  };
  for (const r of RULES) assert.ok(r.re.test(code(samples[r.name])), r.name + " 규칙이 자기 샘플을 못 잡는다");
});
