import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const sources = {
  naver:
    "https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=FNB",
  toss: "https://toss.im/tossfeed/article/tosspay-promotion",
  brands: {
    compose: "https://composecoffee.com/event",
    ediya: "https://www.ediya.com/contents/event.html",
    hollys: "https://www.hollys.co.kr/news/event/list.do",
    mega: "https://mega-mgccoffee.com/bbs/?bbs_category=3",
    paikdabang: "https://paikdabang.com/news/?cate=event",
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
  "공차",
  "메가커피",
  "빽다방",
  "파리바게뜨",
  "뚜레쥬르",
  "베이커리",
  "빵",
  "HANS",
  "테디뵈르",
];

const bakeryKeywords = ["파리바게뜨", "뚜레쥬르", "베이커리", "빵", "HANS", "테디뵈르"];
const brandEventKeywords = [
  "할인",
  "쿠폰",
  "프로모션",
  "적립",
  "증정",
  "혜택",
  "멤버십",
  "프리퀀시",
  "1+1",
  "무료",
  "특가",
  "페이",
  "포인트",
  "엘포인트",
  "선물",
];
const brandEventExclusionKeywords = ["당첨자", "결과 발표", "팬 사인회", "사전예약", "출시 안내"];

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
  const onePlusOne = text.match(/1\s*\+\s*1/);
  if (onePlusOne) return "1+1";

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
  const { raw, sourceHash, collectedAt, ...publicBenefit } = benefit;
  return publicBenefit;
}

function categoryFromText(text) {
  return bakeryKeywords.some((keyword) => text.includes(keyword)) ? "베이커리" : "커피";
}

function hasBrandBenefitSignal(text) {
  if (brandEventExclusionKeywords.some((keyword) => text.includes(keyword))) return false;
  return brandEventKeywords.some((keyword) => text.includes(keyword));
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
  const normalized = compactText(text);
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

async function collectBrandBenefits(asOfDate) {
  const collectors = [
    collectHollys(asOfDate),
    collectPaikdabang(asOfDate),
    collectCompose(asOfDate),
    collectMega(asOfDate),
  ];
  const results = await Promise.allSettled(collectors);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(result.reason);
    }
  }

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function main() {
  const { date: asOfDate, label: asOfLabel } = kstDateParts();
  const [naverBenefits, tossBenefits, brandBenefits] = await Promise.all([
    collectNaver(asOfDate),
    collectToss(asOfDate),
    collectBrandBenefits(asOfDate),
  ]);

  const benefits = [...naverBenefits, ...tossBenefits, ...brandBenefits].sort((a, b) => b.fit - a.fit);
  const outputBase = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    asOfDate,
    asOfLabel,
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
        provider: "brand",
        label: "브랜드 공식 이벤트",
        url: "https://benefit-radar.ieei2.workers.dev/api/benefits",
        children: [
          { brand: "할리스", url: sources.brands.hollys },
          { brand: "빽다방", url: sources.brands.paikdabang },
          { brand: "컴포즈커피", url: sources.brands.compose },
          { brand: "메가MGC커피", url: sources.brands.mega },
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
