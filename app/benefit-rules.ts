// 화면 판단 규칙. Android 1.2.0의 BenefitRules.java / BrandNames.java와 같은 동작을 한다.
// React·브라우저 API에 의존하지 않아 tests/web-rules.test.mjs에서 Node로 바로 검증한다.
// (Node의 타입 제거 실행을 쓰므로 이 파일에는 enum·namespace 같은 런타임 TS 문법을 쓰지 않는다.)

export type Provider = "naverpay" | "toss" | "brand" | "skt" | "kt" | "lguplus";
export type Pay = "네이버페이" | "토스" | "브랜드" | "SKT" | "KT" | "LGU+";
export type Category = "커피" | "베이커리" | "간식" | "기타";

export type Benefit = {
  id: string;
  provider: Provider;
  pay: Pay;
  brand: string;
  category: Category | string;
  title: string;
  value: string;
  valueText: string;
  condition: string;
  period: string;
  startsAt?: string | null;
  validUntil?: string | null;
  notes: string;
  source: string;
  sourceLabel: string;
  fit: number;
  lastVerifiedAt?: string | null;
};

export type BenefitWarning = {
  source: string;
  kind?: "failed" | "empty";
  reason: string;
  fallbackCount: number;
  brands?: string[];
};

export type BenefitSource = {
  provider: Provider;
  label: string;
  url: string;
};

export type BenefitsPayload = {
  schemaVersion: number;
  collectedAt: string;
  asOfDate: string;
  asOfLabel: string;
  warnings?: BenefitWarning[];
  sources?: BenefitSource[];
  benefits: Benefit[];
};

