"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleAlert,
  Layers3,
  RefreshCw,
  Search,
  SearchX,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MarketAnalysisResponse,
  MarketMetric,
  MarketSegment,
  MarketValue,
} from "@/lib/market-analysis";
import styles from "./market-analysis.module.css";

type Tab = "summary" | "fields" | "competition";
type FieldLevel = "large" | "middle" | "small";
type FieldMode = "drill" | "compare";
type FieldPath = {
  field: string;
  fieldMiddle: string;
  fieldSmall: string;
};

const number = new Intl.NumberFormat("ko-KR");
const compact = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const palette = {
  purple: "#6464d8",
};

function formatRate(value: number | null) {
  if (value === null) return "비교 불가";
  return Math.abs(value) < 0.0005 ? "보합" : percent.format(value);
}

function signedNumber(value: number | null) {
  if (value === null) return "비교 불가";
  return `${value > 0 ? "+" : ""}${number.format(value)}명`;
}

function SummaryKpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className={styles.summaryKpi}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Delta({
  value,
  inverse = false,
  format = "number",
}: {
  value: MarketValue;
  inverse?: boolean;
  format?: "number" | "percent" | "index";
}) {
  if (value.change === null) return <span className={styles.neutralDelta}>비교값 없음</span>;
  if (format !== "percent" && value.changeRate !== null && Math.abs(value.changeRate) < 0.0005) {
    return <span className={styles.neutralDelta}>보합 · {signedNumber(value.change)}</span>;
  }
  const up = value.change >= 0;
  const positive = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const changeLabel = format === "percent"
    ? `${value.change >= 0 ? "+" : ""}${(value.change * 100).toFixed(1)}%p`
    : `${value.change >= 0 ? "+" : ""}${number.format(value.change)}${format === "number" ? "명" : ""}`;
  return (
    <span className={`${styles.delta} ${positive ? styles.good : styles.bad}`}>
      <Icon size={14} />
      {changeLabel}
      {format === "percent" || value.changeRate === null ? "" : ` (${percent.format(value.changeRate)})`}
    </span>
  );
}

export function KpiCard({
  label,
  description,
  value,
  icon: Icon,
  format = "number",
  inverse = false,
  unavailable = false,
}: {
  label: string;
  description: string;
  value: MarketValue;
  icon: typeof Users;
  format?: "number" | "percent" | "index";
  inverse?: boolean;
  unavailable?: boolean;
}) {
  const displayed = unavailable
    ? "제공 안 됨"
    : format === "percent"
      ? percent.format(value.value)
      : format === "index"
        ? value.value.toFixed(0)
        : `${compact.format(value.value)}명`;
  return (
    <article className={styles.kpiCard}>
      <div className={styles.kpiHeader}>
        <span><Icon size={18} /></span>
        <div>
          <strong>{label}</strong>
          <small>{description}</small>
        </div>
      </div>
      <b className={unavailable ? styles.unavailable : ""}>{displayed}</b>
      {unavailable ? (
        <span className={styles.neutralDelta}>2023년부터 확인 가능</span>
      ) : (
        <Delta value={value} inverse={inverse} format={format} />
      )}
    </article>
  );
}

