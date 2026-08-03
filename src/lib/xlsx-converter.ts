import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { SaxesParser, type SaxesTagPlain } from "saxes";
import type { EnrollmentRecord, ValidationIssue } from "./types";
import type { QualityMessage } from "./data-management-types";

type CellRow = Map<string, string>;

type ParsedSheet = {
  rows: Map<number, CellRow>;
  merges: string[];
  dimensionRef: string;
  maxColumn: number;
  maxRow: number;
};

type Layout = {
  kind: "legacy" | "subtotal";
  expectedColumnCount: number;
  enrolled: readonly string[];
  leave: readonly string[];
  deferment: readonly string[];
  total: readonly string[];
};

export type WorkbookConversionResult = {
  records: EnrollmentRecord[];
  detectedYear: number | null;
  fileNameYear: number | null;
  sha256: string;
  fileSize: number;
  sourceRows: number;
  columnCount: number;
  expectedColumnCount: number | null;
  dimensionRef: string;
  restoredMergedCells: Record<string, number>;
  errors: QualityMessage[];
  warnings: QualityMessage[];
  issueSample: ValidationIssue[];
};

const DATA_START_ROW = 7;
const REQUIRED_DIMENSIONS = ["F", "G", "H", "I"] as const;
const REQUIRED_HEADER_PATTERNS = [
  { label: "재학생", pattern: /재학생/ },
  { label: "휴학생", pattern: /휴학생/ },
  { label: "재적학생", pattern: /재적학생/ },
] as const;
const REQUIRED_DIMENSION_HEADERS = [
  { column: "F", label: "학교", pattern: /^학교$/ },
  { column: "G", label: "단과대학", pattern: /^단과대학$/ },
  { column: "H", label: "학과", pattern: /^학과(?:전공)?$/ },
  { column: "I", label: "주야(구분)", pattern: /^(?:주야|구분)$/ },
] as const;

const LEGACY_LAYOUT: Layout = {
  kind: "legacy",
  expectedColumnCount: 37,
  enrolled: ["N", "O"],
  leave: ["T", "U"],
  deferment: ["Z", "AA"],
  total: ["AF", "AG"],
};

