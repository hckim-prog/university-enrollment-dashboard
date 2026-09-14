import type { CurriculumRow, TrendResult } from "./curriculum-types";
import { csvCell } from "./curriculum";

export const RESEARCH_SCHEMA_VERSION = 1 as const;
export const DASHBOARD_VIEWS = ["overview", "fields", "schools", "details", "curriculum", "research"] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];
export const CURRICULUM_BASKET_KEY = "curriculum-basket-v1";
export type CurriculumBasket = { schema: 1; rows: Record<string, CurriculumRow>; context: Record<string, unknown> };

export function viewFromUrl(source: string): DashboardView {
  const requested = new URL(source).searchParams.get("view");
  return DASHBOARD_VIEWS.includes(requested as DashboardView) ? requested as DashboardView : "overview";
}

export function urlForView(source: string, view: DashboardView) {
  const url = new URL(source);
  if (view === "overview") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  return url.toString();
}

export function parseCurriculumBasket(source: string | null): CurriculumBasket | null {
  if (!source) return { schema: 1, rows: {}, context: {} };
  try {
    const value = JSON.parse(source) as Partial<CurriculumBasket>;
    if (value.schema !== 1 || !value.rows || typeof value.rows !== "object" || Array.isArray(value.rows)) return null;
    return { schema: 1, rows: value.rows, context: value.context && typeof value.context === "object" ? value.context : {} };
  } catch {
    return null;
  }
}

export function trendSearchParams(topic: string) {
  return new URLSearchParams({
    mode: "trend",
    q: topic,
    description: "true",
    category: "",
    school: "",
    department: "",
    division: "",
  });
}

export const CANDIDATE_STATUSES = ["검토중", "우선검토", "보류", "제외"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type CandidateMetadata = {
  status: CandidateStatus;
  owner: string;
  note: string;
};
export type ResearchProject = {
  schemaVersion: typeof RESEARCH_SCHEMA_VERSION;
  title: string;
  topics: string[];
  candidateMetadata: Record<string, CandidateMetadata>;
  generatedAt?: string;
  exportedAt: string;
};
export type ProjectParseResult =
  | { ok: true; project: ResearchProject }
  | { ok: false; error: string };

type ChangeValue = {
  first: number | null;
  last: number | null;
  change: number | null;
};

export type TopicTrendSummary = {
  firstYear: number;
  lastYear: number;
  schools: ChangeValue;
  departments: ChangeValue;
  registrations: ChangeValue;
  enrolled: ChangeValue;
  coverage: ChangeValue;
};

function change(first: number | null, last: number | null): ChangeValue {
  return {
    first,
    last,
    change: first === null || last === null ? null : last - first,
  };
}

export function summarizeTopicTrend(result: TrendResult): TopicTrendSummary | null {
  const first = result.all[0];
  const last = result.all.at(-1);
  if (!first || !last) return null;

  return {
    firstYear: first.year,
    lastYear: last.year,
    schools: change(first.schools, last.schools),
    departments: change(first.departments, last.departments),
    registrations: change(first.total, last.total),
    enrolled: change(first.enrolled, last.enrolled),
    coverage: change(first.coverage, last.coverage),
  };
}

function isCandidateMetadata(value: unknown): value is CandidateMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return CANDIDATE_STATUSES.includes(item.status as CandidateStatus) &&
    typeof item.owner === "string" && typeof item.note === "string";
}

export function parseResearchProject(source: string): ProjectParseResult {
  try {
    const parsed = JSON.parse(source) as Record<string, unknown>;
    const metadata = parsed.candidateMetadata;
    const valid = parsed.schemaVersion === RESEARCH_SCHEMA_VERSION &&
      typeof parsed.title === "string" && parsed.title.length <= 200 &&
      Array.isArray(parsed.topics) && parsed.topics.length <= 4 &&
      parsed.topics.every((topic) => typeof topic === "string" && topic.trim().length > 0 && topic.length <= 100) &&
      metadata !== null && typeof metadata === "object" && !Array.isArray(metadata) &&
      Object.values(metadata).every(isCandidateMetadata) &&
      typeof parsed.exportedAt === "string" && !Number.isNaN(Date.parse(parsed.exportedAt)) &&
      (parsed.generatedAt === undefined ||
        (typeof parsed.generatedAt === "string" && !Number.isNaN(Date.parse(parsed.generatedAt)))) &&
      !("rows" in parsed);
    if (!valid) throw new Error("invalid_project");
    return { ok: true, project: parsed as ResearchProject };
  } catch {
    return { ok: false, error: "유효한 시장조사 프로젝트 파일이 아닙니다." };
  }
}

