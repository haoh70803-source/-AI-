# AI 内容生产中心 — Codex 总控规则

## 项目目标

本项目是一个长期迭代、多人使用的 AI 内容生产中心，而不是简单的“AI 写作工具”。完整业务链路为：

> 素材发现 → 内容收录 → 视频/网页转写 → 个人素材库 → 选题 → 二创 → 母稿 → 多平台适配 → 人工审核 → 发布 → 数据复盘

从现在开始，所有参与本项目的 Codex 工作都必须严格遵守以下规则。

## 一、禁止一次性开发整个系统

- 必须按照阶段执行。
- 每次只处理用户当前明确指定的阶段。
- 不得因为看到 roadmap 就提前开发后续模块。
- 不得顺手重构无关代码。
- 不得为了“完整”一次新增几十个未验证模块。

## 二、按风险分层验证

每个阶段必须先检查当前代码、阅读相关实现、确认边界，只修改当前阶段涉及的文件。验证强度按变更风险分层，不要求每个小改动机械运行全量测试。

### 小视觉任务

- 打开目标页面并检查相关状态。
- 对涉及文件运行 relevant lint。
- 运行目标 workspace typecheck。
- 运行 `git diff --check` 并审阅实际 diff。

### 普通功能改动

- 运行与改动直接相关的 focused tests。
- 运行目标 workspace typecheck。
- 运行目标 workspace lint。

### 阶段集成

- 运行该阶段覆盖的 focused Vitest。
- 运行 build。
- 完成相关路由、状态和交互的 browser checks。

### Final QA

- full Vitest。
- full typecheck。
- lint。
- build。
- critical E2E。
- 1440 / 1680 / 1920 Desktop visual QA。
- 完整业务主链验收。

只有当前阶段要求的验证全部通过，且没有把未验证结果写成完成，才允许宣布该阶段完成。

阶段报告按实际变更包含：

- 完成了什么
- 修改了哪些文件
- 新增了哪些数据库表（如适用）
- 新增了哪些 API（如适用）
- 新增了哪些页面（如适用）
- 测试结果
- 当前未完成事项
- 下一阶段建议
- 是否存在技术债

未运行的测试必须明确写为“未运行”，不能用历史结果代替当前验证。

## 三、禁止假实现

禁止：

- 假按钮
- 假 API
- 假数据冒充真实数据
- UI 写着“已接入”但后台没有能力
- `catch` 后静默返回 `success`
- 将 `TODO` 包装成成功状态

没有配置真实外部 API 时，必须明确显示：

```text
UNCONFIGURED
```

或者：

```text
MOCK MODE
```

不得伪装成真实成功。

## 四、所有第三方能力必须 Adapter 化

任何外部能力不得直接散落在页面或 API 代码里，必须统一采用 Provider / Adapter 层，例如：

- `SourceProvider`
- `TranscriptionProvider`
- `LLMProvider`
- `PublishingProvider`
- `StorageProvider`

后续红狐、豆包、OpenAI-compatible、Postiz 等能力都必须通过 Adapter 接入。业务层不得知道第三方请求细节。

## 五、许可证边界

主项目不能直接复制 AGPL/GPL 项目的大量源代码。

以下项目主要作为架构和交互参考：

- Postiz
- TryPost
- Postmill
- Karakeep
- BrightBean
- TrendRadar

如果未来使用这些项目的实际服务，优先独立部署，并通过 REST API、MCP 或 Webhook 连接。

MIT 项目可以在保留许可证和版权声明的前提下选择性参考或复用。

任何外部代码引入都必须记录在 `docs/reference-map.md`，并包含以下字段：

- `repository`
- `source_file`
- `license`
- `usage`
- `copied / adapted / inspired`
- `modifications`

## 六、业务状态必须显式

以后所有内容都必须进入状态机，禁止用多个 boolean 拼接状态。

内容项目状态预留：

```text
DRAFT
RESEARCHING
BRIEF_READY
WRITING
IN_REVIEW
APPROVED
SCHEDULED
PUBLISHED
FAILED
ARCHIVED
```

发布任务状态预留：

```text
DRAFT
WAITING_APPROVAL
APPROVED
QUEUED
PUBLISHING
PUBLISHED
FAILED
CANCELLED
```

## 七、人工审核必须保留

任何真实外部发布动作都必须有人类确认。V1 不允许无人值守直接向真实账号发布。

AI 可以：

- 生成
- 改写
- 推荐
- 排期建议
- 准备发布包

但真正的外部发布必须经过 `APPROVED` 状态。

## 八、安全规则

API Key、Cookie、Token：

- 禁止放入 `localStorage`
- 禁止写入源码
- 禁止返回前端
- 禁止输出到日志
- 必须在服务端加密保存
- UI 只显示 masked 状态

## 九、代码原则

优先级如下：

- 清晰 > 炫技
- 稳定 > 抽象
- 可测试 > 快速堆代码
- 显式 > 魔法行为
- 小模块 > 巨型 Service

## 十、当前 V1 Workbench 施工规则

- 当前产品目标、最终实施计划和 Pixel Visual Spec 决定 Workbench 的产品结构与视觉；历史文档和旧设计只作追溯。
- `/dashboard` 是唯一 canonical Workbench。普通员工一级导航只有：开始创作、项目、研究、资产。
- 不得为了前端重构重做已有后端、数据库、Provider 或 Adapter；只新增当前阶段明确缺失的能力。
- 不得把 Model、Provider、Skill、Workflow、Node、AIRun、ApiUsage 等工程术语暴露给普通员工。
- 不得恢复旧 Dashboard、旧 Studio 三栏、假方法、假候选、假 Skill 装配或页面级多个 AI 助手。
- 普通员工只允许一个统一、上下文感知的 AI 协作层：当前 Workbench 的“鑫小助”。

当前 V1 Workbench 施工的 Skill 边界：

- `design-taste-frontend` 不得主导 Workbench。
- `ui-ux-pro-max`、`finesse-ui`、`animate`、`ponytail` 只能作为质量门。
- Skill 不得覆盖 Owner 产品目标、最终实施计划或 Pixel Visual Spec，不得据此新增功能、页面、依赖或视觉 token。
