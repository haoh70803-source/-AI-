export const sourcePlatformLabels: Record<string, string> = {
  GENERIC: "通用素材",
  DOUYIN: "抖音",
  XIAOHONGSHU: "小红书",
  WECHAT: "微信",
  BILIBILI: "哔哩哔哩",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  OTHER: "其他",
};

export const sourceTypeLabels: Record<string, string> = {
  TEXT: "文本",
  URL: "网页",
  VIDEO: "视频",
  AUDIO: "音频",
  IMAGE: "图片",
  DOCUMENT: "文档",
};

export const employeeSourceTypeLabels: Record<string, string> = {
  ...sourceTypeLabels,
  TEXT: "文字资料",
  URL: "链接",
  LINK: "链接",
};

export function employeeSourceMeta(sourceType: string, sourcePlatform: string) {
  const type = employeeSourceTypeLabels[sourceType] || "资料";
  const platform = sourcePlatform === "GENERIC" ? null : sourcePlatformLabels[sourcePlatform];
  return [type, platform].filter(Boolean).join(" · ");
}

export const sourceStatusLabels: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  READY: "已完成",
  FAILED: "失败",
  ARCHIVED: "已归档",
};

export const projectStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  RESEARCHING: "研究中",
  BRIEF_READY: "补充已准备",
  WRITING: "创作中",
  IN_REVIEW: "审核中",
  APPROVED: "已批准",
  SCHEDULED: "已排期",
  PUBLISHED: "已发布",
  FAILED: "失败",
  ARCHIVED: "已归档",
};

export const contentOriginLabels: Record<string, string> = {
  HUMAN: "人工创作",
  KIMI: "Kimi 辅助",
  GPT_WEB: "GPT 网页成稿",
};

export const variantStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  READY: "待提交",
  STALE: "口播稿已更新",
  IN_REVIEW: "待审核",
  APPROVED: "已批准",
  ARCHIVED: "已归档",
};

export const publishStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  SCHEDULED: "已排期",
  READY_TO_PUBLISH: "待发布",
  PUBLISHED: "已发布",
  FAILED: "失败",
  CANCELLED: "已取消",
};

export const methodStatusLabels: Record<string, string> = {
  SAVED: "已收藏",
  TRIAL: "试用中",
  CORE: "常用",
  DISABLED: "已停用",
};

export const evidenceTypeLabels: Record<string, string> = {
  FACT: "事实",
  VIEWPOINT: "观点",
  CASE: "案例",
  DATA: "数据",
  QUOTE: "引用",
  EXPERIENCE: "经历",
  QUESTION: "问题",
  OTHER: "其他",
};
