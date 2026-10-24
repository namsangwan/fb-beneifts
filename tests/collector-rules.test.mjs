// 수집기 규칙 테스트. 실제 사이트나 저장된 JSON에 기대지 않고 고정 입력만 사용한다.
import assert from "node:assert/strict";
import test from "node:test";

import {
  dateFromMonthDay,
  dedupeBenefits,
  displayValue,
  normalizeBrandEvent,
  normalizeExternalBenefit,
  parseFlexiblePeriod,
  reviveFallbackBenefits,
  scoreBenefit,
  settleCollectorResult,
  stripSpendConditions,
  toPublicBenefit,
} from "../scripts/collect-benefits.mjs";

const asOf = "2026-10-24";

test("기간 파싱: 숫자가 든 괄호 안의 기간을 읽는다", () => {
  assert.deepEqual(
    parseFlexiblePeriod("빽다방 20주년 기념 아메리카노(ICED) 1천원에 만나보세요! (8/19~8/21)", asOf),
    { startsAt: "2026-08-19", validUntil: "2026-08-21" },
  );
});

test("기간 파싱: 요일·시각이 섞인 연도 없는 기간", () => {
  assert.deepEqual(
    parseFlexiblePeriod("쿠폰 사용 기간: 10월 28일(수) 오전 9시~ 11월 1일(일) 오후 11시 59분", asOf),
    { startsAt: "2026-10-28", validUntil: "2026-11-01" },
  );
});

test("기간 파싱: 기존 형식 유지", () => {
  assert.deepEqual(parseFlexiblePeriod("2026.10.13(화) ~ 2026.10.31(토)", asOf), {
    startsAt: "2026-10-13",
    validUntil: "2026-10-31",
  });
  assert.deepEqual(parseFlexiblePeriod("3.16~12.31 현대카드 M포인트 매일 20% 사용!", asOf), {
    startsAt: "2026-03-16",
    validUntil: "2026-12-31",
  });
  assert.deepEqual(parseFlexiblePeriod("10.1~31 삼성카드 LINK하면 10% 할인", asOf), {
    startsAt: "2026-10-01",
    validUntil: "2026-10-31",
  });
  assert.deepEqual(parseFlexiblePeriod("자동충전 시 1+1쿠폰 증정", asOf), { startsAt: null, validUntil: null });
});

test("기간 파싱: 연말·연초 경계", () => {
  assert.equal(dateFromMonthDay(1, 3, "2026-12-20"), "2027-01-03");
  assert.equal(dateFromMonthDay(12, 28, "2027-01-05"), "2026-12-28");
  assert.deepEqual(parseFlexiblePeriod("12/26~1/2 연말 이벤트", "2026-12-20"), {
    startsAt: "2026-12-26",
    validUntil: "2027-01-02",
  });
});

test("배지: 결제 조건 금액을 혜택으로 읽지 않는다", () => {
  assert.equal(
    displayValue("10.1~31 신한 슈퍼 SOL 1만원 이상 결제 시 마이신한포인트 5천P 적립!"),
    "5천P",
  );
  assert.equal(displayValue("2만원 이상 결제 시 클래식 롤케이크 증정"), "증정");
  assert.equal(displayValue("10,000원 이상 구매 시 20% 할인"), "20%");
  assert.equal(stripSpendConditions("7천원 이상 결제 시 10% 할인"), "10% 할인");
});

test("배지: 금액당 할인은 비율로 바꾼다", () => {
  assert.equal(
    displayValue("VVIP: 1,000원당 150원 할인 / VIP: 1,000원당 150원 할인 / 일반: 1,000원당 100원 할인"),
    "최대15%",
  );
  assert.equal(displayValue("1,000원당 100원 할인"), "10%");
});

test("배지: M포인트는 실질 할인효과로 표시한다", () => {
  assert.equal(displayValue("현대카드 M포인트 50%"), "8.3%");
});

test("점수: 1+1·무료를 올리고 카페가 아닌 곳은 낮춘다", () => {
  const coffee = (value, title) => scoreBenefit({ value, title, category: "커피" });
  assert.equal(coffee("1+1", "5만원 이상 자동충전 시, 1+1쿠폰 증정"), 92);
  assert.equal(coffee("5+1", "[해피앱] 음료 5+1 스탬프 챌린지"), 60);
  assert.equal(coffee("증정", "아메리카노(S)+글레이즈드 무료"), 84);
  assert.equal(coffee("5천P", "1만원 이상 결제 시 5천P 적립"), 90);
  assert.equal(coffee("10%", "7천원 이상 결제 시 10% 할인"), 78);
  assert.equal(scoreBenefit({ value: "50%", title: "50% 적립", category: "기타" }), 83);
});