function SegmentRows({
  rows,
  limit = 8,
  showAbsoluteChange = false,
  changeMode = "recent",
  startYear,
  endYear,
  dimensionLabel = "항목",
}: {
  rows: MarketSegment[];
  limit?: number;
  showAbsoluteChange?: boolean;
  changeMode?: "recent" | "long";
  startYear?: number;
  endYear?: number;
  dimensionLabel?: string;
}) {
  const max = Math.max(...rows.slice(0, limit).map((row) => row.value), 1);
  return (
    <div className={styles.segmentRows}>
      {changeMode === "long" && startYear !== undefined && endYear !== undefined ? (
        <div className={styles.segmentRowHeader} aria-hidden="true">
          <span />
          <span>{dimensionLabel} · {startYear}→{endYear} 규모</span>
          <span>현재 규모·점유율</span>
          <span>{startYear}년 대비 증감</span>
        </div>
      ) : null}
      {rows.slice(0, limit).map((row) => (
        <div className={styles.segmentRow} key={row.name}>
          <span className={styles.rank}>{String(row.rank).padStart(2, "0")}</span>
          <div className={styles.segmentName}>
            <strong title={row.name}>{row.name}</strong>
            <div><i style={{ width: `${(row.value / max) * 100}%` }} /></div>
            {changeMode === "long" && (
              <small className={styles.periodContext}>
                {row.startValue === null
                  ? "시작연도 값 없음"
                  : startYear !== undefined && endYear !== undefined
                    ? `${compact.format(row.startValue)} → ${compact.format(row.value)}`
                    : `${compact.format(row.startValue)} → ${compact.format(row.value)}`}
              </small>
            )}
          </div>
          <div className={styles.segmentMetric}>
            <b>{compact.format(row.value)}</b>
            <small>{percent.format(row.share)}</small>
          </div>
          <span
            className={`${styles.rateText} ${(row.changeRate ?? 0) >= 0 ? styles.rateUp : styles.rateDown}`}
          >
            {showAbsoluteChange && (changeMode === "long" ? row.changeFromStart : row.change) !== null
              ? signedNumber(changeMode === "long" ? row.changeFromStart : row.change)
              : formatRate(changeMode === "long" ? row.changeRateFromStart : row.changeRate)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryView({ data }: { data: MarketAnalysisResponse }) {
  const market = data.kpis.marketSize;
  const selectedLabel = data.meta.metricLabel;
  const topFields = data.fields.slice(0, 6);
  const largestField = topFields[0];
  const chartHeight = Math.max(280, topFields.length * 48);
  return (
    <div className={styles.stack}>
      <aside className={styles.publisherNotice}>
        <BookOpen size={18} />
        <p><strong>출판시장 참고 기준</strong> 학생 수는 전공별 잠재 독자 규모를 비교하는 자료입니다. 실제 교재 채택·판매량이나 향후 수요를 뜻하지 않습니다.</p>
      </aside>

      <section className={styles.kpiGrid} aria-label="시장 핵심 지표">
        <SummaryKpi label={`${data.meta.endYear}년 ${selectedLabel}`} value={`${number.format(market.value)}명`} note="종료연도 전체 합계" />
        <SummaryKpi label={`${data.meta.startYear}년 대비`} value={signedNumber(market.changeFromStart)} note={formatRate(market.changeRateFromStart)} />
        <SummaryKpi label="운영 학교" value={`${number.format(data.kpis.schoolCount.value)}개교`} note="선택 조건에서 학생이 있는 본·분교" />
        <SummaryKpi label="가장 큰 대계열" value={largestField?.name ?? "데이터 없음"} note={largestField ? `${number.format(largestField.value)}명 · 전체 ${percent.format(largestField.share)}` : "비교 가능한 계열 없음"} />
      </section>

      <section className={styles.twoColumns}>
        <article className={`${styles.panel} ${styles.wide}`}>
          <header className={styles.panelHeader}><div><span>전공 규모</span><h3>현재 학생 규모가 큰 대계열</h3><p>{data.meta.endYear}년 {selectedLabel} 상위 6개 · 막대는 현재 규모, 툴팁은 {data.meta.startYear}년 대비 변화를 표시합니다.</p></div><small>단위: 명</small></header>
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topFields} layout="vertical" margin={{ left: 8, right: 22, top: 6, bottom: 6 }}>
                <CartesianGrid stroke="#eceef3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => compact.format(Number(value))} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={92} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f6f7fa" }} content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as MarketSegment | undefined;
                  if (!active || !row) return null;
                  return <div className={styles.chartTooltip}><strong>{row.name}</strong><span>현재 {number.format(row.value)}명</span><span>{data.meta.startYear}년 대비 {signedNumber(row.changeFromStart)}</span><span>전체의 {percent.format(row.share)}</span></div>;
                }} />
                <Bar dataKey="value" fill={palette.purple} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>학교 유형</span><h3>대학·전문대학 규모</h3><p>현재 규모와 {data.meta.startYear}년 대비 변화를 비교합니다.</p></div></header>
          <SegmentRows rows={data.universityCategories} limit={4} showAbsoluteChange changeMode="long" startYear={data.meta.startYear} endYear={data.meta.endYear} dimensionLabel="구분" />
        </article>
      </section>
    </div>
  );
}

function FieldMoverList({
  title,
  rows,
}: {
  title: string;
  rows: MarketSegment[];
}) {
  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div><span>장기 변화</span><h3>{title}</h3><p>시작연도와 종료연도가 모두 있는 계열 기준</p></div>
      </header>
      <div className={styles.fieldMoverList}>
        {rows.length ? rows.map((row, index) => (
          <div key={row.name}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong title={row.name}>{row.name}</strong>
            <b className={(row.changeFromStart ?? 0) >= 0 ? styles.rateUp : styles.rateDown}>
              {signedNumber(row.changeFromStart)}
            </b>
            <small>{formatRate(row.changeRateFromStart)}</small>
          </div>
        )) : <p className={styles.fieldEmpty}>비교 가능한 계열이 없습니다.</p>}
      </div>
    </article>
  );
}

