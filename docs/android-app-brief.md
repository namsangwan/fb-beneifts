# Android App Brief

## Goal

Build an Android app that shows current and future coffee/bakery/snack benefits from official brand event pages, Naver Pay, and Toss.

The app should fetch a public JSON file, render benefits quickly, and let the user save preferences for:

- preferred sources/payment providers
- favorite brands/cafes
- category filter
- search text

KakaoPay is intentionally excluded for now. Ediya is also excluded from brand-event crawling for now because its official event list was not reliably current.

## Public Endpoints

Primary endpoint for Android:

```text
https://benefit-radar.ieei2.workers.dev/api/benefits
```

Underlying R2 JSON:

```text
https://pub-56d7d48261244062821afb49268b2223.r2.dev/benefits.json
```

Prefer the Worker endpoint in the app because it keeps the API on our own domain and avoids browser/client CORS differences.

## Update Schedule

GitHub Actions runs the benefit collector once a day:

```text
00:00 UTC / 09:00 KST
```

The batch collects data, writes `public/data/benefits.json`, uploads it to Cloudflare R2, and commits the generated JSON when changed.

## JSON Shape

```ts
type BenefitsPayload = {
  schemaVersion: number;
  collectedAt: string;
  asOfDate: string;
  asOfLabel: string;
  benefits: Benefit[];
};

type Benefit = {
  id: string;
  provider: "naverpay" | "toss" | "brand";
  pay: "브랜드" | "네이버페이" | "토스";
  brand: string;
  category: "커피" | "베이커리" | "간식";
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
};
```

## Current Data Example

As of the first deployment, the endpoint returned:

```json
{
  "schemaVersion": 1,
  "asOfLabel": "2026.08.01 22:20 KST",
  "benefits": [
    {
      "provider": "naverpay",
      "pay": "네이버페이",
      "brand": "이디야",
      "category": "커피",
      "value": "50%",
      "condition": "5천원 이상 결제 시"
    }
  ]
}
```

The live endpoint should be treated as the source of truth.

## App Behavior

- Fetch `https://benefit-radar.ieei2.workers.dev/api/benefits` on app launch.
- Cache the latest successful payload locally.
- If network fails, show cached data and a small stale/error state.
- Hide expired benefits by default using `validUntil` and `asOfDate`.
- Keep future benefits visible, with a "예정" status when `startsAt` is later than `asOfDate`.
- Sort by `fit` descending first.
- Treat `provider: "brand"` as official brand-event benefits.
- Save user preferences on-device.

## Suggested Screens

- Main list: today's best benefit, filters, benefit cards.
- Filter bottom sheet: payment provider, category, favorite brands.
- Benefit detail: condition, period, notes, source link.
- Settings/debug: last collected time, JSON endpoint, cache refresh.

## Existing Web Implementation References

- Main UI: `app/page.tsx`
- Worker API: `worker/index.ts`
- Collector batch: `scripts/collect-benefits.mjs`
- Generated public JSON: `public/data/benefits.json`
- Snapshot with audit data: `data/benefits.snapshot.json`
- GitHub Actions:
  - `.github/workflows/update-benefits.yml`
  - `.github/workflows/deploy-web.yml`
