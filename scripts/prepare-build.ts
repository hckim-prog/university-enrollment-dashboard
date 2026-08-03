import { rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const generatedDevTypes = path.resolve(projectRoot, ".next", "dev", "types");
const relativeTarget = path.relative(projectRoot, generatedDevTypes);

if (
  relativeTarget !== path.join(".next", "dev", "types") ||
  relativeTarget.startsWith("..") ||
  path.isAbsolute(relativeTarget)
) {
  throw new Error("빌드 캐시 경로를 안전하게 확인하지 못했습니다.");
}

async function main() {
  await rm(generatedDevTypes, { recursive: true, force: true });
  console.log("Next.js 개발용 생성 타입 캐시를 정리했습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
