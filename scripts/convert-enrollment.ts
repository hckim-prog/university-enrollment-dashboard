import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { Unzip, UnzipInflate } from "fflate";
import { SaxesParser, type SaxesTagPlain } from "saxes";
import type {
  EnrollmentRecord,
  ValidationIssue,
  ValidationReport,
  YearValidation,
} from "../src/lib/types";

type CellRow = Map<string, string>;

type QualityAccumulator = {
  year: number;
  universityCategory: string;
  rows: number;
  nonZeroRows: number;
  duplicateRows: number;
  negativeValues: number;
  subtotalErrors: number;
  enrollmentEquationErrors: number;
  missingDimensions: number;
  seen: Set<string>;
};

type ParsedWorkbook = {
  records: EnrollmentRecord[];
  issues: ValidationIssue[];
  sha256: string;
  dimensionRef: string;
  maxColumn: number;
  maxRow: number;
  expectedColumnCount: number;
  quality: QualityAccumulator[];
};

const DEFAULT_INPUT_DIR = path.resolve(process.cwd(), "origin_data");
const OUTPUT_DIR = path.resolve(process.cwd(), "data", "processed");
const SHEET_PATH = "xl/worksheets/sheet1.xml";
const gzipAsync = promisify(gzip);

const REQUIRED_HEADERS = [
  "공시연도",
  "기준연도",
  "학교코드",
  "학교명",
  "본분교명",
  "대학구분",
  "학교종류",
  "설립구분",
  "소재지유형",
  "지역",
  "학교상태",
  "단과대학",
  "학과코드",
  "학과명",
  "대학자체계열",
  "표준분류_대계열",
  "표준분류_중계열",
  "표준분류_소계열",
  "주야간구분",
  "학과특성",
  "재학생_계_정원내",
  "재학생_계_정원외",
  "휴학생_계_정원내",
  "휴학생_계_정원외",
  "학사학위취득유예학생_계_정원내",
  "학사학위취득유예학생_계_정원외",
  "재적학생_계_정원내",
  "재적학생_계_정원외",
] as const;

const REQUIRED_DIMENSIONS = [
  "학교코드",
  "학교명",
  "본분교명",
  "대학구분",
  "학교종류",
  "설립구분",
  "지역",
  "단과대학",
  "학과코드",
  "학과명",
  "표준분류_대계열",
  "표준분류_중계열",
  "표준분류_소계열",
  "주야간구분",
] as const;

const NUMERIC_HEADERS = [
  "학생정원",
  "재학생_계_정원내",
  "재학생_계_정원외",
  "재학생_남_정원내",
  "재학생_남_정원외",
  "재학생_여_정원내",
  "재학생_여_정원외",
  "휴학생_계_정원내",
  "휴학생_계_정원외",
  "휴학생_남_정원내",
  "휴학생_남_정원외",
  "휴학생_여_정원내",
  "휴학생_여_정원외",
  "학사학위취득유예학생_계_정원내",
  "학사학위취득유예학생_계_정원외",
  "학사학위취득유예학생_남_정원내",
  "학사학위취득유예학생_남_정원외",
  "학사학위취득유예학생_여_정원내",
  "학사학위취득유예학생_여_정원외",
  "재적학생_계_정원내",
  "재적학생_계_정원외",
  "재적학생_남_정원내",
  "재적학생_남_정원외",
  "재적학생_여_정원내",
  "재적학생_여_정원외",
] as const;

const SUBTOTAL_CHECKS = [
  ["재학생_계_정원내", "재학생_남_정원내", "재학생_여_정원내"],
  ["재학생_계_정원외", "재학생_남_정원외", "재학생_여_정원외"],
  ["휴학생_계_정원내", "휴학생_남_정원내", "휴학생_여_정원내"],
  ["휴학생_계_정원외", "휴학생_남_정원외", "휴학생_여_정원외"],
  [
    "학사학위취득유예학생_계_정원내",
    "학사학위취득유예학생_남_정원내",
    "학사학위취득유예학생_여_정원내",
  ],
  [
    "학사학위취득유예학생_계_정원외",
    "학사학위취득유예학생_남_정원외",
    "학사학위취득유예학생_여_정원외",
  ],
  ["재적학생_계_정원내", "재적학생_남_정원내", "재적학생_여_정원내"],
  ["재적학생_계_정원외", "재적학생_남_정원외", "재적학생_여_정원외"],
] as const;

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

