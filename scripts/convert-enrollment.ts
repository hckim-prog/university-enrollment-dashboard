import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { unzipSync } from "fflate";
import { SaxesParser, type SaxesTagPlain } from "saxes";
import type {
  EnrollmentRecord,
  ValidationIssue,
  ValidationReport,
  YearValidation,
} from "../src/lib/types";

type CellRow = Map<string, string>;

type ParsedSheet = {
  rows: Map<number, CellRow>;
  merges: string[];
  dimensionRef: string;
  maxColumn: number;
  maxRow: number;
};

const DEFAULT_INPUT_DIR =
  "C:\\Users\\user\\Downloads\\data_20260731153427";
const OUTPUT_DIR = path.resolve(process.cwd(), "data", "processed");
const DATA_START_ROW = 7;
const REQUIRED_DIMENSIONS = ["F", "G", "H", "I"] as const;

const mappings = {
  legacy: {
    enrolled: ["N", "O"],
    leave: ["T", "U"],
    deferment: ["Z", "AA"],
    total: ["AF", "AG"],
  },
  current: {
    enrolled: ["N"],
    leave: ["U"],
    deferment: ["AB"],
    total: ["AI"],
  },
} as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input-dir");
  const outputIndex = args.indexOf("--output-dir");
  return {
    inputDir:
      inputIndex >= 0 && args[inputIndex + 1]
        ? path.resolve(args[inputIndex + 1])
        : DEFAULT_INPUT_DIR,
    outputDir:
      outputIndex >= 0 && args[outputIndex + 1]
        ? path.resolve(args[outputIndex + 1])
        : OUTPUT_DIR,
  };
}

function tagName(tag: SaxesTagPlain | string) {
  return typeof tag === "string" ? tag : tag.name;
}

function parseSharedStrings(xml: string) {
  const values: string[] = [];
  let inString = false;
  let inText = false;
  let current = "";
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentag", (tag) => {
    if (tag.name === "si") {
      inString = true;
      current = "";
    } else if (inString && tag.name === "t") {
      inText = true;
    }
  });
  parser.on("text", (text) => {
    if (inText) current += text;
  });
  parser.on("closetag", (tag) => {
    const name = tagName(tag);
    if (name === "t") inText = false;
    if (name === "si") {
      values.push(current);
      current = "";
      inString = false;
    }
  });
  parser.write(xml).close();
  return values;
}

function parseSheet(xml: string, sharedStrings: string[]): ParsedSheet {
  const rows = new Map<number, CellRow>();
  const merges: string[] = [];
  let dimensionRef = "";
  let currentRow = 0;
  let currentCellRef = "";
  let currentCellType = "";
  let currentCellValue = "";
  let inCellValue = false;
  let maxColumn = 0;
  let maxRow = 0;

  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentag", (tag) => {
    if (tag.name === "dimension") {
      dimensionRef = String(tag.attributes.ref ?? "");
    } else if (tag.name === "row") {
      currentRow = Number(tag.attributes.r ?? 0);
      maxRow = Math.max(maxRow, currentRow);
      if (currentRow >= DATA_START_ROW) rows.set(currentRow, new Map());
    } else if (tag.name === "c") {
      currentCellRef = String(tag.attributes.r ?? "");
      currentCellType = String(tag.attributes.t ?? "");
      currentCellValue = "";
      maxColumn = Math.max(maxColumn, columnNumber(currentCellRef));
    } else if (
      (tag.name === "v" || tag.name === "t") &&
      currentCellRef
    ) {
      inCellValue = true;
    } else if (tag.name === "mergeCell") {
      merges.push(String(tag.attributes.ref ?? ""));
    }
  });
  parser.on("text", (text) => {
    if (inCellValue) currentCellValue += text;
  });
  parser.on("closetag", (tag) => {
    const name = tagName(tag);
    if (name === "v" || name === "t") inCellValue = false;
    if (name === "c") {
      if (currentRow >= DATA_START_ROW && currentCellRef) {
        const column = currentCellRef.replace(/\d/g, "");
        const value =
          currentCellType === "s"
            ? sharedStrings[Number(currentCellValue)] ?? ""
            : currentCellValue;
        rows.get(currentRow)?.set(column, value);
      }
      currentCellRef = "";
      currentCellType = "";
      currentCellValue = "";
    }
  });
  parser.write(xml).close();
  return { rows, merges, dimensionRef, maxColumn, maxRow };
}

