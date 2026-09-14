import { describe, expect, it } from "vitest";
import type { TrendResult } from "./curriculum-types";
import { appliedFilterEntries, buildResearchReportHtml, researchCsv, parseResearchProject, summarizeTopicTrend, viewFromUrl, urlForView, parseCurriculumBasket, trendSearchParams } from "./research-workspace";

const trend: TrendResult = {
  filters: {
    year: 2026,
    q: "인공지능",
    description: true,
    category: "",
    school: "",
    department: "",
    division: "",
    page: 1,
  },
  version: "curriculum-v1",
  years: [2024, 2025, 2026],
  commonSchools: 8,
  all: [
    { year: 2024, schools: 10, departments: 12, total: 20, enrolled: 1000, unlinked: 2, coverage: 30 },
    { year: 2025, schools: 11, departments: 14, total: 24, enrolled: null, unlinked: 3, coverage: 31 },
    { year: 2026, schools: 15, departments: 18, total: 29, enrolled: 1300, unlinked: 1, coverage: 32 },
  ],
  common: [],
};

describe("research workspace trend summary", () => {
  it("calculates first-to-last changes while preserving missing enrollment", () => {
    expect(summarizeTopicTrend(trend)).toEqual({
      firstYear: 2024,
      lastYear: 2026,
      schools: { first: 10, last: 15, change: 5 },
      departments: { first: 12, last: 18, change: 6 },
      registrations: { first: 20, last: 29, change: 9 },
      enrolled: { first: 1000, last: 1300, change: 300 },
      coverage: { first: 30, last: 32, change: 2 },
    });
  });
});

describe("research workspace trend request", () => {
  it("lets the API choose the latest available year for trend mode", () => {
    const params = trendSearchParams("인공지능");
    expect(params.get("mode")).toBe("trend");
    expect(params.get("q")).toBe("인공지능");
    expect(params.get("description")).toBe("true");
    expect(params.has("year")).toBe(false);
  });
});

describe("research project import", () => {
  it("validates the portable schema and rejects embedded curriculum rows", () => {
    const valid = parseResearchProject(JSON.stringify({
      schemaVersion: 1,
      title: "AI 교재 시장 조사",
      topics: ["인공지능", "머신러닝"],
      candidateMetadata: {
        "source:10": { status: "우선검토", owner: "기획팀", note: "회의 안건" },
      },
      exportedAt: "2026-09-14T00:00:00.000Z",
    }));
    expect(valid.ok).toBe(true);

    const invalid = parseResearchProject(JSON.stringify({
      schemaVersion: 1,
      title: "잘못된 파일",
      topics: ["A", "B", "C", "D", "E"],
      candidateMetadata: {},
      rows: [{ id: "large-row" }],
      exportedAt: "not-a-date",
    }));
    expect(invalid).toEqual({ ok: false, error: "유효한 시장조사 프로젝트 파일이 아닙니다." });
  });
});

describe("research report CSV", () => {
  it("neutralizes spreadsheet formulas in every exported cell", () => {
    const csv = researchCsv([
      ["주제", "담당자"],
      ["=HYPERLINK(\"bad\")", "+기획팀"],
      ["-1", "@owner"],
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+기획팀");
    expect(csv).toContain("'-1");
    expect(csv).toContain("'@owner");
  });
});

describe("standalone HTML report", () => {
  it("escapes user content and includes report provenance and caveats", () => {
    const html = buildResearchReportHtml({
      title: "AI <script>alert(1)</script>",
      generatedAt: "2026-09-14T03:00:00.000Z",
      topics: [{ name: "AI & 데이터", summary: summarizeTopicTrend(trend)!, version: "v<1", filters: "과목명·해설" }],
      candidates: [{ id: "1", school: "A대", department: "컴퓨터학과", course: "AI <기초>", year: 2026, enrolled: 100, status: "검토중", owner: "홍길동", note: "<b>메모</b>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("AI &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("데이터 버전");
    expect(html).toContain("실제 판매 수요가 아닙니다");
    expect(html).toContain("@media print");
  });
});

describe("debounced department filter presentation", () => {
  it("uses only the applied department in chips and counts", () => {
    expect(appliedFilterEntries({ region: "서울", department: "컴퓨" }, "컴퓨터공학과"))
      .toEqual([["region", "서울"], ["department", "컴퓨터공학과"]]);
    expect(appliedFilterEntries({ region: "서울", department: "입력 중" }, ""))
      .toEqual([["region", "서울"]]);
  });
});

describe("top-level view URL", () => {
  it("validates restored views and changes only the view query", () => {
    expect(viewFromUrl("https://example.test/?view=research")).toBe("research");
    expect(viewFromUrl("https://example.test/?view=unknown")).toBe("overview");
    expect(urlForView("https://example.test/?region=서울&view=fields", "research"))
      .toBe("https://example.test/?region=%EC%84%9C%EC%9A%B8&view=research");
    expect(urlForView("https://example.test/?region=서울&view=fields", "overview"))
      .toBe("https://example.test/?region=%EC%84%9C%EC%9A%B8");
  });
});

describe("curriculum basket reader", () => {
  it("accepts schema v1 rows without changing the basket shape", () => {
    const parsed = parseCurriculumBasket(JSON.stringify({ schema: 1, rows: { row1: { id: "row1", year: 2026, school: "A대", department: "AI학과", course: "AI", enrolled: 10 } }, context: {} }));
    expect(parsed?.rows.row1.course).toBe("AI");
    expect(parseCurriculumBasket('{"schema":2,"rows":{}}')).toBeNull();
  });
});