function columnNumber(cellRef: string) {
  const letters = cellRef.replace(/[^A-Z]/g, "");
  return [...letters].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

function normalizedEntryName(value: string) {
  return value.replaceAll("\\", "/").toLocaleLowerCase();
}

function cleanText(value: string | undefined) {
  return (value ?? "").replace(/\r?\n/g, " ").trim();
}

function parseNumber(
  raw: string,
  label: string,
  year: number,
  sourceRow: number,
  issues: ValidationIssue[],
) {
  if (!raw) return 0;
  const parsed = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) {
    issues.push({
      year,
      sourceRow,
      type: "invalid_numeric",
      message: `${label} 숫자값 '${raw}'을 읽을 수 없음`,
    });
    return 0;
  }
  return Math.round(parsed);
}

function qualityKey(year: number, category: string) {
  return `${year}\u001f${category}`;
}

async function parseWorkbook(filePath: string): Promise<ParsedWorkbook> {
  const records: EnrollmentRecord[] = [];
  const issues: ValidationIssue[] = [];
  const qualityByYear = new Map<string, QualityAccumulator>();
  const sharedStrings: string[] = [];
  const hash = createHash("sha256");
  let dimensionRef = "";
  let maxColumn = 0;
  let maxRow = 0;
  let expectedColumnCount = 0;
  let headerByName = new Map<string, string>();
  let foundSheet = false;

  let resolveSheet!: () => void;
  let rejectSheet!: (error: unknown) => void;
  const sheetDone = new Promise<void>((resolve, reject) => {
    resolveSheet = resolve;
    rejectSheet = reject;
  });

  const processRow = (sourceRow: number, row: CellRow) => {
    if (sourceRow === 1) {
      headerByName = new Map(
        [...row].map(([column, value]) => [cleanText(value), column]),
      );
      const missing = REQUIRED_HEADERS.filter(
        (header) => !headerByName.has(header),
      );
      if (missing.length) {
        throw new Error(
          `${path.basename(filePath)} 필수 열 누락: ${missing.join(", ")}`,
        );
      }
      expectedColumnCount = headerByName.has("학생정원") ? 46 : 45;
      return;
    }
    if (headerByName.size === 0) return;
    const value = (header: string) =>
      cleanText(row.get(headerByName.get(header) ?? ""));
    const year = parseNumber(
      value("기준연도"),
      "기준연도",
      0,
      sourceRow,
      issues,
    );
    const disclosureYear = parseNumber(
      value("공시연도"),
      "공시연도",
      year,
      sourceRow,
      issues,
    );
    const universityCategory = value("대학구분");
    if (!year || !universityCategory) {
      issues.push({
        year,
        sourceRow,
        type: "missing_dimension",
        message: "기준연도 또는 대학구분 누락",
      });
      return;
    }
    const accumulatorKey = qualityKey(year, universityCategory);
    let quality = qualityByYear.get(accumulatorKey);
    if (!quality) {
      quality = {
        year,
        universityCategory,
        rows: 0,
        nonZeroRows: 0,
        duplicateRows: 0,
        negativeValues: 0,
        subtotalErrors: 0,
        enrollmentEquationErrors: 0,
        missingDimensions: 0,
        seen: new Set<string>(),
      };
      qualityByYear.set(accumulatorKey, quality);
    }
    quality.rows += 1;

    if (disclosureYear !== year) {
      issues.push({
        year,
        sourceRow,
        type: "schema",
        message: `공시연도 ${disclosureYear}와 기준연도 ${year} 불일치`,
      });
    }

    const missingDimensions = REQUIRED_DIMENSIONS.filter(
      (header) => !value(header),
    );
    if (missingDimensions.length) {
      quality.missingDimensions += 1;
      issues.push({
        year,
        sourceRow,
        type: "missing_dimension",
        message: `필수 차원 누락: ${missingDimensions.join(", ")}`,
      });
    }

    const numeric = new Map<string, number>();
    for (const header of NUMERIC_HEADERS) {
      if (!headerByName.has(header)) continue;
      const parsed = parseNumber(value(header), header, year, sourceRow, issues);
      numeric.set(header, parsed);
      if (parsed < 0) {
        quality.negativeValues += 1;
        issues.push({
          year,
          sourceRow,
          type: "negative",
          message: `${header} 음수값: ${parsed}`,
        });
      }
    }
    const number = (header: string) => numeric.get(header) ?? 0;
    for (const [target, male, female] of SUBTOTAL_CHECKS) {
      const expected = number(male) + number(female);
      if (number(target) !== expected) {
        quality.subtotalErrors += 1;
        issues.push({
          year,
          sourceRow,
          type: "subtotal",
          message: `${target}: ${number(target)} ≠ ${expected}`,
        });
      }
    }

    const enrolled =
      number("재학생_계_정원내") + number("재학생_계_정원외");
    const leave =
      number("휴학생_계_정원내") + number("휴학생_계_정원외");
    const deferment =
      number("학사학위취득유예학생_계_정원내") +
      number("학사학위취득유예학생_계_정원외");
    const total =
      number("재적학생_계_정원내") + number("재적학생_계_정원외");
    if (total > 0) quality.nonZeroRows += 1;
    if (total !== enrolled + leave + deferment) {
      quality.enrollmentEquationErrors += 1;
      issues.push({
        year,
        sourceRow,
        type: "enrollment_equation",
        message: `재적학생 ${total} ≠ 재학생+휴학생+학위취득유예학생 ${enrolled + leave + deferment}`,
      });
    }

    const record: EnrollmentRecord = {
      year,
      disclosureYear,
      schoolCode: value("학교코드"),
      school: value("학교명"),
      campus: value("본분교명"),
      universityCategory,
      schoolType: value("학교종류"),
      establishment: value("설립구분"),
      establishmentType: value("설립유형"),
      locationType: value("소재지유형"),
      region: value("지역"),
      schoolStatus: value("학교상태"),
      college: value("단과대학"),
      departmentCode: value("학과코드"),
      department: value("학과명"),
      institutionField: value("대학자체계열"),
      field: value("표준분류_대계열"),
      fieldMiddle: value("표준분류_중계열"),
      fieldSmall: value("표준분류_소계열"),
      dayNight: value("주야간구분"),
      departmentFeature: value("학과특성"),
      departmentStatus: "",
      capacity: headerByName.has("학생정원") ? number("학생정원") : null,
      enrolled,
      leave,
      deferment,
      total,
      sourceRow,
    };
    const duplicateKey = [
      record.schoolCode,
      record.campus,
      record.departmentCode,
      record.dayNight,
      record.departmentFeature,
    ].join("\u001f");
    if (quality.seen.has(duplicateKey)) {
      quality.duplicateRows += 1;
      issues.push({
        year,
        sourceRow,
        type: "duplicate",
        message: "동일 학교·캠퍼스·학과코드·주야·학과특성 행 중복",
      });
    } else {
      quality.seen.add(duplicateKey);
    }
    records.push(record);
  };

  const unzip = new Unzip((file) => {
    const name = normalizedEntryName(file.name);
    if (name === "xl/sharedstrings.xml") {
      const chunks: Uint8Array[] = [];
      file.ondata = (error, data, final) => {
        if (error) {
          rejectSheet(error);
          return;
        }
        chunks.push(data);
        if (!final) return;
        const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        const parser = new SaxesParser({ xmlns: false });
        let inItem = false;
        let inText = false;
        let current = "";
        parser.on("opentag", (tag) => {
          if (tag.name === "si") {
            inItem = true;
            current = "";
          } else if (inItem && tag.name === "t") {
            inText = true;
          }
        });
        parser.on("text", (text) => {
          if (inText) current += text;
        });
        parser.on("closetag", (tag) => {
          const closed = tagName(tag);
          if (closed === "t") inText = false;
          if (closed === "si") {
            sharedStrings.push(current);
            inItem = false;
          }
        });
        parser.write(new TextDecoder().decode(merged)).close();
      };
      file.start();
      return;
    }
    if (name !== SHEET_PATH) return;
    foundSheet = true;
    const decoder = new TextDecoder("utf-8");
    const parser = new SaxesParser({ xmlns: false });
    let currentRow = 0;
    let currentCells: CellRow = new Map();
    let currentCellRef = "";
    let currentCellType = "";
    let currentCellValue = "";
    let inCellValue = false;
    parser.on("opentag", (tag) => {
      if (tag.name === "dimension") {
        dimensionRef = String(tag.attributes.ref ?? "");
      } else if (tag.name === "row") {
        currentRow = Number(tag.attributes.r ?? 0);
        currentCells = new Map();
        maxRow = Math.max(maxRow, currentRow);
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
      }
    });
    parser.on("text", (text) => {
      if (inCellValue) currentCellValue += text;
    });
    parser.on("closetag", (tag) => {
      const closed = tagName(tag);
      if (closed === "v" || closed === "t") inCellValue = false;
      if (closed === "c") {
        const column = currentCellRef.replace(/\d/g, "");
        const cellValue =
          currentCellType === "s"
            ? sharedStrings[Number(currentCellValue)] ?? ""
            : currentCellValue;
        if (column) currentCells.set(column, cellValue);
        currentCellRef = "";
        currentCellType = "";
        currentCellValue = "";
      }
      if (closed === "row") processRow(currentRow, currentCells);
    });
    file.ondata = (error, data, final) => {
      if (error) {
        rejectSheet(error);
        return;
      }
      try {
        const chunk = decoder.decode(data, { stream: !final });
        if (chunk) parser.write(chunk);
        if (final) {
          const tail = decoder.decode();
          if (tail) parser.write(tail);
          parser.close();
          resolveSheet();
        }
      } catch (parseError) {
        rejectSheet(parseError);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  const input = createReadStream(filePath);
  for await (const chunk of input) {
    hash.update(chunk);
    unzip.push(chunk, false);
  }
  unzip.push(new Uint8Array(), true);
  if (!foundSheet) {
    throw new Error(`${path.basename(filePath)}에서 Sheet1 XML을 찾지 못했습니다.`);
  }
  await sheetDone;
  if (maxColumn !== expectedColumnCount) {
    issues.push({
      year: 0,
      sourceRow: 1,
      type: "schema",
      message: `원본 열 수 ${maxColumn} ≠ 헤더 기준 ${expectedColumnCount}`,
    });
  }

  return {
    records,
    issues,
    sha256: hash.digest("hex"),
    dimensionRef,
    maxColumn,
    maxRow,
    expectedColumnCount,
    quality: [...qualityByYear.values()],
  };
}

async function main() {
  const { inputDir, outputDir } = parseArgs();
  const files = (await readdir(inputDir))
    .filter((name) => name.toLocaleLowerCase().endsWith(".xlsx"))
    .sort((left, right) => left.localeCompare(right, "ko-KR"));
  if (files.length !== 4) {
    throw new Error(
      `${inputDir}에서 대학·전문대학 2019~2022/2023~ 원본 4개를 찾지 못했습니다. 발견: ${files.length}개`,
    );
  }

  const allRecords: EnrollmentRecord[] = [];
  const allIssues: ValidationIssue[] = [];
  const years: YearValidation[] = [];
  const sourceFiles: Array<{
    sourceFile: string;
    sha256: string;
    columnCount: number;
    normalizedRows: number;
    years: number[];
    universityCategories: string[];
  }> = [];

  for (const file of files) {
    const filePath = path.join(inputDir, file);
    const parsed = await parseWorkbook(filePath);
    allRecords.push(...parsed.records);
    allIssues.push(...parsed.issues);
    sourceFiles.push({
      sourceFile: file,
      sha256: parsed.sha256,
      columnCount: parsed.maxColumn,
      normalizedRows: parsed.records.length,
      years: [...new Set(parsed.records.map((record) => record.year))].sort(),
      universityCategories: [
        ...new Set(parsed.records.map((record) => record.universityCategory)),
      ].sort(),
    });
    for (const quality of parsed.quality) {
      years.push({
        year: quality.year,
        universityCategory: quality.universityCategory,
        sourceFile: file,
        sha256: parsed.sha256,
        sourceRows: quality.rows,
        normalizedRows: quality.rows,
        nonZeroRows: quality.nonZeroRows,
        sourceColumnCount: parsed.maxColumn,
        expectedColumnCount: parsed.expectedColumnCount,
        nonStandardDimensionRef: parsed.dimensionRef,
        restoredMergedCells: {
          school: 0,
          college: 0,
          department: 0,
          dayNight: 0,
        },
        duplicateRows: quality.duplicateRows,
        negativeValues: quality.negativeValues,
        subtotalErrors: quality.subtotalErrors,
        enrollmentEquationErrors: quality.enrollmentEquationErrors,
        missingDimensions: quality.missingDimensions,
      });
    }
    console.log(
      `${file}: ${parsed.records.length.toLocaleString("ko-KR")}행 · ${[
        ...new Set(parsed.records.map((record) => record.year)),
      ].join("–")}년`,
    );
  }

  allRecords.sort(
    (left, right) =>
      left.year - right.year ||
      left.universityCategory.localeCompare(right.universityCategory, "ko-KR") ||
      left.school.localeCompare(right.school, "ko-KR") ||
      left.sourceRow - right.sourceRow,
  );
  years.sort(
    (left, right) =>
      left.year - right.year ||
      left.universityCategory.localeCompare(right.universityCategory, "ko-KR"),
  );

  const report: ValidationReport = {
    generatedAt: new Date().toISOString(),
    valid:
      allIssues.length === 0 &&
      years.every(
        (item) => item.sourceColumnCount === item.expectedColumnCount,
      ),
    totalRows: allRecords.length,
    issueCount: allIssues.length,
    issueSample: allIssues.slice(0, 100),
    years,
  };
  const methodology = {
    title: "대학·전문대학 재적학생 장기 트렌드 데이터 변환 명세",
    generatedAt: report.generatedAt,
    sourceDirectory: inputDir,
    sourceFiles,
    coverage: {
      years: [...new Set(allRecords.map((record) => record.year))].sort(),
      universityCategories: [
        ...new Set(allRecords.map((record) => record.universityCategory)),
      ].sort(),
      normalizedRows: allRecords.length,
    },
    nonStandardFormat:
      "worksheet dimension이 A1로 기록된 비표준 XLSX이므로 ZIP 내부 sheet1.xml을 스트리밍 SAX 방식으로 직접 읽는다. 새 원본은 행마다 차원이 완성되어 있어 병합 셀 보정은 하지 않는다.",
    schema: {
      dimensions:
        "공시연도, 기준연도, 학교코드, 학교명, 본분교, 대학구분, 학교종류, 설립구분·유형, 소재지유형, 지역, 학교상태, 단과대학, 학과코드·명, 대학자체계열, 표준분류 대·중·소계열, 주야, 학과특성",
      metrics:
        "학생정원(2023년 이후), 재학생, 휴학생, 학사학위취득유예학생, 재적학생",
      "2019-2022":
        "45열(A:AS). 학생정원 항목이 없으며 정원 관련 분석에서 제외한다.",
      "2023-2025":
        "46열(A:AT). 학생정원 항목이 추가되어 정원 대비 재학생 비율을 계산할 수 있다.",
      departmentStatus:
        "새 원본에는 학과상태가 없으므로 임의 추정하지 않는다. 학과 신설·이탈은 연도별 관측 여부로만 구분한다.",
    },
    validationRules: [
      "공시연도와 기준연도의 일치",
      "재적학생 = 재학생 + 휴학생 + 학사학위취득유예학생",
      "정원내·외 각각의 계 = 남 + 여",
      "동일 연도·학교코드·본분교·학과코드·주야·학과특성 복합키 중복",
      "모든 학생 수 지표의 음수·비숫자 값",
      "학교·학과·대학구분·지역·표준분류 대중소계열 등 필수 차원 누락",
      "원본별 실제 열 수 45/46",
    ],
    comparabilityNotes: [
      "2019~2022와 2023~2025 파일은 학과 행 구성 방식이 달라 원본 행 수 자체를 장기 시장 지표로 비교하지 않는다.",
      "학생 수 합계는 동일 산식으로 재계산하고 연도 간 연속성을 별도 확인한다.",
      "2025년부터 광역계열이 관측되므로 일부 계열 점유율 변화에는 분류 변경 효과가 포함될 수 있다.",
      "학생정원은 2023년 이후만 제공되며 재학생에는 정원외 학생이 포함되므로 정원 대비 재학생 비율은 충원율과 동일하지 않다.",
    ],
  };

  await mkdir(outputDir, { recursive: true });
  const compressedRecords = await gzipAsync(
    Buffer.from(JSON.stringify(allRecords)),
    { level: 9 },
  );
  await Promise.all([
    writeFile(path.join(outputDir, "enrollment.json.gz"), compressedRecords),
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
    `총 ${allRecords.length.toLocaleString("ko-KR")}행 · 검산 이슈 ${report.issueCount.toLocaleString("ko-KR")}건`,
  );
  console.log(`결과: ${outputDir}`);
  if (!report.valid) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