function safeSpreadsheetValue(value: unknown) {
  if (typeof value !== "string") return value;
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

export function researchCsv(rows: unknown[][]) {
  return "\uFEFF" + rows
    .map((row) => row.map((value) => csvCell(safeSpreadsheetValue(value))).join(","))
    .join("\r\n");
}

export type ReportTopic = {
  name: string;
  summary: TopicTrendSummary;
  version: string;
  filters: string;
};
export type ReportCandidate = CandidateMetadata & {
  id: string;
  school: string;
  department: string;
  course: string;
  year: number;
  enrolled: number | null;
};
export type ResearchReport = {
  title: string;
  generatedAt: string;
  topics: ReportTopic[];
  candidates: ReportCandidate[];
};

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reportValue(value: ChangeValue) {
  if (value.first === null || value.last === null) return "자료 없음";
  const sign = value.change !== null && value.change > 0 ? "+" : "";
  return `${value.first.toLocaleString("ko-KR")} → ${value.last.toLocaleString("ko-KR")} (${sign}${value.change?.toLocaleString("ko-KR")})`;
}

export function buildResearchReportHtml(report: ResearchReport) {
  const topicRows = report.topics.map((topic) => `<tr><th>${escapeHtml(topic.name)}</th><td>${reportValue(topic.summary.schools)}</td><td>${reportValue(topic.summary.departments)}</td><td>${reportValue(topic.summary.registrations)}</td><td>${reportValue(topic.summary.enrolled)}</td><td>${reportValue(topic.summary.coverage)}</td></tr>`).join("");
  const candidates = report.candidates.map((candidate) => `<tr><td>${escapeHtml(candidate.school)}</td><td>${escapeHtml(candidate.department)}</td><td>${escapeHtml(candidate.course)}</td><td>${candidate.year}</td><td>${candidate.enrolled === null ? "자료 없음" : candidate.enrolled.toLocaleString("ko-KR")}</td><td>${escapeHtml(candidate.status)}</td><td>${escapeHtml(candidate.owner)}</td><td>${escapeHtml(candidate.note)}</td></tr>`).join("");
  const provenance = report.topics.map((topic) => `<li>${escapeHtml(topic.name)} · 데이터 버전 ${escapeHtml(topic.version)} · 필터 ${escapeHtml(topic.filters)}</li>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>body{font:14px/1.6 system-ui,sans-serif;color:#18202b;max-width:1120px;margin:40px auto;padding:0 24px}h1{font-size:28px}h2{margin-top:32px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #d9dee7;text-align:left;vertical-align:top}thead{background:#f3f6fa}.caveat{padding:16px;background:#fff8e8;border:1px solid #ead7a2}@media print{body{max-width:none;margin:0;padding:0;font-size:10pt}h1{font-size:20pt}table{break-inside:auto}tr{break-inside:avoid}}</style></head><body><main><p>시장조사 워크스페이스 보고서</p><h1>${escapeHtml(report.title)}</h1><p>생성 시각 ${escapeHtml(new Date(report.generatedAt).toLocaleString("ko-KR"))}</p><h2>주제 비교</h2><table><thead><tr><th>주제</th><th>관련 학교</th><th>관련 학과</th><th>교육과정 등록</th><th>연결 재학생</th><th>확보 학교</th></tr></thead><tbody>${topicRows || '<tr><td colspan="6">실행된 비교 결과가 없습니다.</td></tr>'}</tbody></table><h2>연구 후보</h2><table><thead><tr><th>학교</th><th>학과</th><th>과목</th><th>연도</th><th>재학생</th><th>상태</th><th>담당자</th><th>메모</th></tr></thead><tbody>${candidates || '<tr><td colspan="8">저장된 후보가 없습니다.</td></tr>'}</tbody></table><h2>데이터 출처·필터</h2><p>교육과정 원본 및 대학알리미 학과별 학생 현황 연결 자료</p><ul>${provenance || "<li>비교 결과를 실행하면 데이터 버전과 필터가 기록됩니다.</li>"}</ul><div class="caveat"><strong>해석 유의사항</strong><p>교육과정 등록은 실제 개설 강좌 수가 아니며, 학과 재학생은 수강인원·예상 판매부수·실제 판매 수요가 아닙니다. 연도별 자료 범위와 조사차수 차이, 미연결 학과를 함께 확인하세요.</p></div></main></body></html>`;
}

export function appliedFilterEntries<T extends Record<string, string>>(
  filters: T,
  appliedDepartment: string,
) {
  return Object.entries({ ...filters, department: appliedDepartment }).filter(
    ([key, value]) => key !== "startYear" && key !== "endYear" && Boolean(value),
  );
}