function FieldsView({
  data,
  selection,
  path,
  onFieldChange,
  onFieldMiddleChange,
  onFieldSmallChange,
}: {
  data: MarketAnalysisResponse;
  selection: string;
  path: FieldPath;
  onFieldChange: (value: string) => void;
  onFieldMiddleChange: (value: string) => void;
  onFieldSmallChange: (value: string) => void;
}) {
  const [mode, setMode] = useState<FieldMode>("drill");
  const [compareLevel, setCompareLevel] = useState<FieldLevel>("middle");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const levels: Array<{ id: FieldLevel; label: string; rows: MarketSegment[] }> = [
    { id: "large", label: "대계열", rows: data.fields },
    { id: "middle", label: "중계열", rows: data.fieldMiddles },
    { id: "small", label: "소계열", rows: data.fieldSmalls },
  ];
  const drillLevel: FieldLevel = path.fieldMiddle || path.fieldSmall
    ? "small"
    : path.field
      ? "middle"
      : "large";
  const level = mode === "drill" ? drillLevel : compareLevel;
  const activeLevel = levels.find((item) => item.id === level)!;
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const filteredRows = activeLevel.rows.filter((row) =>
    row.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
  );
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pages);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const comparable = activeLevel.rows.filter((row) => row.startValue !== null && row.changeFromStart !== null);
  const increases = comparable
    .filter((row) => (row.changeFromStart ?? 0) > 0)
    .toSorted((left, right) => (right.changeFromStart ?? 0) - (left.changeFromStart ?? 0))
    .slice(0, 5);
  const decreases = comparable
    .filter((row) => (row.changeFromStart ?? 0) < 0)
    .toSorted((left, right) => (left.changeFromStart ?? 0) - (right.changeFromStart ?? 0))
    .slice(0, 5);
  const market = data.kpis.marketSize;
  const selectedName = level === "large"
    ? path.field
    : level === "middle"
      ? path.fieldMiddle
      : path.fieldSmall;
  const nextLevelLabel = level === "large" ? "중계열" : level === "middle" ? "소계열" : "상세 시장";

  const selectRow = (row: MarketSegment) => {
    if (level === "large") onFieldChange(row.name);
    else if (level === "middle") onFieldMiddleChange(row.name);
    else onFieldSmallChange(row.name);
    setMode("drill");
    setQuery("");
    setPage(1);
  };

  const resetPath = () => {
    onFieldChange("");
    setMode("drill");
    setQuery("");
    setPage(1);
  };

  const drillGuide = level === "large"
    ? "대계열을 선택하면 해당 중계열로 이동합니다."
    : level === "middle"
      ? `${path.field || "선택 범위"}의 중계열을 선택하면 소계열로 이동합니다.`
      : "소계열을 선택하면 해당 분야의 학생 규모와 장기 변화를 자세히 볼 수 있습니다.";

  return (
    <div className={styles.stack}>
      <section className={styles.fieldDefinition}>
        <div><Layers3 size={19} /><span>전공 분류</span></div>
        <strong>대계열 → 중계열 → 소계열</strong>
        <p>큰 전공 분야에서 세부 분야로 단계별로 내려가며 학생 규모와 장기 변화를 비교합니다.</p>
      </section>

      <section className={styles.fieldKpiGrid} aria-label="선택 계열 핵심 수치">
        <SummaryKpi label={`${data.meta.endYear}년 ${data.meta.metricLabel}`} value={`${number.format(market.value)}명`} note={selection} />
        <SummaryKpi label={`${data.meta.startYear}년 대비`} value={signedNumber(market.changeFromStart)} note={formatRate(market.changeRateFromStart)} />
        <SummaryKpi label="최근 1년 변화" value={market.change === null ? "비교 불가" : signedNumber(market.change)} note={formatRate(market.changeRate)} />
        <SummaryKpi label="운영 학교" value={`${number.format(data.kpis.schoolCount.value)}개교`} note="선택한 전공 분야를 운영하는 본·분교" />
      </section>

      <article className={styles.panel}>
        <header className={styles.fieldExplorerHeader}>
          <div><span>계열 탐색</span><h3>공식 분류별 시장 규모와 장기 변화</h3><p>{drillGuide}</p></div>
          <label className={styles.fieldSearch}><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="계열명 검색" /></label>
        </header>
        <div className={styles.fieldExplorerMode} role="group" aria-label="계열 탐색 방식">
          <button type="button" aria-pressed={mode === "drill"} onClick={() => { setMode("drill"); setQuery(""); setPage(1); }}>계층 탐색</button>
          <button type="button" aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); setCompareLevel(drillLevel); setQuery(""); setPage(1); }}>전체 단계 비교</button>
        </div>
        <nav className={styles.fieldBreadcrumb} aria-label="선택한 계열 경로">
          <button type="button" aria-current={!path.field && !path.fieldMiddle && !path.fieldSmall ? "page" : undefined} onClick={resetPath}>전체 계열</button>
          {path.field && <><ChevronRight size={14} /><button type="button" aria-current={!path.fieldMiddle && !path.fieldSmall ? "page" : undefined} onClick={() => { onFieldMiddleChange(""); setMode("drill"); setPage(1); }}>{path.field}</button></>}
          {path.fieldMiddle && <><ChevronRight size={14} /><button type="button" aria-current={!path.fieldSmall ? "page" : undefined} onClick={() => { onFieldSmallChange(""); setMode("drill"); setPage(1); }}>{path.fieldMiddle}</button></>}
          {path.fieldSmall && <><ChevronRight size={14} /><span aria-current="page">{path.fieldSmall}</span></>}
        </nav>
        {mode === "compare" && (
          <div className={styles.fieldLevelTabs} role="tablist" aria-label="전체 계열 분류 단계 비교">
            {levels.map((item) => (
              <button type="button" role="tab" aria-selected={level === item.id} key={item.id} onClick={() => { setCompareLevel(item.id); setPage(1); }}>
                {item.label}<span>{number.format(item.rows.length)}</span>
              </button>
            ))}
          </div>
        )}
        <div className={styles.fieldRankingHeader} aria-hidden="true"><span>순위·계열명</span><span>현재 규모</span><span>현재 비중</span><span>{data.meta.startYear}년 대비</span></div>
        <div className={styles.fieldRanking}>
          {visibleRows.map((row) => (
            <button type="button" key={row.name} aria-current={row.name === selectedName ? "true" : undefined} aria-label={`${row.name} 선택, ${nextLevelLabel} 보기`} onClick={() => selectRow(row)}>
              <span className={styles.rank}>{String(row.rank).padStart(2, "0")}</span>
              <strong title={row.name}>{row.name}</strong>
              <b><small>현재</small>{number.format(row.value)}명</b>
              <span><small>비중</small>{percent.format(row.share)}</span>
              <span className={(row.changeFromStart ?? 0) >= 0 ? styles.rateUp : styles.rateDown}><small>장기</small>{signedNumber(row.changeFromStart)}</span>
              <ChevronRight className={styles.drillArrow} size={16} aria-hidden="true" />
            </button>
          ))}
          {!visibleRows.length && <p className={styles.fieldEmpty}>검색 조건에 맞는 계열이 없습니다.</p>}
        </div>
        {pages > 1 && <div className={styles.fieldPagination}><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>이전</button><span><strong>{safePage}</strong> / {pages} 페이지</span><button type="button" disabled={safePage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>다음</button></div>}
      </article>

      <section className={styles.twoColumns}>
        <FieldMoverList title={`${activeLevel.label} 장기 증가`} rows={increases} />
        <FieldMoverList title={`${activeLevel.label} 장기 감소`} rows={decreases} />
      </section>

      <article className={styles.panel}>
        <header className={styles.panelHeader}><div><span>지역 분포</span><h3>선택 계열의 지역별 시장</h3><p>현재 규모와 {data.meta.startYear}년 대비 증감을 함께 봅니다.</p></div></header>
        <SegmentRows rows={data.regions} limit={10} showAbsoluteChange changeMode="long" startYear={data.meta.startYear} endYear={data.meta.endYear} dimensionLabel="지역" />
      </article>
    </div>
  );
}

