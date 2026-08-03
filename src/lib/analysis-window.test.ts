import { describe, expect, it } from "vitest";
import {
  analysisYears,
  indexedValue,
  isFlatChange,
  resolveAnalysisWindow,
} from "./analysis-window";

const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

describe("analysis window", () => {
  it("uses the full dataset by default", () => {
    expect(resolveAnalysisWindow(years)).toEqual({ startYear: 2019, endYear: 2025 });
  });

  it.each([
    [2024, 2025],
    [2023, 2025],
    [2020, 2022],
  ])("supports %i-%i windows", (startYear, endYear) => {
    const window = resolveAnalysisWindow(years, { startYear, endYear });
    expect(window).toEqual({ startYear, endYear });
    expect(analysisYears(years, window)).toEqual(
      years.filter((year) => year >= startYear && year <= endYear),
    );
  });

  it("treats the legacy year as the end year", () => {
    expect(resolveAnalysisWindow(years, { year: 2024 })).toEqual({
      startYear: 2019,
      endYear: 2024,
    });
  });

  it("restores the safe default when start is after end", () => {
    expect(resolveAnalysisWindow(years, { startYear: 2025, endYear: 2023 })).toEqual({
      startYear: 2019,
      endYear: 2025,
    });
  });

  it("clamps missing years to the nearest observed years", () => {
    expect(resolveAnalysisWindow(years, { startYear: 2018, endYear: 2027 })).toEqual({
      startYear: 2019,
      endYear: 2025,
    });
  });

  it("does not calculate an index from a zero baseline", () => {
    expect(indexedValue(20, 0)).toBeNull();
    expect(indexedValue(120, 100)).toBe(120);
  });

  it("classifies rates below 0.05 percent as flat", () => {
    expect(isFlatChange(-0.0003)).toBe(true);
    expect(isFlatChange(-0.001)).toBe(false);
  });
});
