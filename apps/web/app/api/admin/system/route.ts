import { NextResponse } from "next/server";
import { getSystemServiceStatuses } from "@/server/admin/system-services";
import { getSystemAdminApiContext } from "@/server/api-access";

export async function GET() {
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  return NextResponse.json({ services: await getSystemServiceStatuses() });
}