const SUBTOTAL_LAYOUT: Layout = {
  kind: "subtotal",
  expectedColumnCount: 41,
  enrolled: ["N"],
  leave: ["U"],
  deferment: ["AB"],
  total: ["AI"],
};

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
  parser.on("text", (value) => {
    if (inText) current += value;
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
      rows.set(currentRow, new Map());
    } else if (tag.name === "c") {
      currentCellRef = String(tag.attributes.r ?? "");
      currentCellType = String(tag.attributes.t ?? "");
      currentCellValue = "";
      maxColumn = Math.max(maxColumn, columnNumber(currentCellRef));
    } else if ((tag.name === "v" || tag.name === "t") && currentCellRef) {
      inCellValue = true;
    } else if (tag.name === "mergeCell") {
      merges.push(String(tag.attributes.ref ?? ""));
    }
  });
  parser.on("text", (value) => {
    if (inCellValue) currentCellValue += value;
  });
  parser.on("closetag", (tag) => {
    const name = tagName(tag);
    if (name === "v" || name === "t") inCellValue = false;
    if (name === "c") {
      if (currentCellRef) {
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

function findArchiveEntry(
  archive: Record<string, Uint8Array>,
  expected: string,
) {
  const key = Object.keys(archive).find(
    (candidate) => candidate.toLocaleLowerCase() === expected.toLocaleLowerCase(),
  );
  return key ? archive[key] : undefined;
}

function extractYears(value: string) {
  return [...value.matchAll(/(?:^|\D)((?:19|20)\d{2})(?=\D|$)/g)].map(
    (match) => Number(match[1]),
  );
}

function issueToMessage(issue: ValidationIssue): QualityMessage {
  return {
    code: issue.type,
    severity: "error",
    sourceRow: issue.sourceRow || undefined,
    message: issue.sourceRow
      ? `${issue.sourceRow}행: ${issue.message}`
      : issue.message,
  };
}

function differenceError(message: string): QualityMessage {
  return { code: "schema", severity: "error", message };
}

function validateSubtotals(
  values: Map<string, number>,
  layout: Layout,
  year: number,
  sourceRow: number,
  issues: ValidationIssue[],
) {
  const checks: Array<[string, string, string[]]> =
    layout.kind === "subtotal"
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
  for (const [label, target, parts] of checks) {
    const targetValue = values.get(target) ?? 0;
    const partValue = parts.reduce(
      (sum, column) => sum + (values.get(column) ?? 0),
      0,
    );
    if (targetValue !== partValue) {
      issues.push({
        year,
        sourceRow,
        type: "subtotal",
        message: `${label}: ${targetValue} ≠ ${partValue}`,
      });
    }
  }
}

function recordKey(record: EnrollmentRecord) {
  return [
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
}

export function enrollmentObservationKey(record: EnrollmentRecord) {
  return [
    record.school,
    record.college,
    record.department,
    record.dayNight,
    record.departmentFeature,
  ].join("\u001f");
}

export async function convertEnrollmentWorkbook(
  bytes: Uint8Array,
  originalFileName: string,
): Promise<WorkbookConversionResult> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const errors: QualityMessage[] = [];
  const warnings: QualityMessage[] = [];
  const issues: ValidationIssue[] = [];
  const base: WorkbookConversionResult = {
    records: [] as EnrollmentRecord[],
    detectedYear: null,
    fileNameYear: extractYears(originalFileName)[0] ?? null,
    sha256,
    fileSize: bytes.byteLength,
    sourceRows: 0,
    columnCount: 0,
    expectedColumnCount: null,
    dimensionRef: "",
    restoredMergedCells: {},
    errors,
    warnings,
    issueSample: issues,
  };

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    errors.push({
      code: "unreadable_workbook",
      severity: "error",
      message: "XLSX 파일을 읽을 수 없습니다. 파일이 손상되었는지 확인해 주세요.",
    });
    return base;
  }
  const sheetBytes = findArchiveEntry(archive, "xl/worksheets/sheet1.xml");
  const sharedBytes = findArchiveEntry(archive, "xl/sharedStrings.xml");
  if (!sheetBytes) {
    errors.push({
      code: "missing_worksheet",
      severity: "error",
      message: "첫 번째 워크시트의 데이터 구조를 찾을 수 없습니다.",
    });
    return base;
  }
  try {
    const decoder = new TextDecoder("utf-8");
    const sharedStrings = sharedBytes
      ? parseSharedStrings(decoder.decode(sharedBytes))
      : [];
    const sheet = parseSheet(decoder.decode(sheetBytes), sharedStrings);
    const restoredMergedCells = restoreMergedCells(sheet);
    const headerText = [...sheet.rows]
      .filter(([row]) => row < DATA_START_ROW)
      .flatMap(([, cells]) => [...cells.values()])
      .join(" ");
    const normalizedHeaderText = headerText.replace(
      /[\s\r\n\t·ㆍ・･,./()[\]{}_'-]+/g,
      "",
    );
    const headerYears = [...new Set(extractYears(headerText))];
    const detectedYear = headerYears.length === 1 ? headerYears[0] : null;
    const fileNameYear = base.fileNameYear;
    const layout =
      sheet.maxColumn === LEGACY_LAYOUT.expectedColumnCount
        ? LEGACY_LAYOUT
        : sheet.maxColumn === SUBTOTAL_LAYOUT.expectedColumnCount
          ? SUBTOTAL_LAYOUT
          : null;

    base.detectedYear = detectedYear;
    base.columnCount = sheet.maxColumn;
    base.expectedColumnCount = layout?.expectedColumnCount ?? null;
    base.sourceRows = Math.max(0, sheet.maxRow - DATA_START_ROW + 1);
    base.dimensionRef = sheet.dimensionRef;
    base.restoredMergedCells = restoredMergedCells;

    if (!detectedYear) {
      errors.push({
        code: "unknown_year",
        severity: "error",
        message:
          headerYears.length > 1
            ? "헤더에서 여러 기준연도가 감지되어 기준연도를 확정할 수 없습니다."
            : "헤더에서 기준연도를 확인할 수 없습니다.",
      });
    }
    if (detectedYear && fileNameYear && detectedYear !== fileNameYear) {
      errors.push({
        code: "year_mismatch",
        severity: "error",
        message: `파일명의 ${fileNameYear}년과 헤더의 ${detectedYear}년이 일치하지 않습니다.`,
      });
    } else if (detectedYear && !fileNameYear) {
      warnings.push({
        code: "filename_year_missing",
        severity: "warning",
        message: `파일명에서 연도를 찾지 못했지만 헤더에서 ${detectedYear}년을 확인했습니다.`,
      });
    }
    if (!layout) {
      errors.push(
        differenceError(
          `지원 형식은 37열 또는 소계가 포함된 41열입니다. 업로드 파일은 ${sheet.maxColumn}열로 감지되었습니다.`,
        ),
      );
    }
    for (const required of REQUIRED_HEADER_PATTERNS) {
      if (!required.pattern.test(normalizedHeaderText)) {
        errors.push({
          code: "missing_column",
          severity: "error",
          message: `필수 헤더 '${required.label}'을 찾을 수 없습니다.`,
        });
      }
    }
    const headerRow = sheet.rows.get(4) ?? new Map<string, string>();
    for (const required of REQUIRED_DIMENSION_HEADERS) {
      const value = text(headerRow, required.column).replace(
        /[\s\r\n\t·ㆍ・･,./()[\]{}_'-]+/g,
        "",
      );
      if (!required.pattern.test(value)) {
        errors.push({
          code: "missing_column",
          severity: "error",
          message: `필수 헤더 '${required.label}'을 찾을 수 없습니다.`,
        });
      }
    }
    if (!detectedYear || !layout || errors.some((error) => error.code === "missing_column")) {
      return base;
    }

    const records: EnrollmentRecord[] = [];
    const seen = new Map<string, number>();
    for (const [sourceRow, row] of sheet.rows) {
      if (sourceRow < DATA_START_ROW) continue;
      const school = text(row, "F");
      const department = text(row, "H");
      if (!school && !department) continue;

      const numericValues = new Map<string, number>();
      for (let columnIndex = 13; columnIndex <= sheet.maxColumn; columnIndex += 1) {
        const column = columnName(columnIndex);
        const raw = (row.get(column) ?? "").trim();
        if (!raw) {
          numericValues.set(column, 0);
          continue;
        }
        const parsed = Number(raw.replaceAll(",", ""));
        if (!Number.isFinite(parsed)) {
          issues.push({
            year: detectedYear,
            sourceRow,
            type: "invalid_numeric",
            message: `${column}열 숫자값 '${raw}'을 읽을 수 없음`,
          });
          numericValues.set(column, 0);
          continue;
        }
        const value = Math.round(parsed);
        numericValues.set(column, value);
        if (value < 0) {
          issues.push({
            year: detectedYear,
            sourceRow,
            type: "negative",
            message: `${column}열 학생 수 음수값: ${value}`,
          });
        }
      }
      const sum = (columns: readonly string[]) =>
        columns.reduce(
          (total, column) => total + (numericValues.get(column) ?? 0),
          0,
        );
      const record: EnrollmentRecord = {
        year: detectedYear,
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
        capacity: numericValues.get("M") ?? 0,
        enrolled: sum(layout.enrolled),
        leave: sum(layout.leave),
        deferment: sum(layout.deferment),
        total: sum(layout.total),
        sourceRow,
      };

      const missing = REQUIRED_DIMENSIONS.filter((column) => !text(row, column));
      if (missing.length) {
        issues.push({
          year: detectedYear,
          sourceRow,
          type: "missing_dimension",
          message: `필수 차원 누락: ${missing.join(", ")}`,
        });
      }
      validateSubtotals(numericValues, layout, detectedYear, sourceRow, issues);
      const calculatedTotal = record.enrolled + record.leave + record.deferment;
      if (record.total !== calculatedTotal) {
        issues.push({
          year: detectedYear,
          sourceRow,
          type: "enrollment_equation",
          message: `재적학생 ${record.total} ≠ 재학생+휴학생+학위취득유예학생 ${calculatedTotal}`,
        });
      }
      const key = recordKey(record);
      const previousRow = seen.get(key);
      if (previousRow) {
        issues.push({
          year: detectedYear,
          sourceRow,
          type: "duplicate",
          message: `복원 후 동일 차원 행 중복(최초 행 ${previousRow})`,
        });
      } else {
        seen.set(key, sourceRow);
      }
      records.push(record);
    }
    if (records.length === 0) {
      errors.push({
        code: "empty_dataset",
        severity: "error",
        message: "변환할 데이터 행이 없습니다.",
      });
    }
    errors.push(...issues.map(issueToMessage));
    base.records = records;
    base.issueSample = issues.slice(0, 100);
    return base;
  } catch {
    errors.push({
      code: "parse_failed",
      severity: "error",
      message: "XLSX 내부 구조를 안전하게 변환할 수 없습니다.",
    });
    return base;
  }
}
