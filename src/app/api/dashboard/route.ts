import { NextRequest, NextResponse } from "next/server";
import { createDashboard, emptyFilters } from "@/lib/analytics";
import { getRecords, getValidationReport } from "@/lib/data";

export const dynamic = "force-dynamic";

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
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize"));
  const pageSize = [10, 20, 50, 100].includes(requestedPageSize)
    ? requestedPageSize
    : 20;
  const [records, validation] = await Promise.all([
    getRecords(),
    getValidationReport(),
  ]);
  return NextResponse.json({
    ...createDashboard(records, filters, page, pageSize),
    validation: {
      valid: validation.valid,
      totalRows: validation.totalRows,
      issueCount: validation.issueCount,
      generatedAt: validation.generatedAt,
    },
  });
}
