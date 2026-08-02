"use client";

import { useEffect, useMemo, useState } from "react";

type Pay = "네이버페이" | "토스" | "브랜드";
type Category = "커피" | "베이커리" | "간식";

type Benefit = {
  id: string;
  provider: "naverpay" | "toss" | "brand";
  pay: Pay;
  brand: string;
  category: Category;
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

type BenefitsPayload = {
  schemaVersion: number;
  collectedAt: string;
  asOfDate: string;
  asOfLabel: string;
  benefits: Benefit[];
};

const emptyPayload: BenefitsPayload = {
  schemaVersion: 1,
  collectedAt: "",
  asOfDate: "2026-08-01",
  asOfLabel: "수집 대기",
  benefits: [],
};

const payOptions: Pay[] = ["브랜드", "네이버페이", "토스"];
const categoryOptions: Array<Category | "전체"> = ["전체", "커피", "베이커리", "간식"];
const benefitJsonUrl = process.env.NEXT_PUBLIC_BENEFITS_JSON_URL ?? "/api/benefits";

function daysLeft(dateText: string | null | undefined, asOfDate: string) {
  if (!dateText) return null;

  const today = new Date(`${asOfDate}T00:00:00+09:00`);
  const target = new Date(`${dateText}T23:59:59+09:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function isStarted(benefit: Benefit, asOfDate: string) {
  if (!benefit.startsAt) return true;

  const today = new Date(`${asOfDate}T00:00:00+09:00`);
  return new Date(`${benefit.startsAt}T00:00:00+09:00`).getTime() <= today.getTime();
}

function toggleValue<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function statusText(benefit: Benefit, asOfDate: string) {
  const left = daysLeft(benefit.validUntil, asOfDate);
  if (!isStarted(benefit, asOfDate)) return "예정";
  if (left === null) return "상시";
  if (left < 0) return "만료";
  if (left === 0) return "오늘까지";
  return `${left}일 남음`;
}

export default function Home() {
  const [payload, setPayload] = useState<BenefitsPayload>(emptyPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedPays, setSelectedPays] = useState<Pay[]>(payOptions);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [category, setCategory] = useState<Category | "전체">("전체");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetch(benefitJsonUrl, { headers: { accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`혜택 데이터를 불러오지 못했습니다. (${response.status})`);
        return response.json() as Promise<BenefitsPayload>;
      })
      .then((data) => {
        if (!isMounted) return;
        setPayload(data);
        setLoadError("");
      })
      .catch((error: Error) => {
        if (!isMounted) return;
        setLoadError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem("benefit-radar-preferences");
    if (!raw) return;

    try {
      const preferences = JSON.parse(raw) as {
        pays?: Pay[];
        brands?: string[];
        category?: Category | "전체";
      };
      const availablePays = (preferences.pays ?? []).filter((pay) => payOptions.includes(pay));
      setSelectedPays(availablePays.length ? availablePays : payOptions);
      setSelectedBrands(preferences.brands ?? []);
      setCategory(preferences.category ?? "전체");
    } catch {
      window.localStorage.removeItem("benefit-radar-preferences");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "benefit-radar-preferences",
      JSON.stringify({
        pays: selectedPays,
        brands: selectedBrands,
        category,
      }),
    );
  }, [category, selectedBrands, selectedPays]);

  const brandOptions = useMemo(
    () =>
      Array.from(new Set(payload.benefits.map((benefit) => benefit.brand))).sort((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    [payload.benefits],
  );

  const filteredBenefits = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return payload.benefits
      .filter((benefit) => selectedPays.includes(benefit.pay))
      .filter((benefit) => selectedBrands.length === 0 || selectedBrands.includes(benefit.brand))
      .filter((benefit) => category === "전체" || benefit.category === category)
      .filter((benefit) => {
        const left = daysLeft(benefit.validUntil, payload.asOfDate);
        return left === null || left >= 0;
      })
      .filter((benefit) => {
        if (!normalizedQuery) return true;
        return `${benefit.brand} ${benefit.title} ${benefit.pay}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => b.fit - a.fit);
  }, [category, payload.asOfDate, payload.benefits, query, selectedBrands, selectedPays]);

  const activeTop = filteredBenefits[0];
  const selectedBrandText =
    selectedBrands.length === 0 ? "모든 브랜드" : selectedBrands.slice(0, 2).join(", ");

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="요약">
        <div>
          <p className="eyebrow">현재/미래 혜택만 표시</p>
          <h1>페이 혜택 레이더</h1>
        </div>
        <div className="sync-status">
          <span className="status-dot" />
          {isLoading ? "혜택 불러오는 중" : `${payload.asOfLabel} 수집`}
        </div>
      </section>

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      <section className="overview">
        <div className="today-pick">
          <span className="section-label">오늘의 1순위</span>
          {activeTop ? (
            <>
              <div className="pick-line">
                <strong>{activeTop.brand}</strong>
                <span>{activeTop.value}</span>
              </div>
              <p>{activeTop.title}</p>
              <a href={activeTop.source} target="_blank" rel="noreferrer">
                원문 확인
              </a>
            </>
          ) : (
            <p>{isLoading ? "혜택 데이터를 불러오고 있습니다." : "선택한 조건에 맞는 혜택이 없습니다."}</p>
          )}
        </div>

        <div className="metric-band" aria-label="현재 조건">
          <div>
            <span>{filteredBenefits.length}</span>
            <p>표시 혜택</p>
          </div>
          <div>
            <span>{payOptions.length}</span>
            <p>자동 수집 출처</p>
          </div>
          <div>
            <span>{selectedBrandText}</span>
            <p>브랜드 범위</p>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="filters" aria-label="내 조건">
          <div className="filter-header">
            <span className="section-label">내 조건</span>
            <button
              className="ghost-button"
              onClick={() => {
                setSelectedPays(payOptions);
                setSelectedBrands([]);
                setCategory("전체");
                setQuery("");
              }}
              type="button"
            >
              초기화
            </button>
          </div>

          <label className="search-box">
            <span>검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="브랜드, 혜택"
            />
          </label>

          <div className="filter-group">
            <span>페이</span>
            <div className="chip-grid">
              {payOptions.map((pay) => (
                <button
                  className={selectedPays.includes(pay) ? "chip selected" : "chip"}
                  key={pay}
                  onClick={() => setSelectedPays((current) => toggleValue(current, pay))}
                  type="button"
                >
                  {pay}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span>종류</span>
            <div className="segmented">
              {categoryOptions.map((option) => (
                <button
                  className={category === option ? "selected" : ""}
                  key={option}
                  onClick={() => setCategory(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span>자주 가는 곳</span>
            <div className="brand-list">
              {brandOptions.map((brand) => (
                <button
                  className={selectedBrands.includes(brand) ? "brand selected" : "brand"}
                  key={brand}
                  onClick={() => setSelectedBrands((current) => toggleValue(current, brand))}
                  type="button"
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>

          <p className="filter-note">매일 생성되는 JSON 파일에서 브랜드 공식 이벤트와 결제 혜택을 함께 보여줍니다.</p>
        </aside>

        <section className="benefit-list" aria-label="혜택 목록">
          {filteredBenefits.map((benefit) => {
            const left = daysLeft(benefit.validUntil, payload.asOfDate);
            const urgent = left !== null && left >= 0 && left <= 3;

            return (
              <article className="benefit-card" key={benefit.id}>
                <div className="card-top">
                  <div>
                    <span className={`pay-badge ${benefit.pay}`}>{benefit.pay}</span>
                    <h2>{benefit.brand}</h2>
                  </div>
                  <strong>{benefit.value}</strong>
                </div>

                <p className="benefit-title">{benefit.title}</p>

                <dl>
                  <div>
                    <dt>조건</dt>
                    <dd>{benefit.condition}</dd>
                  </div>
                  <div>
                    <dt>기간</dt>
                    <dd>{benefit.period}</dd>
                  </div>
                </dl>

                <div className="card-bottom">
                  <span className={urgent ? "deadline urgent" : "deadline"}>
                    {statusText(benefit, payload.asOfDate)}
                  </span>
                  <a href={benefit.source} target="_blank" rel="noreferrer">
                    {benefit.sourceLabel}
                  </a>
                </div>

                <p className="notes">{benefit.notes}</p>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
