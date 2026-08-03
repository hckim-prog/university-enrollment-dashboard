import { NextRequest, NextResponse } from "next/server";
import { emptyFilters } from "@/lib/analytics";
import {
  createDepartmentTrends,
  DEFAULT_TREND_CRITERIA,
  type ComparisonPeriod,
  type TrendMetric,
  type TrendType,
} from "@/lib/department-trends";
import { getRecords } from "@/lib/data";

export const dynamic = "force-dynamic";

const responseCache = new Map<string, ReturnType<typeof createDepartmentTrends>>();

function list(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function boundedNumber(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, minimum), maximum)
    : fallback;
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const cacheKey = search.toString();
  const cached = responseCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);
  const defaults = emptyFilters();
  const filters = {
    ...defaults,
    years: list(search, "year")
      .map(Number)
      .filter((value) => Number.isInteger(value)),
    regions: list(search, "region"),
    schools: list(search, "school"),
    establishments: list(search, "establishment"),
    fields: list(search, "field"),
    departmentStatuses: list(search, "departmentStatus"),
    departmentQuery: search.get("department") ?? "",
  };
  const metric: TrendMetric =
    search.get("trendMetric") === "enrolled" ? "enrolled" : "total";
  const period: ComparisonPeriod =
    search.get("comparison") === "since2023" ? "since2023" : "recent";
  const criteria = {
    ...DEFAULT_TREND_CRITERIA,
    minimumPrevious: boundedNumber(
      search.get("minimumPrevious"),
      DEFAULT_TREND_CRITERIA.minimumPrevious,
      0,
      10000,
    ),
    minimumChange: boundedNumber(
      search.get("minimumChange"),
      DEFAULT_TREND_CRITERIA.minimumChange,
      0,
      10000,
    ),
    minimumRate: boundedNumber(
      search.get("minimumRate"),
      DEFAULT_TREND_CRITERIA.minimumRate,
      0,
      10,
    ),
    metric,
    period,
    includeClosed: search.get("includeClosed") === "true",
  };
  const records = await getRecords();
  const result = createDepartmentTrends(records, filters, criteria, {
    groupId: search.get("departmentGroup") || undefined,
    focusGroupId: search.get("focusGroup") || undefined,
    trendType: (search.get("trendType") || undefined) as TrendType | undefined,
    page: Math.max(1, Number(search.get("trendPage")) || 1),
    pageSize: boundedNumber(search.get("trendPageSize"), 20, 10, 50),
  });
  responseCache.set(cacheKey, result);
  if (responseCache.size > 30) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  return NextResponse.json(result);
}
