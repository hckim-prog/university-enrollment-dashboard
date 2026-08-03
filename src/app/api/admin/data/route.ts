import { NextResponse } from "next/server";
import { getDataManagementService } from "@/lib/data-store/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getDataManagementService().getOverview(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "로컬 데이터 저장소를 읽을 수 없습니다. 개발 서버와 저장 폴더 상태를 확인해 주세요.",
      },
      { status: 500 },
    );
  }
}