function columnNumber(cellRef: string) {
  const letters = cellRef.replace(/[^A-Z]/g, "");
  return [...letters].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

function columnName(column: number) {
  let value = column;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function parseRange(ref: string) {
  const [start, end = start] = ref.split(":");
  const matchStart = /^([A-Z]+)(\d+)$/.exec(start);
  const matchEnd = /^([A-Z]+)(\d+)$/.exec(end);
  if (!matchStart || !matchEnd) return null;
  return {
    startColumn: columnNumber(matchStart[1]),
    endColumn: columnNumber(matchEnd[1]),
    startRow: Number(matchStart[2]),
    endRow: Number(matchEnd[2]),
  };
}

function restoreMergedCells(sheet: ParsedSheet) {
  const restored: Record<string, number> = {
    school: 0,
    college: 0,
    department: 0,
    dayNight: 0,
  };
  const fieldByColumn: Record<string, keyof typeof restored> = {
    F: "school",
    G: "college",
    H: "department",
    I: "dayNight",
  };

  for (const merge of sheet.merges) {
    const range = parseRange(merge);
    if (!range || range.endRow < DATA_START_ROW) continue;
    const originColumn = columnName(range.startColumn);
    const originValue = sheet.rows.get(range.startRow)?.get(originColumn) ?? "";
    for (
      let rowIndex = Math.max(range.startRow, DATA_START_ROW);
      rowIndex <= range.endRow;
      rowIndex += 1
    ) {
      const row = sheet.rows.get(rowIndex);
      if (!row) continue;
      for (
        let columnIndex = range.startColumn;
        columnIndex <= range.endColumn;
        columnIndex += 1
      ) {
        const column = columnName(columnIndex);
        if (!row.get(column) && originValue) {
          row.set(column, originValue);
          const field = fieldByColumn[column];
          if (field) restored[field] += 1;
        }
      }
    }
  }
  return restored;
}

function text(row: CellRow, column: string) {
  return (row.get(column) ?? "").replace(/\r?\n/g, " ").trim();
}

function number(row: CellRow, column: string) {
  const raw = row.get(column);
  if (raw === undefined || raw === "") return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function sum(row: CellRow, columns: readonly string[]) {
  return columns.reduce((total, column) => total + number(row, column), 0);
}

function validateSubtotal(
  row: CellRow,
  year: number,
  sourceRow: number,
  issues: ValidationIssue[],
) {
  const checks =
    year === 2025
      ? [
          ["재학생 소계", "N", ["O", "P"]],
          ["재학생 정원내 성별", "O", ["Q", "S"]],
          ["재학생 정원외 성별", "P", ["R", "T"]],
          ["휴학생 소계", "U", ["V", "W"]],
          ["휴학생 정원내 성별", "V", ["X", "Z"]],
          ["휴학생 정원외 성별", "W", ["Y", "AA"]],
          ["유예학생 소계", "AB", ["AC", "AD"]],
          ["유예학생 정원내 성별", "AC", ["AE", "AG"]],
          ["유예학생 정원외 성별", "AD", ["AF", "AH"]],
          ["재적학생 소계", "AI", ["AJ", "AK"]],
          ["재적학생 정원내 성별", "AJ", ["AL", "AN"]],
          ["재적학생 정원외 성별", "AK", ["AM", "AO"]],
        ]
      : [
          ["재학생 정원내 성별", "N", ["P", "R"]],
          ["재학생 정원외 성별", "O", ["Q", "S"]],
          ["휴학생 정원내 성별", "T", ["V", "X"]],
          ["휴학생 정원외 성별", "U", ["W", "Y"]],
          ["유예학생 정원내 성별", "Z", ["AB", "AD"]],
          ["유예학생 정원외 성별", "AA", ["AC", "AE"]],
          ["재적학생 정원내 성별", "AF", ["AH", "AJ"]],
          ["재적학생 정원외 성별", "AG", ["AI", "AK"]],
        ];

  let errors = 0;
  for (const [label, target, parts] of checks) {
    const targetValue = number(row, target as string);
    const partValue = sum(row, parts as string[]);
    if (targetValue !== partValue) {
      errors += 1;
      issues.push({
        year,
        sourceRow,
        type: "subtotal",
        message: `${label}: ${targetValue} ≠ ${partValue}`,
      });
    }
  }
  return errors;
}

async function parseWorkbook(filePath: string) {
  const bytes = new Uint8Array(await readFile(filePath));
  const archive = unzipSync(bytes);
  const sharedXml = archive["xl/sharedStrings.xml"];
  const sheetXml = archive["xl/worksheets/Sheet1.xml"];
  if (!sharedXml || !sheetXml) {
    throw new Error(`${path.basename(filePath)}에서 필수 XLSX XML을 찾지 못했습니다.`);
  }
  const decoder = new TextDecoder("utf-8");
  const sharedStrings = parseSharedStrings(decoder.decode(sharedXml));
  const sheet = parseSheet(decoder.decode(sheetXml), sharedStrings);
  const restoredMergedCells = restoreMergedCells(sheet);
  return { bytes, sheet, restoredMergedCells };
}

async function convertFile(
  filePath: string,
  year: number,
  allIssues: ValidationIssue[],
) {
  const { bytes, sheet, restoredMergedCells } = await parseWorkbook(filePath);
  const records: EnrollmentRecord[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();
  let duplicateRows = 0;
  let negativeValues = 0;
  let subtotalErrors = 0;
  let enrollmentEquationErrors = 0;
  let missingDimensions = 0;
  const layout = year === 2025 ? mappings.current : mappings.legacy;

  for (const [sourceRow, row] of sheet.rows) {
    const school = text(row, "F");
    const department = text(row, "H");
    if (!school && !department) continue;

    const record: EnrollmentRecord = {
      year,
      schoolType: text(row, "B"),
      establishment: text(row, "C"),
      region: text(row, "D"),
      schoolStatus: text(row, "E"),
      school,
      college: text(row, "G"),
      department,
      dayNight: text(row, "I"),
      departmentFeature: text(row, "J"),
      departmentStatus: text(row, "K"),
      field: text(row, "L"),
      capacity: number(row, "M"),
      enrolled: sum(row, layout.enrolled),
      leave: sum(row, layout.leave),
      deferment: sum(row, layout.deferment),
      total: sum(row, layout.total),
      sourceRow,
    };

    const missing = REQUIRED_DIMENSIONS.filter(
      (column) => !text(row, column),
    );
    if (missing.length) {
      missingDimensions += 1;
      issues.push({
        year,
        sourceRow,
        type: "missing_dimension",
        message: `필수 차원 누락: ${missing.join(", ")}`,
      });
    }

    const numericEntries = [
      ["학생정원", record.capacity],
      ["재학생", record.enrolled],
      ["휴학생", record.leave],
      ["유예학생", record.deferment],
      ["재적학생", record.total],
    ] as const;
    for (const [label, value] of numericEntries) {
      if (value < 0) {
        negativeValues += 1;
        issues.push({
          year,
          sourceRow,
          type: "negative",
          message: `${label} 음수값: ${value}`,
        });
      }
    }

    subtotalErrors += validateSubtotal(row, year, sourceRow, issues);
    const calculatedTotal =
      record.enrolled + record.leave + record.deferment;
    if (record.total !== calculatedTotal) {
      enrollmentEquationErrors += 1;
      issues.push({
        year,
        sourceRow,
        type: "enrollment_equation",
        message: `재적학생 ${record.total} ≠ 재학생+휴학생+유예학생 ${calculatedTotal}`,
      });
    }

    const duplicateKey = [
      record.schoolType,
      record.establishment,
      record.region,
      record.schoolStatus,
      record.school,
      record.college,
      record.department,
      record.dayNight,
      record.departmentFeature,
      record.departmentStatus,
      record.field,
    ].join("\u001f");
    const previousRow = seen.get(duplicateKey);
    if (previousRow) {
      duplicateRows += 1;
      issues.push({
        year,
        sourceRow,
        type: "duplicate",
        message: `동일 차원 행 중복(최초 행 ${previousRow})`,
      });
    } else {
      seen.set(duplicateKey, sourceRow);
    }
    records.push(record);
  }

  allIssues.push(...issues);
  const validation: YearValidation = {
    year,
    sourceFile: path.basename(filePath),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sourceRows: sheet.maxRow - DATA_START_ROW + 1,
    normalizedRows: records.length,
    sourceColumnCount: sheet.maxColumn,
    expectedColumnCount: year === 2025 ? 41 : 37,
    nonStandardDimensionRef: sheet.dimensionRef,
    restoredMergedCells,
    duplicateRows,
    negativeValues,
    subtotalErrors,
    enrollmentEquationErrors,
    missingDimensions,
  };
  return { records, validation };
}

async function main() {
  const { inputDir, outputDir } = parseArgs();
  const files = (await readdir(inputDir))
    .filter((name) => /^202[345]년 .*학과별자료\.xlsx$/.test(name))
    .sort();
  if (files.length !== 3) {
    throw new Error(
      `${inputDir}에서 2023~2025 학과별자료 3개를 찾지 못했습니다. 발견: ${files.length}개`,
    );
  }

  const allRecords: EnrollmentRecord[] = [];
  const allIssues: ValidationIssue[] = [];
  const years: YearValidation[] = [];
  for (const file of files) {
    const year = Number(file.slice(0, 4));
    const result = await convertFile(
      path.join(inputDir, file),
      year,
      allIssues,
    );
    allRecords.push(...result.records);
    years.push(result.validation);
    console.log(
      `${year}: ${result.records.length.toLocaleString("ko-KR")}행 변환`,
    );
  }

  const report: ValidationReport = {
    generatedAt: new Date().toISOString(),
    valid:
      allIssues.length === 0 &&
      years.every(
        (year) => year.sourceColumnCount === year.expectedColumnCount,
      ),
    totalRows: allRecords.length,
    issueCount: allIssues.length,
    issueSample: allIssues.slice(0, 100),
    years,
  };

  const methodology = {
    title: "대학 재적학생 트렌드 데이터 변환 명세",
    generatedAt: report.generatedAt,
    sourceDirectory: inputDir,
    sourceFiles: years.map(
      ({ year, sourceFile, sha256, normalizedRows }) => ({
        year,
        sourceFile,
        sha256,
        normalizedRows,
      }),
    ),
    nonStandardFormat:
      "세 원본의 worksheet dimension이 실제 범위가 아닌 A1로 기록되어 있어, ZIP 내부 sharedStrings.xml과 Sheet1.xml을 SAX 방식으로 직접 읽는다.",
    mergedCellRule:
      "mergeCell 범위의 좌상단 값을 실제 병합 범위에만 복원한다. 임의의 단순 채우기(fill-down)는 사용하지 않는다.",
    schema: {
      dimensions:
        "기준연도, 학교종류, 설립구분, 지역, 학교상태, 학교, 단과대학, 학과, 주야, 학과특성, 학과상태, 계열",
      metrics: "학생정원, 재학생, 휴학생, 학사학위취득유예학생, 재적학생",
      "2023-2024":
        "37열(A:AK). 재학생=N+O, 휴학생=T+U, 유예학생=Z+AA, 재적학생=AF+AG.",
      "2025":
        "41열(A:AO). 재학생=N, 휴학생=U, 유예학생=AB, 재적학생=AI의 소계 열을 사용하고 각 소계와 정원내·외 합을 교차 검산.",
    },
    validationRules: [
      "재적학생 = 재학생 + 휴학생 + 학사학위취득유예학생",
      "정원내·외 합계와 남녀 합계의 일치",
      "동일 연도·학교·단과대학·학과·주야·상태·계열 차원의 중복 행",
      "학생정원·재학생·휴학생·유예학생·재적학생의 음수값",
      "학교·단과대학·학과·주야 필수 차원 누락",
      "연도별 실제 열 수 37/37/41",
    ],
  };

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(outputDir, "enrollment.json"),
      JSON.stringify(allRecords),
    ),
    writeFile(
      path.join(outputDir, "validation-report.json"),
      JSON.stringify(report, null, 2),
    ),
    writeFile(
      path.join(outputDir, "methodology.json"),
      JSON.stringify(methodology, null, 2),
    ),
  ]);
  console.log(
    `총 ${allRecords.length.toLocaleString("ko-KR")}행, 검산 이슈 ${report.issueCount.toLocaleString("ko-KR")}건`,
  );
  console.log(`결과: ${outputDir}`);
  if (!report.valid) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
