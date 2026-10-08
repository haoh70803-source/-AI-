import { Card } from "@content-center/ui";
import Link from "next/link";
import { PageHeader } from "@/components/page";
import { requireSystemAdmin } from "@/server/access";
import { getAdminUsage, type UsageRange } from "@/server/admin/usage";

export default async function AdminUsagePage({ searchParams }: { searchParams: Promise<{ range?: string; userId?: string }> }) {
  await requireSystemAdmin();
  const query = await searchParams;
  const range: UsageRange = query.range === "today" || query.range === "month" ? query.range : "7d";
  const rows = await getAdminUsage(range, query.userId);
  return <>
    <PageHeader title="用量中心" description="仅统计使用归属，不做额度、计费或自动阻断。" />
    <div className="mb-5 flex gap-2">{[["today", "今天"], ["7d", "最近 7 天"], ["month", "本月"]].map(([value, label]) => <Link key={value} href={`/admin/usage?range=${value}`} className={`rounded-lg px-3 py-2 text-sm ${range === value ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)]"}`}>{label}</Link>)}</div>
    <Card className="overflow-x-auto p-0"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-[var(--border)] text-[var(--text-secondary)]"><tr>{["用户", "Workspace", "AI 调用", "Input Tokens", "Output Tokens", "RedFox", "转写分钟", "素材", "最近使用"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-[var(--border)] last:border-0"><td className="px-4 py-3"><Link className="font-medium text-[var(--accent)]" href={`/admin/usage?range=${range}&userId=${row.id}`}>{row.name}<span className="block text-xs text-[var(--text-secondary)]">{row.email}</span></Link></td><td className="px-4 py-3">{row.workspace?.name ?? "—"}</td><td className="px-4 py-3">{row.aiCalls}</td><td className="px-4 py-3">{row.aiInputTokens}</td><td className="px-4 py-3">{row.aiOutputTokens}</td><td className="px-4 py-3">{row.redfoxCalls}</td><td className="px-4 py-3">{row.transcriptionMinutes}</td><td className="px-4 py-3">{row.materialCount}</td><td className="px-4 py-3">{row.recentActivity ? new Date(row.recentActivity).toLocaleString("zh-CN") : "—"}</td></tr>)}</tbody></table></Card>
    {query.userId && rows[0] ? <Card className="mt-6 p-5"><h2 className="font-semibold">用户详情</h2><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><p>豆包：{rows[0].doubaoMinutes} 分钟</p><p>FunASR：{rows[0].localFunAsrMinutes} 分钟</p><p>ASR Failed：{rows[0].asrFailed}</p><p>创作：{rows[0].projectCount}</p><p>RedFox Success：{rows[0].redfoxSuccess}</p><p>RedFox Failed：{rows[0].redfoxFailed}</p>{Object.entries(rows[0].operations).map(([key, count]) => <p key={key}>{key}：{count}</p>)}</div></Card> : null}
  </>;
}
