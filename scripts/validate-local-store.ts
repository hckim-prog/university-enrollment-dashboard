import { createHash } from "node:crypto";
import { LocalDataVersionRepository } from "../src/lib/data-store/local-repository";

async function main() {
  const repository = new LocalDataVersionRepository();
  const metadata = await repository.readMetadata();
  if (!metadata.activeSnapshotId) throw new Error("활성 게시 스냅샷이 없습니다.");
  const dataset = await repository.readSnapshot(metadata.activeSnapshotId);
  const activeVersions = Object.entries(metadata.activeByYear)
    .map(([year, versionId]) => ({
      year: Number(year),
      version: metadata.versions.find((item) => item.id === versionId),
    }))
    .toSorted((a, b) => a.year - b.year);
  if (activeVersions.some(({ version }) => !version)) {
    throw new Error("활성 버전 메타데이터 연결이 끊어졌습니다.");
  }
  for (const { year, version } of activeVersions) {
    if (!version) continue;
    if (!(await repository.hasVersionFile(version))) {
      throw new Error(`${year}년 버전 파일이 누락되었습니다.`);
    }
    const bytes = await repository.readOriginal(version.storagePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== version.sha256 || bytes.byteLength !== version.fileSize) {
      throw new Error(`${year}년 원본 파일 무결성 검증에 실패했습니다.`);
    }
    const rowCount = dataset.records.filter((record) => record.year === year).length;
    if (rowCount !== version.rowCount) {
      throw new Error(`${year}년 활성 행 수가 버전 메타데이터와 다릅니다.`);
    }
  }
  const expectedRows: Record<number, number> = {
    2023: 14480,
    2024: 15056,
    2025: 15706,
  };
  for (const [year, expected] of Object.entries(expectedRows)) {
    const actual = dataset.records.filter((record) => record.year === Number(year)).length;
    if (actual !== expected) throw new Error(`${year}년 행 수 회귀 검증 실패`);
  }
  const totals = new Map<number, number>();
  for (const record of dataset.records) {
    totals.set(record.year, (totals.get(record.year) ?? 0) + record.total);
    if (record.total !== record.enrolled + record.leave + record.deferment) {
      throw new Error(`${record.year}년 ${record.sourceRow}행 재적학생 검산 실패`);
    }
  }
  if (dataset.records.length !== 45242) throw new Error("총 행 수 회귀 검증 실패");
  if (totals.get(2025) !== 2128443) throw new Error("2025년 합계 회귀 검증 실패");
  if ((totals.get(2025) ?? 0) - (totals.get(2024) ?? 0) !== -1313) {
    throw new Error("2024년 대비 증감 회귀 검증 실패");
  }
  console.log(
    `로컬 게시 저장소 검증 통과: ${dataset.records.length.toLocaleString("ko-KR")}행, 활성 버전 ${activeVersions.length}개, 원본 SHA-256 일치, 오류 0건`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "저장소 검증 실패");
  process.exitCode = 1;
});
