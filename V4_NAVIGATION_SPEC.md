# V4 导航规范（实际代码快照）

2026-10-10。5 个静态主入口，动态快捷访问不计为新增一级模块。

| 主入口 | 实际 URL | 二级能力与兼容边界 |
| --- | --- | --- |
| 首页 | /home | WorkbenchStart；需求、上传、模型、0–3 Skill；真实最近项目及必要摘要；/dashboard 空项目仍可开始 |
| 项目 | /projects | 个人文件夹/全部/置顶/最近；选题管理 /topics；选题审批 /topics?view=review；今日任务 /short-video/tasks；待审核平台稿 /projects?review=pending |
| 资料 | /library | 原始文件/文本/链接/处理状态；/library/feishu；/knowledge；/knowledge/facts；/ip-context，分别沿用权限和数据责任 |
| 研究 | /research/new | 开始、趋势、对标、作品拆解、研究历史、保存来源、对标新作；/research 资讯仅授权本人显示 |
| Skill | /library/methods | 列表、导入、版本、启停、专业方法；项目执行时选择版本；Provider/密钥继续设置 |

账户/设置/管理在独立账户区域；文件夹、置顶、最近为动态个人快捷区。顶部保留全局搜索、编辑/视图/帮助、折叠、全屏；文件链接和窗口重复菜单已移除。项目标题、引用范围、当前成果及版本就近呈现，不建立第二套业务主导航。

## 工作区

默认左上下文、中持续对话、右嵌入Artifact；可折叠两侧，手机竖向堆叠。项目资料引用明确 TURN/TASK/PROJECT。AI候选不会自动覆盖Artifact；保存及历史都沿用现有服务。高级视图进入旧Canvas/主稿/平台稿，切换先保护未保存内容。当前loader仍读部分旧数据，延迟加载不宣称完成。

## 审核

/content-review → /topics?view=review：选题审批兼容入口，非成稿审核中心。一般创作无需选题审批；旧选题转换继续遵守原有审批治理。

平台稿人工审核 /projects/[id]/review/[platform] 与 ReviewRecord/PublishTask 保留，入口位于项目/平台上下文。Artifact锁定与AI CHECK不是正式审批，未开发通用成稿审核。

## 验证

导航13项通过，真实浏览器流程1项通过：5主链接、旧审核URL、键盘dirty保护、实际保存200/重开、390px布局与首页。原17静态目的地口径减少12；旧路径与后台能力未删除。普通用户资讯隐藏仍有服务端权限拒绝。全量旧URL、所有设备/浏览器后退未覆盖，见测试报告。
