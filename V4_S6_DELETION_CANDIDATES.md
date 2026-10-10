# S6 UI 候选复核（只读）

STATUS：13 个原候选已复核静态符号与字面路径引用；删除 0 文件。未将 API 零字面调用当作废弃。

扫描 apps/packages/services/scripts 的 TS/TSX/JS/MJS/JSON，包含 import、动态 import 字面量、测试及脚本中的符号/文件 stem。命中可能含注释或同名符号，逐条证据见 output/v4-s6/candidate-references.json。没有运行日志、外部调用方和非字面动态装配的消除证据，不能认定可删除。旧 Sidebar 有测试引用，保持兼容。

| 文件 | 非测试文本命中 | 测试文本命中 | 未决证据 | 处置 |
| --- | --- | --- | --- | --- |
| `apps/web/components/discovery/discovery-workspace.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/library/metadata-refresh-button.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/library/retry-ingest-button.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/library/source-asset-download-button.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/ai-creation-panel.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/deep-content-workspace.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/evidence-board.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/project-archive-button.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/project-cover-image.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/project-status-panel.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/projects/project-tree-extension.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/research/benchmark-tables.tsx` | 0 | 0 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |
| `apps/web/components/sidebar.tsx` | 9 | 41 | 未取得运行日志；动态装配/外部调用不能排除 | 保留；无删除授权 |

历史深链接属于各 page 路由，不因组件未挂载而删除；本轮 /content-review 兼容重定向已实测，平台稿审核 URL 保留。权限、Prisma、ReviewRecord、PlatformVariant、PublishTask、研究/成果历史均保留。原审计 1045 行仅是候选文件体积，不是已删重复代码量。实际删除仍必须另行人工批准。
