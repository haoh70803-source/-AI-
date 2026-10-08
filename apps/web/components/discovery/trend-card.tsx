import { Badge, Card } from "@content-center/ui";
import { Layers3 } from "lucide-react";
import Link from "next/link";

export type TrendOpportunityView = {
  deterministicKey: string;
  platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL" | "CROSS_PLATFORM";
  type: "HOT" | "SURGING" | "DARK_HORSE" | "CROSS_PLATFORM";
  title: string;
  keyword: string | null;
  summary: string | null;
  rank: number | null;
  previousRank: number | null;
  rankDelta: number | null;
  state: "FIRST_SEEN" | "RISING" | "PERSISTING" | "DARK_HORSE";
  trendScore: null;
  metrics: { contentCount: number | null; engagement: number | null; growth: number | null; likes: number | null; comments: number | null };
  observedAt: string;
  supportingPlatforms: Array<"DOUYIN" | "XIAOHONGSHU" | "GLOBAL">;
  ideaCount: number;
};

const platformLabel = { DOUYIN: "抖音", XIAOHONGSHU: "小红书", GLOBAL: "全网", CROSS_PLATFORM: "多平台" } as const;
const stateLabel = { FIRST_SEEN: "新出现", RISING: "正在上升", PERSISTING: "持续热门", DARK_HORSE: "黑马" } as const;

export function TrendCard({ item, compact = false, actions }: { item: TrendOpportunityView; compact?: boolean; actions?: React.ReactNode }) {
  return <Card data-testid={`trend-card-${item.deterministicKey}`} className={compact ? "p-4" : "p-5"}>
    <div className="flex flex-wrap items-center gap-2">
      <Badge>{stateLabel[item.state]}</Badge>
      <span className="text-xs text-[var(--text-secondary)]">{platformLabel[item.platform]}</span>
      {item.platform === "CROSS_PLATFORM" ? <Layers3 size={13} className="text-[var(--text-secondary)]" /> : null}
    </div>
    <Link href={`/discovery/trends/${encodeURIComponent(item.deterministicKey)}`} className={`${compact ? "mt-2 line-clamp-2 text-sm" : "mt-3 text-lg"} block font-semibold leading-6 hover:text-[var(--accent)]`}>{item.title}</Link>
    {item.summary ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{item.summary}</p> : null}
    <p className="mt-3 text-xs text-[var(--text-secondary)]">{item.rank !== null ? `${platformLabel[item.platform]}榜单 #${item.rank}${item.rankDelta !== null && item.rankDelta > 0 ? `，较前次上升 ${item.rankDelta} 位` : ""}` : item.supportingPlatforms.length > 1 ? "多个平台都在讨论" : "近期榜单出现的新方向"}</p>
    {item.ideaCount > 0 ? <p className="mt-3 text-xs text-[var(--success)]">✓ 已生成 {item.ideaCount} 个选题</p> : null}
    {actions ? <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">{actions}</div> : null}
  </Card>;
}
