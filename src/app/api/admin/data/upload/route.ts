import { NextRequest, NextResponse } from "next/server";
import {
  DataManagementError,
  getDataManagementService,
  toAdminDataVersion,
} from "@/lib/data-store/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 21 * 1024 * 1024) {
      return NextResponse.json(
        { error: "파일 크기는 20MB를 넘을 수 없습니다." },
        { status: 413 },
      );
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "검증할 XLSX 파일을 선택해 주세요." },
        { status: 400 },
      );
    }
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "XLSX 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "파일 크기는 20MB를 넘을 수 없습니다." },
        { status: 413 },
      );
    }
    const version = await getDataManagementService().upload({
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(
      { version: toAdminDataVersion(version) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DataManagementError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          existingVersionId: error.existingVersionId,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "파일 처리 중 오류가 발생했습니다. 기존 게시 데이터는 유지됩니다." },
      { status: 500 },
    );
  }
}
