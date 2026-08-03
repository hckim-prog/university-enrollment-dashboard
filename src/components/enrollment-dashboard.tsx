"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Filter,
  GraduationCap,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnnualPoint, EnrollmentRecord, RankedPoint } from "@/lib/types";
import type { DashboardMetric } from "@/lib/analytics";
import styles from "./enrollment-dashboard.module.css";

type View = "overview" | "departments" | "schools" | "details";
type Filters = {
  year: string;
  region: string;
  school: string;
  establishment: string;
  field: string;
  departmentStatus: string;
  department: string;
};
type DetailRow = EnrollmentRecord & {
  change: number | null;
  changeRate: number | null;
};
type DashboardResponse = {
  meta: {
    years: number[];
    regions: string[];
    schools: string[];
    establishments: string[];
    fields: string[];
    departmentStatuses: string[];
  };
  currentYear: number;
  previousYear: number | null;
  rowCount: number;
  schoolCount: number;
  departmentCount: number;
  metrics: {
    enrolled: DashboardMetric;
    total: DashboardMetric;
    leave: DashboardMetric;
    deferment: DashboardMetric;
  };
  annual: AnnualPoint[];
  regions: RankedPoint[];
  fields: RankedPoint[];
  departments: RankedPoint[];
  departmentSeries: { name: string; annual: AnnualPoint[] }[];
  schools: RankedPoint[];
  details: DetailRow[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  validation: {
    valid: boolean;
    totalRows: number;
    issueCount: number;
    generatedAt: string;
  };
};

const initialFilters: Filters = {
  year: "",
  region: "",
  school: "",
  establishment: "",
  field: "",
  departmentStatus: "",
  department: "",
};
const navigation: {
  id: View;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}[] = [
  {
    id: "overview",
    label: "전체 현황",
    description: "핵심 지표와 변화",
    icon: LayoutDashboard,
  },
  {
    id: "departments",
    label: "학과 트렌드",
    description: "학과별 3개년 추세",
    icon: BookOpen,
  },
  {
    id: "schools",
    label: "학교 비교",
    description: "학교별 규모와 증감",
    icon: Building2,
  },
  {
    id: "details",
    label: "상세 데이터",
    description: "원자료 단위 탐색",
    icon: Database,
  },
];
const compactNumber = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullNumber = new Intl.NumberFormat("ko-KR");
const percent = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatChange(value: number | null) {
  if (value === null) return "비교 연도 없음";
  return `${value >= 0 ? "+" : ""}${fullNumber.format(value)}명`;
}

function ChangeBadge({
  metric,
  inverse = false,
}: {
  metric: Pick<DashboardMetric, "change" | "changeRate">;
  inverse?: boolean;
}) {
  if (metric.change === null) {
    return <span className={styles.mutedBadge}>비교값 없음</span>;
  }
  const up = metric.change >= 0;
  const positive = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`${styles.changeBadge} ${
        positive ? styles.positive : styles.negative
      }`}
    >
      <Icon size={14} />
      {formatChange(metric.change)}
      {metric.changeRate === null ? "" : ` (${percent.format(metric.changeRate)})`}
    </span>
  );
}

function MetricCard({
  label,
  description,
  metric,
  icon: Icon,
  accent,
  inverse,
}: {
  label: string;
  description: string;
  metric: DashboardMetric;
  icon: typeof Users;
  accent: string;
  inverse?: boolean;
}) {
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricTop}>
        <div>
          <span className={styles.metricLabel}>{label}</span>
          <p>{description}</p>
        </div>
        <span className={styles.metricIcon} style={{ color: accent }}>
          <Icon size={20} />
        </span>
      </div>
      <strong>{fullNumber.format(metric.value)}</strong>
      <span className={styles.unit}>명</span>
      <div className={styles.metricFooter}>
        <ChangeBadge metric={metric} inverse={inverse} />
        <span>전년 대비</span>
      </div>
    </article>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: (string | number)[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.filterField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">전체</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
            {label === "연도" ? "년" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function RankingTable({
  rows,
  label,
}: {
  rows: RankedPoint[];
  label: string;
}) {
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div className={styles.rankingList}>
      {rows.map((row, index) => (
        <div className={styles.rankingRow} key={row.name}>
          <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.rankingName}>
            <strong>{row.name}</strong>
            <div className={styles.progressTrack}>
              <span style={{ width: `${(row.total / max) * 100}%` }} />
            </div>
          </div>
          <div className={styles.rankingValue}>
            <strong>{fullNumber.format(row.total)}</strong>
            <span>{label}</span>
          </div>
          <ChangeBadge metric={row} />
        </div>
      ))}
    </div>
  );
}

