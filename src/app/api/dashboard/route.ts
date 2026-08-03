import { NextRequest, NextResponse } from "next/server";
import { createDashboard, emptyFilters } from "@/lib/analytics";
import { getValidatedData } from "@/lib/data";
import { parseAnalysisWindow } from "@/lib/analysis-window";

export const dynamic = "force-dynamic";

const responseCache = new Map<
  string,
  ReturnType<typeof createDashboard> & {
    validation: {
      valid: boolean;
      totalRows: number;
      issueCount: number;
      generatedAt: string;
    };
    dataset: Awaited<ReturnType<typeof getValidatedData>>["dataset"];
  }
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
  const defaults = emptyFilters();
  const filters = {
    ...defaults,
    years: [],
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
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize"));
  const pageSize = [10, 20, 50, 100].includes(requestedPageSize)
    ? requestedPageSize
    : 20;
  const analysisMetric = search.get("analysisMetric") === "total" ? "total" : "enrolled";
  const dataset = await getValidatedData();
  const analysisWindow = parseAnalysisWindow(search, dataset.dataset.years);
  const cacheKey = `${dataset.revision}:${analysisWindow.startYear}-${analysisWindow.endYear}:${search.toString()}`;
  const cached = responseCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);
  const { records, validation } = dataset;
  const result = {
    ...createDashboard(records, filters, page, pageSize, analysisWindow, analysisMetric),
    validation: {
      valid: validation.valid,
      totalRows: validation.totalRows,
      issueCount: validation.issueCount,
      generatedAt: validation.generatedAt,
    },
    dataset: dataset.dataset,
  };
  responseCache.set(cacheKey, result);
  if (responseCache.size > 40) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  return NextResponse.json(result);
}
