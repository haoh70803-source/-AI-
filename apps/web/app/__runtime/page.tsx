import { notFound } from "next/navigation";
import { getRuntimeHealth, type RuntimeStatus } from "@/server/runtime/health";

export const dynamic = "force-dynamic";

const statusClass: Record<RuntimeStatus, string> = {
  OK: "bg-emerald-100 text-emerald-800",
  UNCONFIGURED: "bg-amber-100 text-amber-800",
  MISSING: "bg-amber-100 text-amber-800",
  UNREACHABLE: "bg-red-100 text-red-800",
  DEGRADED: "bg-orange-100 text-orange-800",
  DISABLED_FOR_REVIEW: "bg-slate-100 text-slate-700",
};

export default async function RuntimePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const health = await getRuntimeHealth();
  const services = [
    ["Database", health.database.status],
    ["Redis", health.redis.status],
    ["Worker", health.worker.status],
    ["Storage", health.storage.status],
    ["RedFox", health.redfox.status],
    ["LLM", health.llm.status],
    ["ASR", health.asr.status],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Development only</p>
        <h1 className="mt-3 text-3xl font-semibold">Runtime Health</h1>
        <p className="mt-2 text-sm text-slate-600">此页面不读取或显示任何 secret，只显示当前开发环境身份和依赖状态。</p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Environment</dt><dd className="mt-1 text-lg font-semibold">{health.environment}</dd></div>
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">Provider policy</dt><dd className="mt-1 text-lg font-semibold">{health.policy}</dd></div>
          <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2"><dt className="text-xs text-slate-500">Database target</dt><dd className="mt-1 font-mono text-sm">{health.database.target.host ?? "unknown"}:{health.database.target.port ?? "?"}/{health.database.target.database ?? "unknown"}</dd></div>
        </dl>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {services.map(([name, status]) => <div key={name} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"><span className="font-medium">{name}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[status]}`}>{status === "DISABLED_FOR_REVIEW" ? "当前环境禁用" : status}</span></div>)}
        </div>
        <p className="mt-8 text-xs text-slate-500">Checked at {health.checkedAt}</p>
      </div>
    </main>
  );
}
