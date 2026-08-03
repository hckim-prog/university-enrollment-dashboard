import { NextRequest, NextResponse } from "next/server";
import {
  DataManagementError,
  getDataManagementService,
} from "@/lib/data-store/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      versionId?: string;
      acknowledgeWarnings?: boolean;
    };
    if (!body.versionId) {
      return NextResponse.json(
        { error: "복구할 버전을 선택해 주세요." },
        { status: 400 },
      );
    }
    const result = await getDataManagementService().restore(
      body.versionId,
      body.acknowledgeWarnings === true,
    );
    return NextResponse.json({
      versionId: result.target.id,
      previousVersionId: result.previousVersionId,
      publication: result.publication,
    });
  } catch (error) {
    if (error instanceof DataManagementError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "복구 처리에 실패했습니다. 현재 게시 데이터는 유지됩니다." },
      { status: 500 },
    );
  }
}
