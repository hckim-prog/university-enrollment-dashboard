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
    enrolled: total - 10,
    leave: 8,
    deferment: 2,
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
});
