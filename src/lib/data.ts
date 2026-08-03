import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { EnrollmentRecord, ValidationReport } from "./types";

export type ValidatedDataset = {
  revision: string;
  records: EnrollmentRecord[];
  validation: {
    valid: boolean;
    totalRows: number;
    issueCount: number;
    generatedAt: string;
  };
  dataset: {
    years: number[];
    dataYearRange: string;
    totalRows: number;
    generatedAt: string;
  };
};

let datasetPromise: Promise<ValidatedDataset> | undefined;
const gunzipAsync = promisify(gunzip);

function processedPath(fileName: string) {
  return path.join(process.cwd(), "data", "processed", fileName);
}

export function getValidatedData() {
  datasetPromise ??= Promise.all([
    readFile(processedPath("enrollment.json.gz")),
    readFile(processedPath("validation-report.json"), "utf8"),
  ]).then(async ([recordContent, validationContent]) => {
    const uncompressed = await gunzipAsync(recordContent);
    const records = JSON.parse(
      uncompressed.toString("utf8"),
    ) as EnrollmentRecord[];
    const validation = JSON.parse(validationContent) as ValidationReport;

    if (!validation.valid || validation.issueCount > 0) {
      throw new Error("validated_dataset_failed_quality_gate");
    }
    if (validation.totalRows !== records.length) {
      throw new Error("validated_dataset_row_count_mismatch");
    }

    const years = [...new Set(records.map((record) => record.year))].sort();
    const dataYearRange =
      years.length === 1
        ? `${years[0]}년`
        : `${years[0]}–${years.at(-1)}년`;

    return {
      revision: `processed-${validation.generatedAt}`,
      records,
      validation: {
        valid: validation.valid,
        totalRows: validation.totalRows,
        issueCount: validation.issueCount,
        generatedAt: validation.generatedAt,
      },
      dataset: {
        years,
        dataYearRange,
        totalRows: records.length,
        generatedAt: validation.generatedAt,
      },
    } satisfies ValidatedDataset;
  });

  return datasetPromise;
}

export async function getRecords() {
  return (await getValidatedData()).records;
}

export async function getValidationReport() {
  return (await getValidatedData()).validation;
}
