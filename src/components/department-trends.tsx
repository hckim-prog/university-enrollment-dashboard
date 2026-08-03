"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  GitCompareArrows,
  Network,
  RefreshCw,
  School,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DepartmentTrendResponse,
  GroupTrend,
  IndividualTrend,
  LifecycleEventType,
  TrendType,
} from "@/lib/department-trends";
import styles from "./department-trends.module.css";

type TrendTab = "groups" | "individuals" | "lifecycle";
type BreakdownDimension = "region" | "establishment" | "field" | "group";

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
const colors = [
  "#5b5bd6",
  "#7c7ce2",
  "#a6a6eb",
  "#b76b35",
  "#d18b58",
  "#e4b48f",
];

function formatChange(value: number | null) {
  if (value === null) return "비교 기준 없음";
  return `${value >= 0 ? "+" : ""}${number.format(value)}명`;
}

function formatRate(value: number | null) {
  return value === null ? "기준 없음" : percent.format(value);
}

function ChangeValue({
  value,
  rate,
}: {
  value: number | null;
  rate: number | null;
}) {
  if (value === null) return <span className={styles.neutralPill}>비교 기준 없음</span>;
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`${styles.changePill} ${positive ? styles.up : styles.down}`}>
      <Icon size={13} />
      {formatChange(value)} · {formatRate(rate)}
    </span>
  );
}

function Help({ label, children }: { label: string; children: string }) {
  return (
    <details className={styles.help}>
      <summary aria-label={`${label} 도움말`} title={`${label} 도움말`}>
        <CircleHelp size={14} />
      </summary>
      <p>{children}</p>
    </details>
  );
}

function SummaryCard({
  eyebrow,
  group,
  kind,
  comparison = "recent",
}: {
  eyebrow: string;
  group: GroupTrend | null;
  kind: "change" | "schools" | "new";
  comparison?: "recent" | "long";
}) {
  return (
    <article className={styles.summaryCard}>
      <span>{eyebrow}</span>
      <strong title={group?.name}>{group?.name ?? "해당 없음"}</strong>
      {group ? (
        kind === "change" ? (
          <ChangeValue
            value={comparison === "long" ? group.changeFromStart : group.change}
            rate={comparison === "long" ? group.changeRateFromStart : group.changeRate}
          />
        ) : kind === "schools" ? (
          <p>운영 학교 {group.schoolChange && group.schoolChange > 0 ? "+" : ""}{group.schoolChange ?? 0}개교</p>
        ) : (
          <p>공시 신설 관측 {number.format(group.disclosedNewCount)}건</p>
        )
      ) : null}
    </article>
  );
}

function GroupRanking({
  title,
  rows,
  onFocus,
  comparison = "recent",
}: {
  title: string;
  rows: GroupTrend[];
  onFocus: (id: string) => void;
  comparison?: "recent" | "long";
}) {
  const selectedChange = (row: GroupTrend) =>
    comparison === "long" ? row.changeFromStart : row.change;
  const selectedRate = (row: GroupTrend) =>
    comparison === "long" ? row.changeRateFromStart : row.changeRate;
  const maximum = Math.max(...rows.map((row) => Math.abs(selectedChange(row) ?? 0)), 1);
  return (
    <article className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><span>학과군 순위</span><h3>{title}</h3></div>
        <small>클릭하면 기여 학과를 확인합니다</small>
      </div>
      <div className={styles.groupRanking}>
        {rows.map((row, index) => (
          <button type="button" key={row.id} onClick={() => onFocus(row.id)}>
            <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.groupRankName} title={row.name}>{row.name}</span>
            <small className={styles.groupRankMeta}>
              시작 {number.format(row.startValue ?? 0)}명 · 현재 {number.format(row.selectedValue)}명 · CAGR {formatRate(row.cagr)} · 학교 {row.schoolChangeFromStart && row.schoolChangeFromStart > 0 ? "+" : ""}{row.schoolChangeFromStart ?? 0}개
            </small>
            <span className={styles.rankBar}>
              <i style={{ width: `${(Math.abs(selectedChange(row) ?? 0) / maximum) * 100}%` }} />
            </span>
            <ChangeValue value={selectedChange(row)} rate={selectedRate(row)} />
          </button>
        ))}
      </div>
    </article>
  );
}

