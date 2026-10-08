import { createHealthQueue, SYSTEM_HEALTH_CHECK } from "@content-center/worker/queue";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const queue = createHealthQueue();
  try {
    const job = await queue.add(SYSTEM_HEALTH_CHECK, { requestedBy: session.user.id });
    return NextResponse.json({ jobId: job.id, status: "QUEUED" }, { status: 202 });
  } finally {
    await queue.close();
  }
}
