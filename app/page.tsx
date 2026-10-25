"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CATEGORIES,
  PAYS,
  defaultPreferences,
  displayValue,
  effectiveToday,
  filterBenefits,
  isEndingSoon,
  isUnverified,
  normalizeBrand,
  pruneMarks,
  shortDate,
  sourceName,
  staleDays,
  statusText,
  todayInSeoul,
  type Benefit,
  type BenefitsPayload,
  type Category,
  type Pay,
} from "./benefit-rules";
import {
  getPreferences,
  getServerPreferences,
  readCachedPayload,
  subscribePreferences,
  updatePreferences,
  writeCachedPayload,
  type Preferences,
  type Tab,
} from "./preferences";

const benefitJsonUrl = process.env.NEXT_PUBLIC_BENEFITS_JSON_URL ?? "/api/benefits";

/** Android와 같은 기본 관심 브랜드 후보. 데이터에 있는 브랜드와 합쳐 보여 준다. */
const POPULAR_BRANDS = [
  "메가MGC커피",
  "더벤티",
  "컴포즈커피",
  "빽다방",
  "매머드커피",
  "파리바게뜨",
  "HANS",
  "뚜레쥬르",
  "이디야",
  "투썸플레이스",
  "스타벅스",
];
const PAY_GROUPS: Array<{ label: string; pays: Pay[] }> = [
  { label: "결제·브랜드", pays: ["네이버페이", "토스", "브랜드"] },
  { label: "통신사 멤버십", pays: ["SKT", "KT", "LGU+"] },
];
const API_ERRORS: Record<string, string> = {
  benefits_json_not_found: "아직 수집된 혜택 데이터가 없습니다.",
  benefits_json_unreachable: "혜택 데이터 저장소에 연결하지 못했습니다.",
  benefits_json_invalid: "혜택 데이터 형식이 올바르지 않습니다.",
};

const emptyPayload: BenefitsPayload = {
  schemaVersion: 1,
  collectedAt: "",
  asOfDate: "",
  asOfLabel: "",
  benefits: [],
};

type LoadState = { status: "loading" | "ready" | "error"; error: string; fromCache: boolean };
type Toast = { id: number; message: string; undo?: () => void };

const noopSubscribe = () => () => {};

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function isPayload(value: unknown): value is BenefitsPayload {
  return Boolean(value && typeof value === "object" && Array.isArray((value as BenefitsPayload).benefits));
}

async function fetchPayload(): Promise<BenefitsPayload> {
  const response = await fetch(benefitJsonUrl, { headers: { accept: "application/json" } });
  if (!response.ok) {
    let code = "";
    try {
      code = ((await response.json()) as { error?: string }).error ?? "";
    } catch {
      // 본문이 JSON이 아니면 상태 코드만 알린다.
    }
    throw new Error(`${API_ERRORS[code] ?? "혜택 데이터를 불러오지 못했습니다."} (${response.status})`);
  }
  const data: unknown = await response.json();
  if (!isPayload(data)) throw new Error(API_ERRORS.benefits_json_invalid);
  return data;
}