function DepartmentDetail({ row }: { row: IndividualTrend }) {
  return (
    <div className={styles.expandedDetail}>
      <div>
        <span>전체 학과명</span><strong>{row.department}</strong>
      </div>
      <div><span>주야</span><strong>{row.dayNight || "미상"}</strong></div>
      <div><span>학과특성</span><strong>{row.departmentFeature || "일반"}</strong></div>
      <div><span>재학생</span><strong>{number.format(row.enrolled)}명</strong></div>
      <div><span>휴학생</span><strong>{number.format(row.leave)}명</strong></div>
      <div><span>재적학생</span><strong>{number.format(row.total)}명</strong></div>
      {row.possibleMatch ? (
        <p><AlertTriangle size={14} /> 이전 연도의 ‘{row.possibleMatch}’과 명칭 변경 가능성이 있으나 자동 연결하지 않았습니다.</p>
      ) : null}
    </div>
  );
}

function IndividualRows({
  data,
  expanded,
  onExpand,
}: {
  data: DepartmentTrendResponse;
  expanded: string;
  onExpand: (key: string) => void;
}) {
  return (
    <>
      <div className={styles.trendTableWrap}>
        <table className={styles.trendTable}>
          <thead><tr>
            <th>학교·학과</th><th>지역·계열</th><th>비교상태</th>
            {data.meta.years.map((year) => <th key={year}>{year}년</th>)}
            <th>{data.meta.comparisonLabel} 증감</th><th>추세 유형</th><th>비교 신뢰</th>
          </tr></thead>
          <tbody>
            {data.individuals.map((row) => (
              <tr key={row.key}>
                <td>
                  <button className={styles.departmentButton} type="button" onClick={() => onExpand(row.key)} title={row.department}>
                    <strong>{row.department}</strong><span>{row.school} · {row.college}</span>
                  </button>
                  {expanded === row.key ? <DepartmentDetail row={row} /> : null}
                </td>
                <td>{row.region}<br /><small>{row.field}</small></td>
                <td><span className={styles.status}>{row.comparisonStatus}</span></td>
                {data.meta.years.map((year) => <td className={styles.numeric} key={year}>{row.values[year] === null ? "—" : number.format(row.values[year] ?? 0)}</td>)}
                <td><ChangeValue value={row.displayChange} rate={row.displayRate} /></td>
                <td><span className={styles.trendType}>{row.trendLabel}</span></td>
                <td><span className={row.comparisonStatus === "정확 비교" ? styles.reliable : styles.caution}>{row.comparisonStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.mobileTrendCards}>
        {data.individuals.map((row) => (
          <article key={row.key} className={styles.trendCard}>
            <button type="button" onClick={() => onExpand(row.key)} title={row.department}>
              <span>{row.school} · {row.region}</span>
              <strong>{row.department}</strong>
            </button>
            <div className={styles.yearValues}>
              {data.meta.years.map((year) => <div key={year}><span>{year}</span><strong>{row.values[year] === null ? "—" : number.format(row.values[year] ?? 0)}</strong></div>)}
            </div>
            <div className={styles.cardFoot}><ChangeValue value={row.displayChange} rate={row.displayRate} /><span className={styles.trendType}>{row.trendLabel}</span></div>
            <p className={row.comparisonStatus === "정확 비교" ? styles.reliable : styles.caution}>{row.comparisonStatus}</p>
            {expanded === row.key ? <DepartmentDetail row={row} /> : null}
          </article>
        ))}
      </div>
    </>
  );
}

const lifecycleColors: Record<LifecycleEventType, string> = {
  disclosed_new: "#5b5bd6",
  disclosed_closed: "#d05f78",
  restructured: "#e78b42",
  observed_new: "#0f9f83",
  observed_exit: "#7f8596",
};

export function DepartmentTrends({ baseQuery }: { baseQuery: string }) {
  const [tab, setTab] = useState<TrendTab>("groups");
  const [metric, setMetric] = useState("total");
  const [period, setPeriod] = useState("sinceStart");
  const [minimumPrevious, setMinimumPrevious] = useState(30);
  const [minimumChange, setMinimumChange] = useState(20);
  const [minimumRate, setMinimumRate] = useState(10);
  const [minimumStartValue, setMinimumStartValue] = useState(5_000);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [focusGroup, setFocusGroup] = useState("");
  const [trendType, setTrendType] = useState<TrendType>("persistent_up");
  const [breakdown, setBreakdown] = useState<BreakdownDimension>("group");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState("");
  const [data, setData] = useState<DepartmentTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const effectiveTrendType = trendType;

  const query = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.set("trendMetric", metric);
    params.set("comparison", period);
    params.set("minimumPrevious", String(minimumPrevious));
    params.set("minimumChange", String(minimumChange));
    params.set("minimumRate", String(minimumRate / 100));
    params.set("minimumStartValue", String(minimumStartValue));
    params.set("includeClosed", String(includeClosed));
    params.set("trendType", effectiveTrendType);
    params.set("trendPage", String(page));
    params.set("trendPageSize", "20");
    if (groupId) params.set("departmentGroup", groupId);
    if (focusGroup) params.set("focusGroup", focusGroup);
    return params.toString();
  }, [baseQuery, effectiveTrendType, focusGroup, groupId, includeClosed, metric, minimumChange, minimumPrevious, minimumRate, minimumStartValue, page, period]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/department-trends?${query}`, { signal });
      if (!response.ok) throw new Error("trend_request_failed");
      setData((await response.json()) as DepartmentTrendResponse);
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") {
        setError("학과 트렌드 분석 서버에 연결할 수 없습니다. 개발 서버 상태를 확인해 주세요.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const setAnalysisFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setExpanded("");
  };
  const focus = (id: string) => {
    setFocusGroup(id);
    window.setTimeout(() => document.getElementById("group-drilldown")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  if (error) {
    return <div className={styles.state}><AlertTriangle size={26} /><strong>분석 결과를 불러오지 못했습니다.</strong><p>{error}</p><button type="button" onClick={() => load()}><RefreshCw size={15} /> 다시 시도</button></div>;
  }
  if (!data) {
    return <div className={styles.state}><span className={styles.loader} /><strong>18만여 행을 서버에서 분석하고 있습니다.</strong><p>대학·전문대학 학과군 분류와 장기 연도 연결을 계산합니다.</p></div>;
  }

  const comparisonChange = (group: GroupTrend) =>
    period === "sinceStart" ? group.changeFromStart : group.change;
  const comparisonRate = (group: GroupTrend) =>
    period === "sinceStart" ? group.changeRateFromStart : group.changeRate;
  const comparableGroups = data.groups.filter(
    (group) =>
      group.id !== "other" &&
      (period !== "sinceStart" || (group.startValue ?? 0) >= minimumStartValue),
  );
  const increaseGroups = comparableGroups.filter((group) => (comparisonChange(group) ?? 0) > 0).toSorted((a, b) => (comparisonChange(b) ?? 0) - (comparisonChange(a) ?? 0)).slice(0, 5);
  const decreaseGroups = comparableGroups.filter((group) => (comparisonChange(group) ?? 0) < 0).toSorted((a, b) => (comparisonChange(a) ?? 0) - (comparisonChange(b) ?? 0)).slice(0, 5);
  const lineGroups = [...increaseGroups.slice(0, 3), ...decreaseGroups.slice(0, 3)];
  const lineData = data.meta.years.map((year) => ({
    year,
    ...Object.fromEntries(lineGroups.map((group) => [group.name, group.annual.find((point) => point.year === year)?.value ?? null])),
  }));
  const quadrantData = comparableGroups.filter((group) => comparisonRate(group) !== null).map((group) => ({
    x: period === "sinceStart" ? (group.schoolChangeFromStart ?? 0) : (group.schoolChange ?? 0),
    y: (comparisonRate(group) ?? 0) * 100,
    z: group.selectedValue,
    name: group.name,
    id: group.id,
    quadrant: group.quadrant,
  }));
  const focusedGroup = data.groups.find((group) => group.id === data.drilldown.groupId) ?? data.summaries.topIncrease;
  const componentData = focusedGroup ? [{ name: focusedGroup.name, ...focusedGroup.components }] : [];
  const breakdownRows = data.lifecycle.breakdowns[breakdown];
  const breakdownHeight = Math.max(320, breakdownRows.slice(0, 12).length * 38);

  return (
    <section className={`${styles.trendShell} ${loading ? styles.loading : ""}`}>
      <div className={styles.methodNotice}><AlertTriangle size={17} /><p><strong>해석 주의</strong> {data.meta.methodologyNote}</p></div>
      <div className={styles.tabBar} role="tablist" aria-label="학과 트렌드 분석 탭">
        {([
          ["groups", "학과군 트렌드", Network],
          ["individuals", "개별 학과 변화", GitCompareArrows],
          ["lifecycle", "학과 관측 이동", Sparkles],
        ] as const).map(([id, label, Icon]) => <button type="button" role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}
      </div>

      <details className={styles.analysisFilters}>
        <summary><span><SlidersHorizontal size={17} /><strong>분석 기준</strong></span><span>{data.meta.metricLabel} · {data.meta.startYear}~{data.meta.endYear} · 시작 규모 {number.format(minimumStartValue)}명<ChevronDown size={16} /></span></summary>
        <div className={styles.criteriaGrid}>
          <label><span>목록 학과군</span><select value={groupId} onChange={(event) => setAnalysisFilter(setGroupId, event.target.value)}><option value="">전체 학과군</option>{data.meta.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label><span>분석 지표</span><select value={metric} onChange={(event) => setAnalysisFilter(setMetric, event.target.value)}><option value="total">재적학생</option><option value="enrolled">재학생</option></select></label>
          <label><span>비교 기간</span><select value={period} onChange={(event) => setAnalysisFilter(setPeriod, event.target.value)}><option value="recent">최근 1년</option><option value="sinceStart">장기 시작연도 대비</option></select></label>
          <label><span>최소 전년도 학생 수</span><input type="number" min="0" value={minimumPrevious} onChange={(event) => { setMinimumPrevious(Number(event.target.value)); setPage(1); }} /></label>
          <label><span>최소 증감 인원</span><input type="number" min="0" value={minimumChange} onChange={(event) => { setMinimumChange(Number(event.target.value)); setPage(1); }} /></label>
          <label><span>최소 증감률</span><div className={styles.inputUnit}><input type="number" min="0" step="1" value={minimumRate} onChange={(event) => { setMinimumRate(Number(event.target.value)); setPage(1); }} /><span>%</span></div></label>
          <label><span>학과군 최소 시작 규모</span><input type="number" min="0" step="500" value={minimumStartValue} onChange={(event) => { setMinimumStartValue(Number(event.target.value)); setPage(1); }} /></label>
          <label className={styles.checkLabel}><input type="checkbox" checked={includeClosed} onChange={(event) => { setIncludeClosed(event.target.checked); setPage(1); }} /><span>비교상 이탈 포함</span></label>
          <div className={styles.criteriaHelp}><Help label="분석 기준">개별 학과 기본값은 전년도 30명 이상, 절대 증감 20명 이상, 증감률 10% 이상입니다. 학과군 장기 순위는 별도로 시작연도 5,000명 이상을 적용합니다.</Help><span>학과군 최소 시작 규모는 장기 강조 순위에만 적용되며 ‘기타·미분류’는 합계에는 포함하고 강조 순위에서는 제외합니다.</span></div>
        </div>
      </details>

      {data.totals.selectedValue === 0 ? (
        <div className={styles.state}><SearchX size={27} /><strong>조건에 맞는 학과 트렌드가 없습니다.</strong><p>상단 기본 필터나 분석 기준을 완화해 보세요.</p></div>
      ) : tab === "groups" ? (
        <div className={styles.stack}>
          <div className={styles.summaryGrid}>
            <SummaryCard eyebrow={`${data.meta.startYear}년 대비 증가 1위`} group={increaseGroups[0] ?? null} kind="change" comparison="long" />
            <SummaryCard eyebrow={`${data.meta.startYear}년 대비 감소 1위`} group={decreaseGroups[0] ?? null} kind="change" comparison="long" />
            <SummaryCard eyebrow="운영 학교 확산 1위" group={data.summaries.topSchoolExpansion} kind="schools" />
          </div>
          <article className={styles.coverageStrip}>
            <div><strong>{percent.format(data.coverage.valueRate)}</strong><span>학생 규모 분류</span></div>
            <div><strong>{number.format(data.coverage.classifiedRows)} / {number.format(data.coverage.totalRows)}</strong><span>학과 관측 분류</span></div>
            <p><CircleHelp size={14} /> 분류 근거가 불충분한 {number.format(data.coverage.totalRows - data.coverage.classifiedRows)}개 관측은 ‘기타·미분류’로 보존했습니다.</p>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>{data.meta.comparisonLabel}</span><h3>변화 폭이 큰 학과군의 학생 수 추세</h3></div><small>선택 연도 이후 데이터 제외 · 단위: 명</small></div>
            <div className={styles.largeChart}><ResponsiveContainer width="100%" height="100%"><LineChart data={lineData} margin={{ left: 8, right: 16 }}><CartesianGrid stroke="#e8eaf0" vertical={false} /><XAxis dataKey="year" tickFormatter={(value) => `${value}년`} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compact.format(value)} axisLine={false} tickLine={false} width={62} /><Tooltip formatter={(value, name) => [`${number.format(Number(value))}명`, name]} labelFormatter={(label) => `${label}년`} />{lineGroups.map((group, index) => <Line key={group.id} type="monotone" dataKey={group.name} stroke={colors[index]} strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} />)}</LineChart></ResponsiveContainer></div>
            <div className={styles.directSeriesLabels}>{lineGroups.map((group, index) => <button type="button" key={group.id} onClick={() => focus(group.id)}><i style={{ background: colors[index] }} />{group.name}</button>)}</div>
          </article>
          <div className={styles.twoColumns}><GroupRanking title={`${period === "sinceStart" ? "장기" : "최근 1년"} 증가 학과군`} rows={increaseGroups} onFocus={focus} comparison={period === "sinceStart" ? "long" : "recent"} /><GroupRanking title={`${period === "sinceStart" ? "장기" : "최근 1년"} 감소 학과군`} rows={decreaseGroups} onFocus={focus} comparison={period === "sinceStart" ? "long" : "recent"} /></div>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>확산도 사분면</span><h3>학생 변화와 운영 학교 수 변화를 함께 보기</h3></div><small>원 크기: {data.meta.selectedYear}년 {data.meta.metricLabel}</small></div>
            <div className={styles.quadrantLayout}>
              <div className={styles.quadrantChart}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 18, right: 20, bottom: 18, left: 8 }}><CartesianGrid stroke="#e8eaf0" /><XAxis type="number" dataKey="x" name="운영 학교 수 증감" unit="개교" axisLine={false} tickLine={false} /><YAxis type="number" dataKey="y" name="학생 수 증감률" unit="%" axisLine={false} tickLine={false} width={56} /><ZAxis type="number" dataKey="z" range={[70, 650]} /><ReferenceLine x={0} stroke="#9195a4" /><ReferenceLine y={0} stroke="#9195a4" /><Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value, name) => [name === "학생 수 증감률" ? `${Number(value).toFixed(1)}%` : name === "운영 학교 수 증감" ? `${value}개교` : `${number.format(Number(value))}명`, name]} /><Scatter data={quadrantData}>{quadrantData.map((point) => <Cell key={point.id} cursor="pointer" onClick={() => focus(point.id)} fill={point.x > 0 && point.y > 0 ? "#0f9f83" : point.x < 0 && point.y < 0 ? "#d05f78" : "#7777e7"} />)}</Scatter></ScatterChart></ResponsiveContainer></div>
              <ul className={styles.quadrantGuide}><li><i className={styles.green} /><strong>확산 성장</strong><span>학생과 운영 학교가 함께 증가</span></li><li><i className={styles.purple} /><strong>기존 학과 집중 성장</strong><span>학생은 증가, 학교 수는 정체·감소</span></li><li><i className={styles.orange} /><strong>공급 확산·규모 확인 필요</strong><span>학교는 증가하지만 평균 규모 확인 필요</span></li><li><i className={styles.red} /><strong>축소 관측</strong><span>학생과 운영 학교가 함께 감소</span></li></ul>
            </div>
          </article>
          <div className={styles.twoColumns} id="group-drilldown">
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span>변화 구성</span><h3>{focusedGroup?.name ?? "학과군"} 증감 분해</h3></div><small>구성 합계 = 학과군 순증감</small></div>
              <div className={styles.compositionChart}><ResponsiveContainer width="100%" height="100%"><BarChart data={componentData} layout="vertical" margin={{ left: 8, right: 15 }}><CartesianGrid stroke="#e8eaf0" horizontal={false} /><XAxis type="number" tickFormatter={(value) => compact.format(value)} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, name) => [`${number.format(Number(value))}명`, { comparableIncrease: "기존 학과 증가", comparableDecrease: "기존 학과 감소", observedNew: "비교상 신규", observedExit: "비교상 이탈" }[String(name) as "comparableIncrease" | "comparableDecrease" | "observedNew" | "observedExit"]]} /><Legend formatter={(value) => ({ comparableIncrease: "기존 증가", comparableDecrease: "기존 감소", observedNew: "비교상 신규", observedExit: "비교상 이탈" }[value as "comparableIncrease" | "comparableDecrease" | "observedNew" | "observedExit"])} /><Bar dataKey="comparableIncrease" stackId="change" fill="#0f9f83" /><Bar dataKey="observedNew" stackId="change" fill="#68bda9" /><Bar dataKey="comparableDecrease" stackId="change" fill="#d05f78" /><Bar dataKey="observedExit" stackId="change" fill="#9ca0ad" /></BarChart></ResponsiveContainer></div>
              <p className={styles.explain}>새 원본에는 학과상태가 없으므로 동일 비교키의 전년 대비 신규·이탈 관측만 분리합니다.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span>드릴다운</span><h3>{data.drilldown.groupName ?? "학과군"} 기여 학교·학과</h3></div><small>정확 연결 가능한 키 기준</small></div>
              <div className={styles.drillGrid}><div><strong>증가 기여 학교</strong>{data.drilldown.topIncreaseSchools.slice(0, 5).map((row) => <p key={row.name}><span title={row.name}>{row.name}</span><b>+{number.format(row.change)}명</b></p>)}</div><div><strong>감소 기여 학교</strong>{data.drilldown.topDecreaseSchools.slice(0, 5).map((row) => <p key={row.name}><span title={row.name}>{row.name}</span><b>{number.format(row.change)}명</b></p>)}</div></div>
              <div className={styles.schoolChangeList}><span>새로 관측된 학교 {data.drilldown.newSchools.length}개</span><span>이탈 관측 학교 {data.drilldown.exitedSchools.length}개</span><span>비교 가능 학과 평균 {formatChange(data.drilldown.comparableAverageChange === null ? null : Math.round(data.drilldown.comparableAverageChange))}</span></div>
              <div className={styles.topDepartmentList}>{data.drilldown.topDepartments.slice(0, 5).map((row) => <button type="button" key={row.key} onClick={() => { setTab("individuals"); setGroupId(row.groupId); setTrendType(row.trendType); }}><span title={row.department}>{row.department}<small>{row.school}</small></span><ChangeValue value={row.recentChange} rate={row.recentRate} /></button>)}</div>
            </article>
          </div>
        </div>
      ) : tab === "individuals" ? (
        <div className={styles.stack}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>추세 유형</span><h3>학교별 개별 학과 변화</h3></div><small>학교 + 단과대학 + 학과명 + 주야 + 학과특성 키</small></div>
            <div className={styles.typeFilters}>{data.meta.trendTypes.filter((type) => type.id !== "stable").map((type) => <button type="button" aria-pressed={effectiveTrendType === type.id} key={type.id} onClick={() => { setTrendType(type.id); setPage(1); setExpanded(""); }}>{type.label}<span>{number.format(type.count)}</span></button>)}</div>
            <div className={styles.listMeta}><span>{data.meta.metricLabel} · {data.meta.comparisonLabel}</span><strong>{number.format(data.individualPagination.total)}개 학과 관측</strong><Help label="학과 관측 수">학교·단과대학·정규화한 학과명·주야·학과특성이 같은 한 건을 학과 관측 1개로 계산합니다. 이름이 비슷하다는 이유만으로 자동 합치지 않습니다.</Help></div>
            {data.individuals.length ? <IndividualRows data={data} expanded={expanded} onExpand={(key) => setExpanded((current) => current === key ? "" : key)} /> : <div className={styles.inlineEmpty}><SearchX size={22} /><strong>이 유형에 해당하는 학과가 없습니다.</strong><span>최소 기준값이나 학과군 필터를 조정해 보세요.</span></div>}
            <div className={styles.pagination}><button type="button" disabled={page <= 1} onClick={() => setPage(1)} aria-label="처음 페이지">«</button><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> 이전</button><span><strong>{data.individualPagination.page}</strong> / {data.individualPagination.pages} 페이지</span><button type="button" disabled={page >= data.individualPagination.pages} onClick={() => setPage((value) => Math.min(data.individualPagination.pages, value + 1))}>다음 <ChevronRight size={16} /></button><button type="button" disabled={page >= data.individualPagination.pages} onClick={() => setPage(data.individualPagination.pages)} aria-label="마지막 페이지">»</button></div>
          </article>
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.lifecycleCards}>{([
            ["observed_new", "비교상 신규 관측", TrendingUp], ["observed_exit", "비교상 이탈 관측", ArrowDownRight],
          ] as const).map(([id, label, Icon]) => <article key={id}><Icon size={18} /><span>{label}</span><strong>{number.format(data.lifecycle.counts[id])}</strong><small>학과 관측</small></article>)}</div>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>구조 변화 비교</span><h3>지역·설립·계열·학과군별 관측 이동</h3></div><select aria-label="학과 관측 이동 분석 차원" value={breakdown} onChange={(event) => setBreakdown(event.target.value as BreakdownDimension)}><option value="group">학과군</option><option value="region">지역</option><option value="establishment">설립구분</option><option value="field">계열</option></select></div>
            <div className={styles.lifecycleChart} style={{ height: breakdownHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart data={breakdownRows.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 10 }}><CartesianGrid stroke="#e8eaf0" horizontal={false} /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Legend /><Bar dataKey="observedNew" name="비교상 신규" stackId="events" fill={lifecycleColors.observed_new} /><Bar dataKey="observedExit" name="비교상 이탈" stackId="events" fill={lifecycleColors.observed_exit} /></BarChart></ResponsiveContainer></div>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><span>{data.meta.comparisonLabel}</span><h3>비교상 신규·이탈 학과 사례</h3></div><small>학생 규모 상위 60건</small></div>
            <div className={styles.lifecycleExplanation}><p><strong>비교상 신규·이탈</strong> 같은 학교코드·본분교·학과코드·주야·학과특성 키가 전년 또는 선택 연도에 없다는 뜻입니다.</p><p><strong>해석 주의</strong> 명칭·코드·분류 변경일 수 있으므로 실제 신설·폐과로 단정하지 않습니다.</p></div>
            <div className={styles.eventList}>{data.lifecycle.events.map((event, index) => <article key={`${event.type}-${event.school}-${event.department}-${index}`}><i style={{ background: lifecycleColors[event.type] }} /><div><span>{event.label} · {event.groupName}</span><strong title={event.department}>{event.department}</strong><small>{event.school} · {event.region} · {event.field}</small></div><b>{number.format(event.studentValue)}명</b></article>)}</div>
          </article>
        </div>
      )}
      <footer className={styles.analysisFoot}><div><School size={15} /><span>기준연도 {data.meta.selectedYear}년</span></div><div><Users size={15} /><span>{data.meta.metricLabel} {number.format(data.totals.selectedValue)}명</span></div><div><Building2 size={15} /><span>학과군 합계 검산 {data.validation.groupTotalMatches && data.validation.contributionMatches ? "일치" : "확인 필요"}</span></div></footer>
    </section>
  );
}
