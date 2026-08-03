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
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Database,
  Filter,
  GraduationCap,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { AnnualPoint, EnrollmentRecord, RankedPoint } from "@/lib/types";
import type { DashboardMetric } from "@/lib/analytics";
import { DepartmentTrends } from "./department-trends";
import { MarketAnalysis } from "./market-analysis";
import styles from "./enrollment-dashboard.module.css";

type View = "overview" | "market" | "departments" | "schools" | "details";
type Filters = {
  year: string;
  universityCategory: string;
  region: string;
  school: string;
  establishment: string;
  field: string;
  fieldMiddle: string;
  fieldSmall: string;
  schoolStatus: string;
  department: string;
};
type DetailRow = EnrollmentRecord & {
  change: number | null;
  changeRate: number | null;
};
type DashboardResponse = {
  meta: {
    years: number[];
    universityCategories: string[];
    regions: string[];
    schools: string[];
    schoolsByRegion: Record<string, string[]>;
    schoolsByUniversityCategory: Record<string, string[]>;
    schoolsByRegionAndCategory: Record<string, Record<string, string[]>>;
    establishments: string[];
    fields: string[];
    fieldMiddles: string[];
    fieldSmalls: string[];
    fieldMiddlesByField: Record<string, string[]>;
    fieldSmallsByMiddle: Record<string, string[]>;
    schoolStatuses: string[];
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
  dataset: {
    years: number[];
    dataYearRange: string;
    totalRows: number;
    generatedAt: string;
  };
};

const initialFilters: Filters = {
  year: "",
  universityCategory: "",
  region: "",
  school: "",
  establishment: "",
  field: "",
  fieldMiddle: "",
  fieldSmall: "",
  schoolStatus: "",
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
    id: "market",
    label: "시장 분석",
    description: "규모·성장·점유율·집중도",
    icon: TrendingUp,
  },
  {
    id: "departments",
    label: "학과 트렌드",
    description: "선택 연도까지 추세",
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

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function HelpTip({ label, children }: { label: string; children: string }) {
  return (
    <details className={styles.helpTip}>
      <summary aria-label={`${label} 도움말`} title={`${label} 도움말`}>
        <CircleHelp size={14} />
      </summary>
      <p>{children}</p>
    </details>
  );
}

function LongName({ name }: { name: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      className={`${styles.longName} ${expanded ? styles.longNameExpanded : ""}`}
      title={name}
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
    >
      {name}
    </button>
  );
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
  helpText,
}: {
  label: string;
  value: string;
  options: (string | number)[];
  onChange: (value: string) => void;
  helpText?: string;
}) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>
        {label}
        {helpText && <HelpTip label={label}>{helpText}</HelpTip>}
      </span>
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

function SchoolCombobox({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return options
      .filter(
        (school) =>
          !normalized || school.toLocaleLowerCase("ko-KR").includes(normalized),
      )
      .slice(0, 80);
  }, [options, query]);

  return (
    <label className={`${styles.filterField} ${styles.comboboxField}`}>
      <span>학교</span>
      <div className={styles.combobox}>
        <Search size={16} />
        <input
          role="combobox"
          aria-label="학교 검색"
          aria-expanded={open}
          aria-controls="school-options"
          autoComplete="off"
          value={query}
          placeholder={`${options.length}개 학교 검색`}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            if (value && next !== value) onChange("");
          }}
        />
        {query && (
          <button
            type="button"
            className={styles.clearCombobox}
            aria-label="학교 선택 지우기"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              onChange("");
              setOpen(true);
            }}
          >
            <X size={14} />
          </button>
        )}
        {open && (
          <div id="school-options" className={styles.comboboxOptions} role="listbox">
            {matches.length > 0 ? (
              matches.map((school) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={school === value}
                  key={school}
                  title={school}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery(school);
                    onChange(school);
                    setOpen(false);
                  }}
                >
                  {school}
                </button>
              ))
            ) : (
              <p>검색되는 학교가 없습니다.</p>
            )}
          </div>
        )}
      </div>
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
            <LongName name={row.name} />
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
  const trendStart = data.annual.at(0)?.year;
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
          description="재학생·휴학생·학위취득유예학생 합계"
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
      <p className={styles.colorGuide}>
        <span /> 휴학생은 감소할 때 긍정적인 색상으로 표시합니다.
      </p>
      <section className={styles.chartGrid}>
        <article className={`${styles.panel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>
                {trendStart}–{data.currentYear}년 변화
              </span>
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
              <span className={styles.eyebrow}>대계열별 규모</span>
              <h2>재적학생 상위 대계열</h2>
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
              <span>활동 본·분교</span>
              <strong>{fullNumber.format(data.schoolCount)}</strong>
              <small>재적학생 1명 이상</small>
            </div>
            <div>
              <span>활동 학과</span>
              <strong>{fullNumber.format(data.departmentCount)}</strong>
              <small>공시 단위 기준</small>
            </div>
            <div>
              <span>데이터 행</span>
              <strong>{fullNumber.format(data.rowCount)}</strong>
              <small>행</small>
            </div>
            <div>
              <span className={styles.helpLabel}>
                학위취득유예학생
                <HelpTip label="학위취득유예학생">
                  화면에서는 짧게 ‘학위취득유예학생’으로 표시합니다. 대학알리미 공식 항목명은 ‘학사학위취득유예학생’입니다.
                </HelpTip>
              </span>
              <strong>{fullNumber.format(data.metrics.deferment.value)}</strong>
              <small>명</small>
            </div>
          </div>
          <p className={styles.formulaNote}>
            <CheckCircle2 size={17} />
            재적학생 = 재학생 + 휴학생 + 학위취득유예학생
          </p>
        </article>
      </section>
    </>
  );
}

function MobileSchoolTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const name = payload?.value ?? "";
  const lines = name.length > 7 ? [name.slice(0, 7), name.slice(7)] : [name];
  return (
    <text x={x} y={y} textAnchor="end" fill="#686c79" fontSize={10}>
      {lines.map((line, index) => (
        <tspan key={line} x={x - 4} dy={index === 0 ? (lines.length > 1 ? -2 : 3) : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Schools({ data }: { data: DashboardResponse }) {
  const mobile = useMediaQuery("(max-width: 620px)");
  const mobileHeight = Math.max(430, data.schools.length * 54);
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
        <div
          className={`${styles.largeChart} ${mobile ? styles.mobileSchoolChart : ""}`}
          style={mobile ? { height: mobileHeight } : undefined}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.schools}
              layout={mobile ? "vertical" : "horizontal"}
              margin={mobile ? { left: 0, right: 8 } : { left: 10, right: 12 }}
            >
              <CartesianGrid
                stroke="#e8eaf0"
                vertical={!mobile}
                horizontal={mobile}
              />
              {mobile ? (
                <>
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
                    interval={0}
                    width={128}
                    tick={<MobileSchoolTick />}
                  />
                </>
              ) : (
                <>
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
                </>
              )}
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
              <Bar
                dataKey="total"
                fill="#7777e7"
                radius={mobile ? [0, 6, 6, 0] : [6, 6, 0, 0]}
              />
              <Bar
                dataKey="enrolled"
                fill="#5ec6ac"
                radius={mobile ? [0, 6, 6, 0] : [6, 6, 0, 0]}
              />
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
  onPageSize,
}: {
  data: DashboardResponse;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const moveToInputPage = (formData: FormData) => {
    const requested = Number(formData.get("page"));
    if (Number.isFinite(requested)) {
      onPage(Math.min(Math.max(1, Math.trunc(requested)), data.pagination.pages));
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>{data.currentYear}년 상세 데이터 탐색</span>
          <h2 className={styles.helpHeading}>
            학과별 정규화 데이터
            <HelpTip label="정규화 데이터">
              2019~2022년 45열과 2023~2025년 46열을 하나의 형식으로 맞추고, 대학·전문대학과 표준분류 대·중·소계열을 보존한 데이터입니다.
            </HelpTip>
          </h2>
        </div>
        <span className={styles.panelNote}>총 {fullNumber.format(data.pagination.total)}행</span>
      </div>
      <div className={`${styles.tableScroller} ${styles.desktopDetails}`}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>연도</th>
              <th>대학구분</th>
              <th>학교</th>
              <th>단과대학</th>
              <th>학과</th>
              <th>주야</th>
              <th>지역</th>
              <th>설립</th>
              <th>대계열</th>
              <th>중계열</th>
              <th>소계열</th>
              <th>학교상태</th>
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
                <td>{row.universityCategory}</td>
                <td className={styles.strongCell}>{row.school}</td>
                <td>{row.college}</td>
                <td><LongName name={row.department} /></td>
                <td>{row.dayNight}</td>
                <td>{row.region}</td>
                <td>{row.establishment}</td>
                <td>{row.field}</td>
                <td>{row.fieldMiddle}</td>
                <td>{row.fieldSmall}</td>
                <td>
                  <span
                    className={`${styles.statusPill} ${
                      row.schoolStatus.includes("폐")
                        ? styles.closed
                        : ""
                    }`}
                  >
                    {row.schoolStatus}
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
      <div className={styles.mobileDetails} aria-label="모바일 상세 데이터 목록">
        {data.details.map((row) => (
          <article
            className={styles.detailCard}
            key={`${row.year}-${row.school}-${row.sourceRow}`}
          >
            <div className={styles.detailCardHeader}>
              <div>
                <span>{row.year}년 · {row.universityCategory} · {row.region}</span>
                <strong title={row.school}>{row.school}</strong>
              </div>
              <span
                className={`${styles.statusPill} ${
                  row.schoolStatus.includes("폐") ? styles.closed : ""
                }`}
                title="학교상태는 새 원본 자료의 기존·폐교 등 학교 상태를 뜻합니다."
              >
                {row.schoolStatus}
              </span>
            </div>
            <LongName name={row.department} />
            <p className={styles.detailFieldPath}>
              {row.field} · {row.fieldMiddle} · {row.fieldSmall}
            </p>
            <dl className={styles.detailMetrics}>
              <div><dt>재학생</dt><dd>{fullNumber.format(row.enrolled)}명</dd></div>
              <div><dt>휴학생</dt><dd>{fullNumber.format(row.leave)}명</dd></div>
              <div><dt>재적학생</dt><dd>{fullNumber.format(row.total)}명</dd></div>
            </dl>
            <div className={styles.detailChange}>
              <span>전년 대비</span>
              <ChangeBadge metric={row} />
            </div>
          </article>
        ))}
      </div>
      <div className={styles.pagination}>
        <label className={styles.pageSize}>
          페이지당
          <select
            value={data.pagination.pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>{size}행</option>
            ))}
          </select>
        </label>
        <div className={styles.pageButtons}>
          <button type="button" onClick={() => onPage(1)} disabled={data.pagination.page <= 1} aria-label="처음 페이지">
            <ChevronsLeft size={17} />
          </button>
          <button type="button" onClick={() => onPage(data.pagination.page - 1)} disabled={data.pagination.page <= 1} aria-label="이전 페이지">
            <ChevronLeft size={17} />
          </button>
          <span><strong>{data.pagination.page}</strong> / {data.pagination.pages} 페이지</span>
          <button type="button" onClick={() => onPage(data.pagination.page + 1)} disabled={data.pagination.page >= data.pagination.pages} aria-label="다음 페이지">
            <ChevronRight size={17} />
          </button>
          <button type="button" onClick={() => onPage(data.pagination.pages)} disabled={data.pagination.page >= data.pagination.pages} aria-label="마지막 페이지">
            <ChevronsRight size={17} />
          </button>
        </div>
        <form
          className={styles.pageJump}
          action={(formData) => moveToInputPage(formData)}
        >
          <label htmlFor="detail-page">페이지 이동</label>
          <input
            key={data.pagination.page}
            id="detail-page"
            name="page"
            type="number"
            min={1}
            max={data.pagination.pages}
            defaultValue={data.pagination.page}
          />
          <button type="submit">이동</button>
        </form>
      </div>
    </section>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className={styles.emptyState}>
      <Search size={28} />
      <h2>조건에 맞는 데이터가 없습니다</h2>
      <p>필터를 줄이거나 학과명 검색어를 바꿔보세요.</p>
      <button type="button" onClick={onReset}>필터 초기화</button>
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
  const [pageSize, setPageSize] = useState(20);
  const [filterVersion, setFilterVersion] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setAppliedDepartment(filters.department),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [filters.department]);

  const baseQuery = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries({
      year: filters.year,
      universityCategory: filters.universityCategory,
      region: filters.region,
      school: filters.school,
      establishment: filters.establishment,
      field: filters.field,
      fieldMiddle: filters.fieldMiddle,
      fieldSmall: filters.fieldSmall,
      schoolStatus: filters.schoolStatus,
      department: appliedDepartment,
    }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters, appliedDepartment]);

  const query = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [baseQuery, page, pageSize]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/dashboard?${query}`, { signal });
        if (!response.ok) {
          throw new Error("dashboard_request_failed");
        }
        setData((await response.json()) as DashboardResponse);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError(
            "데이터 서버에 연결할 수 없습니다. 개발 서버 상태를 확인해 주세요.",
          );
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
  const setRegion = (region: string) => {
    setFilters((current) => {
      const availableSchools = region
        ? current.universityCategory
          ? (data?.meta.schoolsByRegionAndCategory[region]?.[
              current.universityCategory
            ] ?? [])
          : (data?.meta.schoolsByRegion[region] ?? [])
        : current.universityCategory
          ? (data?.meta.schoolsByUniversityCategory[
              current.universityCategory
            ] ?? [])
          : (data?.meta.schools ?? []);
      return {
        ...current,
        region,
        school:
          current.school && !availableSchools.includes(current.school)
            ? ""
            : current.school,
      };
    });
    setPage(1);
  };
  const setUniversityCategory = (universityCategory: string) => {
    setFilters((current) => {
      const availableSchools = current.region
        ? universityCategory
          ? (data?.meta.schoolsByRegionAndCategory[current.region]?.[
              universityCategory
            ] ?? [])
          : (data?.meta.schoolsByRegion[current.region] ?? [])
        : universityCategory
          ? (data?.meta.schoolsByUniversityCategory[universityCategory] ?? [])
          : (data?.meta.schools ?? []);
      return {
        ...current,
        universityCategory,
        school:
          current.school && !availableSchools.includes(current.school)
            ? ""
            : current.school,
      };
    });
    setPage(1);
  };
  const setField = (field: string) => {
    setFilters((current) => ({
      ...current,
      field,
      fieldMiddle:
        current.fieldMiddle &&
        !(data?.meta.fieldMiddlesByField[field] ?? []).includes(
          current.fieldMiddle,
        )
          ? ""
          : current.fieldMiddle,
      fieldSmall: "",
    }));
    setPage(1);
  };
  const setFieldMiddle = (fieldMiddle: string) => {
    setFilters((current) => ({
      ...current,
      fieldMiddle,
      fieldSmall:
        current.fieldSmall &&
        !(data?.meta.fieldSmallsByMiddle[fieldMiddle] ?? []).includes(
          current.fieldSmall,
        )
          ? ""
          : current.fieldSmall,
    }));
    setPage(1);
  };
  const resetFilters = () => {
    setFilters(initialFilters);
    setAppliedDepartment("");
    setPage(1);
    setFilterVersion((version) => version + 1);
  };
  const schoolOptions = filters.region
    ? filters.universityCategory
      ? (data?.meta.schoolsByRegionAndCategory[filters.region]?.[
          filters.universityCategory
        ] ?? [])
      : (data?.meta.schoolsByRegion[filters.region] ?? [])
    : filters.universityCategory
      ? (data?.meta.schoolsByUniversityCategory[
          filters.universityCategory
        ] ?? [])
      : (data?.meta.schools ?? []);
  const middleFieldOptions = filters.field
    ? (data?.meta.fieldMiddlesByField[filters.field] ?? [])
    : (data?.meta.fieldMiddles ?? []);
  const smallFieldOptions = filters.fieldMiddle
    ? (data?.meta.fieldSmallsByMiddle[filters.fieldMiddle] ?? [])
    : filters.field
      ? [...new Set(
          middleFieldOptions.flatMap(
            (middle) => data?.meta.fieldSmallsByMiddle[middle] ?? [],
          ),
        )].sort((left, right) => left.localeCompare(right, "ko-KR"))
      : (data?.meta.fieldSmalls ?? []);
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
            <strong>대학 시장</strong>
            <span>재적학생 트렌드</span>
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
        <div className={styles.localBadge}>2019–2025 · 대학·전문대학</div>
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
          <p>
            대학알리미 학과별 자료 · {data?.dataset.dataYearRange ?? "데이터 확인 중"}
          </p>
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
            <strong>{data?.dataset.dataYearRange ?? "데이터 확인 중"} 대학알리미</strong>
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
                대학 시장의 학생 흐름을
                <br />
                {" "}한눈에 살펴보세요.
              </h1>
              <p>
                {data?.dataset.dataYearRange ?? "검산된 연도"} 재학생·휴학생·재적학생의 변화를
                대학·전문대학과 대·중·소계열 단위로 탐색합니다.
              </p>
            </div>
            <div className={styles.heroSummary}>
              {data?.rowCount === 0 ? (
                <>
                  <span>선택 현황</span>
                  <strong className={styles.noResultSummary}>검색 결과 없음</strong>
                  <small>필터를 조정해 주세요</small>
                </>
              ) : (
                <>
                  <span>{data?.currentYear ?? "—"}년 선택 현황</span>
                  <strong>{data ? compactNumber.format(data.metrics.total.value) : "—"}</strong>
                  <small>재적학생</small>
                  {data && <ChangeBadge metric={data.metrics.total} />}
                </>
              )}
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
                options={data?.meta.years ?? [2019, 2020, 2021, 2022, 2023, 2024, 2025]}
                onChange={(value) => setFilter("year", value)}
              />
              <SelectFilter
                label="대학구분"
                value={filters.universityCategory}
                options={data?.meta.universityCategories ?? []}
                onChange={setUniversityCategory}
                helpText="대학과 전문대학을 구분합니다. 학교종류보다 상위의 시장 구분입니다."
              />
              <SelectFilter
                label="지역"
                value={filters.region}
                options={data?.meta.regions ?? []}
                onChange={setRegion}
              />
              <SchoolCombobox
                key={`${filterVersion}-${filters.region}`}
                value={filters.school}
                options={schoolOptions}
                onChange={(value) => setFilter("school", value)}
              />
              <SelectFilter
                label="설립구분"
                value={filters.establishment}
                options={data?.meta.establishments ?? []}
                onChange={(value) => setFilter("establishment", value)}
              />
              <SelectFilter
                label="대계열"
                value={filters.field}
                options={data?.meta.fields ?? []}
                onChange={setField}
                helpText="교육부 표준분류의 가장 큰 계열 구분입니다."
              />
              <SelectFilter
                label="중계열"
                value={filters.fieldMiddle}
                options={middleFieldOptions}
                onChange={setFieldMiddle}
                helpText="선택한 대계열 아래의 표준분류 중계열입니다."
              />
              <SelectFilter
                label="소계열"
                value={filters.fieldSmall}
                options={smallFieldOptions}
                onChange={(value) => setFilter("fieldSmall", value)}
                helpText="가장 세부적인 표준분류 소계열입니다."
              />
              <SelectFilter
                label="학교상태"
                value={filters.schoolStatus}
                options={data?.meta.schoolStatuses ?? []}
                onChange={(value) => setFilter("schoolStatus", value)}
                helpText="새 원본에는 학과상태가 없고 학교상태만 있습니다. 기존·폐교 등 원본 값을 그대로 사용합니다."
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
              <p>18만여 행을 분석하고 있습니다…</p>
            </div>
          ) : data.rowCount === 0 ? (
            <EmptyState onReset={resetFilters} />
          ) : (
            <div className={loading ? styles.contentLoading : ""}>
              {view === "overview" && <Overview data={data} />}
              {view === "market" && <MarketAnalysis baseQuery={baseQuery} />}
              {view === "departments" && <DepartmentTrends baseQuery={baseQuery} />}
              {view === "schools" && <Schools data={data} />}
              {view === "details" && (
                <Details
                  data={data}
                  onPage={setPage}
                  onPageSize={(nextPageSize) => {
                    setPageSize(nextPageSize);
                    setPage(1);
                  }}
                />
              )}
            </div>
          )}
          <footer className={styles.footer}>
            <p>
              검산을 통과한 정규화 데이터만 사용합니다. 원본 XLSX는 웹 공개 폴더에 복사하지 않습니다.
            </p>
            <span>
              마지막 변환 · {data?.dataset.generatedAt.slice(0, 10) ?? "—"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
