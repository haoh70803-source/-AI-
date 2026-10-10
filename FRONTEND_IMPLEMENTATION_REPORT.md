# 前端复刻修正报告

日期：2026-10-10。用户最新调整为主攻桌面网页，停止后续手机操作与验收。目标：修正上一轮正式前端与已确认原型在导航、页面骨架、功能板块和主题上的偏差。现有 Next.js / React / TypeScript 技术栈与业务接口保持。

## 依据与边界

阅读 PRODUCT.md、ARCHITECTURE.md、LEGACY.md 与 Web 模块开发说明；产品仍以 Project、对话、资料和成果为核心。采用用户最新明确的复刻要求：以 4178 上保存的 Dual Experience 原型和所给深浅截图为视觉基准，恢复中性深色、品牌红点和克制浅色，不继续扩大蓝紫主题。

没有将无法访问的历史讨论视为已读材料。没有修改后端业务逻辑、API 协议、schema、权威文档或生产数据。已有混合工作保留；此次没有执行 Git 暂存、提交或推送。

## 已落地页面

| 页面 | 本轮修改 | 数据与实际行为 |
| --- | --- | --- |
| 公共骨架 | 64px 窄图标栏、72px 桌面顶部栏、五项主导航、品牌标题与双主题控件 | 主动展开项目侧栏、全局搜索、设置、账号操作仍可用；手机为底部导航和抽屉 |
| 首页 /home | Hero → 轻量快捷入口 → 四列最近项目 → 大幅品牌成果展示 | 创作输入由按钮展开，复用现有资料 / 模型 / Skill 控件；工作区统计与模板折叠保留 |
| AI 创作 /dashboard?project=… | 上下文、持续对话、成果连续三栏；手机堆叠；真实发送按钮遮挡修复 | 资料引用、生成、多轮修改、保存、重开、版本恢复、导出继续使用原业务链路 |
| 内容中心 /library | 横幅、成果 / 资料分组、统一搜索 / 展示工具、四列卡片 | getProjectListView + listArtifacts 使用现有 scope；成果卡片可打开真实 Artifact；高级来源控件折叠保留 |
| 研究 /research/new | 品牌研究 Hero → 280px 会话栏 → 问题和依据区域 | 真实研究会话、资料选择、研究输入与原研究工具入口；不伪造完成态 |
| 视频拆解 /research/teardown | 入口证据与报告双面板、共享主题材质 | 保留原文证据、拆解报告、导出、历史、播放器定位和带入项目 |
| 数据中台 /short-video | 184px 模块侧栏、四 KPI、全宽趋势、分段占比 / 账号横向排行 / 账号圆环 | 现有 /api/video-data 真实记录；来源、覆盖率、筛选、刷新和导出保持 |
| 分析视图 | 折线 / 热力 / 柱状；留存 / 多指标曲线 / 圆环模块结构 | 已有日度统计绘图；缺少小时、留存与设备采集的模块明确未接入 |

## 设计规范

扩展既有语义 Token，未引入平行 CSS 系统。Color 使用 background / surface / text / border / accent / data 系列；暗色 #111113、面板 #1b1b1e；浅色 #f5f5f7 与白色；红点与水平弧线继续来自已确认品牌 SVG。

| Token / 规则 | Dark Studio | Light Edition / 响应式 |
| --- | --- | --- |
| Typography | 共享 UI 字体、分级标题、等宽统计数字 | 相同字体体系；首页标题独立放大与居中 |
| --spacing-page | 36px | 48px；手机 18px |
| --grid-gap | 16px | 24px；手机 12px |
| Radius | 控件 8、卡片 12、大面板 16px | 共用比例；浅色自然阴影 |
| Hero | 左文右图，350px | 居中排版，580px；手机重排 |
| Motion | 使用现有过渡与 reduced-motion | 去掉鼠标自动撑宽导航；保留主动展开和状态反馈 |
| Grid / Breakpoints | 首页四列；创作三栏；数据独立网格 | 1100 / 900 / 760 / 700px 附近按各模块已有规则重排；已验证尺寸见测试报告 |

颜色、阴影、边框和全局间距集中复用现有全局主题；页面 CSS 负责具体构图。未为复刻静态示例而写入虚构业务记录。

## 主要文件

apps/web/components/app-shell.tsx、app-shell.css、sidebar-foundation.tsx；app/(app)/layout.tsx、globals.css；workbench-start.tsx、fusion-overview.tsx、home-reference.css；library/page.tsx 与 asset-library.css；research/new/page.tsx、research-shell.tsx、research.css；teardown-workspace.tsx / teardown.css；projects/studio-shell.tsx / artifact-window.css；video-analytics-workspace.tsx / .css；frontend-ui.spec.ts。

精确文件与当前哈希：output/frontend-replica/changed-files.json；相对上一版独立预览的可审阅补丁：replica-diff.patch。该补丁不代表清空工作区中的其他用户修改。

## 运行与证据

最终运行版本、启动命令与本轮测试结果记录在 FUNCTIONAL_TEST_REPORT.md。对照页 http://127.0.0.1:4181/ 提供七个桌面网页 × 双主题并排浏览，支持同步滚动，原始完整截图全部可打开。原静态原型 4178 与原正式服务未覆盖。

尚未复刻的能力或真实数据差异列于 KNOWN_ISSUES.md；本报告不宣称逐像素 1:1 或外部模型质量认证。