function Overview({ data }: { data: DashboardResponse }) {
  return (
    <>
      <section className={styles.metricGrid} aria-label="핵심 지표">
        <MetricCard
          label="재학생"
          description="현재 학교에 재학 중인 학생"
          metric={data.metrics.enrolled}
          icon={GraduationCap}
          accent="#5b5bd6"
        />
        <MetricCard
          label="재적학생"
          description="재학생·휴학생·유예학생 합계"
          metric={data.metrics.total}
          icon={Users}
          accent="#0f9f83"
        />
        <MetricCard
          label="휴학생"
          description="현재 휴학 상태인 학생"
          metric={data.metrics.leave}
          icon={BookOpen}
          accent="#e78b42"
          inverse
        />
      </section>
      <section className={styles.chartGrid}>
        <article className={`${styles.panel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>3개년 변화</span>
              <h2>학생 수 추이</h2>
            </div>
            <span className={styles.panelNote}>단위: 명</span>
          </div>
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.annual} margin={{ left: 4, right: 12 }}>
                <CartesianGrid stroke="#e8eaf0" vertical={false} />
                <XAxis
                  dataKey="year"
                  tickFormatter={(value) => `${value}년`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => compactNumber.format(value)}
                  axisLine={false}
                  tickLine={false}
                  width={62}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${fullNumber.format(Number(value))}명`,
                    name === "total" ? "재적학생" : "재학생",
                  ]}
                  labelFormatter={(label) => `${label}년`}
                />
                <Legend
                  formatter={(value) =>
                    value === "total" ? "재적학생" : "재학생"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#5b5bd6"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#5b5bd6" }}
                />
                <Line
                  type="monotone"
                  dataKey="enrolled"
                  stroke="#0f9f83"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#0f9f83" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>지역 분포</span>
              <h2>재적학생 상위 지역</h2>
            </div>
          </div>
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.regions}
                layout="vertical"
                margin={{ left: 2, right: 8 }}
              >
                <CartesianGrid stroke="#eef0f4" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => compactNumber.format(value)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  formatter={(value) => `${fullNumber.format(Number(value))}명`}
                />
                <Bar dataKey="total" fill="#7777e7" radius={[0, 7, 7, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
      <section className={styles.bottomGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>계열별 규모</span>
              <h2>재적학생 상위 계열</h2>
            </div>
          </div>
          <RankingTable rows={data.fields.slice(0, 6)} label="명" />
        </article>
        <article className={`${styles.panel} ${styles.insightPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>현재 선택 범위</span>
              <h2>{data.currentYear}년 데이터 한눈에 보기</h2>
            </div>
          </div>
          <div className={styles.statTiles}>
            <div>
              <span>학교</span>
              <strong>{fullNumber.format(data.schoolCount)}</strong>
              <small>개교</small>
            </div>
            <div>
              <span>학과</span>
              <strong>{fullNumber.format(data.departmentCount)}</strong>
              <small>개</small>
            </div>
            <div>
              <span>데이터 행</span>
              <strong>{fullNumber.format(data.rowCount)}</strong>
              <small>행</small>
            </div>
            <div>
              <span>취득유예</span>
              <strong>{fullNumber.format(data.metrics.deferment.value)}</strong>
              <small>명</small>
            </div>
          </div>
          <p className={styles.formulaNote}>
            <CheckCircle2 size={17} />
            재적학생 = 재학생 + 휴학생 + 학사학위취득유예학생
          </p>
        </article>
      </section>
    </>
  );
}

function Departments({ data }: { data: DashboardResponse }) {
  const chartData = data.annual.map((point) => {
    const values: Record<string, number> = { year: point.year };
    data.departmentSeries.slice(0, 5).forEach((series) => {
      values[series.name] =
        series.annual.find((value) => value.year === point.year)?.total ?? 0;
    });
    return values;
  });
  const colors = ["#5b5bd6", "#0f9f83", "#e78b42", "#d05f78", "#2684c7"];
  return (
    <section className={styles.viewStack}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>학과 트렌드</span>
            <h2>상위 학과의 3개년 재적학생 변화</h2>
          </div>
          <span className={styles.panelNote}>동일 학과명 합산</span>
        </div>
        <div className={styles.largeChart}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 10, right: 18 }}>
              <CartesianGrid stroke="#e8eaf0" vertical={false} />
              <XAxis
                dataKey="year"
                tickFormatter={(value) => `${value}년`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value) => compactNumber.format(value)}
                axisLine={false}
                tickLine={false}
                width={62}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${fullNumber.format(Number(value))}명`,
                  name,
                ]}
                labelFormatter={(label) => `${label}년`}
              />
              <Legend />
              {data.departmentSeries.slice(0, 5).map((series, index) => (
                <Line
                  key={series.name}
                  type="monotone"
                  dataKey={series.name}
                  stroke={colors[index]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>{data.currentYear}년 기준</span>
            <h2>재적학생 규모가 큰 학과</h2>
          </div>
          <span className={styles.panelNote}>
            학과명 필터로 원하는 학과를 검색하세요
          </span>
        </div>
        <RankingTable rows={data.departments} label="명" />
      </article>
    </section>
  );
}

function Schools({ data }: { data: DashboardResponse }) {
  return (
    <section className={styles.viewStack}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>학교 비교</span>
            <h2>{data.currentYear}년 학교별 재적학생</h2>
          </div>
          <span className={styles.panelNote}>상위 12개교</span>
        </div>
        <div className={styles.largeChart}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.schools} margin={{ left: 10, right: 12 }}>
              <CartesianGrid stroke="#e8eaf0" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-24}
                textAnchor="end"
                height={88}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(value) => compactNumber.format(value)}
                axisLine={false}
                tickLine={false}
                width={62}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${fullNumber.format(Number(value))}명`,
                  name === "total" ? "재적학생" : "재학생",
                ]}
              />
              <Legend
                formatter={(value) =>
                  value === "total" ? "재적학생" : "재학생"
                }
              />
              <Bar dataKey="total" fill="#7777e7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="enrolled" fill="#5ec6ac" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>전년 대비</span>
            <h2>학교별 증감 비교</h2>
          </div>
          <span className={styles.panelNote}>
            상단 학교 필터로 한 학교를 자세히 볼 수 있습니다
          </span>
        </div>
        <RankingTable rows={data.schools} label="명" />
      </article>
    </section>
  );
}

function Details({
  data,
  onPage,
}: {
  data: DashboardResponse;
  onPage: (page: number) => void;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>상세 데이터 탐색</span>
          <h2>학과별 정규화 데이터</h2>
        </div>
        <span className={styles.panelNote}>
          총 {fullNumber.format(data.pagination.total)}행
        </span>
      </div>
      <div className={styles.tableScroller}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>연도</th>
              <th>학교</th>
              <th>단과대학</th>
              <th>학과</th>
              <th>주야</th>
              <th>지역</th>
              <th>설립</th>
              <th>계열</th>
              <th>학과상태</th>
              <th className={styles.numberCell}>재학생</th>
              <th className={styles.numberCell}>휴학생</th>
              <th className={styles.numberCell}>재적학생</th>
              <th>전년 대비</th>
            </tr>
          </thead>
          <tbody>
            {data.details.map((row) => (
              <tr key={`${row.year}-${row.school}-${row.sourceRow}`}>
                <td>{row.year}</td>
                <td className={styles.strongCell}>{row.school}</td>
                <td>{row.college}</td>
                <td>{row.department}</td>
                <td>{row.dayNight}</td>
                <td>{row.region}</td>
                <td>{row.establishment}</td>
                <td>{row.field}</td>
                <td>
                  <span
                    className={`${styles.statusPill} ${
                      row.departmentStatus.includes("폐")
                        ? styles.closed
                        : ""
                    }`}
                  >
                    {row.departmentStatus}
                  </span>
                </td>
                <td className={styles.numberCell}>
                  {fullNumber.format(row.enrolled)}
                </td>
                <td className={styles.numberCell}>
                  {fullNumber.format(row.leave)}
                </td>
                <td className={`${styles.numberCell} ${styles.strongCell}`}>
                  {fullNumber.format(row.total)}
                </td>
                <td>
                  <ChangeBadge metric={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <button
          type="button"
          onClick={() => onPage(data.pagination.page - 1)}
          disabled={data.pagination.page <= 1}
          aria-label="이전 페이지"
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          <strong>{data.pagination.page}</strong> / {data.pagination.pages}
        </span>
        <button
          type="button"
          onClick={() => onPage(data.pagination.page + 1)}
          disabled={data.pagination.page >= data.pagination.pages}
          aria-label="다음 페이지"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <Search size={28} />
      <h2>조건에 맞는 데이터가 없습니다</h2>
      <p>필터를 줄이거나 학과명 검색어를 바꿔보세요.</p>
    </div>
  );
}

export function EnrollmentDashboard() {
  const [view, setView] = useState<View>("overview");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedDepartment, setAppliedDepartment] = useState("");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [mobileNav, setMobileNav] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setAppliedDepartment(filters.department),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [filters.department]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries({
      year: filters.year,
      region: filters.region,
      school: filters.school,
      establishment: filters.establishment,
      field: filters.field,
      departmentStatus: filters.departmentStatus,
      department: appliedDepartment,
    }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set("page", String(page));
    return params.toString();
  }, [filters, appliedDepartment, page]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/dashboard?${query}`, { signal });
        if (!response.ok) {
          throw new Error(`데이터 요청 실패 (${response.status})`);
        }
        setData((await response.json()) as DashboardResponse);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError((loadError as Error).message);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const resetFilters = () => {
    setFilters(initialFilters);
    setAppliedDepartment("");
    setPage(1);
  };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const activeNav = navigation.find((item) => item.id === view)!;

  return (
    <div className={styles.appShell}>
      <aside
        className={`${styles.sidebar} ${mobileNav ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <BarChart3 size={23} />
          </div>
          <div>
            <strong>대학 재적학생</strong>
            <span>트렌드</span>
          </div>
          <button
            className={styles.closeNav}
            type="button"
            onClick={() => setMobileNav(false)}
            aria-label="메뉴 닫기"
          >
            <X size={20} />
          </button>
        </div>
        <div className={styles.localBadge}>LOCAL · 1단계 MVP</div>
        <nav aria-label="주요 화면">
          <span className={styles.navLabel}>분석 메뉴</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={view === item.id ? styles.activeNav : ""}
                onClick={() => {
                  setView(item.id);
                  setMobileNav(false);
                }}
              >
                <Icon size={19} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>
        <div className={styles.sidebarFoot}>
          <div className={styles.dataHealth}>
            <CheckCircle2 size={18} />
            <div>
              <strong>데이터 검산 완료</strong>
              <span>
                {data
                  ? `${fullNumber.format(data.validation.totalRows)}행 · 오류 ${data.validation.issueCount}건`
                  : "검산 결과 불러오는 중"}
              </span>
            </div>
          </div>
          <p>대학알리미 학과별 자료 · 2023–2025</p>
        </div>
      </aside>
      {mobileNav && (
        <button
          className={styles.backdrop}
          type="button"
          onClick={() => setMobileNav(false)}
          aria-label="메뉴 닫기"
        />
      )}
      <main className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMobileNav(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={21} />
          </button>
          <div>
            <span>데이터 기준</span>
            <strong>2023–2025년 대학알리미</strong>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.verifiedPill}>
              <CheckCircle2 size={15} /> 검산 완료
            </span>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => load()}
              aria-label="데이터 새로고침"
            >
              <RefreshCw size={17} className={loading ? styles.spinning : ""} />
            </button>
          </div>
        </header>
        <div className={styles.content}>
          <section className={styles.hero}>
            <div>
              <span className={styles.heroEyebrow}>{activeNav.label}</span>
              <h1>
                대학의 학생 흐름을
                <br />
                한눈에 살펴보세요.
              </h1>
              <p>
                2023년부터 2025년까지 재학생·휴학생·재적학생의 변화를
                학교와 학과 단위로 탐색합니다.
              </p>
            </div>
            <div className={styles.heroSummary}>
              <span>{data?.currentYear ?? "—"}년 선택 현황</span>
              <strong>
                {data ? compactNumber.format(data.metrics.total.value) : "—"}
              </strong>
              <small>재적학생</small>
              {data && <ChangeBadge metric={data.metrics.total} />}
            </div>
          </section>
          <section
            className={`${styles.filters} ${
              filtersOpen ? styles.filtersExpanded : ""
            }`}
          >
            <div className={styles.filterHeading}>
              <div>
                <SlidersHorizontal size={18} />
                <strong>분석 조건</strong>
                {activeFilterCount > 0 && <span>{activeFilterCount}개 적용</span>}
              </div>
              <button
                type="button"
                className={styles.filterToggle}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <Filter size={16} />
                {filtersOpen ? "필터 접기" : "필터 열기"}
              </button>
            </div>
            <div className={styles.filterGrid}>
              <SelectFilter
                label="연도"
                value={filters.year}
                options={data?.meta.years ?? [2023, 2024, 2025]}
                onChange={(value) => setFilter("year", value)}
              />
              <SelectFilter
                label="지역"
                value={filters.region}
                options={data?.meta.regions ?? []}
                onChange={(value) => setFilter("region", value)}
              />
              <SelectFilter
                label="학교"
                value={filters.school}
                options={data?.meta.schools ?? []}
                onChange={(value) => setFilter("school", value)}
              />
              <SelectFilter
                label="설립구분"
                value={filters.establishment}
                options={data?.meta.establishments ?? []}
                onChange={(value) => setFilter("establishment", value)}
              />
              <SelectFilter
                label="계열"
                value={filters.field}
                options={data?.meta.fields ?? []}
                onChange={(value) => setFilter("field", value)}
              />
              <SelectFilter
                label="학과상태"
                value={filters.departmentStatus}
                options={data?.meta.departmentStatuses ?? []}
                onChange={(value) => setFilter("departmentStatus", value)}
              />
              <label className={`${styles.filterField} ${styles.searchField}`}>
                <span>학과명</span>
                <div>
                  <Search size={16} />
                  <input
                    value={filters.department}
                    onChange={(event) =>
                      setFilter("department", event.target.value)
                    }
                    placeholder="예: 간호, 컴퓨터"
                  />
                </div>
              </label>
              <button
                type="button"
                className={styles.resetButton}
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                <RefreshCw size={15} />
                초기화
              </button>
            </div>
          </section>
          {error ? (
            <div className={styles.errorState}>
              <strong>데이터를 불러오지 못했습니다.</strong>
              <span>{error}</span>
              <button type="button" onClick={() => load()}>
                다시 시도
              </button>
            </div>
          ) : !data ? (
            <div className={styles.loadingState}>
              <span className={styles.loader} />
              <p>45,242행을 분석하고 있습니다…</p>
            </div>
          ) : data.rowCount === 0 ? (
            <EmptyState />
          ) : (
            <div className={loading ? styles.contentLoading : ""}>
              {view === "overview" && <Overview data={data} />}
              {view === "departments" && <Departments data={data} />}
              {view === "schools" && <Schools data={data} />}
              {view === "details" && <Details data={data} onPage={setPage} />}
            </div>
          )}
          <footer className={styles.footer}>
            <p>
              원본 파일은 프로젝트 밖에 유지되며, 화면은 검산된 정규화 데이터만
              사용합니다.
            </p>
            <span>마지막 변환 · {data?.validation.generatedAt.slice(0, 10)}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
