import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  DataManagementError,
  DataManagementService,
} from "../src/lib/data-store/service";
import { PARSER_VERSION } from "../src/lib/data-management-types";
import { LocalDataVersionRepository } from "../src/lib/data-store/local-repository";

const DEFAULT_INPUT_DIR = "C:\\Users\\user\\Downloads\\data_20260731153427";

function inputDirectory() {
  const index = process.argv.indexOf("--input-dir");
  return path.resolve(
    index >= 0 && process.argv[index + 1]
      ? process.argv[index + 1]
      : DEFAULT_INPUT_DIR,
  );
}

async function main() {
  const inputDir = inputDirectory();
  const fileNames = (await readdir(inputDir))
    .filter((fileName) => /^202[345]년 .*학과별자료\.xlsx$/.test(fileName))
    .toSorted();
  if (fileNames.length !== 3) {
    throw new Error("2023~2025 원본 XLSX 세 개를 찾지 못했습니다.");
  }
  const service = new DataManagementService(new LocalDataVersionRepository());
  for (const fileName of fileNames) {
    let versionId: string;
    let migrated = false;
    try {
      const version = await service.upload({
        fileName,
        bytes: new Uint8Array(await readFile(path.join(inputDir, fileName))),
      });
      versionId = version.id;
      migrated = true;
    } catch (error) {
      if (
        error instanceof DataManagementError &&
        error.code === "duplicate_file" &&
        error.existingVersionId
      ) {
        versionId = error.existingVersionId;
      } else {
        throw error;
      }
    }
    let overview = await service.getOverview();
    let version = overview.versions.find((item) => item.id === versionId);
    if (
      version &&
      (!version.validation.canPublish || version.parserVersion !== PARSER_VERSION)
    ) {
      await service.revalidate(version.id);
      overview = await service.getOverview();
      version = overview.versions.find((item) => item.id === versionId);
    }
    if (!version?.validation.canPublish || version.year === null) {
      throw new Error(`${fileName} 검증에 실패했습니다.`);
    }
    if (!version.isCurrent) {
      await service.publish(versionId, { acknowledgeWarnings: true });
    }
    if (migrated) await service.recordMigration(versionId);
    console.log(
      `${version.year}: ${version.rowCount.toLocaleString("ko-KR")}행 ${migrated ? "최초 게시 등록" : "기존 게시 버전 유지"}`,
    );
  }
  const overview = await service.getOverview();
  const dataset = await service.getPublishedDataset();
  if (
    !dataset ||
    dataset.records.length !== 45242 ||
    overview.publication.totalRows !== 45242
  ) {
    throw new Error("최초 게시 데이터 45,242행 회귀 검증에 실패했습니다.");
  }
  const total2025 = dataset.records
    .filter((record) => record.year === 2025)
    .reduce((sum, record) => sum + record.total, 0);
  if (total2025 !== 2128443) {
    throw new Error("2025년 재적학생 기준값 회귀 검증에 실패했습니다.");
  }
  console.log(
    `이관 완료: ${overview.publication.dataYearRange}, ${dataset.records.length.toLocaleString("ko-KR")}행, 2025년 재적학생 ${total2025.toLocaleString("ko-KR")}명`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "이관에 실패했습니다.");
  process.exitCode = 1;
});
