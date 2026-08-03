import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const sources = {
  naver:
    "https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=FNB",
  toss: "https://toss.im/tossfeed/article/tosspay-promotion",
  telecom: {
    sktTday: "https://sktmembership.tworld.co.kr/mps/pc-bff/program/tday.do",
    ktPartnerList: "https://membership.kt.com/discount/partner/C23/67/PartnerDetail.do",
    ktJungCodeList: "https://membership.kt.com/discount/partner/selectJungCodeList.json",
    lguplusOngoing: "https://www.lguplus.com/benefit-event/ongoing",
  },
  brands: {
    compose: "https://composecoffee.com/event",
    ediya: "https://www.ediya.com/contents/event.html",
    gongcha: "https://www.gong-cha.co.kr/brand/content/eventlist",
    hollys: "https://www.hollys.co.kr/news/event/list.do",
    mammothEvent: "https://www.mmthcoffee.com/sub/event/list.html",
    mammothNotice: "https://www.mmthcoffee.com/sub/notice/list.html",
    mega: "https://mega-mgccoffee.com/bbs/?bbs_category=3",
    paikdabang: "https://paikdabang.com/news/?cate=event",
    parisbaguette: "https://www.paris.co.kr/",
    paulbassett: "https://www.baristapaulbassett.co.kr/Index.pb",
    pascucci: "https://www.pascucci.co.kr/event/eventList.asp",
    starbucks: "https://www.starbucks.co.kr/whats_new/campaign_list.do",
    theventi: "https://theventi.co.kr/new2022/news/event.html",
    twosome: "https://mo.twosome.co.kr/ev/eventList.do",
  },
};

const cafeAndBakeryKeywords = [
  "커피",
  "카페",
  "이디야",
  "투썸",
  "할리스",
  "폴바셋",
  "컴포즈",
  "매머드",
  "매머드커피",
  "매머드익스프레스",
  "공차",
  "메가커피",
  "빽다방",
  "더벤티",
  "던킨",
  "파스쿠찌",
  "파리바게뜨",
  "뚜레쥬르",
  "베이커리",
  "빵",
  "테디뵈르",
  "배달의민족",
  "배민",
  "베스킨라빈스",
  "배스킨라빈스",
  "롯데리아",
];

const bakeryKeywords = ["파리바게뜨", "뚜레쥬르", "베이커리", "빵", "테디뵈르"];
const snackKeywords = ["배달의민족", "배민", "베스킨라빈스", "배스킨라빈스", "롯데리아"];
const brandEventKeywords = [
  "할인",
  "쿠폰",
  "적립",
  "증정",
  "1+1",
  "무료",
  "특가",
  "페이",
  "포인트",
  "엘포인트",
  "PAYCO",
  "payco",
  "OFF",
];
const brandEventExclusionKeywords = [
  "당첨자",
  "결과 발표",
  "팬 사인회",
  "사전예약",
  "당첨",
  "럭키 드로우",
  "럭키드로우",
  "래플",
  "응모",
  "SNS",
  "인스타그램 이벤트",
  "블로그 이벤트",
  "릴스 콘테스트",
  "콘테스트",
  "출시 안내",
  "신메뉴",
  "신메뉴 출시",
  "출시",
  "신상",
  "제품소개",
  "한정 판매",
  "굿즈",
  "키링",
  "텀블러",
  "MD",
  "테이블웨어",
  "우산",
  "코스터",
  "플래너",
  "다이어리",
  "커피클래스",
  "대량 구매",
  "상품권 대량",
  "카드 소개",
  "고향사랑",
  "고향사랑기부제",
  "기부제",
  "위기브",
  "HOLLYS PASS",
  "Buddy Pass",
  "My DT Pass",
  "Campus Buddy",
  "사과문",
  "리콜",
  "개인정보",
  "시스템 점검",
  "채용",
  "알바",
];
const ktTargetBrands = new Set([
  "공차",
  "던킨",
  "뚜레쥬르",
  "메가MGC커피",
  "배달의민족",
  "비트커피",
  "스타벅스",
  "카페베네",
  "파리바게뜨",
  "파리크라상",
  "할리스",
]);
const sktTargetBrands = [
  "더벤티",
  "투썸플레이스",
  "던킨",
  "공차",
  "할리스",
  "스타벅스",
  "파리바게뜨",
  "파스쿠찌",
  "메가MGC커피",
  "메가커피",
  "빽다방",
  "이디야",
  "컴포즈커피",
  "매머드커피",
  "배달의민족",
  "배민",
];
const telecomEventExclusionKeywords = [
  "휴대폰",
  "요금제",
  "인터넷",
  "iptv",
  "방송패스",
  "갤럭시",
  "중고폰",
  "자급제",
  "유심",
];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function kstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    label: `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} KST`,
  };
}

function dateFromTimestampKst(timestamp) {
  if (!timestamp) return null;

  return kstDateParts(new Date(timestamp)).date;
}

function formatPeriod(startsAt, endsAt) {
  if (!startsAt && !endsAt) return "기간 미고지";
  if (!startsAt) return `${endsAt}까지`;
  if (!endsAt) return `${startsAt}부터`;
  return `${startsAt.replaceAll("-", ".")} - ${endsAt.replaceAll("-", ".")}`;
}

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'");
}

