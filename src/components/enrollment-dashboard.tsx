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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Database,
  Filter,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  Menu,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AnnualPoint, EnrollmentRecord, RankedPoint } from "@/lib/types";
import type { DashboardMetric } from "@/lib/analytics";
import type { MarketMetric } from "@/lib/market-analysis";
import { isFlatChange } from "@/lib/analysis-window";
import { DepartmentTrends } from "./department-trends";
import { MarketAnalysis } from "./market-analysis";
import styles from "./enrollment-dashboard.module.css";

type View = "overview" | "fields" | "schools" | "details";
type FieldSection = "explore" | "trends";
type Filters = {
  startYear: string;
  endYear: string;
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
  analysisMetric: MarketMetric;
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
  analysisWindow: { startYear: number; endYear: number };
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
  startYear: "",
  endYear: "",
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
    label: "대학시장 요약",
    description: "시장 규모와 주요 변화",
    icon: LayoutDashboard,
  },
  {
    id: "fields",
    label: "전공 시장",
    description: "계열별 규모와 성장·축소",
    icon: Layers3,
  },
  {
    id: "schools",
    label: "지역·학교",
    description: "지역 규모와 주요 학교",
    icon: Building2,
  },
  {
    id: "details",
    label: "학교·학과 찾기",
    description: "출판 대상 학교와 학과 탐색",
    icon: Database,
  },
];
const guideStorageKey = "university-dashboard-guide-seen-v1";
const screenGuides: Record<View, { title: string; description: string; questions: string[]; caution: string }> = {
  overview: {
    title: "전체 대학시장의 크기와 장기 변화를 먼저 파악합니다",
    description: "선택한 학생 수 기준으로 전체 규모, 증감, 계열·학교 분포를 요약해 시장의 큰 방향을 확인합니다.",
    questions: ["전체 학생 수는 늘었을까?", "어떤 계열의 규모가 클까?", "대학과 전문대학의 흐름은 다를까?"],
    caution: "시장 전체의 기술 통계이며 변화의 원인이나 교재 수요를 직접 설명하지는 않습니다.",
  },
  fields: {
    title: "전공 분류별 규모와 최근·장기 학과 흐름을 비교합니다",
    description: "계열 탐색에서는 대·중·소계열 시장을, 학과 동향에서는 요즘 뜨거나 줄어드는 학과군과 운영 학교 확산을 확인합니다.",
    questions: ["컴퓨터 계열은 장기적으로 성장했을까?", "최근 커진 학과군은 무엇일까?", "운영 학교가 함께 늘어난 분야는?"],
    caution: "학생 수 증가는 취업 전망이나 미래 유망성을 뜻하지 않습니다.",
  },
  schools: {
    title: "지역별 시장 규모와 주요 학교의 변화를 확인합니다",
    description: "지역의 시작·종료연도 규모를 비교하고, 선택 지역에서 학생 수가 큰 학교와 전년 대비 변화를 살펴봅니다.",
    questions: ["어느 지역의 시장이 큰가?", "경기 지역의 주요 학교는?", "학생 규모가 늘어난 학교는?"],
    caution: "학교 규모는 잠재 독자 수를 가늠하는 참고값이며 실제 교재 채택량과 같지 않습니다.",
  },
  details: {
    title: "조건에 맞는 학교와 학과를 구체적으로 찾습니다",
    description: "종료연도의 학교·학과를 지역, 설립, 전공 분류와 학과명으로 찾고 학생 규모 및 전년 대비 변화를 확인합니다.",
    questions: ["경기 지역의 간호학과는 어디에 있을까?", "컴퓨터 관련 학과의 학생 규모는?", "특정 학교에는 어떤 학과가 있을까?"],
    caution: "비교값 없음은 반드시 신설·폐과를 의미하지 않으며, 이 목록은 자동 영업 우선순위가 아닙니다.",
  },
};
const guidePaths: { view: View; fieldSection?: FieldSection; question: string; answer: string; icon: typeof LayoutDashboard }[] = [
  { view: "overview", question: "전체 시장이 어떻게 변했나요?", answer: "대학시장 요약", icon: LayoutDashboard },
  { view: "fields", fieldSection: "explore", question: "특정 계열의 규모와 흐름은?", answer: "전공 시장 · 계열 탐색", icon: Layers3 },
  { view: "fields", fieldSection: "trends", question: "요즘 뜨거나 줄어드는 학과는?", answer: "전공 시장 · 학과 동향", icon: ArrowUpRight },
  { view: "schools", question: "어느 지역·학교의 규모가 큰가요?", answer: "지역·학교", icon: Building2 },
  { view: "details", question: "출판 대상 학교와 학과를 찾고 싶어요", answer: "학교·학과 찾기", icon: Database },
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
  return `${value > 0 ? "+" : ""}${fullNumber.format(value)}명`;
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

function ScreenGuide({ view, onOpen }: { view: View; onOpen: () => void }) {
  const guide = screenGuides[view];
  return (
    <details className={styles.screenGuide}>
      <summary>
        <span><CircleHelp size={17} /><strong>이 화면에서 알 수 있는 것</strong></span>
        <span>{guide.title}<ChevronDown size={16} /></span>
      </summary>
      <div className={styles.screenGuideBody}>
        <div>
          <p>{guide.description}</p>
          <div className={styles.guideQuestionChips}>{guide.questions.map((question) => <span key={question}>{question}</span>)}</div>
        </div>
        <aside><strong>해석 주의</strong><p>{guide.caution}</p></aside>
        <button type="button" onClick={onOpen}>전체 사용 가이드 보기</button>
      </div>
    </details>
  );
}

function UsageGuide({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: View, fieldSection?: FieldSection) => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.guideOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.guideDrawer} role="dialog" aria-modal="true" aria-labelledby="usage-guide-title">
        <header>
          <div><span>대시보드 사용 가이드</span><h2 id="usage-guide-title">무엇을 알고 싶으세요?</h2><p>질문을 선택하면 알맞은 분석 화면으로 이동합니다.</p></div>
          <button type="button" onClick={onClose} aria-label="사용 가이드 닫기"><X size={20} /></button>
        </header>
        <div className={styles.guideSteps}>
          <strong>처음이라면 이렇게 보세요</strong>
          <ol>
            <li><b>1</b><span><strong>학생 수 기준 선택</strong><small>재학생 또는 재적학생 중 분석 기준을 정합니다.</small></span></li>
            <li><b>2</b><span><strong>기간과 조건 설정</strong><small>기간·대학구분·지역 등 필요한 범위만 좁힙니다.</small></span></li>
            <li><b>3</b><span><strong>결과와 주의사항 확인</strong><small>증감 방향과 규모를 함께 보고 인과관계로 단정하지 않습니다.</small></span></li>
          </ol>
        </div>
        <div className={styles.guidePathList}>
          {guidePaths.map((path) => {
            const Icon = path.icon;
            return (
              <button type="button" key={`${path.view}-${path.fieldSection ?? "main"}`} onClick={() => onNavigate(path.view, path.fieldSection)}>
                <Icon size={19} />
                <span><strong>{path.question}</strong><small>{path.answer}에서 확인</small></span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
        <div className={styles.guideTerms}>
          <strong>자주 쓰는 기준</strong>
          <dl>
            <div><dt>재학생</dt><dd>현재 재학 중인 학생</dd></div>
            <div><dt>재적학생</dt><dd>재학생 + 휴학생 + 학위취득유예학생</dd></div>
            <div><dt>전년 대비</dt><dd>선택한 종료연도와 바로 이전 연도의 차이</dd></div>
            <div><dt>대·중·소계열</dt><dd>교육부 표준분류의 큰 범주부터 세부 범주</dd></div>
          </dl>
        </div>
        <footer><p>학생 규모는 시장 탐색을 위한 참고 지표이며 취업 전망·선호도·교재 판매량을 직접 뜻하지 않습니다.</p><button type="button" onClick={onClose}>가이드 닫고 시작하기</button></footer>
      </section>
    </div>
  );
}

function QuickStart({ onNavigate }: { onNavigate: (view: View, fieldSection?: FieldSection) => void }) {
  return (
    <section className={styles.quickStart} aria-labelledby="quick-start-title">
      <div><span className={styles.eyebrow}>빠른 시작</span><h2 id="quick-start-title">무엇을 알고 싶으세요?</h2><p>질문을 선택하면 알맞은 분석 화면으로 이동합니다.</p></div>
      <div className={styles.quickStartGrid}>
        {guidePaths.slice(1).map((path) => {
          const Icon = path.icon;
          return <button type="button" key={`${path.view}-${path.fieldSection ?? "main"}`} onClick={() => onNavigate(path.view, path.fieldSection)}><Icon size={18} /><span><strong>{path.question}</strong><small>{path.answer}</small></span><ChevronRight size={16} /></button>;
        })}
      </div>
    </section>
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
  if (isFlatChange(metric.changeRate)) {
    return (
      <span className={`${styles.changeBadge} ${styles.flatChange}`}>
        보합 · {formatChange(metric.change)}
      </span>
    );
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

function AnalysisMetricSwitch({
  value,
  onChange,
}: {
  value: MarketMetric;
  onChange: (metric: MarketMetric) => void;
}) {
  const activeLabel = value === "enrolled" ? "재학생" : "재적학생";
  return (
    <div className={styles.metricPriority}>
      <div className={styles.metricPriorityCopy}>
        <span>분석할 학생 수</span>
        <strong>{activeLabel} 기준으로 전체 화면을 분석합니다</strong>
        <small>기본값은 재학생이며, 선택은 핵심 수치·차트·순위·학과 목록에 함께 적용됩니다.</small>
      </div>
      <div className={styles.metricPriorityOptions} role="radiogroup" aria-label="분석할 학생 수">
        <button
          type="button"
          role="radio"
          aria-checked={value === "enrolled"}
          className={value === "enrolled" ? styles.metricPriorityActive : ""}
          onClick={() => onChange("enrolled")}
        >
          <strong>재학생</strong>
          <small>시장분석 기본</small>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === "total"}
          className={value === "total" ? styles.metricPriorityActive : ""}
          onClick={() => onChange("total")}
        >
          <strong>재적학생</strong>
          <small>재학생+휴학생+유예</small>
        </button>
      </div>
    </div>
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

function AnalysisPeriodFilter({
  years,
  startYear,
  endYear,
  onChange,
}: {
  years: number[];
  startYear: string;
  endYear: string;
  onChange: (startYear: string, endYear: string) => void;
}) {
  if (years.length === 0) return null;
  const firstYear = years[0];
  const lastYear = years.at(-1)!;
  const selectedStart = Number(startYear) || firstYear;
  const selectedEnd = Number(endYear) || lastYear;
  const quickWindows = [
    { label: "최근 1년", start: years[Math.max(0, years.length - 2)] },
    { label: "최근 3년", start: years[Math.max(0, years.length - 3)] },
    { label: "전체 기간", start: firstYear },
  ];
  return (
    <fieldset className={styles.periodFilter}>
      <legend>분석 기간</legend>
      <div className={styles.periodQuick}>
        {quickWindows.map((item) => (
          <button
            type="button"
            key={item.label}
            className={selectedStart === item.start && selectedEnd === lastYear ? styles.periodActive : ""}
            onClick={() => onChange(String(item.start), String(lastYear))}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.periodSelects}>
        <label>
          시작연도
          <select
            value={selectedStart}
            onChange={(event) => onChange(event.target.value, String(selectedEnd))}
          >
            {years.filter((year) => year <= selectedEnd).map((year) => <option key={year} value={year}>{year}년</option>)}
          </select>
        </label>
        <span aria-hidden="true">–</span>
        <label>
          종료연도
          <select
            value={selectedEnd}
            onChange={(event) => onChange(String(selectedStart), event.target.value)}
          >
            {years.filter((year) => year >= selectedStart).map((year) => <option key={year} value={year}>{year}년</option>)}
          </select>
        </label>
      </div>
    </fieldset>
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

export function LegacyOverview({ data }: { data: DashboardResponse }) {
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

function Overview({ baseQuery, metric, onNavigate }: { baseQuery: string; metric: MarketMetric; onNavigate: (view: View, fieldSection?: FieldSection) => void }) {
  return <div className={styles.viewStack}><QuickStart onNavigate={onNavigate} /><MarketAnalysis baseQuery={baseQuery} metric={metric} view="summary" /></div>;
}

function Fields({
  baseQuery,
  metric,
  filters,
  onFieldChange,
  onFieldMiddleChange,
  onFieldSmallChange,
  section,
  onSectionChange,
}: {
  baseQuery: string;
  metric: MarketMetric;
  filters: Filters;
  onFieldChange: (value: string) => void;
  onFieldMiddleChange: (value: string) => void;
  onFieldSmallChange: (value: string) => void;
  section: FieldSection;
  onSectionChange: (section: FieldSection) => void;
}) {
  const selection = [filters.field, filters.fieldMiddle, filters.fieldSmall]
    .filter(Boolean)
    .join(" → ") || "전체 계열";
  return (
    <div className={styles.fieldViewShell}>
      <div className={styles.fieldViewTabs} role="tablist" aria-label="전공 시장 분석 화면">
        <button type="button" role="tab" aria-selected={section === "explore"} onClick={() => onSectionChange("explore")}>
          <Layers3 size={17} />
          <span><strong>계열 탐색</strong><small>대·중·소계열 규모와 변화</small></span>
        </button>
        <button type="button" role="tab" aria-selected={section === "trends"} onClick={() => onSectionChange("trends")}>
          <ArrowUpRight size={17} />
          <span><strong>학과 동향</strong><small>요즘 뜨고 줄어드는 학과</small></span>
        </button>
      </div>
      {section === "explore" ? (
        <MarketAnalysis
          baseQuery={baseQuery}
          metric={metric}
          view="fields"
          fieldSelection={selection}
          fieldPath={{
            field: filters.field,
            fieldMiddle: filters.fieldMiddle,
            fieldSmall: filters.fieldSmall,
          }}
          onFieldChange={onFieldChange}
          onFieldMiddleChange={onFieldMiddleChange}
          onFieldSmallChange={onFieldSmallChange}
        />
      ) : (
        <DepartmentTrends baseQuery={baseQuery} metric={metric} />
      )}
    </div>
  );
}

function Schools({ data, baseQuery, metric }: { data: DashboardResponse; baseQuery: string; metric: MarketMetric }) {
  const visibleSchools = data.schools.slice(0, 10);
  const metricLabel = metric === "enrolled" ? "재학생" : "재적학생";
  const maxSchoolValue = Math.max(...visibleSchools.map((school) => school[metric]), 1);
  return (
    <section className={styles.viewStack}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>주요 학교</span>
            <h2>{data.currentYear}년 {metricLabel} 규모 상위 학교</h2>
            <p className={styles.panelDescription}>현재 학생 수와 전년 대비 증감을 함께 비교합니다.</p>
          </div>
          <span className={styles.panelNote}>현재 {metricLabel} 규모순 · 상위 {visibleSchools.length}개교</span>
        </div>
        <div className={styles.schoolComparison}>
          <div className={styles.schoolComparisonHeader} aria-hidden="true">
            <span>순위</span><span>학교·현재 규모</span><span>{metricLabel}·전체 비중</span><span>전년 대비</span>
          </div>
          {visibleSchools.map((school, index) => (
            <div className={styles.schoolComparisonRow} key={school.name}>
              <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.schoolComparisonName}>
                <LongName name={school.name} />
                <div className={styles.schoolScale}><i style={{ width: `${(school[metric] / maxSchoolValue) * 100}%` }} /></div>
              </div>
              <div className={styles.schoolCurrentValue}>
                <strong>{fullNumber.format(school[metric])}명</strong>
                <small>전체의 {percent.format(data.metrics[metric].value > 0 ? school[metric] / data.metrics[metric].value : 0)}</small>
              </div>
              <ChangeBadge metric={school} />
            </div>
          ))}
        </div>
      </article>
      <MarketAnalysis baseQuery={baseQuery} metric={metric} view="competition" />
    </section>
  );
}

function Details({
  data,
  metric,
  onPage,
  onPageSize,
}: {
  data: DashboardResponse;
  metric: MarketMetric;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const metricLabel = metric === "enrolled" ? "재학생" : "재적학생";
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
          <span className={styles.eyebrow}>{data.currentYear}년 출판 대상 탐색</span>
          <h2>학교·학과 목록</h2>
          <p className={styles.panelDescription}>학교와 학과를 찾고 전공 분류, 지역, 학생 규모를 함께 확인합니다.</p>
        </div>
        <span className={styles.panelNote}>총 {fullNumber.format(data.pagination.total)}개 학과</span>
      </div>
      <div className={`${styles.tableScroller} ${styles.desktopDetails}`}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>학교</th>
              <th>학과</th>
              <th>대학구분</th>
              <th>지역</th>
              <th>설립</th>
              <th>대계열</th>
              <th>중계열</th>
              <th>소계열</th>
              <th className={`${styles.numberCell} ${styles.selectedMetricCell}`}>{metricLabel}</th>
              <th>{metricLabel} 전년 대비</th>
            </tr>
          </thead>
          <tbody>
            {data.details.map((row) => (
              <tr key={`${row.year}-${row.school}-${row.sourceRow}`}>
                <td className={styles.strongCell}>{row.school}</td>
                <td><LongName name={row.department} /></td>
                <td>{row.universityCategory}</td>
                <td>{row.region}</td>
                <td>{row.establishment}</td>
                <td>{row.field}</td>
                <td>{row.fieldMiddle}</td>
                <td>{row.fieldSmall}</td>
                <td className={`${styles.numberCell} ${styles.strongCell} ${styles.selectedMetricCell}`}>
                  {fullNumber.format(row[metric])}
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
              <div className={styles.selectedDetailMetric}><dt>{metricLabel}</dt><dd>{fullNumber.format(row[metric])}명</dd></div>
            </dl>
            <div className={styles.detailChange}>
              <span>{metricLabel} 전년 대비</span>
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

function marketHeadline(data: DashboardResponse | null, metric: MarketMetric) {
  if (!data || data.annual.length === 0) return "장기 시장 변화를 불러오고 있습니다.";
  const start = data.annual[0];
  const end = data.annual.at(-1)!;
  const metricLabel = metric === "enrolled" ? "재학생" : "재적학생";
  const change = end[metric] - start[metric];
  const rate = start[metric] === 0 ? null : change / start[metric];
  const direction = change === 0 ? "변화 없음" : `${fullNumber.format(Math.abs(change))}명 ${change < 0 ? "감소" : "증가"}`;
  return `${start.year}–${end.year}년 ${metricLabel} 시장: ${direction} (${rate === null ? "비교 불가" : percent.format(rate)})`;
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
  const [analysisMetric, setAnalysisMetric] = useState<MarketMetric>("enrolled");
  const [fieldSection, setFieldSection] = useState<FieldSection>("explore");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(guideStorageKey)) return;
    const timer = window.setTimeout(() => setGuideOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const closeGuide = useCallback(() => {
    window.localStorage.setItem(guideStorageKey, "seen");
    setGuideOpen(false);
  }, []);

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
      startYear: filters.startYear,
      endYear: filters.endYear,
      universityCategory: filters.universityCategory,
      region: filters.region,
      school: filters.school,
      establishment: filters.establishment,
      field: filters.field,
      fieldMiddle: filters.fieldMiddle,
      fieldSmall: filters.fieldSmall,
      schoolStatus: filters.schoolStatus,
      department: appliedDepartment,
      analysisMetric,
    }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters, appliedDepartment, analysisMetric]);

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
  const setAnalysisWindow = (startYear: string, endYear: string) => {
    const start = Number(startYear);
    const end = Number(endYear);
    if (Number.isFinite(start) && Number.isFinite(end) && start > end) return;
    setFilters((current) => ({ ...current, startYear, endYear }));
    setPage(1);
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
  const dimensionFilterEntries = Object.entries(filters).filter(
    ([key, value]) => key !== "startYear" && key !== "endYear" && Boolean(value),
  );
  const availableYears = data?.meta.years ?? [];
  const defaultStartYear = availableYears[0];
  const defaultEndYear = availableYears.at(-1);
  const effectiveStartYear = Number(filters.startYear) || defaultStartYear;
  const effectiveEndYear = Number(filters.endYear) || defaultEndYear;
  const periodChanged = Boolean(
    defaultStartYear &&
      defaultEndYear &&
      (effectiveStartYear !== defaultStartYear || effectiveEndYear !== defaultEndYear),
  );
  const activeFilterCount = dimensionFilterEntries.length + (periodChanged ? 1 : 0);
  const basicFilterKeys = new Set(
    view === "overview"
      ? ["universityCategory", "region"]
      : view === "fields"
        ? ["universityCategory", "region", "field", "fieldMiddle", "fieldSmall"]
        : view === "schools"
          ? ["region", "establishment", "school"]
          : [],
  );
  const advancedFilterCount = dimensionFilterEntries.filter(
    ([key]) => !basicFilterKeys.has(key),
  ).length;
  const activeNav = navigation.find((item) => item.id === view)!;
  const navigateTo = (nextView: View, nextFieldSection?: FieldSection) => {
    setView(nextView);
    if (nextFieldSection) setFieldSection(nextFieldSection);
    setGuideOpen(false);
    window.localStorage.setItem(guideStorageKey, "seen");
    setMobileNav(false);
    setFiltersOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

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
            <strong>대학교재 시장</strong>
            <span>학생 규모 기반 분석</span>
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
        <div className={styles.localBadge}>
          {data?.dataset.dataYearRange?.replace("년", "") ?? "데이터 확인 중"} · 대학·전문대학
        </div>
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
                  setFiltersOpen(false);
                  window.scrollTo({ top: 0, behavior: "auto" });
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
          <span className={styles.navLabel}>도움말</span>
          <button type="button" className={styles.guideNavButton} onClick={() => { setGuideOpen(true); setMobileNav(false); }}>
            <CircleHelp size={19} />
            <span><strong>사용 가이드</strong><small>질문별 메뉴와 해석법</small></span>
          </button>
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
          <section className={`${styles.hero} ${view === "overview" ? styles.summaryHero : styles.pageHero}`}>
            <div>
              <span className={styles.heroEyebrow}>{activeNav.label}</span>
              <h1>{view === "overview" ? marketHeadline(data, analysisMetric) : activeNav.label}</h1>
              <p>
                {view === "overview"
                  ? "공시 학생 수의 기술 통계이며 원인·수요·취업 전망을 단정하지 않습니다."
                  : activeNav.description}
              </p>
            </div>
            {view === "overview" && (
              <div className={styles.heroSummary}>
                {data?.rowCount === 0 ? (
                  <>
                    <span>선택 현황</span>
                    <strong className={styles.noResultSummary}>검색 결과 없음</strong>
                    <small>필터를 조정해 주세요</small>
                  </>
                ) : (
                  <>
                    <span>{data?.currentYear ?? "—"}년 {analysisMetric === "enrolled" ? "재학생" : "재적학생"}</span>
                    <strong>{data ? compactNumber.format(data.metrics[analysisMetric].value) : "—"}</strong>
                    {data && <ChangeBadge metric={data.metrics[analysisMetric]} />}
                  </>
                )}
              </div>
            )}
          </section>
          <ScreenGuide view={view} onOpen={() => setGuideOpen(true)} />
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
                {filtersOpen
                  ? "상세 조건 접기"
                  : advancedFilterCount > 0
                    ? `상세 조건 ${advancedFilterCount}개 적용`
                    : "상세 조건"}
              </button>
            </div>
            <AnalysisMetricSwitch
              value={analysisMetric}
              onChange={(metric) => {
                setAnalysisMetric(metric);
                setPage(1);
              }}
            />
            <div className={styles.basicFilterGrid}>
              <AnalysisPeriodFilter
                years={availableYears}
                startYear={filters.startYear}
                endYear={filters.endYear}
                onChange={setAnalysisWindow}
              />
              {(view === "overview" || view === "fields") && (
                <SelectFilter
                  label="대학구분"
                  value={filters.universityCategory}
                  options={data?.meta.universityCategories ?? []}
                  onChange={setUniversityCategory}
                  helpText="대학과 전문대학을 구분합니다. 학교종류보다 상위의 시장 구분입니다."
                />
              )}
              {(view === "overview" || view === "schools" || view === "fields") && (
                <SelectFilter label="지역" value={filters.region} options={data?.meta.regions ?? []} onChange={setRegion} />
              )}
              {view === "schools" && (
                <>
                  <SelectFilter label="설립구분" value={filters.establishment} options={data?.meta.establishments ?? []} onChange={(value) => setFilter("establishment", value)} />
                  <SchoolCombobox key={`basic-${filterVersion}-${filters.region}-${filters.school}`} value={filters.school} options={schoolOptions} onChange={(value) => setFilter("school", value)} />
                </>
              )}
            </div>
            {(filtersOpen || view === "details") && (
            <div className={styles.filterGrid}>
              {(view === "schools" || view === "details") && (
                <SelectFilter
                  label="대학구분"
                  value={filters.universityCategory}
                  options={data?.meta.universityCategories ?? []}
                  onChange={setUniversityCategory}
                  helpText="대학과 전문대학을 구분합니다. 학교종류보다 상위의 시장 구분입니다."
                />
              )}
              {view === "details" && (
                <SelectFilter label="지역" value={filters.region} options={data?.meta.regions ?? []} onChange={setRegion} />
              )}
              {view !== "schools" && (
                <SchoolCombobox
                  key={`${filterVersion}-${filters.region}-${filters.school}`}
                  value={filters.school}
                  options={schoolOptions}
                  onChange={(value) => setFilter("school", value)}
                />
              )}
              {view !== "schools" && (
                <SelectFilter
                  label="설립구분"
                  value={filters.establishment}
                  options={data?.meta.establishments ?? []}
                  onChange={(value) => setFilter("establishment", value)}
                />
              )}
              {view !== "fields" && <SelectFilter
                label="대계열"
                value={filters.field}
                options={data?.meta.fields ?? []}
                onChange={setField}
                helpText="교육부 표준분류의 가장 큰 계열 구분입니다."
              />}
              {view !== "fields" && (
                <SelectFilter
                  label="중계열"
                  value={filters.fieldMiddle}
                  options={middleFieldOptions}
                  onChange={setFieldMiddle}
                  helpText="선택한 대계열 아래의 표준분류 중계열입니다."
                />
              )}
              {view !== "fields" && <SelectFilter
                label="소계열"
                value={filters.fieldSmall}
                options={smallFieldOptions}
                onChange={(value) => setFilter("fieldSmall", value)}
                helpText="가장 세부적인 표준분류 소계열입니다."
              />}
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
            )}
            {activeFilterCount > 0 && (
              <div className={styles.filterChips} aria-label="적용된 필터">
                {periodChanged && (
                  <button type="button" onClick={() => setAnalysisWindow(String(defaultStartYear), String(defaultEndYear))}>
                    {effectiveStartYear}~{effectiveEndYear}년 <X size={13} />
                  </button>
                )}
                {dimensionFilterEntries.map(([key, value]) => (
                  <button key={key} type="button" onClick={() => {
                    if (key === "region") setRegion("");
                    else if (key === "universityCategory") setUniversityCategory("");
                    else if (key === "field") setField("");
                    else if (key === "fieldMiddle") setFieldMiddle("");
                    else setFilter(key as keyof Filters, "");
                  }}>
                    {value} <X size={13} />
                  </button>
                ))}
                <button type="button" className={styles.clearAllChip} onClick={resetFilters}>전체 초기화</button>
              </div>
            )}
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
              {view === "overview" && <Overview baseQuery={baseQuery} metric={analysisMetric} onNavigate={navigateTo} />}
              {view === "fields" && (
                <Fields
                  baseQuery={baseQuery}
                  metric={analysisMetric}
                  filters={filters}
                  onFieldChange={setField}
                  onFieldMiddleChange={setFieldMiddle}
                  onFieldSmallChange={(value) => setFilter("fieldSmall", value)}
                  section={fieldSection}
                  onSectionChange={setFieldSection}
                />
              )}
              {view === "schools" && <Schools data={data} baseQuery={baseQuery} metric={analysisMetric} />}
              {view === "details" && (
                <Details
                  data={data}
                  metric={analysisMetric}
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
              형식을 통일하고 검산을 통과한 데이터만 사용합니다. 원본 XLSX는 웹 공개 폴더에 복사하지 않습니다.
            </p>
            <span>
              마지막 변환 · {data?.dataset.generatedAt.slice(0, 10) ?? "—"}
            </span>
          </footer>
        </div>
      </main>
      {guideOpen && <UsageGuide onClose={closeGuide} onNavigate={navigateTo} />}
    </div>
  );
}
