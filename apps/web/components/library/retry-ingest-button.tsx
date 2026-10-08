"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryIngestButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button disabled={busy} className="mt-2 font-medium underline" onClick={async () => { setBusy(true); await fetch(`/api/ingest-jobs/${jobId}/retry`, { method: "POST" }); router.refresh(); setBusy(false); }}>{busy ? "重试中…" : "重试"}</button>;
}
