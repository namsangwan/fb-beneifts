// 웹 화면 규칙 테스트. 기준은 Android BenefitRulesTest.java와 같은 경우들이다.
// app/benefit-rules.ts를 Node의 타입 제거 실행으로 바로 불러온다(Node 22.18 이상).
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CATEGORIES,
  PAYS,
  daysLeft,
  effectiveToday,
  filterBenefits,
  isEndingSoon,
  isUnverified,
  migratePreferences,
  normalizeBrand,
  pruneMarks,
  sourceName,
  staleDays,
  statusText,
  todayInSeoul,
} from "../app/benefit-rules.ts";

function benefit(overrides = {}) {
  return {
    id: "b1",
    provider: "brand",
    pay: "브랜드",
    brand: "메가MGC커피",
    category: "커피",
    title: "아메리카노 1+1",
    value: "1+1",
    valueText: "아메리카노 1+1",
    condition: "브랜드 공식 이벤트",
    period: "",
    startsAt: null,
    validUntil: null,
    notes: "",
    source: "https://example.com",
    sourceLabel: "메가 이벤트",
    fit: 50,
    lastVerifiedAt: "2026-10-25",
    ...overrides,
  };
}

function filter(overrides = {}) {
  return {
    tab: "all",
    sources: [...PAYS],
    categories: [...DEFAULT_CATEGORIES],
    brands: [],
    query: "",
    hiddenIds: new Set(),
    usedIds: new Set(),
    ...overrides,
  };
}

test("오늘은 KST 기준이고 수집일보다 이르지 않다", () => {
  // 2026-10-25 23:30 UTC = 2026-10-26 08:30 KST
  assert.equal(todayInSeoul(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(effectiveToday("2026-10-25", "2026-10-27"), "2026-10-27");
  assert.equal(effectiveToday("2026-10-25", "2026-10-24"), "2026-10-25");
  assert.equal(effectiveToday("", "2026-10-24"), "2026-10-24");
});

test("남은 일수와 상태 문구는 Android와 같다", () => {
  const today = "2026-10-25";
  assert.equal(daysLeft("2026-10-25", today), 0);
  assert.equal(daysLeft("2026-10-24", today), -1);
  assert.equal(daysLeft(null, today), null);
  assert.equal(daysLeft("2026.10.31", today), null);
  assert.equal(statusText(null, "2026-10-25", today), "오늘까지");
  assert.equal(statusText(null, "2026-10-28", today), "3일 남음");
  assert.equal(statusText(null, null, today), "상시");
  assert.equal(statusText(null, "2026-10-24", today), "종료");
  assert.equal(statusText("2026-10-26", "2026-10-30", today), "예정");
  assert.equal(statusText("2026-10-25", null, today), "상시");
  assert.equal(isEndingSoon("2026-10-26", today), true);
  assert.equal(isEndingSoon("2026-10-27", today), false);
});

test("오래된 데이터와 이전 확인일을 판단한다", () => {
  assert.equal(staleDays("2026-10-23", "2026-10-25"), 2);
  assert.equal(staleDays("2026-10-25", "2026-10-24"), 0);
  assert.equal(isUnverified({ lastVerifiedAt: "2026-10-23" }, "2026-10-25"), true);
  assert.equal(isUnverified({ lastVerifiedAt: "2026-10-25" }, "2026-10-25"), false);
  assert.equal(isUnverified({}, "2026-10-25"), false);
});

test("출처 표시 이름과 브랜드 이름을 맞춘다", () => {
  assert.equal(sourceName("LGU+"), "LG U+");
  assert.equal(sourceName("브랜드"), "브랜드 이벤트");
  assert.equal(sourceName("토스"), "토스");
  assert.equal(normalizeBrand(" 백다방 "), "빽다방");
  assert.equal(normalizeBrand("컴포즈"), "컴포즈커피");
});

test("목록: 만료·숨김·사용·카테고리·출처·관심 브랜드를 거르고 fit 순으로 정렬한다", () => {
  const today = "2026-10-25";
  const items = [
    benefit({ id: "low", fit: 10 }),
    benefit({ id: "high", fit: 90 }),
    benefit({ id: "expired", validUntil: "2026-10-24", fit: 99 }),
    benefit({ id: "today", validUntil: "2026-10-25", fit: 20 }),
    benefit({ id: "food", category: "기타", fit: 80 }),
    benefit({ id: "snack", category: "간식", fit: 30 }),
    benefit({ id: "unknown-category", category: "음료", fit: 40 }),
    benefit({ id: "kt", provider: "kt", pay: "KT", brand: "스타벅스", fit: 70 }),
    benefit({ id: "hidden", fit: 95 }),
    benefit({ id: "used", fit: 94 }),
  ];
  const marks = { hiddenIds: new Set(["hidden"]), usedIds: new Set(["used"]) };

  assert.deepEqual(
    filterBenefits(items, filter(marks), today).map((item) => item.id),
    ["high", "kt", "unknown-category", "snack", "today", "low"],
  );
  assert.deepEqual(
    filterBenefits(items, filter({ ...marks, sources: ["KT"] }), today).map((item) => item.id),
    ["kt"],
  );
  assert.deepEqual(
    filterBenefits(items, filter({ ...marks, tab: "interest", brands: [] }), today).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    filterBenefits(items, filter({ ...marks, tab: "interest", brands: ["스타벅스"] }), today).map((item) => item.id),
    ["kt"],
  );
  assert.deepEqual(
    filterBenefits(items, filter({ ...marks, query: "lg u+" }), today).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    filterBenefits(items, filter({ ...marks, query: "KT" }), today).map((item) => item.id),
    ["kt"],
  );
});

test("이전 웹 설정(버전 5)을 옮긴다", () => {
  assert.deepEqual(migratePreferences(null).categories, ["커피", "베이커리", "간식"]);
  assert.equal(migratePreferences(null).tab, "all");

  const cafe = migratePreferences({ version: 5, sources: ["토스", "KT"], brands: ["백다방"], category: "카페/빵" });
  assert.deepEqual(cafe.categories, ["커피", "베이커리", "간식"]);
  assert.deepEqual(cafe.sources, ["토스", "KT"]);
  assert.deepEqual(cafe.brands, ["빽다방"]);
  assert.equal(cafe.tab, "interest");

  assert.deepEqual(migratePreferences({ version: 5, category: "전체" }).categories, ["커피", "베이커리", "간식", "기타"]);
  assert.deepEqual(migratePreferences({ version: 5, category: "베이커리" }).categories, ["베이커리"]);
  assert.deepEqual(migratePreferences({ version: 3, pays: ["통신사"] }).sources, PAYS);
  assert.deepEqual(migratePreferences({ version: 6, sources: [], categories: [] }).sources, PAYS);

  const current = migratePreferences({
    version: 6,
    tab: "all",
    sources: ["네이버페이"],
    categories: ["기타"],
    brands: ["스타벅스"],
    hidden: { a: "2026-10-01", broken: 3 },
    used: { b: "2026-10-02" },
  });
  assert.equal(current.tab, "all");
  assert.deepEqual(current.categories, ["기타"]);
  assert.deepEqual(current.hidden, { a: "2026-10-01" });
  assert.deepEqual(current.used, { b: "2026-10-02" });
});

test("목록에 없고 60일 지난 숨김 기록만 지운다", () => {
  const record = { live: "2026-01-01", recent: "2026-10-01", old: "2026-08-01" };
  assert.deepEqual(pruneMarks(record, new Set(["live"]), "2026-10-25"), {
    live: "2026-01-01",
    recent: "2026-10-01",
  });
});
