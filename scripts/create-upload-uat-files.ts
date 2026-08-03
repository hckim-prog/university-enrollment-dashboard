import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";

const inputDir = path.resolve(
  process.argv[2] ?? "C:\\Users\\user\\Downloads\\data_20260731153427",
);
const outputDir = path.resolve(
  process.argv[3] ?? path.join("output", "playwright", "uploads"),
);

async function main() {
  const sourceName = (await readdir(inputDir)).find(
    (fileName) => fileName.startsWith("2025년") && fileName.endsWith(".xlsx"),
  );
  if (!sourceName) throw new Error("2025년 원본을 찾지 못했습니다.");
  const source = new Uint8Array(await readFile(path.join(inputDir, sourceName)));
  const archive = unzipSync(source);
  const normal = zipSync({
    ...archive,
    "docProps/uat-normal.txt": strToU8("local-admin-browser-uat-normal"),
  });
  const mismatch = zipSync({
    ...archive,
    "docProps/uat-year-mismatch.txt": strToU8(
      "local-admin-browser-uat-year-mismatch",
    ),
  });
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "2025년_수정파일_UAT.xlsx"), normal),
    writeFile(path.join(outputDir, "2024년_연도불일치_UAT.xlsx"), mismatch),
    writeFile(
      path.join(outputDir, "손상파일_UAT.xlsx"),
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
    ),
    writeFile(path.join(outputDir, "허용안됨_UAT.csv"), "not an xlsx"),
  ]);
  console.log(`브라우저 UAT 파일 생성: ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UAT 파일 생성 실패");
  process.exitCode = 1;
});
