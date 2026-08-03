import { describe, expect, it } from "vitest";
import { createDashboard, emptyFilters, filterRecords } from "./analytics";
import type { EnrollmentRecord } from "./types";

const base: Omit<EnrollmentRecord, "year" | "enrolled" | "leave" | "total"> = {
  schoolType: "대학교",
  establishment: "국립",
  region: "서울",
  schoolStatus: "기존",
  school: "한빛대학교",
  college: "공과대학",
  department: "컴퓨터공학과",
  dayNight: "주간",
  departmentFeature: "일반과정",
  departmentStatus: "기존",
  field: "공학계열",
  capacity: 100,
  deferment: 2,
  sourceRow: 7,
};

const records: EnrollmentRecord[] = [
  { ...base, year: 2024, enrolled: 80, leave: 18, total: 100 },
  { ...base, year: 2025, enrolled: 84, leave: 24, total: 110 },
  {
    ...base,
    year: 2025,
    school: "다른대학교",
    region: "부산",
    department: "경영학과",
    field: "인문ㆍ사회계열",
    enrolled: 50,
    leave: 8,
    deferment: 2,
    total: 60,
    sourceRow: 8,
  },
];

describe("analytics", () => {
  it("filters by region and partial department name", () => {
    const filters = {
      ...emptyFilters(),
      regions: ["서울"],
      departmentQuery: "컴퓨터",
    };
    expect(filterRecords(records, filters)).toHaveLength(2);
  });

  it("calculates current-year totals and year-over-year changes", () => {
    const dashboard = createDashboard(records, emptyFilters());
    expect(dashboard.currentYear).toBe(2025);
    expect(dashboard.metrics.total.value).toBe(170);
    expect(dashboard.metrics.total.change).toBe(70);
    expect(dashboard.annual).toHaveLength(2);
    expect(dashboard.pagination.total).toBe(2);
    expect(dashboard.details.every((row) => row.year === 2025)).toBe(true);
  });

  it("keeps the prior year as comparison context when a year is selected", () => {
    const filters = { ...emptyFilters(), years: [2025], regions: ["서울"] };
    const dashboard = createDashboard(records, filters);
    expect(dashboard.metrics.total.value).toBe(110);
    expect(dashboard.metrics.total.change).toBe(10);
    expect(dashboard.pagination.total).toBe(1);
  });

  it("uses the selected year as the trend cutoff", () => {
    const dashboard = createDashboard(records, {
      ...emptyFilters(),
      years: [2024],
    });
    expect(dashboard.currentYear).toBe(2024);
    expect(dashboard.annual.map((point) => point.year)).toEqual([2024]);
    expect(
      dashboard.departmentSeries.flatMap((series) =>
        series.annual.map((point) => point.year),
      ),
    ).toEqual([2024]);
  });

  it("returns region-linked schools and applies the requested page size", () => {
    const dashboard = createDashboard(records, emptyFilters(), 1, 10);
    expect(dashboard.meta.schoolsByRegion["서울"]).toEqual(["한빛대학교"]);
    expect(dashboard.meta.schoolsByRegion["부산"]).toEqual(["다른대학교"]);
    expect(dashboard.pagination.pageSize).toBe(10);
  });

  it("keeps KPI, final trend point, ranking, and details totals aligned", () => {
    const dashboard = createDashboard(records, {
      ...emptyFilters(),
      years: [2025],
      schools: ["한빛대학교"],
    });
    const detailTotal = dashboard.details.reduce((sum, row) => sum + row.total, 0);
    expect(dashboard.metrics.total.value).toBe(110);
    expect(dashboard.annual.at(-1)?.total).toBe(110);
    expect(dashboard.schools[0].total).toBe(110);
    expect(detailTotal).toBe(110);
  });
});
