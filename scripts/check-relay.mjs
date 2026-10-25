// 배포한 서울 리전 중계로 3개 출처에 실제로 접속되는지 확인한다.
// 사용법: RELAY_URL=https://… RELAY_TOKEN=… npm run check:relay
const { RELAY_URL, RELAY_TOKEN } = process.env;
if (!RELAY_URL || !RELAY_TOKEN) {
  console.error("RELAY_URL과 RELAY_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

const form = { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" };
const checks = [
  [
    "투썸플레이스",
    { url: "https://mo.twosome.co.kr/ev/eventListAjax.json", method: "POST", headers: form, body: "eventDiv=progress&searchOpt=endSoon&pageNum=1" },
  ],
  ["LG U+", { url: "https://www.lguplus.com/benefit-event/ongoing" }],
  [
    "KT 멤버십",
    {
      url: "https://membership.kt.com/discount/partner/selectJungCodeList.json",
      method: "POST",
      headers: { ...form, origin: "https://membership.kt.com", referer: "https://membership.kt.com/discount/partner/C23/67/PartnerDetail.do" },
      body: "daeCode=C21",
    },
  ],
];

let failed = 0;
for (const [name, payload] of checks) {
  const started = Date.now();
  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${RELAY_TOKEN}`, "content-type": "application/json", "accept-encoding": "gzip" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    const body = await response.text();
    const relayError = response.headers.get("x-relay-error");
    const ok = !relayError && response.status === 200;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "OK  " : "FAIL"} ${name.padEnd(8)} status=${response.status}${relayError ? ` relay=${relayError}` : ""} ` +
        `${body.length.toLocaleString()}자 ${Date.now() - started}ms`,
    );
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name.padEnd(8)} ${error.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
