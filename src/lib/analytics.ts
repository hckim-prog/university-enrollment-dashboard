import type {
  AnnualPoint,
  EnrollmentRecord,
  FilterState,
  MetricKey,
  RankedPoint,
} from "./types";

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
    regions: [],
    schools: [],
    establishments: [],
    fields: [],
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
      includes(filters.regions, row.region) &&
      includes(filters.schools, row.school) &&
      includes(filters.establishments, row.establishment) &&
      includes(filters.fields, row.field) &&
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
        ...calculateChange(values.total, prior?.total ?? null),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function uniqueSorted(
  records: EnrollmentRecord[],
  selector: (row: EnrollmentRecord) => string,
) {
  return [...new Set(records.map(selector).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko-KR"),
  );
}

function rowComparisonKey(row: EnrollmentRecord) {
  return [row.school, row.college, row.department, row.dayNight].join("\u001f");
}

export function createDashboard(
  records: EnrollmentRecord[],
  filters: FilterState,
  page = 1,
  pageSize = 20,
) {
  const contextRows = filterRecords(records, filters, false);
  const allYears = uniqueSorted(records, (row) => String(row.year)).map(Number);
  const availableYears = uniqueSorted(contextRows, (row) =>
    String(row.year),
  ).map(Number);
  const currentYear =
    filters.years.length > 0
      ? Math.max(...filters.years)
      : Math.max(...allYears);
  const previousYear = allYears.includes(currentYear - 1)
    ? currentYear - 1
    : null;
  const trendYears = availableYears.filter((year) => year <= currentYear);
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
    (a, b) => b.year - a.year || b.total - a.total,
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
        ...calculateChange(row.total, prior?.total ?? null),
      };
    });
  const topDepartmentNames = rank(
    currentRows,
    previousRows,
    (row) => row.department,
    8,
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

  return {
    meta: {
      years: allYears,
      regions: uniqueSorted(records, (row) => row.region),
      schools: uniqueSorted(records, (row) => row.school),
      schoolsByRegion: Object.fromEntries(
        uniqueSorted(records, (row) => row.region).map((region) => [
          region,
          uniqueSorted(
            records.filter((row) => row.region === region),
            (row) => row.school,
          ),
        ]),
      ),
      establishments: uniqueSorted(records, (row) => row.establishment),
      fields: uniqueSorted(records, (row) => row.field),
      departmentStatuses: uniqueSorted(
        records,
        (row) => row.departmentStatus,
      ),
    },
    currentYear,
    previousYear,
    rowCount: currentRows.length,
    schoolCount: new Set(currentRows.map((row) => row.school)).size,
    departmentCount: new Set(
      currentRows.map((row) => `${row.school}\u001f${row.department}`),
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
    regions: rank(currentRows, previousRows, (row) => row.region, 8),
    fields: rank(currentRows, previousRows, (row) => row.field, 8),
    departments: rank(
      currentRows,
      previousRows,
      (row) => row.department,
      12,
    ),
    departmentSeries,
    schools: rank(
      currentRows,
      previousRows,
      (row) => row.school,
      12,
    ),
    details,
    pagination: {
      page: safePage,
      pageSize,
      total: selectedRows.length,
      pages,
    },
  };
}
