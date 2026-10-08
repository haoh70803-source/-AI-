export const platformLabel: Record<string, string> = { DOUYIN: "抖音", XIAOHONGSHU: "小红书", WECHAT: "微信", BILIBILI: "B站", YOUTUBE: "YouTube", TIKTOK: "TikTok", GLOBAL: "全网", GENERIC: "通用", OTHER: "其他" };
export const trendTypeLabel: Record<string, string> = { HOT: "热门榜", SURGING: "上升榜", DARK_HORSE: "黑马榜" };
export const collectionStatusLabel: Record<string, string> = { QUEUED: "排队中", RUNNING: "采集中", COMPLETED: "采集完成", PARTIAL: "部分完成", FAILED: "采集失败" };

/** Display labels only; never renames the stored source or invents an AI title. */
export function researchSourceLabel(title: string | null, sourceType: string) {
  const value = title?.trim() || "";
  const technical = /^(?:[a-f\d]{24,}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})(?:\.[a-z\d]+)?$/i.test(value)
    || /(?:_raw|_transcript)(?:\.[a-z\d]+)?$/i.test(value);
  return !value || technical ? ({ VIDEO: "视频资料", AUDIO: "音频资料", TEXT: "文字资料", IMAGE: "图片资料" }[sourceType] || "未命名资料") : value;
}

export function researchHistoryStatus(run?: { status: string; savedAt?: Date | string | null }) {
  if (!run) return "尚未开始";
  if (run.status === "COMPLETED") return run.savedAt ? "已完成 · 已保存" : "已完成 · 尚未保存";
  return ({ QUEUED: "已排队 · 尚未执行", RUNNING: "正在研究", FAILED: "失败 · 查看原因与重试", CANCELLED: "已取消", STOPPED: "已停止" }[run.status] || "状态待确认");
}