function compactText(value) {
  return decodeHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function includesCafeOrBakery(text) {
  return cafeAndBakeryKeywords.some((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase()),
  );
}

function hasDeliverySignal(text) {
  return /배달의민족|배민/.test(text);
}

function hasTelecomEventExclusionSignal(text) {
  const normalized = compactText(text).toLowerCase();
  return telecomEventExclusionKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function hasSktDetailNoise(text) {
  return /중복|동시에|없습니다|않습니다|일부 매장|문의|바로 가기|사용 가능|사용 안 됨|적립하실 수 없습니다|고객센터|유의 사항|홈페이지|매장 영업시간/.test(
    text,
  );
}

function inferFoodBrand(text, fallback = "커피") {
  const specificKeywords = cafeAndBakeryKeywords
    .filter((keyword) => !["커피", "카페", "베이커리", "빵"].includes(keyword))
    .sort((a, b) => b.length - a.length);
  return specificKeywords.find((keyword) => text.includes(keyword)) ?? fallback;
}

function isCurrentOrFuture(benefit, asOfDate) {
  if (!benefit.validUntil) return true;

  return benefit.validUntil >= asOfDate;
}

function parseKoreanPeriod(periodText) {
  const match = periodText.match(/(\d{2})\.(\d{2})\.(\d{2})\s*~\s*(\d{2})\.(\d{2})\.(\d{2})/);
  if (!match) return { startsAt: null, validUntil: null };

  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match;
  return {
    startsAt: `20${startYear}-${startMonth}-${startDay}`,
    validUntil: `20${endYear}-${endMonth}-${endDay}`,
  };
}

function textFromHtml(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function displayValue(valueText) {
  const text = compactText(valueText);
  const plusDeal = text.match(/\d+\s*\+\s*\d+/);
  if (plusDeal) return plusDeal[0].replace(/\s+/g, "");

  const percent = text.match(/(?:최대\s*)?\d+(?:\.\d+)?\s*%/);
  if (percent) return percent[0].replace(/\s+/g, "");

  const amount = text.match(/(?:최대\s*)?\d+(?:,\d{3})*(?:\.\d+)?\s*(만원|천원|원)/);
  if (amount) return amount[0].replace(/\s+/g, "");

  if (/쿠폰/.test(text)) return "쿠폰";
  if (/무료|증정/.test(text)) return "증정";
  if (/적립/.test(text)) return "적립";
  if (/할인/.test(text)) return "할인";
  if (/선물|혜택|멤버십/.test(text)) return "혜택";
  if (/프리퀀시/.test(text)) return "프리퀀시";
  if (/프로모션/.test(text)) return "프로모션";

  return text
    .replace(/\s*\((.*?)\)\s*/g, " ")
    .replace(/\s*(즉시\s*)?(적립|할인).*$/g, "")
    .trim();
}

function scoreBenefit(benefit) {
  const text = `${benefit.value} ${benefit.title}`;
  const percent = Number(text.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? 0);
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(만원|천원|원)/);
  const unit = amountMatch?.[2];
  const amount =
    amountMatch && unit === "만원"
      ? Number(amountMatch[1]) * 10000
      : amountMatch && unit === "천원"
        ? Number(amountMatch[1]) * 1000
        : amountMatch
          ? Number(amountMatch[1])
          : 0;

  if (percent >= 50) return 98;
  if (amount >= 5000) return 90;
  if (percent >= 20) return 86;
  if (amount >= 3000) return 82;
  if (percent >= 7) return 78;
  if (percent >= 2) return 70;
  return 60;
}

function toPublicBenefit(benefit) {
  const publicBenefit = { ...benefit };
  delete publicBenefit.raw;
  delete publicBenefit.sourceHash;
  delete publicBenefit.collectedAt;
  return publicBenefit;
}

async function readPreviousBenefits() {
  for (const file of ["data/benefits.snapshot.json", "public/data/benefits.json"]) {
    try {
      const payload = JSON.parse(await readFile(file, "utf8"));
      return payload.benefits ?? [];
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`Could not read previous benefits from ${file}: ${error.message}`);
      }
    }
  }

  return [];
}

function categoryFromText(text) {
  if (snackKeywords.some((keyword) => text.includes(keyword))) return "간식";
  return bakeryKeywords.some((keyword) => text.includes(keyword)) ? "베이커리" : "커피";
}

function hasBrandExclusionSignal(text) {
  const normalized = compactText(text).toLowerCase();
  return brandEventExclusionKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function hasPositiveBrandBenefitSignal(text) {
  const normalized = compactText(text).toLowerCase();
  if (/\d+(?:\.\d+)?\s*%|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:만원|천원|원)|\d+\s*\+\s*\d+/.test(normalized)) {
    return true;
  }
  if (/(?:카드|card|마이샵|link).{0,12}혜택|혜택.{0,12}(?:카드|card|마이샵|link)/.test(normalized)) {
    return true;
  }
  return brandEventKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function hasBrandBenefitSignal(text) {
  if (hasBrandExclusionSignal(text)) return false;
  return hasPositiveBrandBenefitSignal(text);
}

function absoluteUrl(url, baseUrl) {
  return new URL(decodeHtml(url), baseUrl).href;
}

function dateFromMonthDay(month, day, asOfDate) {
  const [year] = asOfDate.split("-");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferEndYear(startsAt, endMonth, asOfDate) {
  const [startYear, startMonth] = (startsAt ?? asOfDate).split("-").map(Number);
  return endMonth < startMonth ? startYear + 1 : startYear;
}

function parseFlexiblePeriod(text, asOfDate) {
  const normalized = compactText(text).replace(/\([^)]+\)/g, "");
  const koreanDateTimeRange = normalized.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(?:오전|오후)?\s*\d{1,2}시(?:\s*\d{1,2}분)?)?\s*~\s*(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/,
  );
  if (koreanDateTimeRange) {
    const [, sy, sm, sd, eyRaw, em, ed] = koreanDateTimeRange;
    const startsAt = `${sy}-${sm.padStart(2, "0")}-${sd.padStart(2, "0")}`;
    const ey = eyRaw ?? String(inferEndYear(startsAt, Number(em), asOfDate));
    return {
      startsAt,
      validUntil: `${ey}-${em.padStart(2, "0")}-${ed.padStart(2, "0")}`,
    };
  }

  const koreanSingleDate = normalized.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(?:오전|오후)?\s*\d{1,2}시(?:\s*\d{1,2}분)?)?\s*~/,
  );
  if (koreanSingleDate) {
    const [, sy, sm, sd] = koreanSingleDate;
    const date = `${sy}-${sm.padStart(2, "0")}-${sd.padStart(2, "0")}`;
    return { startsAt: date, validUntil: date };
  }

  const koreanEndDate = normalized.match(/~\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (koreanEndDate) {
    const [, ey, em, ed] = koreanEndDate;
    return {
      startsAt: null,
      validUntil: `${ey}-${em.padStart(2, "0")}-${ed.padStart(2, "0")}`,
    };
  }

  const fullDate = normalized.match(
    /(\d{4})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})일?\s*(?:~|-|부터\s*~?)\s*(\d{2,4})?[.\-년]?\s*(\d{1,2})[.\-월]\s*(\d{1,2})일?/,
  );
  if (fullDate) {
    const [, sy, sm, sd, eyRaw, em, ed] = fullDate;
    const ey = eyRaw ? (eyRaw.length === 2 ? `20${eyRaw}` : eyRaw) : sy;
    return {
      startsAt: `${sy}-${sm.padStart(2, "0")}-${sd.padStart(2, "0")}`,
      validUntil: `${ey}-${em.padStart(2, "0")}-${ed.padStart(2, "0")}`,
    };
  }

  const openFullDate = normalized.match(
    /(\d{4})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})일?\s*(?:~|-)\s*(?:소진|재고)/,
  );
  if (openFullDate) {
    const [, sy, sm, sd] = openFullDate;
    return {
      startsAt: `${sy}-${sm.padStart(2, "0")}-${sd.padStart(2, "0")}`,
      validUntil: null,
    };
  }

  const koreanRange = normalized.match(
    /(\d{1,2})월\s*(\d{1,2})일?\s*(?:~|-)\s*(\d{1,2})월\s*(\d{1,2})일?/,
  );
  if (koreanRange) {
    const [, sm, sd, em, ed] = koreanRange;
    const startsAt = dateFromMonthDay(sm, sd, asOfDate);
    const endYear = inferEndYear(startsAt, Number(em), asOfDate);
    return {
      startsAt,
      validUntil: `${endYear}-${em.padStart(2, "0")}-${ed.padStart(2, "0")}`,
    };
  }

  const slashRange = normalized.match(/(\d{1,2})[./](\d{1,2})\s*(?:~|-)\s*(\d{1,2})[./](\d{1,2})/);
  if (slashRange) {
    const [, sm, sd, em, ed] = slashRange;
    const startsAt = dateFromMonthDay(sm, sd, asOfDate);
    const endYear = inferEndYear(startsAt, Number(em), asOfDate);
    return {
      startsAt,
      validUntil: `${endYear}-${em.padStart(2, "0")}-${ed.padStart(2, "0")}`,
    };
  }

  const openStart = normalized.match(/(\d{1,2})[./](\d{1,2})\s*~/);
  if (openStart) {
    const [, sm, sd] = openStart;
    return {
      startsAt: dateFromMonthDay(sm, sd, asOfDate),
      validUntil: null,
    };
  }

  const openKoreanStart = normalized.match(/(\d{1,2})월\s*(\d{1,2})일?\s*~/);
  if (openKoreanStart) {
    const [, sm, sd] = openKoreanStart;
    return {
      startsAt: dateFromMonthDay(sm, sd, asOfDate),
      validUntil: null,
    };
  }

  return { startsAt: null, validUntil: null };
}

