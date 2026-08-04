"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
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
  purpleLight: "#adadef",
  teal: "#158f7a",
  orange: "#d97735",
  blue: "#3778c2",
  ink: "#252838",
  muted: "#8b90a0",
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
}: {
  rows: MarketSegment[];
  limit?: number;
  showAbsoluteChange?: boolean;
  changeMode?: "recent" | "long";
  startYear?: number;
  endYear?: number;
}) {
  const max = Math.max(...rows.slice(0, limit).map((row) => row.value), 1);
  return (
    <div className={styles.segmentRows}>
      {changeMode === "long" && startYear !== undefined && endYear !== undefined ? (
        <div className={styles.segmentRowHeader} aria-hidden="true">
          <span />
          <span>지역 · {startYear}→{endYear} 규모</span>
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
  const latest = data.annual.at(-1);
  const enrolledShare = latest && latest.total > 0 ? latest.enrolled / latest.total : null;
  const leaveShare = latest && latest.total > 0 ? latest.leave / latest.total : null;
  const selectedKey = data.meta.metric;
  const comparisonKey: MarketMetric = selectedKey === "enrolled" ? "total" : "enrolled";
  const selectedLabel = data.meta.metricLabel;
  const comparisonLabel = comparisonKey === "enrolled" ? "재학생" : "재적학생";
  const annualChanges = data.annual.map((row, index) => ({
    ...row,
    annualChange: index === 0 ? null : row[selectedKey] - data.annual[index - 1][selectedKey],
  }));
  const longTrend = data.annual;
  const indexedCategories = data.meta.years.map((year, yearIndex) => {
    const row: Record<string, string | number | null> = { year };
    for (const series of data.universityCategoryAnnual) {
      const point = series.annual.find((item) => item.year === year);
      row[series.name] = point?.index ?? null;
      row[`${series.name}Actual`] = point?.value ?? null;
      row[`${series.name}Label`] = yearIndex === data.meta.years.length - 1 ? series.name : "";
    }
    return row;
  });
  return (
    <div className={styles.stack}>
      <section className={styles.kpiGrid} aria-label="시장 핵심 지표">
        <SummaryKpi label={`${data.meta.endYear}년 ${selectedLabel}`} value={`${number.format(market.value)}명`} note="종료연도 전체 합계" />
        <SummaryKpi label={`${data.meta.startYear}년 대비`} value={signedNumber(market.changeFromStart)} note={formatRate(market.changeRateFromStart)} />
        <SummaryKpi label="연평균 변화율" value={formatRate(market.cagr)} note={`${data.meta.startYear}~${data.meta.endYear}년 연평균`} />
        <SummaryKpi label="최근 1년 변화" value={isFinite(market.change ?? NaN) ? signedNumber(market.change) : "비교 불가"} note={formatRate(market.changeRate)} />
        <SummaryKpi label="학생 구성" value={`재학생 ${formatRate(enrolledShare)}`} note={`휴학생 ${formatRate(leaveShare)} · 유예 ${number.format(latest?.deferment ?? 0)}명`} />
      </section>

      <section className={styles.primaryCharts}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>장기 추세</span><h3>{selectedLabel} 장기 추세</h3><p>{data.meta.startYear}~{data.meta.endYear}년 · 단위: 명 · 선택 지표를 진한 실선으로 표시</p></div><small>{number.format(market.startValue ?? 0)}명 → {number.format(market.value)}명 · {signedNumber(market.changeFromStart)}</small></header>
          <div className={styles.trendKey} aria-label="장기 추세 범례">
            <span><i className={styles.selectedLine} />{selectedLabel}<b>선택</b></span>
            <span><i className={styles.comparisonLine} />{comparisonLabel}</span>
          </div>
          <div className={styles.chartLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={longTrend} margin={{left:8,right:18,top:24,bottom:4}}>
                <CartesianGrid stroke="#e9ebf1" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(value) => `${value}년`} axisLine={false} tickLine={false} />
                <YAxis domain={["dataMin - 50000", "dataMax + 50000"]} tickFormatter={(value) => compact.format(value)} axisLine={false} tickLine={false} width={58} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    const point = payload?.[0]?.payload as (typeof longTrend)[number] | undefined;
                    if (!active || !point) return null;
                    return (
                      <div className={styles.chartTooltip}>
                        <strong>{label}년</strong>
                        <span>재적학생 {number.format(point.total)}명</span>
                        <span>재학생 {number.format(point.enrolled)}명</span>
                        <span>휴학생 {number.format(point.leave)}명</span>
                        <span>학위취득유예학생 {number.format(point.deferment)}명</span>
                      </div>
                    );
                  }}
                />
                <Line name={selectedLabel} type="monotone" dataKey={selectedKey} stroke={palette.purple} strokeWidth={3} dot={{r:4}} />
                <Line name={comparisonLabel} type="monotone" dataKey={comparisonKey} stroke={palette.teal} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>연도별 이동</span><h3>전년 대비 {selectedLabel} 증감</h3><p>첫 연도는 비교값 없음 · 단위: 명</p></div></header>
          <div className={styles.chartLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={annualChanges} margin={{left:8,right:12,top:24,bottom:4}}>
                <CartesianGrid stroke="#eceef3" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(value) => `${String(value).slice(2)}년`} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => compact.format(value)} axisLine={false} tickLine={false} width={58} />
                <ReferenceLine y={0} stroke={palette.ink} />
                <Tooltip formatter={(value) => signedNumber(Number(value))} labelFormatter={(label) => `${label}년`} />
                <Bar dataKey="annualChange" fill={palette.purpleLight} radius={[4,4,0,0]}>
                  {annualChanges.map((row) => (
                    <Cell key={row.year} fill={(row.annualChange ?? 0) >= 0 ? palette.teal : palette.orange} />
                  ))}
                  <LabelList dataKey="annualChange" position="top" formatter={(value) => value === null ? "" : signedNumber(Number(value))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className={styles.primaryCharts}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>상대 변화</span><h3>대학·전문대학 지수</h3><p>{data.meta.startYear}년=100 · 실제 학생 수는 툴팁에서 확인</p></div></header>
          <div className={styles.chartLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={indexedCategories} margin={{left:8,right:18,top:16,bottom:4}}>
                <CartesianGrid stroke="#eceef3" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(value) => `${String(value).slice(2)}년`} axisLine={false} tickLine={false} />
                <YAxis domain={["auto","auto"]} tickFormatter={(value) => Number(value).toFixed(0)} axisLine={false} tickLine={false} width={44} />
                <ReferenceLine y={100} stroke={palette.ink} strokeDasharray="4 4" />
                <Tooltip formatter={(value, name, item) => [`지수 ${Number(value).toFixed(1)} · ${number.format(Number(item.payload[`${String(name)}Actual`]))}명`, String(name)]} labelFormatter={(label) => `${label}년`} />
                <Legend formatter={(value) => String(value)} />
                <Line type="monotone" dataKey="대학" stroke={palette.purple} strokeWidth={3} dot={{r:3}} connectNulls={false} />
                <Line type="monotone" dataKey="전문대학" stroke={palette.teal} strokeWidth={3} strokeDasharray="6 4" dot={{r:3}} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={`${styles.panel} ${styles.wide}`}>
          <header className={styles.panelHeader}>
            <div>
              <span>장기 시장 규모</span>
              <h3>{data.meta.startYear}–{data.meta.selectedYear}년 학생 구성</h3>
              <p>같은 축에서 재학생·휴학생·학위취득유예학생 합계를 비교합니다.</p>
            </div>
            <small>단위: 명</small>
          </header>
          <div className={styles.chartLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.annual} margin={{ left: 8, right: 12, top: 8 }}>
                <CartesianGrid stroke="#e9ebf1" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(value) => `${value}년`} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => compact.format(value)} axisLine={false} tickLine={false} width={58} />
                <Tooltip
                  labelFormatter={(label) => `${label}년`}
                  formatter={(value, name) => [
                    `${number.format(Number(value))}명`,
                    name === "enrolled" ? "재학생" : name === "leave" ? "휴학생" : "학위취득유예학생",
                  ]}
                />
                <Legend formatter={(value) => value === "enrolled" ? "재학생" : value === "leave" ? "휴학생" : "학위취득유예학생"} />
                <Bar dataKey="enrolled" stackId="students" fill={palette.purple} radius={[4, 4, 0, 0]} />
                <Bar dataKey="leave" stackId="students" fill={palette.orange} />
                <Bar dataKey="deferment" stackId="students" fill={palette.muted} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span>학교 체제별 시장</span>
              <h3>대학·전문대학 구성</h3>
              <p>선택 지표의 규모, 점유율, 전년 변화입니다.</p>
            </div>
          </header>
          <SegmentRows rows={data.universityCategories} limit={4} />
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

function FieldsView({ data, selection }: { data: MarketAnalysisResponse; selection: string }) {
  const [level, setLevel] = useState<FieldLevel>("middle");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const levels: Array<{ id: FieldLevel; label: string; rows: MarketSegment[] }> = [
    { id: "large", label: "대계열", rows: data.fields },
    { id: "middle", label: "중계열", rows: data.fieldMiddles },
    { id: "small", label: "소계열", rows: data.fieldSmalls },
  ];
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
  const latest = data.annual.at(-1);

  return (
    <div className={styles.stack}>
      <section className={styles.fieldDefinition}>
        <div><Layers3 size={19} /><span>대학알리미 공식 표준분류</span></div>
        <strong>대계열 → 중계열 → 소계열</strong>
        <p>원본 Q·R·S열을 그대로 사용합니다. 상단에서 계열을 선택하면 모든 숫자와 차트가 함께 바뀝니다.</p>
      </section>

      <section className={styles.fieldKpiGrid} aria-label="선택 계열 시장 핵심 지표">
        <SummaryKpi label={`${data.meta.endYear}년 ${data.meta.metricLabel}`} value={`${number.format(market.value)}명`} note={selection} />
        <SummaryKpi label={`${data.meta.startYear}년 대비`} value={signedNumber(market.changeFromStart)} note={formatRate(market.changeRateFromStart)} />
        <SummaryKpi label="연평균 변화율" value={formatRate(market.cagr)} note={`${data.meta.startYear}~${data.meta.endYear}년`} />
        <SummaryKpi label="운영 학교" value={`${number.format(data.kpis.schoolCount.value)}개교`} note={`${latest ? number.format(latest.departmentCount) : "—"}개 학과 관측`} />
      </section>

      <section className={styles.twoColumns}>
        <article className={`${styles.panel} ${styles.wide}`}>
          <header className={styles.panelHeader}>
            <div><span>장기 추세</span><h3>{selection} {data.meta.metricLabel} 변화</h3><p>{data.meta.startYear}~{data.meta.endYear}년 · 상단 계열 필터와 연동 · 단위: 명</p></div>
            <small>{number.format(market.startValue ?? 0)}명 → {number.format(market.value)}명</small>
          </header>
          <div className={styles.chartLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.annual} margin={{ left: 8, right: 18, top: 18, bottom: 4 }}>
                <CartesianGrid stroke="#e9ebf1" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(value) => `${value}년`} axisLine={false} tickLine={false} />
                <YAxis domain={["dataMin - 1000", "dataMax + 1000"]} tickFormatter={(value) => compact.format(value)} axisLine={false} tickLine={false} width={58} />
                <Tooltip formatter={(value) => [`${number.format(Number(value))}명`, data.meta.metricLabel]} labelFormatter={(label) => `${label}년`} />
                <Line type="monotone" dataKey="value" name={data.meta.metricLabel} stroke={palette.purple} strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>대학구분</span><h3>대학·전문대학 구성</h3><p>선택한 계열 안에서 현재 규모와 비중을 비교합니다.</p></div></header>
          <SegmentRows rows={data.universityCategories} limit={4} />
        </article>
      </section>

      <article className={styles.panel}>
        <header className={styles.fieldExplorerHeader}>
          <div><span>계열 순위</span><h3>공식 분류별 시장 규모와 장기 변화</h3><p>현재 필터 결과 안에서 규모·비중·장기 증감을 비교합니다.</p></div>
          <label className={styles.fieldSearch}><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="계열명 검색" /></label>
        </header>
        <div className={styles.fieldLevelTabs} role="tablist" aria-label="계열 분류 단계">
          {levels.map((item) => (
            <button type="button" role="tab" aria-selected={level === item.id} key={item.id} onClick={() => { setLevel(item.id); setPage(1); }}>
              {item.label}<span>{number.format(item.rows.length)}</span>
            </button>
          ))}
        </div>
        <div className={styles.fieldRankingHeader} aria-hidden="true"><span>순위·계열명</span><span>현재 규모</span><span>현재 비중</span><span>{data.meta.startYear}년 대비</span><span>연평균 변화율</span></div>
        <div className={styles.fieldRanking}>
          {visibleRows.map((row) => (
            <div key={row.name}>
              <span className={styles.rank}>{String(row.rank).padStart(2, "0")}</span>
              <strong title={row.name}>{row.name}</strong>
              <b><small>현재</small>{number.format(row.value)}명</b>
              <span><small>비중</small>{percent.format(row.share)}</span>
              <span className={(row.changeFromStart ?? 0) >= 0 ? styles.rateUp : styles.rateDown}><small>장기</small>{signedNumber(row.changeFromStart)}</span>
              <span><small>연평균</small>{formatRate(row.cagr)}</span>
            </div>
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
        <SegmentRows rows={data.regions} limit={10} showAbsoluteChange changeMode="long" startYear={data.meta.startYear} endYear={data.meta.endYear} />
      </article>
    </div>
  );
}

function CompetitionView({ data }: { data: MarketAnalysisResponse }) {
  const hhiLevel = data.kpis.hhi.value < 1_000 ? "분산 시장" : data.kpis.hhi.value < 1_800 ? "중간 집중" : "고집중";
  return (
    <div className={styles.stack}>
      <section className={styles.competitionKpis}>
        <div><span>시장 집중도 HHI</span><strong>{data.kpis.hhi.value.toFixed(0)}</strong><small>{hhiLevel}</small></div>
        <div><span>상위 10개교 점유율</span><strong>{percent.format(data.kpis.top10Share.value)}</strong><small>선택 지표 기준</small></div>
        <div><span>활동 학교 수</span><strong>{number.format(data.kpis.schoolCount.value)}</strong><small>본·분교 기준</small></div>
      </section>

      <section className={styles.twoColumns}>
        <article className={`${styles.panel} ${styles.wide}`}>
          <header className={styles.panelHeader}>
            <div><span>경쟁 구조</span><h3>학교 집중도 변화</h3><p>HHI와 상위 10개교 점유율을 각각 확인합니다. HHI 1,000 미만은 일반적으로 분산 구조로 해석합니다.</p></div>
          </header>
          <div className={styles.dualCharts}>
            <div>
              <h4>HHI</h4>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.annual} margin={{ left: 2, right: 8 }}>
                  <CartesianGrid stroke="#eceef3" vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(value) => String(value).slice(2)} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(value) => Number(value).toFixed(0)} labelFormatter={(label) => `${label}년`} />
                  <Bar dataKey="hhi" fill={palette.blue} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4>상위 10개교 점유율</h4>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.annual} margin={{ left: 2, right: 8 }}>
                  <CartesianGrid stroke="#eceef3" vertical={false} />
                  <XAxis dataKey="year" tickFormatter={(value) => String(value).slice(2)} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(value) => percent.format(Number(value))} labelFormatter={(label) => `${label}년`} />
                  <Bar dataKey="top10Share" fill={palette.teal} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>지역 시장</span><h3>지역별 재적학생과 장기 변화</h3><p>현재 규모·점유율과 {data.meta.startYear}년 대비 증감을 비교합니다.</p></div></header>
          <SegmentRows rows={data.regions} limit={10} showAbsoluteChange changeMode="long" startYear={data.meta.startYear} endYear={data.meta.endYear} />
        </article>
      </section>

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
}: {
  baseQuery: string;
  metric: MarketMetric;
  view?: Tab;
  fieldSelection?: string;
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
          {view === "fields" && <FieldsView data={data} selection={fieldSelection} />}
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
