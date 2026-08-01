import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const sources = {
  naver:
    "https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=FNB",
  toss: "https://toss.im/tossfeed/article/tosspay-promotion",
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
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function displayValue(valueText) {
  return valueText
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

async function main() {
  const { date: asOfDate, label: asOfLabel } = kstDateParts();
  const [naverBenefits, tossBenefits] = await Promise.all([
    collectNaver(asOfDate),
    collectToss(asOfDate),
  ]);

  const benefits = [...naverBenefits, ...tossBenefits].sort((a, b) => b.fit - a.fit);
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
