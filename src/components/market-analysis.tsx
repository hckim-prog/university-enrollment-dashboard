"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleAlert,
  Gauge,
  Layers3,
  RefreshCw,
  School,
  SearchX,
  Target,
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
  return value === null ? "비교 불가" : percent.format(value);
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

function KpiCard({
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
}: {
  rows: MarketSegment[];
  limit?: number;
  showAbsoluteChange?: boolean;
}) {
  const max = Math.max(...rows.slice(0, limit).map((row) => row.value), 1);
  return (
    <div className={styles.segmentRows}>
      {rows.slice(0, limit).map((row) => (
        <div className={styles.segmentRow} key={row.name}>
          <span className={styles.rank}>{String(row.rank).padStart(2, "0")}</span>
          <div className={styles.segmentName}>
            <strong title={row.name}>{row.name}</strong>
            <div><i style={{ width: `${(row.value / max) * 100}%` }} /></div>
          </div>
          <div className={styles.segmentMetric}>
            <b>{compact.format(row.value)}</b>
            <small>{percent.format(row.share)}</small>
          </div>
          <span
            className={`${styles.rateText} ${(row.changeRate ?? 0) >= 0 ? styles.rateUp : styles.rateDown}`}
          >
            {showAbsoluteChange && row.change !== null
              ? `${row.change >= 0 ? "+" : ""}${number.format(row.change)}명`
              : formatRate(row.changeRate)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryView({ data }: { data: MarketAnalysisResponse }) {
  return (
    <div className={styles.stack}>
      <section className={styles.kpiGrid} aria-label="시장 핵심 지표">
        <KpiCard
          label={`${data.meta.metricLabel} 시장 규모`}
          description={`${data.meta.selectedYear}년 전체 합계`}
          value={data.kpis.marketSize}
          icon={Users}
        />
        <KpiCard
          label="재학생"
          description="실제 재학 중인 학생"
          value={data.kpis.enrolled}
          icon={School}
        />
        <KpiCard
          label="휴학생 비중"
          description="휴학생 ÷ 재적학생"
          value={data.kpis.leaveRate}
          icon={Activity}
          format="percent"
          inverse
        />
        <KpiCard
          label="정원 대비 재학생"
          description="정원외 포함·공식 충원율 아님"
          value={data.kpis.capacityRatio}
          icon={Target}
          format="percent"
          unavailable={!data.kpis.capacityRatio.available}
        />
        <KpiCard
          label="활동 학교"
          description="재적학생 1명 이상 본·분교"
          value={data.kpis.schoolCount}
          icon={Building2}
          format="index"
        />
        <KpiCard
          label="상위 10개교 점유율"
          description="학교 시장 집중도 보조지표"
          value={data.kpis.top10Share}
          icon={Gauge}
          format="percent"
        />
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

      <section className={styles.insightGrid}>
        {data.insights.map((insight) => (
          <article className={`${styles.insight} ${styles[insight.tone]}`} key={insight.id}>
            <span>{insight.tone === "caution" ? <CircleAlert size={17} /> : <Activity size={17} />}</span>
            <div>
              <small>분석 신호</small>
              <h4>{insight.title}</h4>
              <strong>{insight.value}</strong>
              <p>{insight.body}</p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function FieldsView({ data }: { data: MarketAnalysisResponse }) {
  const scatter = data.portfolio.map((row) => ({
    ...row,
    sharePercent: row.share * 100,
    changePercent: (row.changeRate ?? 0) * 100,
  }));
  return (
    <div className={styles.stack}>
      <section className={styles.hierarchyGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>대계열</span><h3>시장 포트폴리오</h3><p>현재 규모와 전년 변화율</p></div></header>
          <SegmentRows rows={data.fields} limit={7} />
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>중계열</span><h3>세부 시장 상위 분야</h3><p>표준분류 중계열 기준</p></div></header>
          <SegmentRows rows={data.fieldMiddles} limit={8} />
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>소계열</span><h3>학과 시장 상위 분야</h3><p>표준분류 소계열 기준</p></div></header>
          <SegmentRows rows={data.fieldSmalls} limit={8} />
        </article>
      </section>

      <section className={styles.twoColumns}>
        <article className={`${styles.panel} ${styles.wide}`}>
          <header className={styles.panelHeader}>
            <div><span>중계열 포트폴리오</span><h3>점유율과 전년 성장률</h3><p>점 하나는 중계열이며, 점 크기는 현재 학생 규모입니다. 0%선 위는 성장, 아래는 축소입니다.</p></div>
            <small>단위: %</small>
          </header>
          <div className={styles.chartLarge}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 6, right: 18, top: 12, bottom: 6 }}>
                <CartesianGrid stroke="#e9ebf1" />
                <XAxis type="number" dataKey="sharePercent" name="점유율" unit="%" axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="changePercent" name="전년 성장률" unit="%" axisLine={false} tickLine={false} width={52} />
                <ZAxis type="number" dataKey="value" range={[70, 700]} name="학생 규모" />
                <ReferenceLine y={0} stroke={palette.ink} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: "4 4" }}
                  formatter={(value, name) => [
                    name === "학생 규모" ? `${number.format(Number(value))}명` : `${Number(value).toFixed(1)}%`,
                    name,
                  ]}
                  labelFormatter={(_, payload) => payload[0]?.payload?.name ?? ""}
                />
                <Scatter data={scatter} fill={palette.purple} stroke="#3f3fa8" fillOpacity={0.72} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>증감 기여</span><h3>대계열별 시장 변화</h3><p>전년 대비 전체 증감을 구성한 인원입니다.</p></div></header>
          <div className={styles.contributionList}>
            {data.contribution.map((row) => (
              <div key={row.name}>
                <span title={row.name}>{row.name}</span>
                <b className={row.change >= 0 ? styles.rateUp : styles.rateDown}>
                  {row.change >= 0 ? "+" : ""}{number.format(row.change)}명
                </b>
                <small>{row.contributionRate === null ? "변동 비중 비교 불가" : `절대 변동의 ${percent.format(row.contributionRate)}`}</small>
              </div>
            ))}
          </div>
        </article>
      </section>
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
          <header className={styles.panelHeader}><div><span>지역 시장</span><h3>재적학생 상위 지역</h3><p>현재 점유율과 전년 변화율</p></div></header>
          <SegmentRows rows={data.regions} limit={10} />
        </article>
      </section>

      <section className={styles.moversGrid}>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>학교 이동</span><h3>전년 대비 증가 학교</h3><p>선택 조건 내 절대 증감 상위</p></div></header>
          <SegmentRows rows={data.schoolMovers.increases} limit={10} showAbsoluteChange />
        </article>
        <article className={styles.panel}>
          <header className={styles.panelHeader}><div><span>학교 이동</span><h3>전년 대비 감소 학교</h3><p>선택 조건 내 절대 감소 상위</p></div></header>
          <SegmentRows rows={data.schoolMovers.decreases} limit={10} showAbsoluteChange />
        </article>
      </section>
    </div>
  );
}

export function MarketAnalysis({ baseQuery }: { baseQuery: string }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [metric, setMetric] = useState<MarketMetric>("total");
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
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="시장 분석 보기">
          {([
            ["summary", "시장 요약"],
            ["fields", "계열 포트폴리오"],
            ["competition", "지역·학교 경쟁"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? styles.activeTab : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <label className={styles.metricSelect}>
          분석 지표
          <select value={metric} onChange={(event) => setMetric(event.target.value as MarketMetric)}>
            <option value="total">재적학생</option>
            <option value="enrolled">재학생</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className={styles.state}><CircleAlert size={28} /><strong>시장 분석을 불러오지 못했습니다.</strong><p>{error}</p><button type="button" onClick={() => load()}><RefreshCw size={15} /> 다시 시도</button></div>
      ) : !data ? (
        <div className={styles.state}><span className={styles.loader} /><strong>18만여 행에서 시장 구조를 계산하고 있습니다…</strong></div>
      ) : data.kpis.marketSize.value === 0 ? (
        <div className={styles.state}><SearchX size={28} /><strong>조건에 맞는 시장 데이터가 없습니다.</strong><p>상단 필터를 줄이거나 기준연도를 바꿔보세요.</p></div>
      ) : (
        <div className={loading ? styles.loading : ""}>
          {tab === "summary" && <SummaryView data={data} />}
          {tab === "fields" && <FieldsView data={data} />}
          {tab === "competition" && <CompetitionView data={data} />}
          <aside className={styles.notes}>
            <Layers3 size={18} />
            <div><strong>분석 해석 시 주의사항</strong>{data.notes.map((note) => <p key={note}>{note}</p>)}</div>
          </aside>
        </div>
      )}
    </section>
  );
}
