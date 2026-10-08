# V1 内部试用说明（ARCHIVED / SUPERSEDED）

> **ARCHIVED / SUPERSEDED：这是旧内部试用记录，不得作为当前 V1 统一 Workbench 的实施规范或验收依据。** 当前产品方向以最新 Owner 目标、最终实施计划、Pixel Visual Spec 和 `V1_PRODUCT_ACCEPTANCE.md` 为准。以下正文仅供历史追溯。

当前版本：`V1 Internal Trial`

版本标记：`v1.0.0-internal`

本版本用于真实用户内部试用，不代表生产环境正式发布。所有真实外部发布动作必须经过人工审核，并由用户手动完成。

## 当前完整业务链

```text
素材收录
→ 视频解析
→ 语音转写
→ 内容项目
→ Evidence / 创作简报
→ Kimi 深度创作包
→ GPT Web 高级创作
→ 导入核心母稿
→ 多平台内容
→ Quality Gate
→ 人工审核
→ 发布中心
→ 人工发布
```

## 当前外部服务

- RedFox：素材解析。
- Doubao ASR：语音转写。
- Workspace LLM / Kimi：内容研究和生成。
- GPT Web：人工高级创作，不使用 GPT API；内容由用户复制到 GPT Web，再将确认后的成稿导回系统。

未配置真实外部服务时，系统必须明确显示 `UNCONFIGURED` 或 `MOCK MODE`，不得将模拟结果标记为真实成功。

## 明确未开放

- 自动发布
- Platform OAuth
- GPT API
- CreatorMemory
- Trend Discovery
- Analytics

以上能力不属于 V1 内部试用范围。本版本不会无人值守地向真实平台账号发布内容。

## 试用反馈

每位试用用户使用一份 [V1 试用反馈模板](V1_TRIAL_FEEDBACK_TEMPLATE.md)。确认后的共性问题汇总到 [V1 试用问题清单](V1_TRIAL_ISSUES.md)。