function daysBetween(dateA, dateB) {
  const start = new Date(`${dateA}T00:00:00+09:00`);
  const end = new Date(`${dateB}T00:00:00+09:00`);
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function normalizeBrandEvent({
  brand,
  id,
  title,
  source,
  sourceLabel,
  startsAt = null,
  validUntil = null,
  publishedAt = null,
  notes = "",
  raw,
}, asOfDate) {
  const cleanTitle = compactText(title)
    .replace(/^\[(이벤트|안내|출시|시즌메뉴 프로모션)\]\s*/g, "")
    .replace(/^★|★$/g, "")
    .trim();
  const benefit = {
    id: `brand-${id}`,
    provider: "brand",
    pay: "브랜드",
    brand,
    category: categoryFromText(`${brand} ${cleanTitle} ${notes}`),
    title: cleanTitle,
    value: displayValue(cleanTitle),
    valueText: cleanTitle,
    condition: "브랜드 공식 이벤트",
    period: formatPeriod(startsAt, validUntil),
    startsAt,
    validUntil,
    notes,
    source,
    sourceLabel,
    sourceHash: hash(raw),
    collectedAt: new Date().toISOString(),
    raw,
  };

  if (!isCurrentOrFuture(benefit, asOfDate)) return null;
  if (
    !validUntil &&
    publishedAt &&
    (!startsAt || startsAt === publishedAt) &&
    daysBetween(publishedAt, asOfDate) > 60
  ) {
    return null;
  }

  return {
    ...benefit,
    fit: scoreBenefit(benefit) - 3,
  };
}

function normalizeExternalBenefit({
  provider,
  pay,
  brand,
  id,
  title,
  source,
  sourceLabel,
  startsAt = null,
  validUntil = null,
  notes = "",
  condition,
  periodLabel = null,
  raw,
}, asOfDate) {
  const cleanTitle = compactText(title);
  const benefit = {
    id: `${provider}-${id}`,
    provider,
    pay,
    brand,
    category: categoryFromText(`${brand} ${cleanTitle} ${notes}`),
    title: cleanTitle,
    value: displayValue(cleanTitle),
    valueText: cleanTitle,
    condition,
    period: periodLabel ?? formatPeriod(startsAt, validUntil),
    startsAt,
    validUntil,
    notes,
    source,
    sourceLabel,
    sourceHash: hash(raw),
    collectedAt: new Date().toISOString(),
    raw,
  };

  if (!isCurrentOrFuture(benefit, asOfDate)) return null;

  return {
    ...benefit,
    fit: scoreBenefit(benefit) - 1,
  };
}

function normalizeNaverItem(item, asOfDate) {
  const raw = JSON.stringify(item);
  const text = [
    item.promotionName,
    item.promotionDescription,
    item.exposeTitle,
    item.cautionText,
  ]
    .filter(Boolean)
    .join(" ");

  if (!includesCafeOrBakery(text)) return null;

  const startsAt = dateFromTimestampKst(item.promotionStartDateTime);
  const validUntil = dateFromTimestampKst(item.promotionEndDateTime);
  const benefit = {
    id: `naver-${item.promotionSeq ?? hash(raw).slice(0, 12)}`,
    provider: "naverpay",
    pay: "네이버페이",
    brand: item.promotionName ?? "네이버페이 혜택",
    category: bakeryKeywords.some((keyword) => text.includes(keyword)) ? "베이커리" : "커피",
    title: `${item.promotionDescription ?? ""} ${item.exposeTitle ?? ""}`.trim(),
    value: displayValue(item.exposeTitle ?? ""),
    valueText: item.exposeTitle ?? "",
    condition: item.promotionDescription ?? "네이버페이 현장결제",
    period: formatPeriod(startsAt, validUntil),
    startsAt,
    validUntil,
    notes: (item.cautionTextLines ?? []).slice(0, 2).join(" "),
    source: item.detailUrl ?? item.linkUrl ?? sources.naver,
    sourceLabel: "네이버페이 상세",
    sourceHash: hash(raw),
    collectedAt: new Date().toISOString(),
    raw,
  };

  if (!isCurrentOrFuture(benefit, asOfDate)) return null;

  return {
    ...benefit,
    fit: scoreBenefit(benefit),
  };
}

async function collectNaver(asOfDate) {
  const firstPage = await fetchNaverPage(1);
  const total = firstPage.totalElements ?? firstPage.elements?.length ?? 0;
  const size = firstPage.paging?.size ?? firstPage.elements?.length ?? 10;
  const pages = Math.max(1, Math.ceil(total / size));

  const rest =
    pages > 1
      ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => fetchNaverPage(index + 2)))
      : [];

  const candidates = [firstPage, ...rest].flatMap((payload) => payload.elements ?? []);
  return candidates.map((item) => normalizeNaverItem(item, asOfDate)).filter(Boolean);
}

async function fetchNaverPage(page) {
  const response = await fetch(`${sources.naver}&page=${page}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Naver fetch failed: ${response.status}`);
  }

  return response.json();
}

