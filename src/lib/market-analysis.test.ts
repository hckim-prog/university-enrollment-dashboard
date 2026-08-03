import { describe, expect, it } from "vitest";
import { emptyFilters } from "./analytics";
import { createMarketAnalysis } from "./market-analysis";
import type { EnrollmentRecord } from "./types";

function record(
  year: number,
  universityCategory: string,
  field: string,
  school: string,
  total: number,
  previousCode: string,
): EnrollmentRecord {
  return {
    year,
    disclosureYear: year,
    schoolCode: school,
    campus: "본교",
    universityCategory,
    schoolType: universityCategory === "대학" ? "대학교" : "전문대학",
    establishment: "사립",
    establishmentType: "사립",
    locationType: "수도권",
    region: "서울",
    schoolStatus: "기존",
    school,
    college: "단과대구분없음",
    departmentCode: previousCode,
    department: `${field}학과`,
    dayNight: "주간",
    departmentFeature: "일반과정",
    departmentStatus: "",
    institutionField: field,
    field,
    fieldMiddle: `${field} 중계열`,
    fieldSmall: `${field} 소계열`,
    capacity: year >= 2023 ? 100 : null,
    enrolled: total === 0 ? 0 : total - 10,
    leave: total === 0 ? 0 : 8,
    deferment: total === 0 ? 0 : 2,
    total,
    sourceRow: year,
  };
}

const records = [
  record(2019, "대학", "공학계열", "가대", 100, "D1"),
  record(2019, "전문대학", "인문사회계열", "나대", 100, "D2"),
  record(2024, "대학", "공학계열", "가대", 110, "D1"),
  record(2024, "전문대학", "인문사회계열", "나대", 80, "D2"),
  record(2025, "대학", "공학계열", "가대", 120, "D1"),
  record(2025, "전문대학", "인문사회계열", "나대", 70, "D2"),
];

describe("market analysis", () => {
  it("reconciles market, category, and field totals", () => {
    const result = createMarketAnalysis(records, emptyFilters());
    expect(result.kpis.marketSize.value).toBe(190);
    expect(result.kpis.marketSize.change).toBe(0);
    expect(result.kpis.marketSize.changeFromStart).toBe(-10);
    expect(result.validation.fieldTotalMatches).toBe(true);
    expect(result.validation.universityCategoryTotalMatches).toBe(true);
    expect(result.validation.enrollmentEquationMatches).toBe(true);
    expect(result.contribution.map((row) => row.contributionRate)).toEqual([
      0.5,
      0.5,
    ]);
  });

  it("uses the selected year as the cutoff across every series", () => {
    const result = createMarketAnalysis(records, {
      ...emptyFilters(),
      years: [2024],
    });
    expect(result.meta.selectedYear).toBe(2024);
    expect(result.annual.map((row) => row.year)).toEqual([2019, 2024]);
    expect(result.annual.some((row) => row.year === 2025)).toBe(false);
  });

  it("applies university category and hierarchy filters consistently", () => {
    const result = createMarketAnalysis(records, {
      ...emptyFilters(),
      universityCategories: ["전문대학"],
      fields: ["인문사회계열"],
      fieldMiddles: ["인문사회계열 중계열"],
    });
    expect(result.kpis.marketSize.value).toBe(70);
    expect(result.universityCategories.map((row) => row.name)).toEqual([
      "전문대학",
    ]);
    expect(result.fields.map((row) => row.name)).toEqual(["인문사회계열"]);
  });

  it("calculates long-term change, CAGR, and category indexes from the selected start", () => {
    const result = createMarketAnalysis(
      records,
      emptyFilters(),
      "total",
      { startYear: 2019, endYear: 2025 },
    );
    expect(result.kpis.marketSize.startValue).toBe(200);
    expect(result.kpis.marketSize.changeFromStart).toBe(-10);
    expect(result.kpis.marketSize.changeRateFromStart).toBeCloseTo(-0.05);
    expect(result.kpis.marketSize.cagr).toBeCloseTo((190 / 200) ** (1 / 6) - 1);
    expect(result.universityCategoryAnnual.every((series) => series.annual[0].index === 100)).toBe(true);
  });

  it("limits every market series to a recent three-year window", () => {
    const result = createMarketAnalysis(
      records,
      emptyFilters(),
      "total",
      { startYear: 2023, endYear: 2025 },
    );
    expect(result.meta.startYear).toBe(2023);
    expect(result.meta.endYear).toBe(2025);
    expect(result.annual.every((point) => point.year >= 2023 && point.year <= 2025)).toBe(true);
  });

  it("uses the end-year previous calendar year and excludes later records", () => {
    const result = createMarketAnalysis(
      records,
      emptyFilters(),
      "total",
      { startYear: 2019, endYear: 2024 },
    );
    expect(result.meta.previousYear).toBeNull();
    expect(result.kpis.marketSize.value).toBe(190);
    expect(result.kpis.marketSize.change).toBeNull();
    expect(result.annual.some((point) => point.year > 2024)).toBe(false);
  });

  it("keeps regional, category, and student-component totals aligned", () => {
    const result = createMarketAnalysis(records, emptyFilters());
    const latest = result.annual.at(-1)!;
    expect(result.regions.reduce((sum, row) => sum + row.value, 0)).toBe(
      result.kpis.marketSize.value,
    );
    expect(result.universityCategories.reduce((sum, row) => sum + row.value, 0)).toBe(
      result.kpis.marketSize.value,
    );
    expect(latest.enrolled + latest.leave + latest.deferment).toBe(latest.total);
  });

  it("does not calculate CAGR or a category index from a zero start", () => {
    const zeroStart = [
      record(2019, "대학", "공학계열", "영대", 0, "D0"),
      record(2025, "대학", "공학계열", "영대", 30, "D0"),
    ];
    const result = createMarketAnalysis(
      zeroStart,
      emptyFilters(),
      "total",
      { startYear: 2019, endYear: 2025 },
    );
    expect(result.kpis.marketSize.cagr).toBeNull();
    expect(result.universityCategoryAnnual[0].annual.every((point) => point.index === null)).toBe(true);
  });

  it("returns a reconciled empty result for unmatched filters", () => {
    const result = createMarketAnalysis(records, {
      ...emptyFilters(),
      regions: ["없는 지역"],
    });
    expect(result.kpis.marketSize.value).toBe(0);
    expect(result.regions).toEqual([]);
    expect(result.validation.fieldTotalMatches).toBe(true);
    expect(result.validation.universityCategoryTotalMatches).toBe(true);
  });
});
