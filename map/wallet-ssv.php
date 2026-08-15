<?php
// AdMob SSV(서버 사이드 검증) 콜백. 구글이 부르는 공개 GET 이다 — 인증이 없는 것이
// 정상이고, 그래서 서명만이 유일한 방어선이다. 검증이 없거나 범위가 틀리면 누구나 이 URL 에
// reward_amount 를 붙여 잔량을 원하는 만큼 만들 수 있다.
//
// 응답은 본문이 없다. 본문에 무언가 적으면 공개·무인증 엔드포인트가 정보 유출 창구가 된다
// (경로·잔량·계정 존재 여부 전부). 상태코드는 딱 두 가지다:
//   200  더 볼 것 없음(적립했거나, 적립하지 않기로 했거나). 구글은 재시도하지 않는다.
//   503  지금은 판단할 수 없다. 구글이 재시도하게 둔다.
// 4xx 를 쓰지 않는 이유: 구글에 실패를 주면 재시도하는데, 위조·모양 이상은 백 번 다시 와도
// 결과가 같다. 반대로 키를 못 얻은 상황에서 200 으로 끝내면 **진짜** 콜백이 영구히 버려져
// 광고를 본 사용자가 조용히 보상을 잃는다 — 그래서 그 둘만 503 이다.
// ⚠ 503 은 절대 지급·적립·큐잉하지 않는다. 순수하게 "나중에 다시 오라"이며, 보상은 완전히
// 검증된 재시도에서만 생긴다(그래야 아무 key_id 나 뿌리는 공격자가 얻는 것이 503 뿐이다).
//
// 돈 엔드포인트에서 호스트 설정을 믿지 않는다 — display_errors 가 켜져 있으면 PHP 진단이
// 그대로 응답 본문이 되고 서버 경로가 샌다(wallet-api.php 와 같은 이유, 첫 출력보다 먼저).
ini_set("display_errors", "0");

// 웹루트 밖. __DIR__ 이 /parksvc/www/map 이므로 두 단계 위가 /parksvc 다(wallet-api.php 와 동일).
$W_DIR = dirname(dirname(__DIR__)) . "/data";

require_once __DIR__ . "/wallet-lib.php";

// 본문 없는 응답 두 가지. 어느 쪽도 이유를 말하지 않는다.
function ssv_done() { http_response_code(200); header("Cache-Control: no-store"); exit; }
function ssv_retry() { http_response_code(503); header("Cache-Control: no-store"); exit; }

// ⚠ 원본 쿼리 문자열을 그대로 넘긴다. http_build_query($_GET) 로 재조립하면 바이트 순서와
// 인코딩이 사라지는데, 서명이 걸려 있는 것이 정확히 그 둘이다 — 재조립하는 순간 순서 재배열·
// %2D 재인코딩 공격이 되살아난다(둘 다 지금은 원본 바이트를 쓰기 때문에만 막힌다).
$query = isset($_SERVER["QUERY_STRING"]) ? (string)$_SERVER["QUERY_STRING"] : "";

$why = null;
if (!w_ssv_verify($W_DIR, $query, $_GET, $why)) {
  if ($why === "unknown_key" || $why === "keys_unavailable") ssv_retry();
  ssv_done();
}

// ⚠ 여기서부터 값은 전부 **서명 범위 안**에서 읽는다. w_ssv_verify 는 "서명된 값과 우리가
// 읽을 값이 같다"를 보증하지만 "그 필드가 서명돼 있었다"는 보증하지 않는다 — custom_data 를
// 서명 뒤에만 붙인 콜백이 실제로 verify=true 를 받았다(Task 2 리뷰 실측). $_GET 에서 읽으면
// 공격자가 지급 대상 계정과 금액을 서명 없이 고를 수 있다. 필수 필드가 범위 "안"에 있어야
// 하고, 값도 이 파싱본에서 가져와야 그 부류가 검사 대상이 아니라 아예 도달 불가가 된다.
$signed = array();
parse_str((string)w_ssv_signed_part($query), $signed);
foreach (array("transaction_id", "reward_amount", "custom_data", "timestamp") as $need) {
  if (!isset($signed[$need]) || !is_string($signed[$need]) || $signed[$need] === "") ssv_done();
}

// 타임스탬프는 밀리초다. 창 밖이면 거절한다 — 서명은 만료되지 않으므로, 한 번 새어나간
// 정품 콜백 URL 은 이 창이 없으면 영원히 다시 쓸 수 있다(재생 공격의 절반은 여기서 막고,
// 나머지 절반은 ad_grants.transaction_id PK 가 막는다).
// ctype_digit 로 먼저 거른다 — 음수·지수표기·공백을 (int) 로 캐스팅하면 조용히 0 이 되고,
// 0 은 1970년이라 창 밖으로 떨어지지만 그건 우연히 맞는 것이지 검사가 아니다.
if (!ctype_digit($signed["timestamp"])) ssv_done();
if (abs(time() - intdiv((int)$signed["timestamp"], 1000)) > W_SSV_SKEW_SEC) ssv_done();

// 금액도 서명 범위에서 읽고 모양을 못박는다. 자릿수 상한은 (int) 포화·기록 오염 방지용이다 —
// 정상 리워드는 한 자리 수준이고, 지갑 상한이 어차피 잘라내지만 ad_grants 에 남는 기록은
// "구글이 뭐라고 했는가"라서 쓰레기가 들어가면 나중에 아무 것도 설명할 수 없다.
if (!ctype_digit($signed["reward_amount"]) || strlen($signed["reward_amount"]) > 9) ssv_done();

$acctId = $signed["custom_data"];
$txId   = $signed["transaction_id"];
if (strlen($acctId) > 128 || strlen($txId) > 128) ssv_done();
// 광고 단위는 라벨일 뿐이라 없어도 진행한다. 다만 값은 역시 서명 범위에서만 읽는다.
$unit = (isset($signed["ad_unit"]) && is_string($signed["ad_unit"]) && strlen($signed["ad_unit"]) <= 128)
  ? $signed["ad_unit"] : "";

try {
  $db = w_db($W_DIR);
  $r = w_ad_grant($db, $acctId, $unit, $txId, (int)$signed["reward_amount"]);
} catch (Throwable $e) {
  // 저장소가 죽은 것은 "위조"가 아니라 "지금은 못 한다"다. 200 으로 끝내면 검증까지 끝난
  // 진짜 보상이 영영 사라진다 — 재시도하게 두되, 아무 것도 적립하지 않는다.
  ssv_retry();
}
// busy·error 도 같은 성질이다(멱등이라 재시도가 안전하다 — transaction_id 가 PK 다).
if (!$r["ok"]) ssv_retry();
ssv_done();
