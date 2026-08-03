import { NextRequest, NextResponse } from "next/server";
import { emptyFilters } from "@/lib/analytics";
import {
  createMarketAnalysis,
  type MarketMetric,
} from "@/lib/market-analysis";
import { getValidatedData } from "@/lib/data";

export const dynamic = "force-dynamic";

const responseCache = new Map<
  string,
  ReturnType<typeof createMarketAnalysis>
>();

function list(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const dataset = await getValidatedData();
  const cacheKey = `${dataset.revision}:${search.toString()}`;
  const cached = responseCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const defaults = emptyFilters();
  const filters = {
    ...defaults,
    years: list(search, "year")
      .map(Number)
      .filter((value) => Number.isInteger(value)),
    universityCategories: list(search, "universityCategory"),
    regions: list(search, "region"),
    schools: list(search, "school"),
    establishments: list(search, "establishment"),
    fields: list(search, "field"),
    fieldMiddles: list(search, "fieldMiddle"),
    fieldSmalls: list(search, "fieldSmall"),
    schoolStatuses: list(search, "schoolStatus"),
    departmentStatuses: list(search, "departmentStatus"),
    departmentQuery: search.get("department") ?? "",
  };
  const metric: MarketMetric =
    search.get("marketMetric") === "enrolled" ? "enrolled" : "total";
  const result = createMarketAnalysis(dataset.records, filters, metric);
  responseCache.set(cacheKey, result);
  if (responseCache.size > 24) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  return NextResponse.json(result);
}