export default function Home() {
  const prefs = useSyncExternalStore(subscribePreferences, getPreferences, getServerPreferences);
  // 서버 렌더링과 어긋나지 않도록 오늘 날짜는 브라우저에서 정한다. (서버에서는 null)
  const deviceToday = useSyncExternalStore(noopSubscribe, todayInSeoul, () => null);

  const [payload, setPayload] = useState<BenefitsPayload>(emptyPayload);
  const [load, setLoad] = useState<LoadState>({ status: "loading", error: "", fromCache: false });
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const receivePayload = useCallback((data: BenefitsPayload) => {
    setPayload(data);
    setLoad({ status: "ready", error: "", fromCache: false });
    writeCachedPayload(data);
    const ids = new Set(data.benefits.map((benefit) => benefit.id));
    const today = todayInSeoul();
    updatePreferences((current) => ({
      ...current,
      hidden: pruneMarks(current.hidden, ids, today),
      used: pruneMarks(current.used, ids, today),
    }));
  }, []);

  const receiveError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "혜택 데이터를 불러오지 못했습니다.";
    const cached = readCachedPayload<unknown>();
    if (isPayload(cached)) {
      setPayload((current) => (current.benefits.length ? current : cached));
      setLoad({ status: "error", error: message, fromCache: true });
    } else {
      setLoad({ status: "error", error: message, fromCache: false });
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchPayload()
      .then((data) => active && receivePayload(data))
      .catch((error) => active && receiveError(error));
    return () => {
      active = false;
    };
  }, [receivePayload, receiveError]);

  const refresh = () => {
    setLoad((current) => ({ ...current, status: "loading" }));
    fetchPayload().then(receivePayload).catch(receiveError);
  };

  const hasData = payload.benefits.length > 0 || Boolean(payload.asOfDate);
  const today = deviceToday ? effectiveToday(payload.asOfDate, deviceToday) : payload.asOfDate;
  const stale = deviceToday && hasData ? staleDays(payload.asOfDate, deviceToday) : 0;

  const hiddenIds = useMemo(() => new Set(Object.keys(prefs.hidden)), [prefs.hidden]);
  const usedIds = useMemo(() => new Set(Object.keys(prefs.used)), [prefs.used]);

  const listFor = useCallback(
    (tab: Tab) =>
      filterBenefits(
        payload.benefits,
        {
          tab,
          sources: prefs.sources,
          categories: prefs.categories,
          brands: prefs.brands,
          query,
          hiddenIds,
          usedIds,
        },
        today,
      ),
    [hiddenIds, payload.benefits, prefs.brands, prefs.categories, prefs.sources, query, today, usedIds],
  );
  const interestCount = useMemo(() => listFor("interest").length, [listFor]);
  const allCount = useMemo(() => listFor("all").length, [listFor]);
  const benefits = useMemo(() => listFor(prefs.tab), [listFor, prefs.tab]);

  const brandOptions = useMemo(() => {
    const fromData = payload.benefits
      .filter((benefit) => benefit.category !== "기타")
      .map((benefit) => normalizeBrand(benefit.brand));
    return Array.from(new Set([...POPULAR_BRANDS, ...fromData, ...prefs.brands])).sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
  }, [payload.benefits, prefs.brands]);

  const failedWarnings = (payload.warnings ?? []).filter((warning) => warning.kind === "failed");
  const detail = detailId ? payload.benefits.find((benefit) => benefit.id === detailId) ?? null : null;

  const showToast = (message: string, undo?: () => void) => setToast({ id: Date.now(), message, undo });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const markBenefit = (benefit: Benefit, kind: "used" | "hidden") => {
    const markedAt = todayInSeoul();
    updatePreferences((current) => ({ ...current, [kind]: { ...current[kind], [benefit.id]: markedAt } }));
    setDetailId(null);
    showToast(kind === "used" ? "사용한 혜택으로 표시했어요." : "혜택을 숨겼어요.", () =>
      updatePreferences((current) => {
        const next = { ...current[kind] };
        delete next[benefit.id];
        return { ...current, [kind]: next };
      }),
    );
  };

  const setPrefs = (patch: Partial<Preferences>) => updatePreferences((current) => ({ ...current, ...patch }));

  const statusLine =
    load.status === "loading" && !hasData
      ? "혜택 불러오는 중"
      : hasData
        ? `${payload.asOfLabel} 수집`
        : "수집 정보 없음";

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-mark" aria-hidden="true">
            <CupIcon />
          </div>
          <div className="topbar-text">
            <h1>카페할인 모아</h1>
            <p className="sync-line">
              <span className={load.status === "loading" ? "dot dot-busy" : load.error ? "dot dot-error" : "dot"} />
              {statusLine}
            </p>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              onClick={refresh}
              disabled={load.status === "loading"}
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshIcon spinning={load.status === "loading"} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
              title="설정"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar" aria-label="필터">
          <label className="search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="브랜드, 혜택 검색"
              aria-label="혜택 검색"
            />
          </label>

          <button
            className="filter-toggle"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="filter-panel"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span>필터</span>
            <span className="filter-summary">
              {filterSummary(prefs)}
              <ChevronIcon open={filtersOpen} />
            </span>
          </button>

          <div id="filter-panel" className={filtersOpen ? "filter-panel open" : "filter-panel"}>
            <section className="filter-group">
              <h2>종류</h2>
              <div className="chips">
                {CATEGORIES.map((category) => (
                  <ToggleChip
                    key={category}
                    label={category}
                    selected={prefs.categories.includes(category)}
                    onClick={() => {
                      const next = toggle(prefs.categories, category);
                      setPrefs({ categories: next.length ? (next as Category[]) : prefs.categories });
                    }}
                  />
                ))}
              </div>
              {!prefs.categories.includes("기타") ? (
                <p className="hint">기타에는 네이버페이 식당·외식 행사가 들어 있어요.</p>
              ) : null}
            </section>

            {PAY_GROUPS.map((group) => (
              <section className="filter-group" key={group.label}>
                <h2>{group.label}</h2>
                <div className="chips">
                  {group.pays.map((pay) => (
                    <ToggleChip
                      key={pay}
                      label={sourceName(pay)}
                      selected={prefs.sources.includes(pay)}
                      onClick={() => {
                        const next = toggle(prefs.sources, pay);
                        setPrefs({ sources: next.length ? next : prefs.sources });
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}

            <section className="filter-group">
              <div className="group-head">
                <h2>관심 브랜드</h2>
                <button className="text-button" type="button" onClick={() => setSettingsOpen(true)}>
                  {prefs.brands.length ? "편집" : "고르기"}
                </button>
              </div>
              <p className="hint">
                {prefs.brands.length
                  ? brandsText(prefs.brands)
                  : "자주 가는 브랜드를 고르면 내 관심 탭에서 모아 볼 수 있어요."}
              </p>
            </section>

            {failedWarnings.length ? (
              <section className="filter-group">
                <h2>수집 상태</h2>
                <ul className="warning-list">
                  {failedWarnings.map((warning) => (
                    <li key={warning.source}>
                      {warningName(warning.source, warning.brands, payload)} 수집 실패
                      {warning.fallbackCount ? ` · 이전 정보 ${warning.fallbackCount}건 표시` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </aside>

        <section className="content" aria-label="혜택">
          {load.error ? (
            <div className="banner banner-error" role="alert">
              <span>
                {load.fromCache ? "네트워크 오류로 저장된 혜택을 보여주는 중입니다. " : ""}
                {load.error}
              </span>
              <button className="text-button" type="button" onClick={refresh}>
                다시 시도
              </button>
            </div>
          ) : null}
          {stale >= 2 ? (
            <p className="banner banner-warn">
              혜택 정보가 {stale}일 전 수집분입니다. 이용 전 원문에서 기간을 확인해 주세요.
            </p>
          ) : null}

          <div className="tabs" role="tablist" aria-label="목록">
            <TabButton
              label="내 관심"
              count={interestCount}
              selected={prefs.tab === "interest"}
              onClick={() => setPrefs({ tab: "interest" })}
              ready={hasData}
            />
            <TabButton
              label="전체"
              count={allCount}
              selected={prefs.tab === "all"}
              onClick={() => setPrefs({ tab: "all" })}
              ready={hasData}
            />
          </div>

          <div role="tabpanel" aria-label={prefs.tab === "interest" ? "내 관심" : "전체"}>
            {!hasData && load.status === "loading" ? (
              <SkeletonList />
            ) : benefits.length === 0 ? (
              <EmptyState
                tab={prefs.tab}
                hasBrands={prefs.brands.length > 0}
                hasData={hasData}
                hasQuery={Boolean(query.trim())}
                onPickBrands={() => setSettingsOpen(true)}
                onClearQuery={() => setQuery("")}
              />
            ) : (
              <ul className="benefit-grid">
                {benefits.map((benefit, index) => (
                  <li key={benefit.id} className={index === 0 ? "featured" : undefined}>
                    <BenefitCard
                      benefit={benefit}
                      recommended={index === 0}
                      today={today}
                      asOfDate={payload.asOfDate}
                      onOpen={() => setDetailId(benefit.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="foot">
            네이버페이·토스·브랜드 공식 이벤트·통신사 멤버십 혜택을 하루 4번(9·11·15·19시) 모아 보여줍니다. 혜택 내용과
            기간은 바뀔 수 있으니 이용 전 원문을 확인해 주세요.
          </footer>
        </section>
      </main>

      {detail ? (
        <DetailDialog
          benefit={detail}
          today={today}
          asOfDate={payload.asOfDate}
          onClose={() => setDetailId(null)}
          onUsed={() => markBenefit(detail, "used")}
          onHide={() => markBenefit(detail, "hidden")}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          prefs={prefs}
          brandOptions={brandOptions}
          benefits={payload.benefits}
          onChange={setPrefs}
          onClose={() => setSettingsOpen(false)}
          onReset={() => {
            updatePreferences(() => ({ ...defaultPreferences }));
            setQuery("");
            setSettingsOpen(false);
            showToast("설정을 초기화했어요.");
          }}
        />
      ) : null}

      <div className="toast-region" aria-live="polite">
        {toast ? (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo ? (
              <button
                className="toast-action"
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                되돌리기
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function filterSummary(prefs: Preferences) {
  const categories =
    prefs.categories.length === CATEGORIES.length ? "모든 종류" : prefs.categories.join("·");
  const sources = prefs.sources.length === PAYS.length ? "모든 출처" : `출처 ${prefs.sources.length}곳`;
  return `${categories} · ${sources}`;
}

function brandsText(brands: string[]) {
  if (brands.length <= 3) return brands.join(", ");
  return `${brands.slice(0, 3).join(", ")} 외 ${brands.length - 3}곳`;
}

function warningName(source: string, brands: string[] | undefined, payload: BenefitsPayload) {
  if (brands?.length) return brands.join(", ");
  const known = payload.sources?.find((item) => item.provider === source);
  if (known) return known.label;
  const pay = { naverpay: "네이버페이", toss: "토스", skt: "SKT", kt: "KT", lguplus: "LG U+" }[source];
  return pay ?? source;
}

function ToggleChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button className={selected ? "chip selected" : "chip"} type="button" aria-pressed={selected} onClick={onClick}>
      {selected ? <CheckIcon /> : null}
      {label}
    </button>
  );
}

function TabButton({
  label,
  count,
  selected,
  ready,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={selected ? "tab selected" : "tab"}
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
    >
      {label}
      {ready ? <span className="tab-count">{count}</span> : null}
    </button>
  );
}

function Tags({ benefit, today, asOfDate, recommended }: {
  benefit: Benefit;
  today: string;
  asOfDate: string;
  recommended?: boolean;
}) {
  const status = statusText(benefit.startsAt, benefit.validUntil, today);
  const ending = isEndingSoon(benefit.validUntil, today);
  return (
    <div className="tags">
      {recommended ? <span className="tag tag-pick">오늘의 추천</span> : null}
      <span className={ending ? "tag tag-urgent" : status === "예정" ? "tag tag-soon" : "tag tag-status"}>
        {status}
      </span>
      <span className={`tag tag-source source-${benefit.provider}`}>{sourceName(benefit.pay)}</span>
      <span className="tag">{benefit.category}</span>
      {isUnverified(benefit, asOfDate) ? (
        <span className="tag tag-old" title="출처 수집이 잠시 실패해 이전에 확인한 내용을 보여줍니다.">
          {shortDate(benefit.lastVerifiedAt as string)} 확인
        </span>
      ) : null}
    </div>
  );
}

function BenefitCard({
  benefit,
  recommended,
  today,
  asOfDate,
  onOpen,
}: {
  benefit: Benefit;
  recommended: boolean;
  today: string;
  asOfDate: string;
  onOpen: () => void;
}) {
  const value = displayValue(benefit);
  return (
    <article className="card">
      <div className="card-head">
        <h3>
          <button
            className="card-hit"
            type="button"
            onClick={onOpen}
            aria-label={`${benefit.brand} ${value}: ${benefit.title}`}
          >
            {benefit.brand}
          </button>
        </h3>
        <span className={value.length >= 6 ? "value value-long" : "value"}>{value}</span>
      </div>
      <p className="card-title">{benefit.title}</p>
      <Tags benefit={benefit} today={today} asOfDate={asOfDate} recommended={recommended} />
      {benefit.condition ? <p className="card-condition">{benefit.condition}</p> : null}
    </article>
  );
}

/** 브라우저 기본 <dialog>를 모달로 띄운다. Esc·바깥 클릭으로 닫힌다. */
function Modal({
  label,
  onClose,
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    document.documentElement.classList.add("modal-open");
    return () => document.documentElement.classList.remove("modal-open");
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className ?? ""}`}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

function DetailDialog({
  benefit,
  today,
  asOfDate,
  onClose,
  onUsed,
  onHide,
}: {
  benefit: Benefit;
  today: string;
  asOfDate: string;
  onClose: () => void;
  onUsed: () => void;
  onHide: () => void;
}) {
  return (
    <Modal label={benefit.title} onClose={onClose} className="sheet">
      <div className="modal-head">
        <div>
          <p className="eyebrow">{benefit.brand}</p>
          <h2>{benefit.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="닫기">
          <CloseIcon />
        </button>
      </div>
      {/* 브랜드 이벤트는 valueText가 제목과 같아서, 그때는 배지 값을 크게 보여 준다. */}
      <p className="detail-value">
        {benefit.valueText && benefit.valueText !== benefit.title ? benefit.valueText : displayValue(benefit)}
      </p>
      <Tags benefit={benefit} today={today} asOfDate={asOfDate} />
      <dl className="detail-list">
        <div>
          <dt>조건</dt>
          <dd>{benefit.condition || "-"}</dd>
        </div>
        <div>
          <dt>기간</dt>
          <dd>
            {benefit.period || "-"} · {statusText(benefit.startsAt, benefit.validUntil, today)}
          </dd>
        </div>
        {benefit.notes ? (
          <div>
            <dt>메모</dt>
            <dd>{benefit.notes}</dd>
          </div>
        ) : null}
        <div>
          <dt>원문</dt>
          <dd>{benefit.sourceLabel}</dd>
        </div>
        {isUnverified(benefit, asOfDate) ? (
          <div>
            <dt>확인</dt>
            <dd>
              {shortDate(benefit.lastVerifiedAt as string)}에 마지막으로 확인한 정보예요. 출처 수집이 잠시 실패해 이전
              내용을 보여줍니다.
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="detail-actions">
        <a className="primary-button" href={benefit.source} target="_blank" rel="noreferrer">
          원문 열기
          <ExternalIcon />
        </a>
        <div className="detail-secondary">
          <button className="ghost-button" type="button" onClick={onUsed}>
            사용했어요
          </button>
          <button className="ghost-button" type="button" onClick={onHide}>
            숨기기
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsDialog({
  prefs,
  brandOptions,
  benefits,
  onChange,
  onClose,
  onReset,
}: {
  prefs: Preferences;
  brandOptions: string[];
  benefits: Benefit[];
  onChange: (patch: Partial<Preferences>) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const marked = benefits
    .filter((benefit) => prefs.hidden[benefit.id] || prefs.used[benefit.id])
    .map((benefit) => ({ benefit, kind: prefs.used[benefit.id] ? ("used" as const) : ("hidden" as const) }));
  const markedTotal = new Set([...Object.keys(prefs.hidden), ...Object.keys(prefs.used)]).size;

  const restore = (id: string) => {
    const hidden = { ...prefs.hidden };
    const used = { ...prefs.used };
    delete hidden[id];
    delete used[id];
    onChange({ hidden, used });
  };

  return (
    <Modal label="설정" onClose={onClose} className="sheet settings">
      <div className="modal-head">
        <h2>설정</h2>
        <button className="icon-button" type="button" onClick={onClose} aria-label="닫기">
          <CloseIcon />
        </button>
      </div>

      <section className="settings-section">
        <div className="group-head">
          <h3>관심 브랜드</h3>
          <div className="inline-actions">
            <button className="text-button" type="button" onClick={() => onChange({ brands: brandOptions })}>
              전체 선택
            </button>
            <button className="text-button" type="button" onClick={() => onChange({ brands: [] })}>
              전체 해제
            </button>
          </div>
        </div>
        <p className="hint">고른 브랜드의 혜택을 내 관심 탭에 모아 보여드려요.</p>
        <div className="chips brand-chips">
          {brandOptions.map((brand) => (
            <ToggleChip
              key={brand}
              label={brand}
              selected={prefs.brands.includes(brand)}
              onClick={() => onChange({ brands: toggle(prefs.brands, brand) })}
            />
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="group-head">
          <h3>숨긴·사용한 혜택 {markedTotal ? `(${markedTotal})` : ""}</h3>
          {markedTotal ? (
            <button className="text-button" type="button" onClick={() => onChange({ hidden: {}, used: {} })}>
              모두 다시 보기
            </button>
          ) : null}
        </div>
        {marked.length ? (
          <ul className="marked-list">
            {marked.map(({ benefit, kind }) => (
              <li key={benefit.id}>
                <div>
                  <span className="marked-kind">{kind === "used" ? "사용함" : "숨김"}</span>
                  <strong>{benefit.brand}</strong>
                  <span className="marked-title">{benefit.title}</span>
                </div>
                <button className="text-button" type="button" onClick={() => restore(benefit.id)}>
                  되돌리기
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            {markedTotal
              ? "숨긴 혜택은 지금 목록에 없어요(기간이 끝났거나 사라짐)."
              : "혜택 상세에서 ‘사용했어요’나 ‘숨기기’를 누르면 목록에서 빠지고 여기에 모여요."}
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>초기화</h3>
        <p className="hint">관심 브랜드, 필터와 숨긴 혜택을 기본값으로 되돌립니다. 이 브라우저에만 저장된 값이에요.</p>
        {confirmReset ? (
          <div className="inline-actions">
            <button className="danger-button" type="button" onClick={onReset}>
              초기화
            </button>
            <button className="ghost-button" type="button" onClick={() => setConfirmReset(false)}>
              취소
            </button>
          </div>
        ) : (
          <button className="ghost-button" type="button" onClick={() => setConfirmReset(true)}>
            설정 초기화
          </button>
        )}
      </section>
    </Modal>
  );
}

function EmptyState({
  tab,
  hasBrands,
  hasData,
  hasQuery,
  onPickBrands,
  onClearQuery,
}: {
  tab: Tab;
  hasBrands: boolean;
  hasData: boolean;
  hasQuery: boolean;
  onPickBrands: () => void;
  onClearQuery: () => void;
}) {
  if (!hasData) {
    return (
      <div className="empty">
        <p>혜택 데이터를 불러오지 못했어요.</p>
      </div>
    );
  }
  if (tab === "interest" && !hasBrands) {
    return (
      <div className="empty">
        <p>관심 브랜드를 설정하면 자주 가는 카페 혜택만 모아볼 수 있어요.</p>
        <button className="primary-button" type="button" onClick={onPickBrands}>
          관심 브랜드 고르기
        </button>
      </div>
    );
  }
  return (
    <div className="empty">
      <p>{tab === "interest" ? "관심 브랜드의 표시할 혜택이 없습니다." : "표시할 혜택이 없습니다."}</p>
      {hasQuery ? (
        <button className="ghost-button" type="button" onClick={onClearQuery}>
          검색어 지우기
        </button>
      ) : null}
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="benefit-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <li key={item} className={item === 0 ? "featured" : undefined}>
          <div className="card skeleton">
            <span />
            <span />
            <span />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- 아이콘 (인라인 SVG) ----

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CupIcon() {
  return (
    <Svg>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5" />
    </Svg>
  );
}
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <Svg className={spinning ? "spin" : undefined}>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 21v-5h-5" />
    </Svg>
  );
}
function SettingsIcon() {
  return (
    <Svg>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Svg>
  );
}
function SearchIcon() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  );
}
function CheckIcon() {
  return (
    <Svg>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}
function CloseIcon() {
  return (
    <Svg>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <Svg className={open ? "chevron open" : "chevron"}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}
function ExternalIcon() {
  return (
    <Svg>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}
