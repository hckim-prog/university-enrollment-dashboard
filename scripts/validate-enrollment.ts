import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { EnrollmentRecord, ValidationReport } from "../src/lib/types";

const gunzipAsync = promisify(gunzip);

async function main() {
  const directory = path.resolve(process.cwd(), "data", "processed");
  const [records, report] = await Promise.all([
    readFile(path.join(directory, "enrollment.json.gz"))
      .then(gunzipAsync)
      .then(
        (value) => JSON.parse(value.toString("utf8")) as EnrollmentRecord[],
      ),
    readFile(path.join(directory, "validation-report.json"), "utf8").then(
      (value) => JSON.parse(value) as ValidationReport,
    ),
  ]);
  const calculated = records.reduce(
    (count, row) =>
      count +
      Number(row.total !== row.enrolled + row.leave + row.deferment),
    0,
  );
  if (records.length !== report.totalRows) {
    throw new Error(
      `행 수 불일치: 데이터 ${records.length}, 보고서 ${report.totalRows}`,
    );
  }
  if (calculated !== 0) {
    throw new Error(`변환 데이터 재검산 실패: ${calculated}건`);
  }
  const duplicateKeys = new Set<string>();
  let duplicates = 0;
  let negatives = 0;
  let missingFields = 0;
  for (const record of records) {
    const key = [
      record.year,
      record.schoolCode,
      record.campus,
      record.departmentCode,
      record.dayNight,
      record.departmentFeature,
    ].join("\u001f");
    if (duplicateKeys.has(key)) duplicates += 1;
    else duplicateKeys.add(key);
    if (
      [
        record.capacity,
        record.enrolled,
        record.leave,
        record.deferment,
        record.total,
      ]
        .filter((value): value is number => value !== null)
        .some((value) => value < 0)
    ) {
      negatives += 1;
    }
    if (
      !record.schoolCode ||
      !record.school ||
      !record.universityCategory ||
      !record.departmentCode ||
      !record.department ||
      !record.field ||
      !record.fieldMiddle ||
      !record.fieldSmall
    ) {
      missingFields += 1;
    }
  }
  if (duplicates || negatives || missingFields) {
    throw new Error(
      `독립 품질 검산 실패: 중복 ${duplicates}건, 음수 ${negatives}건, 필수 차원 누락 ${missingFields}건`,
    );
  }
  const years = [...new Set(records.map((record) => record.year))].sort();
  const categories = [
    ...new Set(records.map((record) => record.universityCategory)),
  ].sort((left, right) => left.localeCompare(right, "ko-KR"));
  if (years.join(",") !== "2019,2020,2021,2022,2023,2024,2025") {
    throw new Error(`연도 범위 오류: ${years.join(", ")}`);
  }
  if (categories.join(",") !== "대학,전문대학") {
    throw new Error(`대학구분 오류: ${categories.join(", ")}`);
  }
  const capacityPeriodErrors = records.filter(
    (record) =>
      (record.year <= 2022 && record.capacity !== null) ||
      (record.year >= 2023 && record.capacity === null),
  ).length;
  if (capacityPeriodErrors) {
    throw new Error(`학생정원 제공기간 검산 실패: ${capacityPeriodErrors}건`);
  }
  const reportRowTotal = report.years.reduce(
    (sum, item) => sum + item.normalizedRows,
    0,
  );
  if (reportRowTotal !== records.length) {
    throw new Error(
      `연도·대학구분 보고서 합계 불일치: ${reportRowTotal} ≠ ${records.length}`,
    );
  }
  if (!report.valid) {
    throw new Error(`원본 검산 보고서에 ${report.issueCount}건의 이슈가 있습니다.`);
  }
  console.log(
    `검산 통과: ${records.length.toLocaleString("ko-KR")}행, 재적학생 계산·중복·음수·필수 차원 오류 0건`,
  );
  console.log(
    `범위 확인: ${years[0]}~${years.at(-1)}년, ${categories.join("·")}, 학생정원 2023년부터 제공`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