async function collectToss(asOfDate) {
  const response = await fetch(sources.toss);

  if (!response.ok) {
    throw new Error(`Toss fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const text = textFromHtml(html);
  const lines = text.split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\[[^\]]+\].+결제 혜택$/.test(lines[index])) continue;

    const block = [lines[index]];
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^\[[^\]]+\].+결제 혜택$/.test(lines[next])) break;
      block.push(lines[next]);
    }
    blocks.push(block.join("\n"));
  }

  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      const heading = lines[0] ?? "";
      const body = lines.join("\n");

      if (!includesCafeOrBakery(`${heading}\n${body}`)) return null;

      const benefitText = body.match(/혜택:\s*(.+)/)?.[1]?.trim();
      const periodText = body.match(/기간:\s*(.+)/)?.[1]?.trim();
      const condition = body.match(/조건:\s*(.+)/)?.[1]?.trim() ?? "토스페이 결제";
      const brand =
        heading.match(/\]\s*([^()]+?)(?:\s*\(|\s*결제 혜택)/)?.[1]?.trim() ??
        heading.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*결제 혜택$/, "").trim();

      if (!benefitText || !periodText) return null;

      const { startsAt, validUntil } = parseKoreanPeriod(periodText);
      const raw = JSON.stringify({ heading, benefitText, periodText, condition });
      const benefit = {
        id: `toss-${hash(raw).slice(0, 12)}`,
        provider: "toss",
        pay: "토스",
        brand,
        category: bakeryKeywords.some((keyword) => heading.includes(keyword)) ? "베이커리" : "커피",
        title: `${condition} ${benefitText}`.trim(),
        value: displayValue(benefitText),
        valueText: benefitText,
        condition,
        period: periodText.replaceAll("~", "-"),
        startsAt,
        validUntil,
        notes: "토스피드 현재 월 혜택 글에서 확인.",
        source: sources.toss,
        sourceLabel: "토스피드 현재 월",
        sourceHash: hash(raw),
        collectedAt: new Date().toISOString(),
        raw,
      };

      if (!isCurrentOrFuture(benefit, asOfDate)) return null;

      return {
        ...benefit,
        fit: scoreBenefit(benefit),
      };
    })
    .filter(Boolean);
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "benefit-radar/1.0 (+https://github.com/namsangwan/fb-beneifts)",
    },
  });

  if (!response.ok) {
    throw new Error(`${label} fetch failed: ${response.status}`);
  }

  return response.text();
}

async function fetchFormJson(url, params, label) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "benefit-radar/1.0 (+https://github.com/namsangwan/fb-beneifts)",
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    throw new Error(`${label} fetch failed: ${response.status}`);
  }

  return response.json();
}

async function fetchKtFormJson(url, params, label) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://membership.kt.com",
      referer: sources.telecom.ktPartnerList,
      "user-agent": "benefit-radar/1.0 (+https://github.com/namsangwan/fb-beneifts)",
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    throw new Error(`${label} fetch failed: ${response.status}`);
  }

  return response.json();
}

async function collectHollys(asOfDate) {
  const sourceUrl = sources.brands.hollys;
  const html = await fetchText(sourceUrl, "Hollys");
  const blocks = Array.from(html.matchAll(/<div class="event_listBox">([\s\S]*?)(?=<div class="event_listBox">|<div class="paging">)/g));

  return blocks
    .map(([, block]) => {
      const idx = block.match(/onDetail\((\d+)\)/)?.[1] ?? hash(block).slice(0, 10);
      const titleHtml = block.match(/<dt>[\s\S]*?<a[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?<\/dt>/)?.[1] ?? "";
      const title = textFromHtml(titleHtml)
        .split("\n")
        .filter((line) => !/^(멤버십 이벤트|온라인 이벤트|매장이벤트|판촉물이벤트)$/.test(line))
        .join(" ");
      const description = compactText(textFromHtml(block.match(/<dd class="pad_l_15">([\s\S]*?)<\/dd>/)?.[1] ?? ""));
      const periodMatch = block.match(/공지 기간<\/span>\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
      const startsAt = periodMatch?.[1] ?? null;
      const validUntil = periodMatch?.[2] ?? null;

      if (!hasBrandBenefitSignal(`${title} ${description}`)) return null;

      return normalizeBrandEvent(
        {
          brand: "할리스",
          id: `hollys-${idx}`,
          title,
          source: `https://www.hollys.co.kr/news/event/view.do?idx=${idx}&pageNo=1&division=`,
          sourceLabel: "할리스 이벤트",
          startsAt,
          validUntil,
          notes: description || "할리스 공식 이벤트 목록에서 확인.",
          raw: block,
        },
        asOfDate,
      );
    })
    .filter(Boolean);
}

async function collectPaikdabang(asOfDate) {
  const sourceUrl = sources.brands.paikdabang;
  const html = await fetchText(sourceUrl, "Paikdabang");
  const rows = Array.from(
    html.matchAll(
      /<tr>[\s\S]*?<td class="subject">이벤트<\/td>[\s\S]*?<td class="tit"><a href="([^"]+)">([\s\S]*?)<\/a><\/td>[\s\S]*?<td class="date">([^<]+)<\/td>[\s\S]*?<\/tr>/g,
    ),
  );

  return rows
    .map(([, href, titleHtml, publishedAt]) => {
      const title = compactText(textFromHtml(titleHtml));
      const period = parseFlexiblePeriod(title, asOfDate);
      if (!hasBrandBenefitSignal(title)) return null;

      return normalizeBrandEvent(
        {
          brand: "빽다방",
          id: `paikdabang-${hash(href).slice(0, 12)}`,
          title,
          source: absoluteUrl(href, sourceUrl),
          sourceLabel: "빽다방 이벤트",
          startsAt: period.startsAt,
          validUntil: period.validUntil,
          publishedAt,
          notes: "빽다방 공식 이벤트 목록에서 확인.",
          raw: JSON.stringify({ href, title, publishedAt }),
        },
        asOfDate,
      );
    })
    .filter(Boolean);
}

