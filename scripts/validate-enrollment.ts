import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EnrollmentRecord, ValidationReport } from "../src/lib/types";

async function main() {
  const directory = path.resolve(process.cwd(), "data", "processed");
  const [records, report] = await Promise.all([
    readFile(path.join(directory, "enrollment.json"), "utf8").then(
      (value) => JSON.parse(value) as EnrollmentRecord[],
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
  if (!report.valid) {
    throw new Error(`원본 검산 보고서에 ${report.issueCount}건의 이슈가 있습니다.`);
  }
  console.log(
    `검산 통과: ${records.length.toLocaleString("ko-KR")}행, 재적학생 계산 오류 0건`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
