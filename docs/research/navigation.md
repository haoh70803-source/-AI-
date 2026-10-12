# 研究导航与模块归类

本说明记录研究入口的当前组织方式，不修改 PRODUCT、ARCHITECTURE 或 LEGACY 的规则。

## 当前入口

**CURRENT IMPLEMENTATION**：应用侧栏“研究与洞察”提供开始研究、作品拆解、老师 / 对标、热点趋势、资讯日刊、研究记录六个直接入口。研究内部使用紧凑的横向分组导航；作品拆解保留其私人历史栏和完整报告画布。

| 工作阶段 | 功能 | 现有路由 |
| --- | --- | --- |
| 发现与收集 | 资讯日刊、热点趋势、已保存来源、对标新作 | `/research`、`/research/trends`、`/research/sources`、`/research/works` |
| 分析与理解 | 开始研究、作品拆解、老师 / 对标 | `/research/new`、`/research/teardown`、`/research/benchmarks` |
| 留存与应用 | 研究记录、报告阅读、既有导出和项目交接 | `/research/results` 及现有报告操作 |

分类仅用于组织现有能力。资讯日刊仍遵守当前服务端授权；研究报告不会因为出现在导航中而自动加入项目或改变私有范围。

## 维护入口

`apps/web/components/research/navigation.ts` 是应用侧栏与研究内部导航共用的名称、路径、分类和选中规则定义。新增入口时先更新此处；`sidebar` 标识是否直接显示在应用侧栏。研究子页面按路径段匹配，日刊只精确匹配 `/research`；研究会话和专项研究详情归入“开始研究”。

页面和导航位于 Web；任务权限与读取位于 `server/research`；后台编排位于 Worker；报告契约、计算与校验位于 Core；外部调用由现有 Provider / Integration 提供。当前归类不移动历史服务文件，不建立平行的研究 Runtime。

演示顺序：左侧作品拆解 → 输入链接 → 查看进度 → 阅读报告与证据 → 导出或主动加入项目 → 在项目中继续协作。真实采集、转写和模型请求沿用现有外调与费用边界。

## 定向验证

导航与侧栏回归：

```powershell
node node_modules/vitest/vitest.mjs run --config apps/web/vitest.research-navigation.config.ts --no-file-parallelism
```

测试使用模拟路由，不连接业务数据库。设置 `RESEARCH_NAVIGATION_PREVIEW=1` 可额外运行本地静态浏览器预览，检查1440、1024、390宽度并将截图保存到忽略目录 `output/research-navigation-preview`。静态截图用于核对导航布局，不代表登录后的完整业务链已验收。