async function collectCompose(asOfDate) {
  const sourceUrl = sources.brands.compose;
  const html = await fetchText(sourceUrl, "Compose");
  const cards = Array.from(
    html.matchAll(
      /<a href="([^"]+)" class="doc_link"[\s\S]*?<div class="doc_title">([\s\S]*?)<\/div>[\s\S]*?<span class="regdate">([^<]+)<\/span>/g,
    ),
  );

  return cards
    .map(([, href, titleHtml, regdate]) => {
      const title = compactText(textFromHtml(titleHtml));
      const publishedAt = regdate.slice(0, 10);
      const period = parseFlexiblePeriod(title, asOfDate);
      if (!hasBrandBenefitSignal(title)) return null;

      return normalizeBrandEvent(
        {
          brand: "컴포즈커피",
          id: `compose-${hash(href).slice(0, 12)}`,
          title,
          source: absoluteUrl(href, sourceUrl),
          sourceLabel: "컴포즈 이벤트",
          startsAt: period.startsAt ?? publishedAt,
          validUntil: period.validUntil,
          publishedAt,
          notes: period.validUntil
            ? "컴포즈커피 공식 이벤트 목록에서 확인."
            : "종료일은 목록에 없어 최근 공식 이벤트만 표시합니다.",
          raw: JSON.stringify({ href, title, regdate }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectMega(asOfDate) {
  const sourceUrl = sources.brands.mega;
  const html = await fetchText(sourceUrl, "Mega MGC");
  const cards = Array.from(html.matchAll(/<a href="(detail\/\?[^"]+)">([\s\S]*?)<\/a>/g));

  return cards
    .map(([, href, block]) => {
      const lines = Array.from(new Set(textFromHtml(block).split("\n").map(compactText).filter(Boolean)));
      const title =
        lines.find((line) => /^\[(이벤트|안내|출시)\]/.test(line)) ??
        lines.find((line) => line.length > 6 && line !== "메가MGC커피");
      if (!title || !hasBrandBenefitSignal(title)) return null;

      const uploadDate = block.match(/upload\/bbs\/(\d{4})(\d{2})(\d{2})/)?.slice(1, 4).join("-");
      const period = parseFlexiblePeriod(title, asOfDate);

      return normalizeBrandEvent(
        {
          brand: "메가MGC커피",
          id: `mega-${hash(href).slice(0, 12)}`,
          title,
          source: absoluteUrl(href, sourceUrl),
          sourceLabel: "메가MGC 이벤트",
          startsAt: period.startsAt ?? uploadDate ?? null,
          validUntil: period.validUntil,
          publishedAt: uploadDate ?? null,
          notes: period.validUntil
            ? "메가MGC커피 공식 이벤트 목록에서 확인."
            : "종료일은 목록에 없어 최근 공식 이벤트만 표시합니다.",
          raw: JSON.stringify({ href, title, uploadDate }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectGongcha(asOfDate) {
  const sourceUrl = sources.brands.gongcha;
  const html = await fetchText(sourceUrl, "Gongcha");
  const items = Array.from(html.matchAll(/<li>\s*<div class="figure">([\s\S]*?)<\/li>/g));

  return items
    .map(([, block]) => {
      const href = block.match(/<a href="([^"]+)"/)?.[1] ?? sourceUrl;
      const titleHtml = block.match(/<p class="t1">([\s\S]*?)<\/p>/)?.[1] ?? "";
      const title = compactText(textFromHtml(titleHtml) || (block.match(/alt="([^"]+)"/)?.[1] ?? ""));
      const periodText = compactText(textFromHtml(block.match(/<p class="t2">([\s\S]*?)<\/p>/)?.[1] ?? ""));
      const period = parseFlexiblePeriod(periodText, asOfDate);
      if (!title || !hasBrandBenefitSignal(title)) return null;

      return normalizeBrandEvent(
        {
          brand: "공차",
          id: `gongcha-${hash(`${href}-${title}`).slice(0, 12)}`,
          title,
          source: href.startsWith("javascript:") ? sourceUrl : absoluteUrl(href, sourceUrl),
          sourceLabel: "공차 이벤트",
          startsAt: period.startsAt,
          validUntil: period.validUntil,
          notes: periodText || "공차 공식 이벤트 목록에서 확인.",
          raw: JSON.stringify({ href, title, periodText }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectParisBaguette(asOfDate) {
  const sourceUrl = sources.brands.parisbaguette;
  const html = await fetchText(sourceUrl, "Paris Baguette");
  const section = html.match(/<section class="pb-section" id="homePromotion">([\s\S]*?)<\/section>/)?.[1] ?? "";
  const cards = Array.from(
    section.matchAll(
      /<div class="promotion-list-item">[\s\S]*?<a href="([^"]+)" class="img">[\s\S]*?<span class="badge">진행 중<\/span>[\s\S]*?<span class="txt-blue"[^>]*>\s*([^<]+)\s*<\/span>[\s\S]*?<h3 class="post-title"><a href="([^"]+)"><strong[^>]*>([\s\S]*?)<\/strong>/g,
    ),
  );

  return cards
    .map(([, imageHref, periodText, titleHref, titleHtml]) => {
      const title = compactText(textFromHtml(titleHtml));
      const period = parseFlexiblePeriod(periodText, asOfDate);
      if (!title || !hasBrandBenefitSignal(title)) return null;

      return normalizeBrandEvent(
        {
          brand: "파리바게뜨",
          id: `parisbaguette-${hash(titleHref || imageHref).slice(0, 12)}`,
          title,
          source: titleHref || imageHref || sourceUrl,
          sourceLabel: "파리바게뜨 프로모션",
          startsAt: period.startsAt,
          validUntil: period.validUntil,
          notes: "파리바게뜨 공식 프로모션 목록에서 확인.",
          raw: JSON.stringify({ imageHref, titleHref, title, periodText }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectPaulBassett(asOfDate) {
  const sourceUrl = sources.brands.paulbassett;
  const html = await fetchText(sourceUrl, "Paul Bassett");
  const slides = Array.from(html.matchAll(/<div class="bannerSlide">([\s\S]*?)<\/div>\s*<\/a>\s*<\/div>/g));

  return slides
    .map(([, block]) => {
      const href = block.match(/<a href="([^"]*)"/)?.[1] ?? sourceUrl;
      const title = compactText(textFromHtml(block.match(/<span class="txt">([\s\S]*?)<\/span>/)?.[1] ?? ""));
      const description = compactText(textFromHtml(block.match(/<span class="sTxt">([\s\S]*?)<\/span>/)?.[1] ?? ""));
      const combinedTitle = [title, description].filter(Boolean).join(" - ");
      if (!combinedTitle || !hasBrandBenefitSignal(combinedTitle)) return null;

      return normalizeBrandEvent(
        {
          brand: "폴바셋",
          id: `paulbassett-${hash(`${href}-${combinedTitle}`).slice(0, 12)}`,
          title: combinedTitle,
          source: href || sourceUrl,
          sourceLabel: "폴바셋 이벤트",
          notes: "폴바셋 공식 홈 이벤트 배너에서 확인. 종료일은 페이지에 별도 표기되지 않습니다.",
          raw: JSON.stringify({ href, title, description }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 6);
}

async function collectStarbucks(asOfDate) {
  const payload = await fetchFormJson(
    "https://www.starbucks.co.kr/whats_new/getIngList.do",
    {
      MENU_CD: "all",
      WEB_XPSR_YN: "Y",
    },
    "Starbucks",
  );

  return (payload.list ?? [])
    .map((item) => {
      const title = compactText(item.title ?? item.sbtitle_NAME ?? "");
      if (!title || !hasBrandBenefitSignal(title)) return null;

      const startsAt = item.view_SDT1 || item.start_DT || null;
      const validUntil = item.end_DT && item.end_DT !== "2999-12-31" ? item.end_DT : item.view_EDT1 || null;

      return normalizeBrandEvent(
        {
          brand: "스타벅스",
          id: `starbucks-${item.pro_SEQ ?? hash(title).slice(0, 12)}`,
          title,
          source: `${sources.brands.starbucks}?pro_seq=${item.pro_SEQ}`,
          sourceLabel: "스타벅스 이벤트",
          startsAt,
          validUntil,
          publishedAt: startsAt,
          notes: item.view_DATE || "스타벅스 공식 이벤트 목록에서 확인.",
          raw: JSON.stringify(item),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectTwosome(asOfDate) {
  const payload = await fetchFormJson(
    "https://mo.twosome.co.kr/ev/eventListAjax.json",
    {
      eventDiv: "progress",
      searchOpt: "endSoon",
      pageNum: "1",
    },
    "Twosome",
  );

  return (payload.fetchResultListSet ?? [])
    .map((item) => {
      const title = compactText(item.ANNO_TITL_NM ?? "");
      const bodyText = compactText(textFromHtml(item.ANNO_CNTNT ?? ""));
      const altTexts = Array.from((item.ANNO_CNTNT ?? "").matchAll(/alt=["']([^"']+)["']/g))
        .map(([, alt]) => compactText(alt))
        .filter(Boolean);
      const altBenefit = altTexts.find((alt) => !hasBrandExclusionSignal(alt) && hasPositiveBrandBenefitSignal(alt));
      if (!title || hasBrandExclusionSignal(title)) return null;
      if (!hasPositiveBrandBenefitSignal(`${title} ${bodyText} ${altTexts.join(" ")}`)) return null;
      const displayTitle = hasPositiveBrandBenefitSignal(title) || !altBenefit ? title : `${title} - ${altBenefit}`;

      return normalizeBrandEvent(
        {
          brand: "투썸플레이스",
          id: `twosome-${item.ANNO_SEQ_NO ?? hash(title).slice(0, 12)}`,
          title: displayTitle,
          source: `${sources.brands.twosome}?eventDiv=progress&searchOpt=endSoon`,
          sourceLabel: "투썸 이벤트",
          startsAt: item.ANNO_FR_DT ?? null,
          validUntil: item.ANNO_END_DT ?? null,
          notes: item.EVENT_USE_DT_TERM || "투썸 모바일 공식 이벤트 목록에서 확인.",
          raw: JSON.stringify(item),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectPascucci(asOfDate) {
  const sourceUrl = sources.brands.pascucci;
  const html = await fetchText(sourceUrl, "Pascucci");
  const cards = Array.from(html.matchAll(/<li>\s*<figure>([\s\S]*?)<\/figure>\s*<\/li>/g));

  return cards
    .map(([, block]) => {
      const title = compactText(textFromHtml(block.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? ""));
      const periodText = compactText(textFromHtml(block.match(/<span class="date">([\s\S]*?)<\/span>/)?.[1] ?? ""));
      const href = block.match(/<a href="([^"]+)" class="btn btnDetail"/)?.[1] ?? sourceUrl;
      const period = parseFlexiblePeriod(periodText, asOfDate);
      if (!title || !hasBrandBenefitSignal(title)) return null;

      return normalizeBrandEvent(
        {
          brand: "파스쿠찌",
          id: `pascucci-${hash(`${href}-${title}`).slice(0, 12)}`,
          title,
          source: absoluteUrl(href, sourceUrl),
          sourceLabel: "파스쿠찌 이벤트",
          startsAt: period.startsAt,
          validUntil: period.validUntil,
          notes: periodText || "파스쿠찌 공식 이벤트 목록에서 확인.",
          raw: JSON.stringify({ href, title, periodText }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .filter((benefit, index, benefits) =>
      benefits.findIndex((candidate) => candidate.title === benefit.title) === index,
    )
    .slice(0, 10);
}

async function collectTheVenti(asOfDate) {
  const sourceUrl = sources.brands.theventi;
  const html = await fetchText(sourceUrl, "The Venti");
  const cards = Array.from(
    html.matchAll(/<a href="([^"]*bmain=view[^"]*)">([\s\S]*?)(?=<\/a>)/g),
  );

  return cards
    .map(([, href, block]) => {
      const title = compactText(textFromHtml(block.match(/<p class="tit">([\s\S]*?)<\/p>/)?.[1] ?? ""));
      const periodText = compactText(textFromHtml(block.match(/<p class="date">([\s\S]*?)<\/p>/)?.[1] ?? ""));
      const period = parseFlexiblePeriod(periodText, asOfDate);
      if (!title || !hasBrandBenefitSignal(title)) return null;

      return normalizeBrandEvent(
        {
          brand: "더벤티",
          id: `theventi-${hash(`${href}-${title}`).slice(0, 12)}`,
          title,
          source: absoluteUrl(href, sourceUrl),
          sourceLabel: "더벤티 이벤트",
          startsAt: period.startsAt,
          validUntil: period.validUntil,
          notes: periodText || "더벤티 공식 이벤트 목록에서 확인.",
          raw: JSON.stringify({ href, title, periodText }),
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function collectMammoth(asOfDate) {
  const [eventHtml, noticeHtml] = await Promise.all([
    fetchText(sources.brands.mammothEvent, "Mammoth event"),
    fetchText(sources.brands.mammothNotice, "Mammoth notice"),
  ]);
  const eventItems = Array.from(
    eventHtml.matchAll(/<li>\s*<a href='javascript:goView\((\d+)\);'>([\s\S]*?)<\/a>\s*<\/li>/g),
  ).map(([, seq, block]) => {
    const status = compactText(textFromHtml(block.match(/<div class='tag[^']*'>[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1] ?? ""));
    const title = compactText(textFromHtml(block.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? ""));
    const periodText = compactText(textFromHtml(block.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? ""));
    const period = parseFlexiblePeriod(periodText, asOfDate);
    if (!title || !/진행\s*중/.test(status) || !hasBrandBenefitSignal(title)) return null;

    return normalizeBrandEvent(
      {
        brand: "매머드커피",
        id: `mammoth-event-${seq}`,
        title,
        source: `https://www.mmthcoffee.com/sub/event/view.html?gallerySeq=${seq}`,
        sourceLabel: "매머드 이벤트",
        startsAt: period.startsAt,
        validUntil: period.validUntil,
        notes: periodText || "매머드커피 공식 이벤트 목록에서 확인.",
        raw: JSON.stringify({ seq, status, title, periodText }),
      },
      asOfDate,
    );
  });

  const noticeItems = Array.from(
    noticeHtml.matchAll(
      /<tr[^>]*>[\s\S]*?<td>[\s\S]*?<\/td>\s*<td><a href='javascript:goView\((\d+)\);'>([\s\S]*?)<\/a><\/td>\s*<td>([^<]+)<\/td>[\s\S]*?<\/tr>/g,
    ),
  ).map(([, seq, titleHtml, publishedAtRaw]) => {
    const title = compactText(textFromHtml(titleHtml));
    const publishedAt = compactText(publishedAtRaw);
    const period = parseFlexiblePeriod(title, asOfDate);
    if (!title || !hasBrandBenefitSignal(title)) return null;

    return normalizeBrandEvent(
      {
        brand: "매머드커피",
        id: `mammoth-notice-${seq}`,
        title,
        source: `https://www.mmthcoffee.com/sub/notice/view.html?noticeSeq=${seq}`,
        sourceLabel: "매머드 공지",
        startsAt: period.startsAt ?? publishedAt,
        validUntil: period.validUntil,
        publishedAt,
        notes: period.validUntil
          ? "매머드커피 공식 공지 목록에서 확인."
          : "종료일은 목록에 없어 최근 공식 혜택만 표시합니다.",
        raw: JSON.stringify({ seq, title, publishedAt }),
      },
      asOfDate,
    );
  });

  return [...eventItems, ...noticeItems]
    .filter(Boolean)
    .filter(
      (benefit, index, benefits) =>
        benefits.findIndex((candidate) => candidate.title === benefit.title) === index,
    )
    .slice(0, 8);
}

function firstPeriodInLines(lines, startIndex, asOfDate) {
  const windowLines = lines.slice(Math.max(0, startIndex - 6), startIndex + 60);
  const periodLine =
    windowLines.find((line) => /^(쿠폰 사용 기간|이벤트 기간)\s*:/.test(line)) ??
    windowLines.find((line) => /^(쿠폰 다운로드 기간|사용 기간)\s*:/.test(line)) ??
    windowLines.find((line) => /\d{4}년\s*\d{1,2}월\s*\d{1,2}일.*~/.test(line)) ??
    windowLines.find((line) => /\d{1,2}[./]\d{1,2}.*~.*\d{1,2}[./]\d{1,2}/.test(line));

  return {
    periodText: periodLine ?? "",
    ...parseFlexiblePeriod(periodLine ?? "", asOfDate),
  };
}

async function collectSktTday(asOfDate) {
  const sourceUrl = sources.telecom.sktTday;
  const html = await fetchText(sourceUrl, "SKT T day");
  const lines = textFromHtml(html).split("\n").map(compactText).filter(Boolean);
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const exactBrand = sktTargetBrands.find((brand) => line === brand);
    const inlineBrand = sktTargetBrands.find((brand) => line.includes(brand));
    const brand = exactBrand ?? inlineBrand;
    if (!brand) continue;

    const title = exactBrand ? (lines[index + 1] ?? "") : line;
    const combined = `${brand} ${title}`;
    if (!title || title.length > 160) continue;
    if (!exactBrand && !title.startsWith(brand)) continue;
    if (hasSktDetailNoise(title)) continue;
    if (!hasPositiveBrandBenefitSignal(combined)) continue;
    if (!includesCafeOrBakery(combined) && !hasDeliverySignal(combined)) continue;
    if (hasBrandExclusionSignal(combined)) continue;

    const period = firstPeriodInLines(lines, index, asOfDate);
    const raw = JSON.stringify({ brand, title, periodText: period.periodText });
    const benefit = normalizeExternalBenefit(
      {
        provider: "telecom",
        pay: "통신사",
        brand,
        id: `skt-${hash(raw).slice(0, 12)}`,
        title,
        source: sourceUrl,
        sourceLabel: "SKT T day",
        startsAt: period.startsAt,
        validUntil: period.validUntil,
        notes: period.periodText || "SKT T day 공식 페이지에서 확인.",
        condition: "SKT T멤버십 T day",
        raw,
      },
      asOfDate,
    );

    if (benefit) candidates.push(benefit);
  }

  return candidates
    .filter(
      (benefit, index, benefits) =>
        benefits.findIndex((candidate) => candidate.brand === benefit.brand && candidate.title === benefit.title) ===
        index,
    )
    .slice(0, 12);
}

function extractKtBenefitSummary(html) {
  const listHtml = html.match(/<ul class="sec-cont-list">([\s\S]*?)<\/ul>/)?.[1] ?? "";
  const rows = Array.from(
    listHtml.matchAll(/<li>\s*<em[^>]*>([\s\S]*?)<\/em>\s*<span>([\s\S]*?)<\/span>\s*<\/li>/g),
  )
    .map(([, tierHtml, summaryHtml]) => {
      const tier = compactText(textFromHtml(tierHtml));
      const summary = compactText(textFromHtml(summaryHtml));
      return [tier, summary].filter(Boolean).join(": ");
    })
    .filter(Boolean);

  return Array.from(new Set(rows)).join(" / ");
}

async function collectKtMembership(asOfDate) {
  const payload = await fetchKtFormJson(
    sources.telecom.ktJungCodeList,
    { daeCode: "C21" },
    "KT membership food partners",
  );
  const partners = (payload.jungCodeList ?? payload.data?.jungCodeList ?? []).filter((partner) =>
    ktTargetBrands.has(partner.jungName),
  );
  const detailPages = await Promise.all(
    partners.map(async (partner) => {
      const sourceUrl = `https://membership.kt.com/discount/partner/${partner.daeCode}/${partner.jungCode}/PartnerDetail.do`;
      const html = await fetchText(sourceUrl, `KT ${partner.jungName}`);
      return { partner, sourceUrl, html };
    }),
  );

  return detailPages
    .map(({ partner, sourceUrl, html }) => {
      const title = extractKtBenefitSummary(html);
      const body = compactText(textFromHtml(html));
      if (!title || !hasPositiveBrandBenefitSignal(title)) return null;
      if (!includesCafeOrBakery(`${partner.jungName} ${title}`) && !hasDeliverySignal(partner.jungName)) return null;

      const period = parseFlexiblePeriod(body, asOfDate);
      const raw = JSON.stringify({ partner, title, period });
      return normalizeExternalBenefit(
        {
          provider: "telecom",
          pay: "통신사",
          brand: partner.jungName,
          id: `kt-${partner.jungCode}`,
          title,
          source: sourceUrl,
          sourceLabel: "KT 멤버십",
          startsAt: period.startsAt,
          validUntil: period.validUntil,
          periodLabel: period.validUntil ? formatPeriod(period.startsAt, period.validUntil) : "상시/월별 제공",
          notes: "KT 멤버십 공식 제휴 브랜드 상세에서 확인.",
          condition: "KT 멤버십 등급별 혜택",
          raw,
        },
        asOfDate,
      );
    })
    .filter(Boolean);
}

async function collectLguplusOngoing(asOfDate) {
  const sourceUrl = sources.telecom.lguplusOngoing;
  const html = await fetchText(sourceUrl, "LG U+ ongoing events");
  const cards = Array.from(html.matchAll(/<li data-fetch-key="data-v-1551fd35:\d+"[\s\S]*?<\/li>/g)).map(
    ([block]) => block,
  );

  return cards
    .map((block) => {
      const href = block.match(/data-gtm-click-url="([^"]+)"/)?.[1];
      const altText = block.match(/<img alt="([^"]*)"/)?.[1] ?? "";
      const titleHtml = block.match(/<p class="tit"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
      const tagHtml = block.match(/<p class="flag-n-tag"[^>]*>\s*<em[^>]*>([\s\S]*?)<\/em>\s*<\/p>/)?.[1] ?? "";
      const dateMatch = block.match(/<p class="date"[^>]*>\s*([\d-]+)\s*~\s*([\d-]+)/);
      if (!href || !dateMatch) return null;

      const title = compactText(textFromHtml(titleHtml));
      const tag = compactText(textFromHtml(tagHtml));
      const alt = compactText(altText);
      const [, startDate, endDate] = dateMatch;
      const combined = `${title} ${tag} ${alt}`;
      const visibleSummary = `${title} ${tag}`;
      if (!title || (!includesCafeOrBakery(visibleSummary) && !hasDeliverySignal(visibleSummary))) return null;
      if (/즉시 추첨|신세계상품권|뮤지컬/.test(combined)) return null;
      if (!hasPositiveBrandBenefitSignal(combined)) return null;
      if (hasTelecomEventExclusionSignal(title) && !/아메리카노|커피|공차|투썸|메가MGC|배달의민족|배민/.test(combined)) {
        return null;
      }

      const brand =
        inferFoodBrand(combined, hasDeliverySignal(combined) ? "배달의민족" : "커피");
      const source = href.startsWith("http") ? decodeHtml(href) : absoluteUrl(href, sourceUrl);
      const raw = JSON.stringify({ title, tag, alt, startDate, endDate, source });

      return normalizeExternalBenefit(
        {
          provider: "telecom",
          pay: "통신사",
          brand,
          id: `lguplus-${hash(raw).slice(0, 12)}`,
          title: tag ? `${title} - ${tag}` : title,
          source,
          sourceLabel: "LG U+ 진행 이벤트",
          startsAt: startDate,
          validUntil: endDate,
          notes: alt || "LG U+ 진행 이벤트 목록에서 확인.",
          condition: "LG U+ 이벤트 참여 조건",
          raw,
        },
        asOfDate,
      );
    })
    .filter(Boolean)
    .filter(
      (benefit, index, benefits) =>
        benefits.findIndex((candidate) => candidate.source === benefit.source && candidate.title === benefit.title) ===
        index,
    )
    .slice(0, 10);
}

function previousProviderBenefits(previousBenefits, provider, pay, asOfDate) {
  return previousBenefits
    .filter((benefit) => benefit.provider === provider && benefit.pay === pay)
    .filter((benefit) => isCurrentOrFuture(benefit, asOfDate));
}

async function collectTelecomBenefits(asOfDate, previousBenefits = []) {
  const collectors = [
    { name: "skt-tday", collect: () => collectSktTday(asOfDate) },
    { name: "kt-membership", collect: () => collectKtMembership(asOfDate) },
    { name: "lguplus-ongoing", collect: () => collectLguplusOngoing(asOfDate) },
  ];
  const results = await Promise.allSettled(collectors.map((collector) => collector.collect()));
  const fallbackBenefits = previousProviderBenefits(previousBenefits, "telecom", "통신사", asOfDate);
  const warnings = [];

  const benefits = results.flatMap((result, index) => {
    const collector = collectors[index];

    if (result.status === "rejected") {
      warnings.push({
        source: collector.name,
        reason: result.reason?.message ?? String(result.reason),
        fallbackCount: fallbackBenefits.length,
      });
      return [];
    }

    return result.value;
  });

  if (benefits.length === 0 && fallbackBenefits.length > 0) {
    warnings.push({
      source: "telecom",
      reason: "all telecom collectors returned no current benefits; preserved previous current benefits",
      fallbackCount: fallbackBenefits.length,
    });
    return { benefits: fallbackBenefits, warnings };
  }

  return { benefits, warnings };
}

function previousBrandBenefits(previousBenefits, brands, asOfDate) {
  return previousBenefits
    .filter((benefit) => benefit.provider === "brand" && brands.includes(benefit.brand))
    .filter((benefit) => isCurrentOrFuture(benefit, asOfDate));
}

async function collectBrandBenefits(asOfDate, previousBenefits = []) {
  const collectors = [
    { name: "hollys", brands: ["할리스"], collect: () => collectHollys(asOfDate) },
    { name: "paikdabang", brands: ["빽다방"], collect: () => collectPaikdabang(asOfDate) },
    { name: "compose", brands: ["컴포즈커피"], collect: () => collectCompose(asOfDate) },
    { name: "mammoth", brands: ["매머드커피"], collect: () => collectMammoth(asOfDate) },
    { name: "mega", brands: ["메가MGC커피"], collect: () => collectMega(asOfDate) },
    { name: "gongcha", brands: ["공차"], collect: () => collectGongcha(asOfDate) },
    { name: "parisbaguette", brands: ["파리바게뜨"], collect: () => collectParisBaguette(asOfDate) },
    { name: "paulbassett", brands: ["폴바셋"], collect: () => collectPaulBassett(asOfDate) },
    { name: "starbucks", brands: ["스타벅스"], collect: () => collectStarbucks(asOfDate) },
    { name: "twosome", brands: ["투썸플레이스"], collect: () => collectTwosome(asOfDate) },
    { name: "pascucci", brands: ["파스쿠찌"], collect: () => collectPascucci(asOfDate) },
    { name: "theventi", brands: ["더벤티"], collect: () => collectTheVenti(asOfDate) },
  ];
  const results = await Promise.allSettled(collectors.map((collector) => collector.collect()));
  const warnings = [];

  return {
    benefits: results.flatMap((result, index) => {
      const collector = collectors[index];
      const fallbackBenefits = previousBrandBenefits(previousBenefits, collector.brands, asOfDate);

      if (result.status === "rejected") {
        warnings.push({
          source: collector.name,
          brands: collector.brands,
          reason: result.reason?.message ?? String(result.reason),
          fallbackCount: fallbackBenefits.length,
        });
        return fallbackBenefits;
      }

      if (result.value.length === 0 && fallbackBenefits.length > 0) {
        warnings.push({
          source: collector.name,
          brands: collector.brands,
          reason: "collector returned no current benefits; preserved previous current benefits",
          fallbackCount: fallbackBenefits.length,
        });
        return fallbackBenefits;
      }

      return result.value;
    }),
    warnings,
  };
}

async function main() {
  const { date: asOfDate, label: asOfLabel } = kstDateParts();
  const previousBenefits = await readPreviousBenefits();
  const [naverBenefits, tossBenefits, brandResult, telecomResult] = await Promise.all([
    collectNaver(asOfDate),
    collectToss(asOfDate),
    collectBrandBenefits(asOfDate, previousBenefits),
    collectTelecomBenefits(asOfDate, previousBenefits),
  ]);
  const brandBenefits = brandResult.benefits;
  const telecomBenefits = telecomResult.benefits;

  const benefits = [...naverBenefits, ...tossBenefits, ...brandBenefits, ...telecomBenefits].sort(
    (a, b) => b.fit - a.fit,
  );
  const outputBase = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    asOfDate,
    asOfLabel,
    warnings: [...brandResult.warnings, ...telecomResult.warnings],
    sources: [
      {
        provider: "naverpay",
        label: "네이버페이 F&B",
        url: "https://pay.naver.com/benefit/payment/list?firstCategory=DOMESTIC_INSTORE&secondCategory=FNB",
      },
      {
        provider: "toss",
        label: "토스피드 현재 월",
        url: sources.toss,
      },
      {
        provider: "telecom",
        label: "통신사/배달 제휴 혜택",
        url: sources.telecom.sktTday,
        children: [
          { brand: "SKT T day", url: sources.telecom.sktTday },
          { brand: "KT 멤버십 푸드 제휴", url: sources.telecom.ktPartnerList },
          { brand: "LG U+ 진행 이벤트", url: sources.telecom.lguplusOngoing },
          {
            brand: "배달의민족",
            url: "https://www.baemin.com/",
            status: "limited",
            reason: "공개 이벤트 목록 대신 통신사 공식 제휴/진행 이벤트에 노출된 배민 혜택을 수집",
          },
        ],
      },
      {
        provider: "brand",
        label: "브랜드 공식 이벤트",
        url: "https://benefit-radar.ieei2.workers.dev/api/benefits",
        children: [
          { brand: "할리스", url: sources.brands.hollys },
          { brand: "빽다방", url: sources.brands.paikdabang },
          { brand: "컴포즈커피", url: sources.brands.compose },
          { brand: "매머드커피/익스프레스 이벤트", url: sources.brands.mammothEvent },
          { brand: "매머드커피/익스프레스 공지", url: sources.brands.mammothNotice },
          { brand: "메가MGC커피", url: sources.brands.mega },
          { brand: "공차", url: sources.brands.gongcha },
          { brand: "파리바게뜨", url: sources.brands.parisbaguette },
          { brand: "폴바셋", url: sources.brands.paulbassett },
          { brand: "스타벅스", url: sources.brands.starbucks },
          { brand: "투썸플레이스", url: sources.brands.twosome },
          { brand: "파스쿠찌", url: sources.brands.pascucci },
          { brand: "더벤티", url: sources.brands.theventi },
          {
            brand: "이디야",
            url: sources.brands.ediya,
            status: "excluded",
            reason: "공식 이벤트 목록 최신성이 낮아 우선 제외",
          },
        ],
      },
    ],
  };
  const publicOutput = {
    ...outputBase,
    benefits: benefits.map(toPublicBenefit),
  };
  const snapshotOutput = {
    ...outputBase,
    benefits,
  };

  await Promise.all([
    mkdir("data", { recursive: true }),
    mkdir("public/data", { recursive: true }),
  ]);
  await Promise.all([
    writeFile("data/benefits.snapshot.json", `${JSON.stringify(snapshotOutput, null, 2)}\n`),
    writeFile("public/data/benefits.json", `${JSON.stringify(publicOutput, null, 2)}\n`),
  ]);

  console.log(`Saved ${benefits.length} current or future benefits`);
  console.log(`Wrote public/data/benefits.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