test("브랜드 이벤트: 브랜드 업종으로 분류하고, 제목의 지난 기간으로 걸러낸다", () => {
  const holiday = normalizeBrandEvent(
    { brand: "스타벅스", id: "s-1", title: "홀리데이 푸드 20% 할인!", source: "x", sourceLabel: "y", raw: "r" },
    asOf,
  );
  assert.equal(holiday.category, "커피");
  assert.equal(
    normalizeBrandEvent(
      {
        brand: "빽다방",
        id: "p-1",
        title: "아메리카노 1천원! (8/19~8/21)",
        source: "x",
        sourceLabel: "y",
        raw: "r",
      },
      asOf,
    ),
    null,
  );
  assert.equal(
    normalizeBrandEvent(
      { brand: "파리바게뜨", id: "pb-1", title: "롤케익 구매 시 파운드케익 증정", source: "x", sourceLabel: "y", raw: "r" },
      asOf,
    ).category,
    "베이커리",
  );
});

test("복구: 지난 기간·오래된 무기한 항목은 되살리지 않는다", () => {
  const revived = reviveFallbackBenefits(
    [
      { id: "a", title: "아메리카노 1천원 (8/19~8/21)", startsAt: null, validUntil: null, collectedAt: "2026-10-20T00:00:00Z" },
      { id: "b", title: "상시 10% 할인", startsAt: null, validUntil: null, collectedAt: "2026-10-01T00:00:00Z" },
      { id: "c", title: "상시 10% 할인", startsAt: null, validUntil: null, collectedAt: "2026-10-20T00:00:00Z" },
      { id: "d", title: "기간 혜택", startsAt: "2026-09-01", validUntil: "2026-12-31", collectedAt: "2026-09-10T00:00:00Z" },
      { id: "e", title: "끝난 혜택", startsAt: "2026-10-01", validUntil: "2026-10-23", collectedAt: "2026-10-20T00:00:00Z" },
      { id: "f", title: "확인일 모름 무기한", startsAt: null, validUntil: null },
    ],
    asOf,
  );
  assert.deepEqual(
    revived.map((benefit) => benefit.id),
    ["c", "d"],
  );
});

test("수집 결과 정리: 실패·0건은 경고와 함께 복구한다", () => {
  const collector = { name: "naverpay" };
  const fallback = [{ id: "old" }];
  const failed = settleCollectorResult({ status: "rejected", reason: new Error("Naver fetch failed: 500") }, collector, fallback);
  assert.equal(failed.benefits, fallback);
  assert.equal(failed.warning.kind, "failed");
  assert.equal(failed.warning.fallbackCount, 1);

  const empty = settleCollectorResult({ status: "fulfilled", value: [] }, collector, []);
  assert.equal(empty.warning.kind, "empty");
  assert.deepEqual(empty.benefits, []);

  const ok = settleCollectorResult({ status: "fulfilled", value: [{ id: "new" }] }, collector, fallback);
  assert.equal(ok.warning, null);
  assert.deepEqual(ok.benefits, [{ id: "new" }]);
});

test("중복 제거: 같은 혜택은 기간 정보가 풍부한 것 하나로 합친다", () => {
  const external = (id, title, startsAt, validUntil) =>
    normalizeExternalBenefit(
      { provider: "skt", pay: "SKT", brand: "파스쿠찌", id, title, source: "x", sourceLabel: "y", condition: "c", startsAt, validUntil, raw: id },
      asOf,
    );
  const merged = dedupeBenefits([
    external("1", "10,000원 이상 구매 시 20% 할인", "2026-10-28", "2026-11-01"),
    external("2", "파스쿠찌 10,000원 이상 구매 시 20% 할인(최대 3,000원)", null, null),
    external("3", "파스쿠찌 10,000원 이상 구매 시 40% 할인(최대 8,000원)", null, null),
    normalizeBrandEvent(
      { brand: "파스쿠찌", id: "4", title: "[T 멤버십] 파스쿠찌 10,000원 이상 구매 시 20% 할인", source: "x", sourceLabel: "y", raw: "4" },
      asOf,
    ),
    external("1", "10,000원 이상 구매 시 20% 할인", "2026-10-28", "2026-11-01"),
  ]);
  assert.equal(merged.length, 2);
  const twenty = merged.find((benefit) => benefit.value === "20%");
  assert.equal(twenty.id, "skt-1");
  assert.equal(twenty.validUntil, "2026-11-01");
});

test("공개 JSON은 감사용 필드를 제거하고 확인일은 남긴다", () => {
  const publicBenefit = toPublicBenefit({ id: "a", raw: "x", sourceHash: "h", collectedAt: "t", lastVerifiedAt: "2026-10-24" });
  assert.deepEqual(publicBenefit, { id: "a", lastVerifiedAt: "2026-10-24" });
});
