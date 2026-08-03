import type {
  AnnualPoint,
  EnrollmentRecord,
  FilterState,
  MetricKey,
  RankedPoint,
} from "./types";
import {
  analysisYears,
  resolveAnalysisWindow,
  type AnalysisWindow,
} from "./analysis-window";

export type DashboardMetric = {
  value: number;
  change: number | null;
  changeRate: number | null;
};

type Aggregate = {
  enrolled: number;
  total: number;
  leave: number;
  deferment: number;
};

const EMPTY_AGGREGATE: Aggregate = {
  enrolled: 0,
  total: 0,
  leave: 0,
  deferment: 0,
};

export function emptyFilters(): FilterState {
  return {
    years: [],
    universityCategories: [],
    regions: [],
    schools: [],
    establishments: [],
    fields: [],
    fieldMiddles: [],
    fieldSmalls: [],
    schoolStatuses: [],
    departmentStatuses: [],
    departmentQuery: "",
  };
}

function includes(values: string[], candidate: string) {
  return values.length === 0 || values.includes(candidate);
}

export function filterRecords(
  records: EnrollmentRecord[],
  filters: FilterState,
  includeYear = true,
) {
  const query = filters.departmentQuery.trim().toLocaleLowerCase("ko-KR");
  return records.filter(
    (row) =>
      (!includeYear ||
        filters.years.length === 0 ||
        filters.years.includes(row.year)) &&
      includes(filters.universityCategories, row.universityCategory) &&
      includes(filters.regions, row.region) &&
      includes(filters.schools, row.school) &&
      includes(filters.establishments, row.establishment) &&
      includes(filters.fields, row.field) &&
      includes(filters.fieldMiddles, row.fieldMiddle) &&
      includes(filters.fieldSmalls, row.fieldSmall) &&
      includes(filters.schoolStatuses, row.schoolStatus) &&
      includes(filters.departmentStatuses, row.departmentStatus) &&
      (!query ||
        row.department.toLocaleLowerCase("ko-KR").includes(query)),
  );
}

function aggregate(records: EnrollmentRecord[]): Aggregate {
  return records.reduce(
    (result, row) => ({
      enrolled: result.enrolled + row.enrolled,
      total: result.total + row.total,
      leave: result.leave + row.leave,
      deferment: result.deferment + row.deferment,
    }),
    { ...EMPTY_AGGREGATE },
  );
}

function calculateChange(current: number, previous?: number | null) {
  if (previous === undefined || previous === null) {
    return { change: null, changeRate: null };
  }
  const change = current - previous;
  return {
    change,
    changeRate: previous === 0 ? null : change / previous,
  };
}