export const CATEGORIES: Category[] = ["커피", "베이커리", "간식", "기타"];
/** 처음 쓸 때 기본 선택. 네이버페이 F&B의 식당 행사(기타)는 기본에서 뺀다. */
export const DEFAULT_CATEGORIES: Category[] = ["커피", "베이커리", "간식"];
export const PAYS: Pay[] = ["네이버페이", "토스", "브랜드", "SKT", "KT", "LGU+"];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateText(text: string | null | undefined): text is string {
  return typeof text === "string" && DATE_PATTERN.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

export function epochDay(dateText: string) {
  return Math.floor(Date.parse(`${dateText}T00:00:00Z`) / 86400000);
}

export function todayInSeoul(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

/** 만료·남은 일수 판단에 쓰는 오늘. 실제 오늘을 쓰되, 기기 시계가 수집일보다 이르면 수집일을 쓴다. */
export function effectiveToday(asOfDate: string | null | undefined, deviceToday: string) {
  if (!isDateText(asOfDate)) return deviceToday;
  return deviceToday > asOfDate ? deviceToday : asOfDate;
}

/** 수집일이 오늘보다 며칠 전인지. 알 수 없으면 0. */
export function staleDays(asOfDate: string | null | undefined, deviceToday: string) {
  if (!isDateText(asOfDate) || !(deviceToday > asOfDate)) return 0;
  return epochDay(deviceToday) - epochDay(asOfDate);
}

/** 종료일까지 남은 날. 종료일 당일은 0, 다음 날은 -1. 종료일이 없으면 null. */
export function daysLeft(validUntil: string | null | undefined, today: string) {
  if (!isDateText(validUntil)) return null;
  return epochDay(validUntil) - epochDay(today);
}

export function isExpired(validUntil: string | null | undefined, today: string) {
  const left = daysLeft(validUntil, today);
  return left !== null && left < 0;
}

export function isStarted(startsAt: string | null | undefined, today: string) {
  return !isDateText(startsAt) || startsAt <= today;
}

export function isEndingSoon(validUntil: string | null | undefined, today: string) {
  const left = daysLeft(validUntil, today);
  return left !== null && left >= 0 && left <= 1;
}

export function statusText(startsAt: string | null | undefined, validUntil: string | null | undefined, today: string) {
  if (!isStarted(startsAt, today)) return "예정";
  const left = daysLeft(validUntil, today);
  if (left === null) return "상시";
  if (left < 0) return "종료";
  if (left === 0) return "오늘까지";
  return `${left}일 남음`;
}

/** 출처 수집이 실패해 이전에 확인한 내용을 유지 중인지. */
export function isUnverified(benefit: Pick<Benefit, "lastVerifiedAt">, asOfDate: string) {
  return isDateText(benefit.lastVerifiedAt) && isDateText(asOfDate) && benefit.lastVerifiedAt < asOfDate;
}

/** "2026-10-23" → "10/23" */
export function shortDate(dateText: string) {
  const [, month, day] = dateText.split("-").map(Number);
  return `${month}/${day}`;
}

/** 화면에 보이는 출처 이름. */
export function sourceName(pay: string) {
  if (pay === "LGU+") return "LG U+";
  if (pay === "브랜드") return "브랜드 이벤트";
  return pay;
}

export function displayValue(benefit: Pick<Benefit, "value" | "valueText">) {
  return benefit.value || benefit.valueText || "혜택";
}

export function normalizeBrand(brand: string | null | undefined) {
  const trimmed = (brand ?? "").trim();
  if (trimmed === "백다방") return "빽다방";
  if (trimmed === "컴포즈") return "컴포즈커피";
  return trimmed;
}

export type FilterState = {
  tab: "interest" | "all";
  sources: string[];
  categories: string[];
  brands: string[];
  query: string;
  hiddenIds: Set<string>;
  usedIds: Set<string>;
};

/** Android MainActivity.filteredBenefits()와 같은 순서·조건으로 목록을 만든다. */
export function filterBenefits(benefits: Benefit[], filter: FilterState, today: string) {
  const query = filter.query.trim().toLowerCase();
  const knownCategories: string[] = CATEGORIES;

  return benefits
    .filter((benefit) => !filter.hiddenIds.has(benefit.id) && !filter.usedIds.has(benefit.id))
    .filter((benefit) => filter.sources.includes(benefit.pay))
    .filter((benefit) => filter.tab !== "interest" || filter.brands.includes(normalizeBrand(benefit.brand)))
    // 앱이 모르는 새 카테고리는 숨기지 않는다.
    .filter((benefit) => !knownCategories.includes(benefit.category) || filter.categories.includes(benefit.category))
    .filter((benefit) => !isExpired(benefit.validUntil, today))
    .filter((benefit) => {
      if (!query) return true;
      const haystack = [
        benefit.brand,
        benefit.title,
        benefit.pay,
        sourceName(benefit.pay),
        benefit.provider,
        benefit.valueText,
        benefit.condition,
        benefit.sourceLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.fit - a.fit);
}

// ---- 기기에 저장하는 개인 설정 ----
// 브라우저 localStorage에 저장하는 개인 설정(저장·읽기는 preferences.ts). 서버에는 보내지 않는다.
// 같은 키를 쓰던 이전 웹(버전 5까지: sources/brands/category)의 값을 옮겨 온다.
export const PREFERENCES_KEY = "benefit-radar-preferences";
export const PREFERENCES_VERSION = 6;
/** 지금 목록에 없는 혜택의 숨김·사용 기록은 이 기간이 지나면 지운다. */
const MARK_RETENTION_DAYS = 60;

export type Tab = "interest" | "all";

export type Preferences = {
  version: number;
  tab: Tab;
  sources: Pay[];
  categories: Category[];
  brands: string[];
  /** 혜택 id → 표시한 날짜(YYYY-MM-DD) */
  hidden: Record<string, string>;
  used: Record<string, string>;
};

export const defaultPreferences: Preferences = {
  version: PREFERENCES_VERSION,
  tab: "all",
  sources: [...PAYS],
  categories: [...DEFAULT_CATEGORIES],
  brands: [],
  hidden: {},
  used: {},
};

export type StoredPreferences = Partial<Omit<Preferences, "sources" | "categories">> & {
  sources?: string[];
  categories?: string[];
  // 버전 5 이전 웹의 값
  pays?: string[];
  category?: string;
};

function onlyKnown<T extends string>(values: unknown, known: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return known.filter((item) => values.includes(item));
}

function marks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** 저장된 값(이전 버전 포함)을 지금 형식으로 옮긴다. 순수 함수라 테스트에서 직접 부른다. */
export function migratePreferences(stored: StoredPreferences | null | undefined): Preferences {
  if (!stored || typeof stored !== "object") return { ...defaultPreferences };
  const version = typeof stored.version === "number" ? stored.version : 1;

  // 출처: 아주 이전 값 "통신사"는 SKT/KT/LGU+로 펼친다. 버전 5 미만에서는 새로 생긴 출처를 모두 켠다.
  const legacySources = (stored.pays ?? []).flatMap((source) =>
    source === "통신사" ? ["SKT", "KT", "LGU+"] : [source],
  );
  let sources = onlyKnown(stored.sources ?? legacySources, PAYS);
  if (version < 5 || sources.length === 0) sources = [...PAYS];

  // 카테고리: 버전 5까지는 하나만 고르는 방식("카페/빵" | "전체" | 개별)이었다.
  let categories: Category[];
  if (version < PREFERENCES_VERSION) {
    const legacy = stored.category ?? "카페/빵";
    if (legacy === "전체") categories = [...CATEGORIES];
    else if ((CATEGORIES as string[]).includes(legacy)) categories = [legacy as Category];
    else categories = [...DEFAULT_CATEGORIES];
  } else {
    categories = onlyKnown(stored.categories, CATEGORIES);
  }
  if (categories.length === 0) categories = [...DEFAULT_CATEGORIES];

  const brands = Array.from(
    new Set((Array.isArray(stored.brands) ? stored.brands : []).map(normalizeBrand).filter(Boolean)),
  );

  // 이전 웹은 고른 브랜드로 전체 목록을 걸렀으므로, 브랜드를 골라 둔 사람은 "내 관심"에서 시작한다.
  const tab: Tab =
    stored.tab === "interest" || stored.tab === "all"
      ? stored.tab
      : brands.length > 0
        ? "interest"
        : "all";

  return {
    version: PREFERENCES_VERSION,
    tab,
    sources,
    categories,
    brands,
    hidden: marks(stored.hidden),
    used: marks(stored.used),
  };
}

/** 지금 목록에 없고 오래된 숨김·사용 기록을 지운다. */
export function pruneMarks(record: Record<string, string>, currentIds: Set<string>, today: string) {
  const limit = Date.parse(`${today}T00:00:00Z`) - MARK_RETENTION_DAYS * 86400000;
  return Object.fromEntries(
    Object.entries(record).filter(([id, markedAt]) => {
      if (currentIds.has(id)) return true;
      const time = Date.parse(`${markedAt}T00:00:00Z`);
      return Number.isNaN(time) || time >= limit;
    }),
  );
}

