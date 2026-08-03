import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  EnrollmentRecord,
  ValidationReport,
} from "./types";
import type { PublishedDataset } from "./data-management-types";
import { getDataManagementService } from "./data-store/service";

let fallbackPromise: Promise<PublishedDataset> | undefined;

function processedPath(fileName: string) {
  return path.join(process.cwd(), "data", "processed", fileName);
}

function getFallbackDataset() {
  fallbackPromise ??= Promise.all([
    readFile(processedPath("enrollment.json"), "utf8"),
    readFile(processedPath("validation-report.json"), "utf8"),
  ]).then(([recordContent, validationContent]) => {
    const records = JSON.parse(recordContent) as EnrollmentRecord[];
    const validation = JSON.parse(validationContent) as ValidationReport;
    const years = [...new Set(records.map((record) => record.year))].sort();
    return {
      revision: `processed-${validation.generatedAt}`,
      records,
      validation: {
        valid: validation.valid,
        totalRows: validation.totalRows,
        issueCount: validation.issueCount,
        generatedAt: validation.generatedAt,
      },
      publication: {
        initialized: false,
        activeYears: years,
        activeVersions: [],
        latestPublishedAt: null,
        totalRows: records.length,
        dataYearRange: `${years[0]}–${years.at(-1)}년`,
        validationValid: validation.valid,
        validationIssueCount: validation.issueCount,
        revision: `processed-${validation.generatedAt}`,
      },
    } satisfies PublishedDataset;
  });
  return fallbackPromise;
}

export async function getPublishedData() {
  return (
    (await getDataManagementService().getPublishedDataset()) ??
    (await getFallbackDataset())
  );
}

export async function getRecords() {
  return (await getPublishedData()).records;
}

export async function getValidationReport() {
  return (await getPublishedData()).validation;
}
