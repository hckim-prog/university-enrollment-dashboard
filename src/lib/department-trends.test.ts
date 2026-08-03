import { describe, expect, it } from "vitest";
import { createDashboard, emptyFilters } from "./analytics";
import { classifyDepartment } from "./department-groups";
import {
  createDepartmentTrends,
  DEFAULT_TREND_CRITERIA,
} from "./department-trends";
import type { EnrollmentRecord } from "./types";

function row(
  year: number,
  department: string,
  total: number,
  overrides: Partial<EnrollmentRecord> = {},
): EnrollmentRecord {
  return {
    year,
    schoolType: "대학교",
    establishment: "국립",
    region: "서울",
    schoolStatus: "기존",
    school: "한빛대학교",
    college: "공과대학",
    department,
    dayNight: "주간",
    departmentFeature: "일반과정",
    departmentStatus: "기존",
    field: "공학계열",
    capacity: 100,
    enrolled: Math.max(total - 12, 0),
    leave: total === 0 ? 0 : 10,
    deferment: total === 0 ? 0 : 2,
    total,
    sourceRow: year,
    ...overrides,
  };
}

const records: EnrollmentRecord[] = [
  row(2023, "컴퓨터공학과", 100),
  row(2024, "컴퓨터공학과", 120),
  row(2025, "컴퓨터공학과", 150),
  row(2024, "영어영문학과", 40, { college: "인문대학" }),
  row(2025, "AI데이터학과", 50, {
    college: "AI융합대학",
    departmentStatus: "신설",
    sourceRow: 99,
  }),
  row(2024, "통계학과", 0, { college: "자연과학대학", sourceRow: 100 }),
  row(2025, "통계학과", 20, { college: "자연과학대학", sourceRow: 101 }),
];

describe("department group classification", () => {
  it("uses priority and manual rules while preserving uncertain names", () => {
    expect(classifyDepartment("관광경영학과").name).toBe("관광·호텔·외식");
    expect(classifyDepartment("컴퓨터교육과").name).toBe("교육");
    expect(classifyDepartment("근거가불분명한학과").name).toBe("기타·미분류");
  });
});

describe("department trend analysis", () => {
  it("excludes years after the selected year from every group series", () => {
    const result = createDepartmentTrends(records, {
      ...emptyFilters(),
      years: [2024],
    });
    expect(result.meta.years).toEqual([2023, 2024]);
    expect(result.groups.flatMap((group) => group.annual.map((point) => point.year)))
      .not.toContain(2025);
    expect(result.totals.total).toBe(160);
    expect(result.validation.futureYearExcluded).toBe(true);
  });

  it("reconciles group totals, contributions, and global-filter totals", () => {
    const filters = { ...emptyFilters(), years: [2025], regions: ["서울"] };
    const trends = createDepartmentTrends(records, filters);
    const dashboard = createDashboard(records, filters);
    expect(trends.validation.groupTotalMatches).toBe(true);
    expect(trends.validation.contributionMatches).toBe(true);
    expect(trends.validation.assignedRows).toBe(trends.validation.sourceRows);
    expect(trends.totals.total).toBe(dashboard.metrics.total.value);
  });

  it("does not produce a rate from a zero baseline or overlap lifecycle events", () => {
    const result = createDepartmentTrends(
      records,
      { ...emptyFilters(), years: [2025] },
      { ...DEFAULT_TREND_CRITERIA, includeClosed: true },
      { trendType: "new_unavailable", pageSize: 50 },
    );
    const statistics = result.individuals.find(
      (item) => item.department === "통계학과",
    );
    expect(statistics?.recentRate).toBeNull();
    expect(statistics?.trendType).toBe("new_unavailable");
    expect(result.validation.invalidRateCount).toBe(0);
    expect(result.validation.lifecycleOverlapCount).toBe(0);
  });

  it("classifies a new publication year using its latest three-year window", () => {
    const extended = [
      row(2024, "미래공학과", 100),
      row(2025, "미래공학과", 125),
      row(2026, "미래공학과", 155),
    ];
    const result = createDepartmentTrends(extended, {
      ...emptyFilters(),
      years: [2026],
    });
    const department = result.individuals.find(
      (item) => item.department === "미래공학과",
    );

    expect(result.meta.years).toEqual([2024, 2025, 2026]);
    expect(department?.trendType).toBe("persistent_up");
    expect(department?.values).toEqual({ 2024: 100, 2025: 125, 2026: 155 });
  });
});