function CompetitionView({ data }: { data: MarketAnalysisResponse }) {
  const chartRows = data.regions.slice(0, 10);
  const largestRegion = data.regions[0];
  const growingRegions = data.regions.filter(
    (region) => (region.changeFromStart ?? 0) > 0,
  ).length;
  const chartHeight = Math.max(360, chartRows.length * 44);

  return (
    <div className={styles.stack}>
      <section className={styles.regionKpis}>
        <div><span>분석 지역</span><strong>{number.format(data.regions.length)}개</strong><small>{data.meta.startYear}–{data.meta.endYear}년</small></div>
        <div><span>현재 최대 지역</span><strong>{largestRegion?.name ?? "-"}</strong><small>{largestRegion ? `${compact.format(largestRegion.value)}명` : "데이터 없음"}</small></div>
        <div><span>장기 증가 지역</span><strong>{number.format(growingRegions)}개</strong><small>{data.meta.startYear}년 대비</small></div>
      </section>

      <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>지역 비교</span><h3>{data.meta.startYear}년과 {data.meta.endYear}년 지역별 학생 규모</h3><p>현재 규모가 큰 10개 지역의 시작연도와 종료연도를 직접 비교합니다.</p></div><small>단위: 명</small></header>
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 18, left: 6, bottom: 8 }}>
                <CartesianGrid stroke="#eceef3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => compact.format(Number(value))} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={50} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f6f7fa" }} content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as MarketSegment | undefined;
                  if (!active || !row) return null;
                  return <div className={styles.chartTooltip}><strong>{row.name}</strong><span>{data.meta.startYear}년 {number.format(row.startValue ?? 0)}명</span><span>{data.meta.endYear}년 {number.format(row.value)}명</span><span>증감 {signedNumber(row.changeFromStart)}</span></div>;
                }} />
                <Legend formatter={(value) => value === "startValue" ? `${data.meta.startYear}년` : `${data.meta.endYear}년`} />
                <Bar dataKey="startValue" fill="#b8bcc8" radius={[0, 4, 4, 0]} />
                <Bar dataKey="value" fill={palette.purple} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </article>

      <section className={styles.moversGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>학교 이동</span><h3>장기 증가 학교</h3><p>{data.meta.startYear}년 시작 규모 {number.format(data.meta.schoolMinimumStartValue)}명 이상 · 절대 증감</p></div></header>
          <SegmentRows rows={data.schoolMovers.increases} limit={10} showAbsoluteChange changeMode="long" />
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>학교 이동</span><h3>장기 감소 학교</h3><p>{data.meta.startYear}년 시작 규모 {number.format(data.meta.schoolMinimumStartValue)}명 이상 · 절대 증감</p></div></header>
          <SegmentRows rows={data.schoolMovers.decreases} limit={10} showAbsoluteChange changeMode="long" />
        </article>
      </section>
    </div>
  );
}

