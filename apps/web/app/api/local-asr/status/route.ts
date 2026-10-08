import { NextResponse } from "next/server";
import { getApiWorkspaceContext } from "@/server/api-access";
import { getLocalAsrDisplay } from "@/server/local-asr";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(await getLocalAsrDisplay(context.workspace.id));
}

