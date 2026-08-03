import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  EnrollmentRecord,
  ValidationReport,
} from "./types";

let recordsPromise: Promise<EnrollmentRecord[]> | undefined;
let validationPromise: Promise<ValidationReport> | undefined;

function processedPath(fileName: string) {
  return path.join(process.cwd(), "data", "processed", fileName);
}

export function getRecords() {
  recordsPromise ??= readFile(processedPath("enrollment.json"), "utf8").then(
    (content) => JSON.parse(content) as EnrollmentRecord[],
  );
  return recordsPromise;
}

export function getValidationReport() {
  validationPromise ??= readFile(
    processedPath("validation-report.json"),
    "utf8",
  ).then((content) => JSON.parse(content) as ValidationReport);
  return validationPromise;
}
