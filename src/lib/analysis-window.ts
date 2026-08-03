export type AnalysisWindow = {
  startYear: number;
  endYear: number;
};

type WindowInput = {
  startYear?: string | number | null;
  endYear?: string | number | null;
  year?: string | number | null;
};

function asInteger(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function closestYear(years: number[], requested: number) {
  return years.reduce((closest, year) =>
    Math.abs(year - requested) < Math.abs(closest - requested) ? year : closest,
  );
}

export function resolveAnalysisWindow(
  availableYears: number[],
  input: WindowInput = {},
): AnalysisWindow {
  const years = [...new Set(availableYears)].toSorted((a, b) => a - b);
  if (years.length === 0) return { startYear: 0, endYear: 0 };
  const defaultWindow = {
    startYear: years[0],
    endYear: years.at(-1)!,
  };
  const requestedEnd = asInteger(input.endYear) ?? asInteger(input.year);
  const requestedStart = asInteger(input.startYear);
  const endYear = requestedEnd === null
    ? defaultWindow.endYear
    : closestYear(years, requestedEnd);
  const startYear = requestedStart === null
    ? defaultWindow.startYear
    : closestYear(years, requestedStart);
  if (startYear > endYear) return defaultWindow;
  return { startYear, endYear };
}

export function analysisYears(
  availableYears: number[],
  window: AnalysisWindow,
) {
  return [...new Set(availableYears)]
    .filter((year) => year >= window.startYear && year <= window.endYear)
    .toSorted((a, b) => a - b);
}

export function parseAnalysisWindow(
  search: URLSearchParams,
  availableYears: number[],
) {
  return resolveAnalysisWindow(availableYears, {
    startYear: search.get("startYear"),
    endYear: search.get("endYear"),
    year: search.get("year"),
  });
}

export function isFlatChange(rate: number | null) {
  return rate !== null && Math.abs(rate) < 0.0005;
}

export function indexedValue(value: number, startValue: number) {
  return startValue > 0 ? (value / startValue) * 100 : null;
}
