import { Badge, Card } from "@content-center/ui";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page";
import { PLATFORM_LABELS, SUPPORTED_PLATFORMS, type SupportedPlatform } from "@/lib/platforms";
import { requireWorkspace } from "@/server/access";
import { listPublishCreators, listPublishTasks } from "@/server/publishing/publish-task-service";
import { publishStatuses, publishStatusSchema } from "@/server/publishing/schemas";

const STATUS_LABELS = { DRAFT: "草稿", SCHEDULED: "已排期", READY_TO_PUBLISH: "待发布", PUBLISHED: "已发布", FAILED: "失败", CANCELLED: "已取消" } as const;
type View = "calendar" | "pending" | "published";
type Params = Record<string, string | string[] | undefined>;

function value(params: Params, key: string) { const found = params[key]; return Array.isArray(found) ? found[0] : found; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function monthValue(raw?: string) { return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : dateKey(new Date()).slice(0, 7); }
function monthBounds(month: string) { const year = Number(month.slice(0, 4)); const index = Number(month.slice(5, 7)) - 1; return { from: new Date(year, index, 1), to: new Date(year, index + 1, 1), year, index }; }
function shiftMonth(month: string, amount: number) { const { year, index } = monthBounds(month); const date = new Date(year, index + amount, 1); return dateKey(date).slice(0, 7); }

export default async function PublishingCenterPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { session, workspace } = await requireWorkspace();
  const params = await searchParams;
  const requestedView = value(params, "view");
  const view: View = requestedView === "pending" || requestedView === "published" ? requestedView : "calendar";
  const month = monthValue(value(params, "month"));
  const bounds = monthBounds(month);
  const rawPlatform = value(params, "platform");
  const platform = SUPPORTED_PLATFORMS.includes(rawPlatform as SupportedPlatform) ? rawPlatform as SupportedPlatform : undefined;
  const statusResult = publishStatusSchema.safeParse(value(params, "status"));
  const creatorId = value(params, "creatorId") || undefined;
  const selectedDate = value(params, "date");
  const dayFrom = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? new Date(`${selectedDate}T00:00:00`) : undefined;
  const actor = { workspaceId: workspace.id, userId: session.user.id };
  const [allTasks, creators] = await Promise.all([
    listPublishTasks(actor, { platform, status: statusResult.success ? statusResult.data : undefined, creatorId, from: dayFrom ?? (view === "calendar" ? bounds.from : undefined), to: dayFrom ? new Date(dayFrom.getFullYear(), dayFrom.getMonth(), dayFrom.getDate() + 1) : view === "calendar" ? bounds.to : undefined }),
    listPublishCreators(actor),
  ]);
  const tasks = allTasks.filter((task) => view === "pending" ? ["READY_TO_PUBLISH", "SCHEDULED", "FAILED"].includes(task.status) : view === "published" ? task.status === "PUBLISHED" : true);

  return <>
    <PageHeader title="发布中心" description="使用已人工批准的内容快照准备发布包、安排时间，并由人工完成真实发布。" />
    <nav aria-label="发布中心视图" className="mb-5 flex gap-1 rounded-xl border bg-[var(--surface)] p-1">
      {([['calendar','日历'],['pending','待发布'],['published','已发布']] as const).map(([key, label]) => <Link key={key} href={`/calendar?view=${key}`} className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium ${view === key ? "bg-[var(--accent)] text-white shadow-[var(--shadow-button)]" : "text-[var(--text-secondary)]"}`}>{label}</Link>)}
    </nav>
    <Card className="mb-5 p-4">
      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="month" value={month} />
        <label className="text-xs text-[var(--text-secondary)]">平台<select name="platform" defaultValue={platform ?? ""} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3 text-sm"><option value="">全部平台</option>{SUPPORTED_PLATFORMS.map((item) => <option key={item} value={item}>{PLATFORM_LABELS[item]}</option>)}</select></label>
        <label className="text-xs text-[var(--text-secondary)]">状态<select name="status" defaultValue={statusResult.success ? statusResult.data : ""} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3 text-sm"><option value="">全部状态</option>{publishStatuses.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
        <label className="text-xs text-[var(--text-secondary)]">创作者<select name="creatorId" defaultValue={creatorId ?? ""} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3 text-sm"><option value="">全部创作者</option>{creators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs text-[var(--text-secondary)]">指定日期<input name="date" type="date" defaultValue={selectedDate ?? ""} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3 text-sm" /></label>
        <div className="flex items-end gap-2"><button className="h-10 flex-1 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white">筛选</button><Link href={`/calendar?view=${view}`} className="grid h-10 place-items-center rounded-lg border px-4 text-sm">重置</Link></div>
      </form>
    </Card>
    {view === "calendar" ? <MonthCalendar month={month} tasks={tasks} /> : <TaskList tasks={tasks} empty={view === "published" ? "暂无已发布任务。" : "暂无待发布任务。"} />}
  </>;
}

type Task = Awaited<ReturnType<typeof listPublishTasks>>[number];

function MonthCalendar({ month, tasks }: { month: string; tasks: Task[] }) {
  const { year, index } = monthBounds(month);
  const firstWeekday = (new Date(year, index, 1).getDay() + 6) % 7;
  const days = new Date(year, index + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, cell) => cell - firstWeekday + 1);
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) { if (!task.scheduledAt) continue; const key = dateKey(task.scheduledAt); grouped.set(key, [...(grouped.get(key) ?? []), task]); }
  return <Card className="overflow-hidden">
    <header className="flex items-center justify-between border-b p-4"><Link aria-label="上个月" href={`/calendar?view=calendar&month=${shiftMonth(month, -1)}`} className="rounded-lg border p-2"><ChevronLeft size={16} /></Link><h2 className="font-semibold">{year} 年 {index + 1} 月</h2><Link aria-label="下个月" href={`/calendar?view=calendar&month=${shiftMonth(month, 1)}`} className="rounded-lg border p-2"><ChevronRight size={16} /></Link></header>
    <div className="grid grid-cols-7 border-b bg-[var(--surface-elevated)] text-center text-xs text-[var(--text-secondary)]">{["一","二","三","四","五","六","日"].map((day) => <div key={day} className="p-2">{day}</div>)}</div>
    <div className="grid grid-cols-7">{cells.map((day, cell) => { const active = day >= 1 && day <= days; const key = active ? dateKey(new Date(year, index, day)) : `blank-${cell}`; return <div key={key} className="min-h-28 border-b border-r p-1.5 sm:p-2"><span className={`text-xs ${active ? "" : "opacity-0"}`}>{active ? day : "0"}</span><div className="mt-1 grid gap-1">{(grouped.get(key) ?? []).slice(0, 3).map((task) => <Link key={task.id} href={`/calendar/tasks/${task.id}`} className="rounded-md border bg-[var(--surface)] p-1.5 text-[10px] hover:border-[var(--accent)]"><span className="block truncate font-medium">{task.scheduledAt?.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} · {PLATFORM_LABELS[task.platform]}</span><span className="block truncate text-[var(--text-secondary)]">{task.project.title}</span></Link>)}</div></div>; })}</div>
  </Card>;
}

function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (!tasks.length) return <Card className="grid min-h-56 place-items-center p-8 text-center"><div><h2 className="font-semibold">{empty}</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">先完成并确认一篇稿件，再把它加入发布计划。</p><Link href="/projects" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">查看项目</Link></div></Card>;
  return <div className="grid gap-3">{tasks.map((task) => <Link key={task.id} href={`/calendar/tasks/${task.id}`}><Card className="flex flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-[var(--accent)]"><div><div className="flex flex-wrap items-center gap-2"><Badge>{PLATFORM_LABELS[task.platform]}</Badge><Badge>{STATUS_LABELS[task.status]}</Badge><strong>{task.project.title}</strong></div><p className="mt-2 text-xs text-[var(--text-secondary)]">创作者：{task.project.creatorProfile?.displayName || task.createdBy.name}</p></div><p className="flex items-center gap-2 text-sm"><Clock3 size={15} />{task.scheduledAt ? task.scheduledAt.toLocaleString("zh-CN") : task.publishedAt ? task.publishedAt.toLocaleString("zh-CN") : "未排期"}</p></Card></Link>)}</div>;
}
