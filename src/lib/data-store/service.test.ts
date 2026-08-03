import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDepartmentTrends, DEFAULT_TREND_CRITERIA } from "../department-trends";
import { emptyFilters } from "../analytics";
import { getPublishedData } from "../data";
import { LocalDataVersionRepository } from "./local-repository";
import {
  DataManagementError,
  DataManagementService,
} from "./service";

type FixtureOptions = {
  year?: number;
  layout?: "legacy" | "subtotal";
  school?: string;
  department?: string;
  duplicate?: boolean;
  negative?: boolean;
  invalidNumeric?: boolean;
  totalError?: boolean;
  missingDimension?: boolean;
  missingHeader?: boolean;
  empty?: boolean;
  columnCount?: number;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inlineCell(reference: string, value: string) {
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function numericCell(reference: string, value: number | string) {
  return `<c r="${reference}"><v>${value}</v></c>`;
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

function fixture(options: FixtureOptions = {}) {
  const year = options.year ?? 2025;
  const layout = options.layout ?? "subtotal";
  const expectedColumns = layout === "legacy" ? 37 : 41;
  const columnCount = options.columnCount ?? expectedColumns;
  const headers = [
    ["A1", `${year}년_ [4-마. 재적 학생 현황_]`],
    ["B4", "학교종류"],
    ["C4", "설립구분"],
    ["D4", "지역"],
    ["E4", "상태"],
    ["F4", "학교"],
    ["G4", "단과대학"],
    ["H4", "학과(전공)"],
    ["I4", "구분"],
    ["J4", "학과특성"],
    ["K4", "학과상태"],
    ["L4", "계열"],
    ["N4", "재학생(A)"],
    ["U4", "휴학생(B)"],
    [layout === "legacy" ? "AG4" : "AI4", "재적학생(D=A+B+C)"],
    [`${columnName(columnCount)}6`, "여"],
  ].filter(([reference]) => !(options.missingHeader && reference === "H4"));
  const headerRows = [1, 4, 6].map((row) => {
    const cells = headers
      .filter(([reference]) => reference.endsWith(String(row)))
      .map(([reference, value]) => inlineCell(reference, value))
      .join("");
    return `<row r="${row}">${cells}</row>`;
  });

  const numeric = new Map<string, number | string>();
  for (let column = 13; column <= columnCount; column += 1) {
    numeric.set(columnName(column), 0);
  }
  numeric.set("M", 100);
  if (layout === "legacy") {
    Object.entries({
      N: 70, O: 10, P: 35, Q: 5, R: 35, S: 5,
      T: 5, U: 1, V: 3, W: 1, X: 2, Y: 0,
      Z: 2, AA: 0, AB: 1, AC: 0, AD: 1, AE: 0,
      AF: 77, AG: 11, AH: 38, AI: 5, AJ: 39, AK: 6,
    }).forEach(([key, value]) => numeric.set(key, value));
  } else {
    Object.entries({
      N: 80, O: 70, P: 10, Q: 35, R: 5, S: 35, T: 5,
      U: 6, V: 5, W: 1, X: 3, Y: 1, Z: 2, AA: 0,
      AB: 2, AC: 2, AD: 0, AE: 1, AF: 0, AG: 1, AH: 0,
      AI: 88, AJ: 77, AK: 11, AL: 38, AM: 5, AN: 39, AO: 6,
    }).forEach(([key, value]) => numeric.set(key, value));
  }
  if (options.negative) numeric.set("N", -80);
  if (options.invalidNumeric) numeric.set("N", "숫자아님");
  if (options.totalError) numeric.set(layout === "legacy" ? "AF" : "AI", 89);

  const makeDataRow = (rowNumber: number) => {
    const dimensions = {
      B: "대학교",
      C: "사립",
      D: "서울",
      E: "기존",
      F: options.school ?? "테스트대학교",
      G: options.missingDimension ? "" : "테스트대학",
      H: options.department ?? "인공지능학과",
      I: "주간",
      J: "일반과정",
      K: "기존",
      L: "공학계열",
    };
    const dimensionCells = Object.entries(dimensions)
      .map(([column, value]) => inlineCell(`${column}${rowNumber}`, value))
      .join("");
    const numericCells = [...numeric]
      .map(([column, value]) => numericCell(`${column}${rowNumber}`, value))
      .join("");
    return `<row r="${rowNumber}">${dimensionCells}${numericCells}</row>`;
  };
  const dataRows = options.empty
    ? []
    : [makeDataRow(7), ...(options.duplicate ? [makeDataRow(8)] : [])];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <dimension ref="A1"/><sheetData>${[...headerRows, ...dataRows].join("")}</sheetData>
    </worksheet>`;
  return zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet) });
}

class FailingSnapshotRepository extends LocalDataVersionRepository {
  failSnapshot = false;
  override async writeSnapshot(
    snapshotId: string,
    dataset: Parameters<LocalDataVersionRepository["writeSnapshot"]>[1],
  ) {
    if (this.failSnapshot) throw new Error("simulated_snapshot_failure");
    return super.writeSnapshot(snapshotId, dataset);
  }
}

describe("로컬 데이터 버전 관리 통합", () => {
  let root: string;
  let repository: FailingSnapshotRepository;
  let service: DataManagementService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "enrollment-store-test-"));
    repository = new FailingSnapshotRepository(root);
    service = new DataManagementService(repository);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("정상 XLSX를 검증하고 게시 전에는 대시보드에 반영하지 않는다", async () => {
    const version = await service.upload({
      fileName: "2025년_테스트.xlsx",
      bytes: fixture(),
    });
    expect(version.status).toBe("review_pending");
    expect(version.validation.canPublish).toBe(true);
    expect(version.validation.summary?.total).toBe(88);
    expect(await service.getPublishedDataset()).toBeNull();
    await service.publish(version.id, { acknowledgeWarnings: true });
    const published = await service.getPublishedDataset();
    expect(published?.records).toHaveLength(1);
    expect(published?.records[0].total).toBe(88);
  });

  it("동일 SHA-256 재등록을 차단하고 기존 버전 ID를 제공한다", async () => {
    const bytes = fixture();
    const version = await service.upload({ fileName: "2025년.xlsx", bytes });
    await expect(
      service.upload({ fileName: "복사본_2025년.xlsx", bytes }),
    ).rejects.toMatchObject({
      code: "duplicate_file",
      existingVersionId: version.id,
    });
  });

  it.each([
    ["손상 XLSX", "2025년.xlsx", new Uint8Array([0x50, 0x4b, 1]), "unreadable_workbook"],
    ["연도 불일치", "2024년.xlsx", fixture(), "year_mismatch"],
    ["필수 헤더 누락", "2025년.xlsx", fixture({ missingHeader: true }), "missing_column"],
    ["음수 학생 수", "2025년.xlsx", fixture({ negative: true }), "negative"],
    ["비숫자 학생 수", "2025년.xlsx", fixture({ invalidNumeric: true }), "invalid_numeric"],
    ["합계 오류", "2025년.xlsx", fixture({ totalError: true }), "subtotal"],
    ["중복 행 키", "2025년.xlsx", fixture({ duplicate: true }), "duplicate"],
    ["필수 차원 누락", "2025년.xlsx", fixture({ missingDimension: true }), "missing_dimension"],
    ["빈 데이터", "2025년.xlsx", fixture({ empty: true }), "empty_dataset"],
    ["호환 불가 열 수", "2025년.xlsx", fixture({ layout: "legacy", columnCount: 38 }), "schema"],
  ])("%s를 게시 차단 오류로 보존한다", async (_label, fileName, bytes, code) => {
    const version = await service.upload({ fileName, bytes });
    expect(version.status).toBe("validation_failed");
    expect(version.validation.canPublish).toBe(false);
    expect(version.validation.errors.some((error) => error.code === code)).toBe(true);
    expect(await service.getPublishedDataset()).toBeNull();
  });

  it("잘못된 확장자와 XLSX 서명을 저장 전에 차단한다", async () => {
    await expect(
      service.upload({ fileName: "data.csv", bytes: fixture() }),
    ).rejects.toMatchObject({ code: "invalid_extension" });
    await expect(
      service.upload({ fileName: "data.xlsx", bytes: new Uint8Array([1, 2, 3]) }),
    ).rejects.toMatchObject({ code: "invalid_xlsx_signature" });
    expect((await service.getOverview()).versions).toHaveLength(0);
  });

  it("새 연도와 누락 과거 연도를 추가하고 연도 순으로 재구성한다", async () => {
    for (const year of [2025, 2026, 2022]) {
      const version = await service.upload({
        fileName: `${year}년.xlsx`,
        bytes: fixture({
          year,
          layout: year <= 2024 ? "legacy" : "subtotal",
          school: `${year}대학교`,
        }),
      });
      await service.publish(version.id, { acknowledgeWarnings: true });
    }
    const dataset = await service.getPublishedDataset();
    expect(dataset?.publication.activeYears).toEqual([2022, 2025, 2026]);
    expect(dataset?.records.map((record) => record.year)).toEqual([2022, 2025, 2026]);
  });

  it("기존 연도 새 버전을 게시하고 이전 버전으로 복구한다", async () => {
    const first = await service.upload({
      fileName: "2025년_첫버전.xlsx",
      bytes: fixture({ school: "첫대학교" }),
    });
    await service.publish(first.id, { acknowledgeWarnings: true });
    const second = await service.upload({
      fileName: "2025년_수정버전.xlsx",
      bytes: fixture({ school: "둘대학교" }),
    });
    expect((await service.getPublishedDataset())?.records[0].school).toBe("첫대학교");
    expect(second.validation.warnings.some((warning) => warning.code === "existing_year_revision")).toBe(true);
    await expect(
      service.publish(second.id, { acknowledgeWarnings: false }),
    ).rejects.toBeInstanceOf(DataManagementError);
    await service.publish(second.id, { acknowledgeWarnings: true });
    expect((await service.getPublishedDataset())?.records[0].school).toBe("둘대학교");
    await service.restore(first.id, true);
    const restored = await service.getPublishedDataset();
    expect(restored?.records[0].school).toBe("첫대학교");
    const overview = await service.getOverview();
    expect(overview.versions.find((version) => version.id === first.id)?.status).toBe("restored");
    expect(overview.audit.some((entry) => entry.action === "restore")).toBe(true);
  });

  it("게시 스냅샷 저장 실패 시 기존 활성 데이터와 캐시를 유지한다", async () => {
    const first = await service.upload({
      fileName: "2025년_정상.xlsx",
      bytes: fixture({ school: "안전대학교" }),
    });
    await service.publish(first.id, { acknowledgeWarnings: true });
    const revision = (await service.getPublishedDataset())?.revision;
    const second = await service.upload({
      fileName: "2025년_실패.xlsx",
      bytes: fixture({ school: "실패대학교" }),
    });
    repository.failSnapshot = true;
    await expect(
      service.publish(second.id, { acknowledgeWarnings: true }),
    ).rejects.toThrow("simulated_snapshot_failure");
    const dataset = await service.getPublishedDataset();
    expect(dataset?.revision).toBe(revision);
    expect(dataset?.records[0].school).toBe("안전대학교");
  });

  it("게시 후 학과군 집계와 캐시 리비전이 다시 계산된다", async () => {
    const first = await service.upload({
      fileName: "2025년_AI.xlsx",
      bytes: fixture({ department: "인공지능학과" }),
    });
    await service.publish(first.id, { acknowledgeWarnings: true });
    const before = await service.getPublishedDataset();
    const second = await service.upload({
      fileName: "2025년_간호.xlsx",
      bytes: fixture({ department: "간호학과" }),
    });
    await service.publish(second.id, { acknowledgeWarnings: true });
    const after = await service.getPublishedDataset();
    expect(after?.revision).not.toBe(before?.revision);
    const trends = createDepartmentTrends(
      after?.records ?? [],
      emptyFilters(),
      DEFAULT_TREND_CRITERIA,
    );
    expect(trends.groups.reduce((sum, group) => sum + group.selectedValue, 0)).toBe(88);
    expect(trends.groups.find((group) => group.name === "간호·의료·보건")?.selectedValue).toBe(88);
  });
});

describe("기존 게시 데이터 회귀", () => {
  it("45,242행과 2025년 기준값을 유지한다", async () => {
    const dataset = await getPublishedData();
    const records2024 = dataset.records.filter((record) => record.year === 2024);
    const records2025 = dataset.records.filter((record) => record.year === 2025);
    const total2024 = records2024.reduce((sum, record) => sum + record.total, 0);
    const total2025 = records2025.reduce((sum, record) => sum + record.total, 0);
    expect(dataset.records).toHaveLength(45242);
    expect(records2024).toHaveLength(15056);
    expect(records2025).toHaveLength(15706);
    expect(total2025).toBe(2128443);
    expect(total2025 - total2024).toBe(-1313);
    expect(dataset.validation.issueCount).toBe(0);
  });
});