export function MarketAnalysis({
  baseQuery,
  metric,
  view = "summary",
  fieldSelection = "전체 계열",
  fieldPath = { field: "", fieldMiddle: "", fieldSmall: "" },
  onFieldChange = () => undefined,
  onFieldMiddleChange = () => undefined,
  onFieldSmallChange = () => undefined,
}: {
  baseQuery: string;
  metric: MarketMetric;
  view?: Tab;
  fieldSelection?: string;
  fieldPath?: FieldPath;
  onFieldChange?: (value: string) => void;
  onFieldMiddleChange?: (value: string) => void;
  onFieldSmallChange?: (value: string) => void;
}) {
  const [data, setData] = useState<MarketAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.set("marketMetric", metric);
    return params.toString();
  }, [baseQuery, metric]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/market-analysis?${query}`, { signal });
      if (!response.ok) throw new Error("market_analysis_failed");
      setData((await response.json()) as MarketAnalysisResponse);
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") {
        setError("시장 분석 데이터를 불러오지 못했습니다. 개발 서버 상태를 확인해 주세요.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return (
    <section className={styles.marketView}>
      {error ? (
        <div className={styles.state}><CircleAlert size={28} /><strong>시장 분석을 불러오지 못했습니다.</strong><p>{error}</p><button type="button" onClick={() => load()}><RefreshCw size={15} /> 다시 시도</button></div>
      ) : !data ? (
        <div className={styles.state}><span className={styles.loader} /><strong>18만여 행에서 시장 구조를 계산하고 있습니다…</strong></div>
      ) : data.kpis.marketSize.value === 0 ? (
        <div className={styles.state}><SearchX size={28} /><strong>조건에 맞는 시장 데이터가 없습니다.</strong><p>상단 필터를 줄이거나 기준연도를 바꿔보세요.</p></div>
      ) : (
        <div className={loading ? styles.loading : ""}>
          {view === "summary" && <SummaryView data={data} />}
          {view === "fields" && (
            <FieldsView
              data={data}
              selection={fieldSelection}
              path={fieldPath}
              onFieldChange={onFieldChange}
              onFieldMiddleChange={onFieldMiddleChange}
              onFieldSmallChange={onFieldSmallChange}
            />
          )}
          {view === "competition" && <CompetitionView data={data} />}
          <details className={styles.notes}>
            <summary><Layers3 size={17} /><strong>분석 해석 시 주의사항</strong><span>펼쳐보기</span></summary>
            <div>{data.notes.map((note) => <p key={note}>{note}</p>)}</div>
          </details>
        </div>
      )}
    </section>
  );
}
