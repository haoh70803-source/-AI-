"use client";

import { Button } from "@content-center/ui";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MetadataRefreshButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"IDLE" | "REFRESHING" | "SUCCEEDED" | "FAILED">("IDLE");
  const [message, setMessage] = useState("");

  async function refresh() {
    setState("REFRESHING");
    setMessage("");
    try {
      const response = await fetch(`/api/source-items/${sourceId}/metadata/refresh`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "作品数据刷新失败，请稍后重试。");
      setState("SUCCEEDED");
      setMessage("作品数据已更新，不会重新下载或转写。");
      router.refresh();
    } catch (error) {
      setState("FAILED");
      setMessage(error instanceof Error ? error.message : "作品数据刷新失败，请稍后重试。");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={state === "REFRESHING"} onClick={() => void refresh()}>
        <RefreshCw size={15} className={state === "REFRESHING" ? "animate-spin" : ""} />
        {state === "REFRESHING" ? "正在更新" : state === "FAILED" ? "重试更新" : "更新作品数据"}
      </Button>
      {message ? (
        <span role={state === "FAILED" ? "alert" : "status"} className={state === "FAILED" ? "text-sm text-[var(--danger)]" : "text-sm text-[var(--text-secondary)]"}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