function groupAggregate(
  records: EnrollmentRecord[],
  selector: (row: EnrollmentRecord) => string,
) {
  const groups = new Map<string, EnrollmentRecord[]>();
  for (const row of records) {
    const key = selector(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return new Map(
    [...groups].map(([key, rows]) => [key, aggregate(rows)] as const),
  );
}

function rank(
  currentRows: EnrollmentRecord[],
  previousRows: EnrollmentRecord[],
  selector: (row: EnrollmentRecord) => string,
  limit = 10,
  analysisMetric: "enrolled" | "total" = "total",
): RankedPoint[] {
  const current = groupAggregate(currentRows, selector);
  const previous = groupAggregate(previousRows, selector);
  return [...current]
    .map(([name, values]) => {
      const prior = previous.get(name);
      return {
        name,
        enrolled: values.enrolled,
        total: values.total,
        leave: values.leave,
        ...calculateChange(values[analysisMetric], prior?.[analysisMetric] ?? null),
      };
    })
    .sort((a, b) => b[analysisMetric] - a[analysisMetric])
    .slice(0, limit);
}

type DashboardMeta = {
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

const dashboardMetaCache = new WeakMap<EnrollmentRecord[], DashboardMeta>();

function createDashboardMeta(records: EnrollmentRecord[]): DashboardMeta {
  const cached = dashboardMetaCache.get(records);
  if (cached) return cached;
  const sets = {
    years: new Set<number>(),
    universityCategories: new Set<string>(),
    regions: new Set<string>(),
    schools: new Set<string>(),
    establishments: new Set<string>(),
    fields: new Set<string>(),
    fieldMiddles: new Set<string>(),
    fieldSmalls: new Set<string>(),
    schoolStatuses: new Set<string>(),
    departmentStatuses: new Set<string>(),
  };
  const schoolsByRegion = new Map<string, Set<string>>();
  const schoolsByUniversityCategory = new Map<string, Set<string>>();
  const schoolsByRegionAndCategory = new Map<string, Map<string, Set<string>>>();
  const fieldMiddlesByField = new Map<string, Set<string>>();
  const fieldSmallsByMiddle = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    if (!key || !value) return;
    const values = map.get(key);
    if (values) values.add(value);
    else map.set(key, new Set([value]));
  };
  for (const row of records) {
    sets.years.add(row.year);
    if (row.universityCategory) sets.universityCategories.add(row.universityCategory);
    if (row.region) sets.regions.add(row.region);
    if (row.school) sets.schools.add(row.school);
    if (row.establishment) sets.establishments.add(row.establishment);
    if (row.field) sets.fields.add(row.field);
    if (row.fieldMiddle) sets.fieldMiddles.add(row.fieldMiddle);
    if (row.fieldSmall) sets.fieldSmalls.add(row.fieldSmall);
    if (row.schoolStatus) sets.schoolStatuses.add(row.schoolStatus);
    if (row.departmentStatus) sets.departmentStatuses.add(row.departmentStatus);
    add(schoolsByRegion, row.region, row.school);
    add(schoolsByUniversityCategory, row.universityCategory, row.school);
    add(fieldMiddlesByField, row.field, row.fieldMiddle);
    add(fieldSmallsByMiddle, row.fieldMiddle, row.fieldSmall);
    if (row.region && row.universityCategory && row.school) {
      let categories = schoolsByRegionAndCategory.get(row.region);
      if (!categories) {
        categories = new Map();
        schoolsByRegionAndCategory.set(row.region, categories);
      }
      add(categories, row.universityCategory, row.school);
    }
  }
  const sortStrings = (values: Iterable<string>) =>
    [...values].sort((left, right) => left.localeCompare(right, "ko-KR"));
  const mapSets = (map: Map<string, Set<string>>) =>
    Object.fromEntries(
      [...map].map(([key, values]) => [key, sortStrings(values)]),
    );
  const meta: DashboardMeta = {
    years: [...sets.years].sort((left, right) => left - right),
    universityCategories: sortStrings(sets.universityCategories),
    regions: sortStrings(sets.regions),
    schools: sortStrings(sets.schools),
    schoolsByRegion: mapSets(schoolsByRegion),
    schoolsByUniversityCategory: mapSets(schoolsByUniversityCategory),
    schoolsByRegionAndCategory: Object.fromEntries(
      [...schoolsByRegionAndCategory].map(([region, categories]) => [
        region,
        mapSets(categories),
      ]),
    ),
    establishments: sortStrings(sets.establishments),
    fields: sortStrings(sets.fields),
    fieldMiddles: sortStrings(sets.fieldMiddles),
    fieldSmalls: sortStrings(sets.fieldSmalls),
    fieldMiddlesByField: mapSets(fieldMiddlesByField),
    fieldSmallsByMiddle: mapSets(fieldSmallsByMiddle),
    schoolStatuses: sortStrings(sets.schoolStatuses),
    departmentStatuses: sortStrings(sets.departmentStatuses),
  };
  dashboardMetaCache.set(records, meta);
  return meta;
}

function rowComparisonKey(row: EnrollmentRecord) {
  return [
    row.schoolCode,
    row.campus,
    row.departmentCode,
    row.dayNight,
    row.departmentFeature,
  ].join("\u001f");
}

export function createDashboard(
  records: EnrollmentRecord[],
  filters: FilterState,
  page = 1,
  pageSize = 20,
  requestedWindow?: AnalysisWindow,
  analysisMetric: "enrolled" | "total" = "total",
) {
  const meta = createDashboardMeta(records);
  const contextRows = filterRecords(records, filters, false);
  const allYears = meta.years;
  const analysisWindow = requestedWindow ?? resolveAnalysisWindow(allYears, {
    endYear: filters.years.length > 0 ? Math.max(...filters.years) : undefined,
  });
  const currentYear = analysisWindow.endYear;
  const previousYear = allYears.includes(currentYear - 1)
    ? currentYear - 1
    : null;
  const trendYears = analysisYears(allYears, analysisWindow);
  const currentRows = contextRows.filter((row) => row.year === currentYear);
  const previousRows =
    previousYear === null
      ? []
      : contextRows.filter((row) => row.year === previousYear);
  const current = aggregate(currentRows);
  const previous = previousYear === null ? null : aggregate(previousRows);
  const metric = (key: MetricKey): DashboardMetric => ({
    value: current[key],
    ...calculateChange(current[key], previous?.[key]),
  });

  const annual: AnnualPoint[] = trendYears.map((year) => ({
    year,
    ...aggregate(contextRows.filter((row) => row.year === year)),
  }));
  const selectedRows = contextRows.filter((row) => row.year === currentYear).sort(
    (a, b) => b.year - a.year || b[analysisMetric] - a[analysisMetric],
  );
  const comparisonIndex = new Map<string, EnrollmentRecord>();
  for (const row of contextRows) {
    comparisonIndex.set(`${row.year}\u001f${rowComparisonKey(row)}`, row);
  }
  const pages = Math.max(1, Math.ceil(selectedRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const details = selectedRows
    .slice((safePage - 1) * pageSize, safePage * pageSize)
    .map((row) => {
      const prior = comparisonIndex.get(
        `${row.year - 1}\u001f${rowComparisonKey(row)}`,
      );
      return {
        ...row,
        ...calculateChange(row[analysisMetric], prior?.[analysisMetric] ?? null),
      };
    });
  const topDepartmentNames = rank(
    currentRows,
    previousRows,
    (row) => row.department,
    8,
    analysisMetric,
  ).map((row) => row.name);
  const departmentSeries = topDepartmentNames.map((name) => ({
    name,
    annual: trendYears.map((year) => ({
      year,
      ...aggregate(
        contextRows.filter(
          (row) => row.year === year && row.department === name,
        ),
      ),
    })),
  }));
  const activeRows = currentRows.filter((row) => row.total > 0);

  return {
    meta,
    analysisMetric,
    analysisWindow,
    currentYear,
    previousYear,
    rowCount: currentRows.length,
    schoolCount: new Set(
      activeRows.map((row) => `${row.schoolCode}\u001f${row.campus}`),
    ).size,
    departmentCount: new Set(
      activeRows.map((row) =>
        [
          row.schoolCode,
          row.campus,
          row.departmentCode,
          row.dayNight,
          row.departmentFeature,
        ].join("\u001f"),
      ),
    ).size,
    metrics: {
      enrolled: metric("enrolled"),
      total: metric("total"),
      leave: metric("leave"),
      deferment: {
        value: current.deferment,
        ...calculateChange(current.deferment, previous?.deferment),
      },
    },
    annual,
    regions: rank(currentRows, previousRows, (row) => row.region, 8, analysisMetric),
    fields: rank(currentRows, previousRows, (row) => row.field, 8, analysisMetric),
    departments: rank(
      currentRows,
      previousRows,
      (row) => row.department,
      12,
      analysisMetric,
    ),
    departmentSeries,
    schools: rank(
      currentRows,
      previousRows,
      (row) => `${row.schoolCode}\u001e${row.campus}\u001e${row.school}`,
      12,
      analysisMetric,
    ).map((row) => {
      const [, campus, school] = row.name.split("\u001e");
      return {
        ...row,
        name: campus && campus !== "본교" ? `${school} (${campus})` : school,
      };
    }),
    details,
    pagination: {
      page: safePage,
      pageSize,
      total: selectedRows.length,
      pages,
    },
  };
}
