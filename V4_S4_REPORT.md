# S4 导航与工作区阶段报告

STATUS：本阶段代码 PASS；真实隔离 Web/浏览器及定向回归通过，非生产发布验收。

- 主导航 17 → 5：首页、项目、资料、研究、Skill；动态文件夹/置顶/最近和账户/设置/管理保留。
- 首页改用现有 WorkbenchStart/HomeComposer + FusionOverview；读取真实项目与摘要，移除首页默认演示运营面板；/short-video 旧运营仍可访问。
- 项目默认上下文 + Conversation + Artifact，同时可见；ArtifactWindow 增加嵌入宿主，使用同一个 useArtifactEditor 和 ArtifactEditor，保留保存、版本、锁定、导出、局部修改和 dirty 保护。
- Canvas/旧主稿/平台稿是高级视图；切换先通过既有 guardedArtifactNavigation；窄屏堆叠，可折叠上下文和成果。
- 资料中心保留原文/处理页，知识、事实、IP、飞书为二级入口。研究各模式继续复用 ResearchShell，资讯入口由原 requireNewsActor 服务端授权决定显示，不修改私人政策。
- 顶部去除重复文件导航和重复窗口菜单；保留全局搜索、编辑/视图/帮助、设置、折叠/全屏。项目标题与成果版本在工作区呈现。

## 成稿审核追加决定

/content-review 原本是 ContentTopic 选题审批，不是 ReviewRecord 成稿审核；现兼容跳转 /topics?view=review，主题页继续使用现有 ContentHub，审批及决定历史不变。主导航没有独立成稿审核入口。

/projects/[id]/review/[platform]、getPlatformReview 和审核动作 API 保留；项目二级页保留待审核平台稿。修复 /projects?review=pending 被默认文件夹入口提前返回的问题，实际沿用 PlatformVariant.IN_REVIEW 筛选。

通用项目可不经过选题审批。经过旧选题审批入口转换的项目继续遵守原评分、事实、审批要求。通用 Artifact 没有新正式审核操作；锁定和 AI CHECK 仍只是编辑保护/候选检查，不展示人工审核通过。

ReviewRecord / PlatformVariant / PublishTask / 历史数据保留。最小后续 Artifact 适配需明确目标 revision 和现有平台变体映射，复用 ReviewService；本轮未开发。

## 实际验证

LOCAL_TEST 数据库 content_center_agent_test_12；专用 Web http://localhost:3040；Mock、外部调用禁用。

43 项旧审核/选题治理/发布包/侧栏测试通过（output/v4-s4/navigation-review.json；该次导航 suite 导入失败不计通过）；修正仅本地 Vite8 JSX 测试配置后导航 13 PASS/预览1 SKIP（output/v4-s4/navigation-final.json）。

真实无头 Edge 1 个组合流程 PASS（output/v4-final/browser.json）：对话与嵌入成果可见、5主入口、键盘切换触发未保存对话框、取消保留正文、保存 PUT 200、数据库内容确认、重新打开、390px无横向溢出、真实首页最近项目、旧选题审批跳转。截图与实体证据 output/v4-s4/browser/。

首次浏览器失败发现旧浮动成果入口挡按钮，已改为默认布局行内入口。一次保存断言因首次API编译超过默认poll时间失败，改为等待真实HTTP响应再查库；没有跳过或强制点击掩盖问题。

Web 类型通过，最终 output/v4-final/typecheck-after-formatter.log。Next 本地编译采用 .next-local-test，已加入忽略；测试服务已关闭。Next 自动将原已修改 next-env.d.ts 的类型路径指向隔离输出，未猜测覆盖还原其既有修改，作为生成文件独立交付核对项。

## 尚未完成

默认页面仍通过现有 loadWorkbenchPageData 加载部分旧数据，尚未按高级视图全面延迟加载；未全量验收旧深链接、浏览器后退、真实模型及九类内容人工质量。主导航图标不替代服务端鉴权。
