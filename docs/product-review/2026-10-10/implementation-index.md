# 鑫世界现有实现索引

快照日期：2026-10-10。覆盖当前工作树，含未提交改动。路由是按文件路径提取的候选，未验证可访问性；拦截路由、重定向和动态参数不能作为独立功能数量。控件索引是 JSX 源码位置，不代表可见按钮总数。API 方法来自静态导出匹配，转导出或动态绑定须人工复核。

页面文件 82 个，Route Handler 文件 196 个，控件源码位置 921 处，服务与适配器文件 337 个，Prisma model 89 个，enum 56 个，测试文件 303 个。均为资产计数，不是功能完成率。

完整源码引用、SHA256 和既有 Git 状态见 implementation-inventory.json。测试只登记文件，本次未执行。

## 页面与路由

| 路由候选 | 页面源码 | 备注 |
| --- | --- | --- |
| `/about` | [apps/web/app/(app)/@settings/(.)settings/about/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/about/page.tsx>) | 拦截页面 |
| `/account` | [apps/web/app/(app)/@settings/(.)settings/account/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/account/page.tsx>) | 拦截页面 |
| `/creator-profile` | [apps/web/app/(app)/@settings/(.)settings/creator-profile/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/creator-profile/page.tsx>) | 拦截页面 |
| `/diagnostics` | [apps/web/app/(app)/@settings/(.)settings/diagnostics/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/diagnostics/page.tsx>) | 拦截页面 |
| `/integrations` | [apps/web/app/(app)/@settings/(.)settings/integrations/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/integrations/page.tsx>) | 拦截页面 |
| `/members` | [apps/web/app/(app)/@settings/(.)settings/members/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/members/page.tsx>) | 拦截页面 |
| `/` | [apps/web/app/(app)/@settings/(.)settings/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/page.tsx>) | 拦截页面 |
| `/storage` | [apps/web/app/(app)/@settings/(.)settings/storage/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/storage/page.tsx>) | 拦截页面 |
| `/workspace` | [apps/web/app/(app)/@settings/(.)settings/workspace/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/(.)settings/workspace/page.tsx>) | 拦截页面 |
| `/[...catchAll]` | [apps/web/app/(app)/@settings/[...catchAll]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/@settings/[...catchAll]/page.tsx>) | 拦截页面 |
| `/admin` | [apps/web/app/(app)/admin/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/admin/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/admin/system` | [apps/web/app/(app)/admin/system/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/admin/system/page.tsx>) | 普通页面文件 |
| `/admin/usage` | [apps/web/app/(app)/admin/usage/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/admin/usage/page.tsx>) | 普通页面文件 |
| `/admin/users` | [apps/web/app/(app)/admin/users/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/admin/users/page.tsx>) | 普通页面文件 |
| `/calendar` | [apps/web/app/(app)/calendar/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/calendar/page.tsx>) | 普通页面文件 |
| `/calendar/tasks/[id]` | [apps/web/app/(app)/calendar/tasks/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/calendar/tasks/[id]/page.tsx>) | 普通页面文件 |
| `/content-review` | [apps/web/app/(app)/content-review/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/content-review/page.tsx>) | 普通页面文件 |
| `/dashboard` | [apps/web/app/(app)/dashboard/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/dashboard/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/discovery/benchmarks/[id]` | [apps/web/app/(app)/discovery/benchmarks/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/benchmarks/[id]/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/discovery/ideas/[id]` | [apps/web/app/(app)/discovery/ideas/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/ideas/[id]/page.tsx>) | 普通页面文件 |
| `/discovery/ideas` | [apps/web/app/(app)/discovery/ideas/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/ideas/page.tsx>) | 普通页面文件 |
| `/discovery` | [apps/web/app/(app)/discovery/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/discovery/recommendations/[id]` | [apps/web/app/(app)/discovery/recommendations/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/recommendations/[id]/page.tsx>) | 普通页面文件 |
| `/discovery/trends/[key]` | [apps/web/app/(app)/discovery/trends/[key]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/trends/[key]/page.tsx>) | 普通页面文件 |
| `/discovery/trends` | [apps/web/app/(app)/discovery/trends/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/discovery/trends/page.tsx>) | 普通页面文件 |
| `/home` | [apps/web/app/(app)/home/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/home/page.tsx>) | 普通页面文件 |
| `/ip-context` | [apps/web/app/(app)/ip-context/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/ip-context/page.tsx>) | 普通页面文件 |
| `/knowledge/facts` | [apps/web/app/(app)/knowledge/facts/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/knowledge/facts/page.tsx>) | 普通页面文件 |
| `/knowledge` | [apps/web/app/(app)/knowledge/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/knowledge/page.tsx>) | 普通页面文件 |
| `/library/[id]` | [apps/web/app/(app)/library/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/library/[id]/page.tsx>) | 普通页面文件 |
| `/library/feishu` | [apps/web/app/(app)/library/feishu/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/library/feishu/page.tsx>) | 普通页面文件 |
| `/library/methods/[id]` | [apps/web/app/(app)/library/methods/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/library/methods/[id]/page.tsx>) | 普通页面文件 |
| `/library/methods` | [apps/web/app/(app)/library/methods/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/library/methods/page.tsx>) | 普通页面文件 |
| `/library` | [apps/web/app/(app)/library/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/library/page.tsx>) | 普通页面文件 |
| `/projects/[id]` | [apps/web/app/(app)/projects/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/projects/[id]/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/projects/[id]/review/[platform]` | [apps/web/app/(app)/projects/[id]/review/[platform]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/projects/[id]/review/[platform]/page.tsx>) | 普通页面文件 |
| `/projects/[id]/studio` | [apps/web/app/(app)/projects/[id]/studio/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/projects/[id]/studio/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/projects/methods` | [apps/web/app/(app)/projects/methods/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/projects/methods/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/projects/new` | [apps/web/app/(app)/projects/new/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/projects/new/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/projects` | [apps/web/app/(app)/projects/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/projects/page.tsx>) | 普通页面文件 |
| `/research/benchmarks/[id]` | [apps/web/app/(app)/research/benchmarks/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/benchmarks/[id]/page.tsx>) | 普通页面文件 |
| `/research/benchmarks/[id]/works/[workId]` | [apps/web/app/(app)/research/benchmarks/[id]/works/[workId]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/benchmarks/[id]/works/[workId]/page.tsx>) | 普通页面文件 |
| `/research/benchmarks` | [apps/web/app/(app)/research/benchmarks/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/benchmarks/page.tsx>) | 普通页面文件 |
| `/research/focus/[runId]` | [apps/web/app/(app)/research/focus/[runId]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/focus/[runId]/page.tsx>) | 普通页面文件 |
| `/research/focus` | [apps/web/app/(app)/research/focus/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/focus/page.tsx>) | 普通页面文件 |
| `/research/new` | [apps/web/app/(app)/research/new/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/new/page.tsx>) | 普通页面文件 |
| `/research` | [apps/web/app/(app)/research/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/research/results/[kind]/[id]` | [apps/web/app/(app)/research/results/[kind]/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/results/[kind]/[id]/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/research/results` | [apps/web/app/(app)/research/results/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/results/page.tsx>) | 普通页面文件 |
| `/research/session/[id]` | [apps/web/app/(app)/research/session/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/session/[id]/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/research/sources/[id]` | [apps/web/app/(app)/research/sources/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/sources/[id]/page.tsx>) | 普通页面文件 |
| `/research/sources` | [apps/web/app/(app)/research/sources/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/sources/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/research/teardown` | [apps/web/app/(app)/research/teardown/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/teardown/page.tsx>) | 普通页面文件 |
| `/research/trends/[stableKey]` | [apps/web/app/(app)/research/trends/[stableKey]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/trends/[stableKey]/page.tsx>) | 普通页面文件 |
| `/research/trends` | [apps/web/app/(app)/research/trends/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/trends/page.tsx>) | 普通页面文件 |
| `/research/works` | [apps/web/app/(app)/research/works/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/research/works/page.tsx>) | 普通页面文件 |
| `/settings/about` | [apps/web/app/(app)/settings/about/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/about/page.tsx>) | 普通页面文件 |
| `/settings/account` | [apps/web/app/(app)/settings/account/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/account/page.tsx>) | 普通页面文件 |
| `/settings/creator-profile` | [apps/web/app/(app)/settings/creator-profile/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/creator-profile/page.tsx>) | 普通页面文件 |
| `/settings/diagnostics` | [apps/web/app/(app)/settings/diagnostics/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/diagnostics/page.tsx>) | 普通页面文件 |
| `/settings/integrations` | [apps/web/app/(app)/settings/integrations/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/integrations/page.tsx>) | 普通页面文件 |
| `/settings/members` | [apps/web/app/(app)/settings/members/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/members/page.tsx>) | 普通页面文件 |
| `/settings` | [apps/web/app/(app)/settings/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/page.tsx>) | 普通页面文件 |
| `/settings/storage` | [apps/web/app/(app)/settings/storage/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/storage/page.tsx>) | 普通页面文件 |
| `/settings/workspace` | [apps/web/app/(app)/settings/workspace/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/settings/workspace/page.tsx>) | 普通页面文件 |
| `/short-video` | [apps/web/app/(app)/short-video/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/short-video/page.tsx>) | 普通页面文件 |
| `/short-video/tasks/[id]` | [apps/web/app/(app)/short-video/tasks/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/short-video/tasks/[id]/page.tsx>) | 普通页面文件 |
| `/short-video/tasks` | [apps/web/app/(app)/short-video/tasks/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/short-video/tasks/page.tsx>) | 普通页面文件 |
| `/topics` | [apps/web/app/(app)/topics/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/topics/page.tsx>) | 普通页面文件 |
| `/account/invite` | [apps/web/app/(auth)/account/invite/page.tsx](<E:/AI工作台1.2/apps/web/app/(auth)/account/invite/page.tsx>) | 普通页面文件 |
| `/account/recovery` | [apps/web/app/(auth)/account/recovery/page.tsx](<E:/AI工作台1.2/apps/web/app/(auth)/account/recovery/page.tsx>) | 普通页面文件 |
| `/account/reset` | [apps/web/app/(auth)/account/reset/page.tsx](<E:/AI工作台1.2/apps/web/app/(auth)/account/reset/page.tsx>) | 普通页面文件 |
| `/account/verify` | [apps/web/app/(auth)/account/verify/page.tsx](<E:/AI工作台1.2/apps/web/app/(auth)/account/verify/page.tsx>) | 普通页面文件 |
| `/login` | [apps/web/app/(auth)/login/page.tsx](<E:/AI工作台1.2/apps/web/app/(auth)/login/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/register` | [apps/web/app/(auth)/register/page.tsx](<E:/AI工作台1.2/apps/web/app/(auth)/register/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/__runtime` | [apps/web/app/__runtime/page.tsx](<E:/AI工作台1.2/apps/web/app/__runtime/page.tsx>) | 普通页面文件 |
| `/experience` | [apps/web/app/experience/page.tsx](<E:/AI工作台1.2/apps/web/app/experience/page.tsx>) | 普通页面文件 |
| `/onboarding` | [apps/web/app/onboarding/page.tsx](<E:/AI工作台1.2/apps/web/app/onboarding/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/` | [apps/web/app/page.tsx](<E:/AI工作台1.2/apps/web/app/page.tsx>) | 普通页面文件；含重定向，请查看源码 |
| `/platform/accounts` | [apps/web/app/platform/accounts/page.tsx](<E:/AI工作台1.2/apps/web/app/platform/accounts/page.tsx>) | 普通页面文件 |
| `/platform/spaces` | [apps/web/app/platform/spaces/page.tsx](<E:/AI工作台1.2/apps/web/app/platform/spaces/page.tsx>) | 普通页面文件 |
| `/workspace-unavailable` | [apps/web/app/workspace-unavailable/page.tsx](<E:/AI工作台1.2/apps/web/app/workspace-unavailable/page.tsx>) | 普通页面文件 |

## API

| 路由候选 | 导出方法 | 源码 |
| --- | --- | --- |
| `/api/account/invitation` | POST | [apps/web/app/api/account/invitation/route.ts](<E:/AI工作台1.2/apps/web/app/api/account/invitation/route.ts>) |
| `/api/account/recovery` | PATCH, POST | [apps/web/app/api/account/recovery/route.ts](<E:/AI工作台1.2/apps/web/app/api/account/recovery/route.ts>) |
| `/api/account/verification` | PATCH, POST | [apps/web/app/api/account/verification/route.ts](<E:/AI工作台1.2/apps/web/app/api/account/verification/route.ts>) |
| `/api/admin/system/providers/[provider]` | GET, PUT | [apps/web/app/api/admin/system/providers/[provider]/route.ts](<E:/AI工作台1.2/apps/web/app/api/admin/system/providers/[provider]/route.ts>) |
| `/api/admin/system` | GET | [apps/web/app/api/admin/system/route.ts](<E:/AI工作台1.2/apps/web/app/api/admin/system/route.ts>) |
| `/api/admin/usage` | GET | [apps/web/app/api/admin/usage/route.ts](<E:/AI工作台1.2/apps/web/app/api/admin/usage/route.ts>) |
| `/api/admin/users/[id]` | PATCH | [apps/web/app/api/admin/users/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/admin/users/[id]/route.ts>) |
| `/api/admin/users` | GET, POST | [apps/web/app/api/admin/users/route.ts](<E:/AI工作台1.2/apps/web/app/api/admin/users/route.ts>) |
| `/api/admin/workspaces` | GET, POST | [apps/web/app/api/admin/workspaces/route.ts](<E:/AI工作台1.2/apps/web/app/api/admin/workspaces/route.ts>) |
| `/api/auth/[...all]` | GET, POST | [apps/web/app/api/auth/[...all]/route.ts](<E:/AI工作台1.2/apps/web/app/api/auth/[...all]/route.ts>) |
| `/api/benchmark-topics/[runId]/select` | POST | [apps/web/app/api/benchmark-topics/[runId]/select/route.ts](<E:/AI工作台1.2/apps/web/app/api/benchmark-topics/[runId]/select/route.ts>) |
| `/api/benchmark-topics` | POST | [apps/web/app/api/benchmark-topics/route.ts](<E:/AI工作台1.2/apps/web/app/api/benchmark-topics/route.ts>) |
| `/api/collections` | GET, POST | [apps/web/app/api/collections/route.ts](<E:/AI工作台1.2/apps/web/app/api/collections/route.ts>) |
| `/api/content-hub` | GET, POST | [apps/web/app/api/content-hub/route.ts](<E:/AI工作台1.2/apps/web/app/api/content-hub/route.ts>) |
| `/api/creation/models` | GET | [apps/web/app/api/creation/models/route.ts](<E:/AI工作台1.2/apps/web/app/api/creation/models/route.ts>) |
| `/api/creation/sources` | POST | [apps/web/app/api/creation/sources/route.ts](<E:/AI工作台1.2/apps/web/app/api/creation/sources/route.ts>) |
| `/api/creator-profile` | GET, PUT | [apps/web/app/api/creator-profile/route.ts](<E:/AI工作台1.2/apps/web/app/api/creator-profile/route.ts>) |
| `/api/creator-profile/suggestions/[suggestionId]` | PATCH | [apps/web/app/api/creator-profile/suggestions/[suggestionId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/creator-profile/suggestions/[suggestionId]/route.ts>) |
| `/api/creator-profile/suggestions` | GET, POST | [apps/web/app/api/creator-profile/suggestions/route.ts](<E:/AI工作台1.2/apps/web/app/api/creator-profile/suggestions/route.ts>) |
| `/api/dev/runtime-health` | GET | [apps/web/app/api/dev/runtime-health/route.ts](<E:/AI工作台1.2/apps/web/app/api/dev/runtime-health/route.ts>) |
| `/api/discovery/benchmarks/[id]/collection-runs/[runId]` | GET | [apps/web/app/api/discovery/benchmarks/[id]/collection-runs/[runId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/collection-runs/[runId]/route.ts>) |
| `/api/discovery/benchmarks/[id]/collection-runs` | GET, POST | [apps/web/app/api/discovery/benchmarks/[id]/collection-runs/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/collection-runs/route.ts>) |
| `/api/discovery/benchmarks/[id]/comments/analyze` | POST | [apps/web/app/api/discovery/benchmarks/[id]/comments/analyze/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/comments/analyze/route.ts>) |
| `/api/discovery/benchmarks/[id]/comments/collect` | POST | [apps/web/app/api/discovery/benchmarks/[id]/comments/collect/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/comments/collect/route.ts>) |
| `/api/discovery/benchmarks/[id]/inputs` | GET, POST | [apps/web/app/api/discovery/benchmarks/[id]/inputs/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/inputs/route.ts>) |
| `/api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]` | PATCH | [apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]/route.ts>) |
| `/api/discovery/benchmarks/[id]/method-suggestions` | GET, POST | [apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/route.ts>) |
| `/api/discovery/benchmarks/[id]/organization` | PATCH | [apps/web/app/api/discovery/benchmarks/[id]/organization/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/organization/route.ts>) |
| `/api/discovery/benchmarks/[id]/report` | GET | [apps/web/app/api/discovery/benchmarks/[id]/report/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/report/route.ts>) |
| `/api/discovery/benchmarks/[id]` | DELETE, GET | [apps/web/app/api/discovery/benchmarks/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/route.ts>) |
| `/api/discovery/benchmarks/[id]/studies` | GET, POST | [apps/web/app/api/discovery/benchmarks/[id]/studies/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/[id]/studies/route.ts>) |
| `/api/discovery/benchmarks` | GET, POST | [apps/web/app/api/discovery/benchmarks/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/benchmarks/route.ts>) |
| `/api/discovery/collect` | POST | [apps/web/app/api/discovery/collect/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/collect/route.ts>) |
| `/api/discovery/ideas/[id]/references` | POST | [apps/web/app/api/discovery/ideas/[id]/references/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/ideas/[id]/references/route.ts>) |
| `/api/discovery/ideas/[id]` | GET, PATCH | [apps/web/app/api/discovery/ideas/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/ideas/[id]/route.ts>) |
| `/api/discovery/ideas/[id]/start` | POST | [apps/web/app/api/discovery/ideas/[id]/start/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/ideas/[id]/start/route.ts>) |
| `/api/discovery/ideas` | GET, POST | [apps/web/app/api/discovery/ideas/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/ideas/route.ts>) |
| `/api/discovery/projects` | POST | [apps/web/app/api/discovery/projects/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/projects/route.ts>) |
| `/api/discovery/recommendations/[id]` | GET, POST | [apps/web/app/api/discovery/recommendations/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/recommendations/[id]/route.ts>) |
| `/api/discovery/recommendations` | GET, POST | [apps/web/app/api/discovery/recommendations/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/recommendations/route.ts>) |
| `/api/discovery/search` | POST | [apps/web/app/api/discovery/search/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/search/route.ts>) |
| `/api/discovery/trends/[key]/ideas` | POST | [apps/web/app/api/discovery/trends/[key]/ideas/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/trends/[key]/ideas/route.ts>) |
| `/api/discovery/trends/[key]/related` | POST | [apps/web/app/api/discovery/trends/[key]/related/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/trends/[key]/related/route.ts>) |
| `/api/discovery/trends/[key]/topics` | POST | [apps/web/app/api/discovery/trends/[key]/topics/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/trends/[key]/topics/route.ts>) |
| `/api/discovery/trends` | GET, POST | [apps/web/app/api/discovery/trends/route.ts](<E:/AI工作台1.2/apps/web/app/api/discovery/trends/route.ts>) |
| `/api/experience/start` | POST | [apps/web/app/api/experience/start/route.ts](<E:/AI工作台1.2/apps/web/app/api/experience/start/route.ts>) |
| `/api/feishu/browse` | POST | [apps/web/app/api/feishu/browse/route.ts](<E:/AI工作台1.2/apps/web/app/api/feishu/browse/route.ts>) |
| `/api/feishu` | GET, POST | [apps/web/app/api/feishu/route.ts](<E:/AI工作台1.2/apps/web/app/api/feishu/route.ts>) |
| `/api/health/live` | GET, HEAD | [apps/web/app/api/health/live/route.ts](<E:/AI工作台1.2/apps/web/app/api/health/live/route.ts>) |
| `/api/health/ready` | GET, HEAD | [apps/web/app/api/health/ready/route.ts](<E:/AI工作台1.2/apps/web/app/api/health/ready/route.ts>) |
| `/api/ingest-jobs/[id]/cancel` | POST | [apps/web/app/api/ingest-jobs/[id]/cancel/route.ts](<E:/AI工作台1.2/apps/web/app/api/ingest-jobs/[id]/cancel/route.ts>) |
| `/api/ingest-jobs/[id]/retry` | POST | [apps/web/app/api/ingest-jobs/[id]/retry/route.ts](<E:/AI工作台1.2/apps/web/app/api/ingest-jobs/[id]/retry/route.ts>) |
| `/api/ingest-jobs/[id]` | GET | [apps/web/app/api/ingest-jobs/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/ingest-jobs/[id]/route.ts>) |
| `/api/integrations/[provider]/disable` | POST | [apps/web/app/api/integrations/[provider]/disable/route.ts](<E:/AI工作台1.2/apps/web/app/api/integrations/[provider]/disable/route.ts>) |
| `/api/integrations/[provider]/enable` | POST | [apps/web/app/api/integrations/[provider]/enable/route.ts](<E:/AI工作台1.2/apps/web/app/api/integrations/[provider]/enable/route.ts>) |
| `/api/integrations/[provider]` | DELETE, GET, PUT | [apps/web/app/api/integrations/[provider]/route.ts](<E:/AI工作台1.2/apps/web/app/api/integrations/[provider]/route.ts>) |
| `/api/integrations/[provider]/test` | POST | [apps/web/app/api/integrations/[provider]/test/route.ts](<E:/AI工作台1.2/apps/web/app/api/integrations/[provider]/test/route.ts>) |
| `/api/integrations/LLM/models` | GET | [apps/web/app/api/integrations/LLM/models/route.ts](<E:/AI工作台1.2/apps/web/app/api/integrations/LLM/models/route.ts>) |
| `/api/integrations` | GET | [apps/web/app/api/integrations/route.ts](<E:/AI工作台1.2/apps/web/app/api/integrations/route.ts>) |
| `/api/internal/media-storage/[assetId]` | DELETE, GET, PUT | [apps/web/app/api/internal/media-storage/[assetId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/internal/media-storage/[assetId]/route.ts>) |
| `/api/internal-signup` | POST | [apps/web/app/api/internal-signup/route.ts](<E:/AI工作台1.2/apps/web/app/api/internal-signup/route.ts>) |
| `/api/local-asr/models/initialize` | POST | [apps/web/app/api/local-asr/models/initialize/route.ts](<E:/AI工作台1.2/apps/web/app/api/local-asr/models/initialize/route.ts>) |
| `/api/local-asr/status` | GET | [apps/web/app/api/local-asr/status/route.ts](<E:/AI工作台1.2/apps/web/app/api/local-asr/status/route.ts>) |
| `/api/media/[token]` | GET | [apps/web/app/api/media/[token]/route.ts](<E:/AI工作台1.2/apps/web/app/api/media/[token]/route.ts>) |
| `/api/methods/[id]` | DELETE, GET, PATCH, PUT | [apps/web/app/api/methods/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/methods/[id]/route.ts>) |
| `/api/methods/default` | GET, PATCH, POST, PUT | [apps/web/app/api/methods/default/route.ts](<E:/AI工作台1.2/apps/web/app/api/methods/default/route.ts>) |
| `/api/methods/import` | POST | [apps/web/app/api/methods/import/route.ts](<E:/AI工作台1.2/apps/web/app/api/methods/import/route.ts>) |
| `/api/methods` | GET, POST | [apps/web/app/api/methods/route.ts](<E:/AI工作台1.2/apps/web/app/api/methods/route.ts>) |
| `/api/projects/[id]/ai/run` | POST | [apps/web/app/api/projects/[id]/ai/run/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/ai/run/route.ts>) |
| `/api/projects/[id]/ai/runs/[runId]/apply` | POST | [apps/web/app/api/projects/[id]/ai/runs/[runId]/apply/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/ai/runs/[runId]/apply/route.ts>) |
| `/api/projects/[id]/ai/runs/[runId]/discard` | POST | [apps/web/app/api/projects/[id]/ai/runs/[runId]/discard/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/ai/runs/[runId]/discard/route.ts>) |
| `/api/projects/[id]/artifacts/[artifactId]/history` | GET, POST | [apps/web/app/api/projects/[id]/artifacts/[artifactId]/history/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/artifacts/[artifactId]/history/route.ts>) |
| `/api/projects/[id]/artifacts/[artifactId]/revisions` | POST | [apps/web/app/api/projects/[id]/artifacts/[artifactId]/revisions/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/artifacts/[artifactId]/revisions/route.ts>) |
| `/api/projects/[id]/artifacts/[artifactId]` | GET, PATCH, PUT | [apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts>) |
| `/api/projects/[id]/artifacts` | GET, POST | [apps/web/app/api/projects/[id]/artifacts/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/artifacts/route.ts>) |
| `/api/projects/[id]/assistant/messages/[messageId]/save` | POST | [apps/web/app/api/projects/[id]/assistant/messages/[messageId]/save/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/assistant/messages/[messageId]/save/route.ts>) |
| `/api/projects/[id]/assistant/models` | GET | [apps/web/app/api/projects/[id]/assistant/models/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/assistant/models/route.ts>) |
| `/api/projects/[id]/assistant/references` | GET | [apps/web/app/api/projects/[id]/assistant/references/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/assistant/references/route.ts>) |
| `/api/projects/[id]/assistant` | GET, PATCH, POST | [apps/web/app/api/projects/[id]/assistant/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/assistant/route.ts>) |
| `/api/projects/[id]/brief` | PUT | [apps/web/app/api/projects/[id]/brief/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/brief/route.ts>) |
| `/api/projects/[id]/canvas/objects/[objectId]/assistant` | GET, POST | [apps/web/app/api/projects/[id]/canvas/objects/[objectId]/assistant/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/canvas/objects/[objectId]/assistant/route.ts>) |
| `/api/projects/[id]/canvas/objects/[objectId]/restore` | POST | [apps/web/app/api/projects/[id]/canvas/objects/[objectId]/restore/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/canvas/objects/[objectId]/restore/route.ts>) |
| `/api/projects/[id]/canvas/objects/[objectId]` | DELETE, PATCH | [apps/web/app/api/projects/[id]/canvas/objects/[objectId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/canvas/objects/[objectId]/route.ts>) |
| `/api/projects/[id]/canvas/objects` | GET, POST | [apps/web/app/api/projects/[id]/canvas/objects/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/canvas/objects/route.ts>) |
| `/api/projects/[id]/creative-basis` | POST | [apps/web/app/api/projects/[id]/creative-basis/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/creative-basis/route.ts>) |
| `/api/projects/[id]/deep-content-package/apply` | POST | [apps/web/app/api/projects/[id]/deep-content-package/apply/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/deep-content-package/apply/route.ts>) |
| `/api/projects/[id]/deep-content-package/generate` | POST | [apps/web/app/api/projects/[id]/deep-content-package/generate/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/deep-content-package/generate/route.ts>) |
| `/api/projects/[id]/deep-content-package` | GET, PUT | [apps/web/app/api/projects/[id]/deep-content-package/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/deep-content-package/route.ts>) |
| `/api/projects/[id]/drafts/[draftId]/checkpoint` | POST | [apps/web/app/api/projects/[id]/drafts/[draftId]/checkpoint/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/drafts/[draftId]/checkpoint/route.ts>) |
| `/api/projects/[id]/drafts/[draftId]/confirm` | POST | [apps/web/app/api/projects/[id]/drafts/[draftId]/confirm/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/drafts/[draftId]/confirm/route.ts>) |
| `/api/projects/[id]/drafts/[draftId]/history` | GET | [apps/web/app/api/projects/[id]/drafts/[draftId]/history/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/drafts/[draftId]/history/route.ts>) |
| `/api/projects/[id]/drafts/[draftId]/primary` | POST | [apps/web/app/api/projects/[id]/drafts/[draftId]/primary/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/drafts/[draftId]/primary/route.ts>) |
| `/api/projects/[id]/drafts/[draftId]` | DELETE, GET, PATCH, PUT | [apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts>) |
| `/api/projects/[id]/drafts` | GET, POST | [apps/web/app/api/projects/[id]/drafts/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/drafts/route.ts>) |
| `/api/projects/[id]/evidence/[evidenceId]` | DELETE, PATCH | [apps/web/app/api/projects/[id]/evidence/[evidenceId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/evidence/[evidenceId]/route.ts>) |
| `/api/projects/[id]/evidence` | POST | [apps/web/app/api/projects/[id]/evidence/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/evidence/route.ts>) |
| `/api/projects/[id]/feedback` | GET, PUT | [apps/web/app/api/projects/[id]/feedback/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/feedback/route.ts>) |
| `/api/projects/[id]/gpt-task-package/copied` | POST | [apps/web/app/api/projects/[id]/gpt-task-package/copied/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/gpt-task-package/copied/route.ts>) |
| `/api/projects/[id]/gpt-task-package` | GET | [apps/web/app/api/projects/[id]/gpt-task-package/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/gpt-task-package/route.ts>) |
| `/api/projects/[id]/import-gpt-draft` | POST | [apps/web/app/api/projects/[id]/import-gpt-draft/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/import-gpt-draft/route.ts>) |
| `/api/projects/[id]/methods` | GET, PUT | [apps/web/app/api/projects/[id]/methods/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/methods/route.ts>) |
| `/api/projects/[id]/mother-content/confirm` | POST | [apps/web/app/api/projects/[id]/mother-content/confirm/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/mother-content/confirm/route.ts>) |
| `/api/projects/[id]/mother-content/confirmation` | PUT | [apps/web/app/api/projects/[id]/mother-content/confirmation/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/mother-content/confirmation/route.ts>) |
| `/api/projects/[id]/mother-content` | GET, PUT | [apps/web/app/api/projects/[id]/mother-content/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/mother-content/route.ts>) |
| `/api/projects/[id]/mother-content/warnings` | POST | [apps/web/app/api/projects/[id]/mother-content/warnings/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/mother-content/warnings/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/apply` | POST | [apps/web/app/api/projects/[id]/platform-variants/[platform]/apply/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/apply/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/review/ai` | POST | [apps/web/app/api/projects/[id]/platform-variants/[platform]/review/ai/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/review/ai/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/review/approve` | POST | [apps/web/app/api/projects/[id]/platform-variants/[platform]/review/approve/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/review/approve/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/review/reject` | POST | [apps/web/app/api/projects/[id]/platform-variants/[platform]/review/reject/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/review/reject/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/review/request-changes` | POST | [apps/web/app/api/projects/[id]/platform-variants/[platform]/review/request-changes/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/review/request-changes/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/review/submit` | POST | [apps/web/app/api/projects/[id]/platform-variants/[platform]/review/submit/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/review/submit/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]/reviews` | GET | [apps/web/app/api/projects/[id]/platform-variants/[platform]/reviews/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/reviews/route.ts>) |
| `/api/projects/[id]/platform-variants/[platform]` | GET, PUT | [apps/web/app/api/projects/[id]/platform-variants/[platform]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/[platform]/route.ts>) |
| `/api/projects/[id]/platform-variants/generate` | POST | [apps/web/app/api/projects/[id]/platform-variants/generate/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/generate/route.ts>) |
| `/api/projects/[id]/platform-variants` | GET | [apps/web/app/api/projects/[id]/platform-variants/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/platform-variants/route.ts>) |
| `/api/projects/[id]/restore` | POST | [apps/web/app/api/projects/[id]/restore/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/restore/route.ts>) |
| `/api/projects/[id]` | DELETE, GET, PATCH | [apps/web/app/api/projects/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/route.ts>) |
| `/api/projects/[id]/sources/[sourceId]` | DELETE | [apps/web/app/api/projects/[id]/sources/[sourceId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/sources/[sourceId]/route.ts>) |
| `/api/projects/[id]/sources` | POST | [apps/web/app/api/projects/[id]/sources/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/sources/route.ts>) |
| `/api/projects/[id]/transition` | POST | [apps/web/app/api/projects/[id]/transition/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/[id]/transition/route.ts>) |
| `/api/projects` | GET, POST | [apps/web/app/api/projects/route.ts](<E:/AI工作台1.2/apps/web/app/api/projects/route.ts>) |
| `/api/publish-tasks/[id]/cancel` | POST | [apps/web/app/api/publish-tasks/[id]/cancel/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/cancel/route.ts>) |
| `/api/publish-tasks/[id]/failed` | POST | [apps/web/app/api/publish-tasks/[id]/failed/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/failed/route.ts>) |
| `/api/publish-tasks/[id]/package/copied` | POST | [apps/web/app/api/publish-tasks/[id]/package/copied/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/package/copied/route.ts>) |
| `/api/publish-tasks/[id]/package` | GET | [apps/web/app/api/publish-tasks/[id]/package/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/package/route.ts>) |
| `/api/publish-tasks/[id]/published` | POST | [apps/web/app/api/publish-tasks/[id]/published/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/published/route.ts>) |
| `/api/publish-tasks/[id]` | GET, PATCH | [apps/web/app/api/publish-tasks/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/route.ts>) |
| `/api/publish-tasks/[id]/schedule` | POST | [apps/web/app/api/publish-tasks/[id]/schedule/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/[id]/schedule/route.ts>) |
| `/api/publish-tasks` | GET, POST | [apps/web/app/api/publish-tasks/route.ts](<E:/AI工作台1.2/apps/web/app/api/publish-tasks/route.ts>) |
| `/api/research/benchmarks/[id]/research` | POST | [apps/web/app/api/research/benchmarks/[id]/research/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/research/route.ts>) |
| `/api/research/benchmarks/[id]/research-v2` | POST | [apps/web/app/api/research/benchmarks/[id]/research-v2/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/research-v2/route.ts>) |
| `/api/research/benchmarks/[id]/sync` | POST | [apps/web/app/api/research/benchmarks/[id]/sync/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/sync/route.ts>) |
| `/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export` | GET | [apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export/route.ts>) |
| `/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation` | POST | [apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation/route.ts>) |
| `/api/research/benchmarks/[id]/works/[workId]/analysis` | POST | [apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/route.ts>) |
| `/api/research/benchmarks/[id]/works/[workId]/collect` | POST | [apps/web/app/api/research/benchmarks/[id]/works/[workId]/collect/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/works/[workId]/collect/route.ts>) |
| `/api/research/benchmarks/[id]/works/[workId]/media` | GET | [apps/web/app/api/research/benchmarks/[id]/works/[workId]/media/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/works/[workId]/media/route.ts>) |
| `/api/research/benchmarks/[id]/works/[workId]` | GET | [apps/web/app/api/research/benchmarks/[id]/works/[workId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/[id]/works/[workId]/route.ts>) |
| `/api/research/benchmarks/import` | POST | [apps/web/app/api/research/benchmarks/import/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/benchmarks/import/route.ts>) |
| `/api/research/creation` | GET, POST | [apps/web/app/api/research/creation/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/creation/route.ts>) |
| `/api/research/focus-v2` | POST | [apps/web/app/api/research/focus-v2/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/focus-v2/route.ts>) |
| `/api/research/materials` | GET | [apps/web/app/api/research/materials/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/materials/route.ts>) |
| `/api/research/news` | GET, POST | [apps/web/app/api/research/news/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/news/route.ts>) |
| `/api/research/preferences` | POST | [apps/web/app/api/research/preferences/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/preferences/route.ts>) |
| `/api/research/results/[runId]/share` | GET, POST | [apps/web/app/api/research/results/[runId]/share/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/results/[runId]/share/route.ts>) |
| `/api/research/results/study/[studyId]/share` | POST | [apps/web/app/api/research/results/study/[studyId]/share/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/results/study/[studyId]/share/route.ts>) |
| `/api/research/sessions/[id]` | GET | [apps/web/app/api/research/sessions/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/sessions/[id]/route.ts>) |
| `/api/research/sessions/[id]/runs/[runId]` | GET, POST | [apps/web/app/api/research/sessions/[id]/runs/[runId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/sessions/[id]/runs/[runId]/route.ts>) |
| `/api/research/sessions/[id]/runs` | POST | [apps/web/app/api/research/sessions/[id]/runs/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/sessions/[id]/runs/route.ts>) |
| `/api/research/sessions` | GET, POST | [apps/web/app/api/research/sessions/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/sessions/route.ts>) |
| `/api/research/sources/[id]/clippings` | POST | [apps/web/app/api/research/sources/[id]/clippings/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/sources/[id]/clippings/route.ts>) |
| `/api/research/sources/[id]/topic` | POST | [apps/web/app/api/research/sources/[id]/topic/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/sources/[id]/topic/route.ts>) |
| `/api/research/teardown/[runId]/export` | GET | [apps/web/app/api/research/teardown/[runId]/export/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/teardown/[runId]/export/route.ts>) |
| `/api/research/teardown/[runId]/history` | DELETE | [apps/web/app/api/research/teardown/[runId]/history/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/teardown/[runId]/history/route.ts>) |
| `/api/research/teardown/[runId]` | DELETE, GET, POST | [apps/web/app/api/research/teardown/[runId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/teardown/[runId]/route.ts>) |
| `/api/research/teardown` | GET, POST | [apps/web/app/api/research/teardown/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/teardown/route.ts>) |
| `/api/research/trends/[stableKey]/opportunity-v2` | POST | [apps/web/app/api/research/trends/[stableKey]/opportunity-v2/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/trends/[stableKey]/opportunity-v2/route.ts>) |
| `/api/research/trends/[stableKey]/related` | POST | [apps/web/app/api/research/trends/[stableKey]/related/route.ts](<E:/AI工作台1.2/apps/web/app/api/research/trends/[stableKey]/related/route.ts>) |
| `/api/search` | GET | [apps/web/app/api/search/route.ts](<E:/AI工作台1.2/apps/web/app/api/search/route.ts>) |
| `/api/settings/diagnostics` | GET | [apps/web/app/api/settings/diagnostics/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/diagnostics/route.ts>) |
| `/api/settings/invitations` | DELETE, GET, POST | [apps/web/app/api/settings/invitations/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/invitations/route.ts>) |
| `/api/settings/members/[id]` | DELETE, PATCH | [apps/web/app/api/settings/members/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/members/[id]/route.ts>) |
| `/api/settings/members` | GET, POST | [apps/web/app/api/settings/members/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/members/route.ts>) |
| `/api/settings/owner` | POST | [apps/web/app/api/settings/owner/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/owner/route.ts>) |
| `/api/settings/sessions` | DELETE, GET | [apps/web/app/api/settings/sessions/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/sessions/route.ts>) |
| `/api/settings/storage` | GET, POST | [apps/web/app/api/settings/storage/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/storage/route.ts>) |
| `/api/settings/workspace` | PATCH, POST | [apps/web/app/api/settings/workspace/route.ts](<E:/AI工作台1.2/apps/web/app/api/settings/workspace/route.ts>) |
| `/api/sidebar/folders/[folderId]` | DELETE, PATCH | [apps/web/app/api/sidebar/folders/[folderId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/sidebar/folders/[folderId]/route.ts>) |
| `/api/sidebar/folders` | POST | [apps/web/app/api/sidebar/folders/route.ts](<E:/AI工作台1.2/apps/web/app/api/sidebar/folders/route.ts>) |
| `/api/sidebar/projects/[projectId]/opened` | POST | [apps/web/app/api/sidebar/projects/[projectId]/opened/route.ts](<E:/AI工作台1.2/apps/web/app/api/sidebar/projects/[projectId]/opened/route.ts>) |
| `/api/sidebar/projects/[projectId]/preference` | PATCH | [apps/web/app/api/sidebar/projects/[projectId]/preference/route.ts](<E:/AI工作台1.2/apps/web/app/api/sidebar/projects/[projectId]/preference/route.ts>) |
| `/api/sidebar/projects` | POST | [apps/web/app/api/sidebar/projects/route.ts](<E:/AI工作台1.2/apps/web/app/api/sidebar/projects/route.ts>) |
| `/api/sidebar` | GET | [apps/web/app/api/sidebar/route.ts](<E:/AI工作台1.2/apps/web/app/api/sidebar/route.ts>) |
| `/api/source-items/[id]/assets/[assetId]/access` | GET | [apps/web/app/api/source-items/[id]/assets/[assetId]/access/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/assets/[assetId]/access/route.ts>) |
| `/api/source-items/[id]/assets/[assetId]/preview` | GET | [apps/web/app/api/source-items/[id]/assets/[assetId]/preview/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/assets/[assetId]/preview/route.ts>) |
| `/api/source-items/[id]/collections` | DELETE, POST | [apps/web/app/api/source-items/[id]/collections/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/collections/route.ts>) |
| `/api/source-items/[id]/distillation` | GET, POST | [apps/web/app/api/source-items/[id]/distillation/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/distillation/route.ts>) |
| `/api/source-items/[id]/knowledge/candidates/[candidateId]` | PATCH | [apps/web/app/api/source-items/[id]/knowledge/candidates/[candidateId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/knowledge/candidates/[candidateId]/route.ts>) |
| `/api/source-items/[id]/knowledge` | GET, POST | [apps/web/app/api/source-items/[id]/knowledge/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/knowledge/route.ts>) |
| `/api/source-items/[id]/material-analysis/[analysisId]` | PUT | [apps/web/app/api/source-items/[id]/material-analysis/[analysisId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/material-analysis/[analysisId]/route.ts>) |
| `/api/source-items/[id]/material-analysis/project` | POST | [apps/web/app/api/source-items/[id]/material-analysis/project/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/material-analysis/project/route.ts>) |
| `/api/source-items/[id]/material-analysis` | GET, POST | [apps/web/app/api/source-items/[id]/material-analysis/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/material-analysis/route.ts>) |
| `/api/source-items/[id]/metadata/refresh` | POST | [apps/web/app/api/source-items/[id]/metadata/refresh/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/metadata/refresh/route.ts>) |
| `/api/source-items/[id]/processing` | GET | [apps/web/app/api/source-items/[id]/processing/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/processing/route.ts>) |
| `/api/source-items/[id]` | DELETE, GET, PATCH | [apps/web/app/api/source-items/[id]/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/route.ts>) |
| `/api/source-items/[id]/tags` | DELETE, POST | [apps/web/app/api/source-items/[id]/tags/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/tags/route.ts>) |
| `/api/source-items/[id]/transcribe` | POST | [apps/web/app/api/source-items/[id]/transcribe/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/transcribe/route.ts>) |
| `/api/source-items/[id]/transcript` | PUT | [apps/web/app/api/source-items/[id]/transcript/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/transcript/route.ts>) |
| `/api/source-items/[id]/understanding` | POST | [apps/web/app/api/source-items/[id]/understanding/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/[id]/understanding/route.ts>) |
| `/api/source-items` | GET, POST | [apps/web/app/api/source-items/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/route.ts>) |
| `/api/source-items/upload` | POST | [apps/web/app/api/source-items/upload/route.ts](<E:/AI工作台1.2/apps/web/app/api/source-items/upload/route.ts>) |
| `/api/system/health/queue` | POST | [apps/web/app/api/system/health/queue/route.ts](<E:/AI工作台1.2/apps/web/app/api/system/health/queue/route.ts>) |
| `/api/tags` | GET, POST | [apps/web/app/api/tags/route.ts](<E:/AI工作台1.2/apps/web/app/api/tags/route.ts>) |
| `/api/video-data` | GET, POST | [apps/web/app/api/video-data/route.ts](<E:/AI工作台1.2/apps/web/app/api/video-data/route.ts>) |
| `/api/voice-input` | GET, POST | [apps/web/app/api/voice-input/route.ts](<E:/AI工作台1.2/apps/web/app/api/voice-input/route.ts>) |
| `/api/workspaces/[workspaceId]` | GET | [apps/web/app/api/workspaces/[workspaceId]/route.ts](<E:/AI工作台1.2/apps/web/app/api/workspaces/[workspaceId]/route.ts>) |

## 数据模型与枚举

模型存在仅证明 Schema 声明，不证明 migration 已执行或有真实数据。

| 声明 | 源码 |
| --- | --- |
| `enum WorkspaceRole` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:10>) |
| `enum SystemRole` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:17>) |
| `enum IntegrationProvider` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:22>) |
| `enum IntegrationStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:32>) |
| `enum SourceType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:40>) |
| `enum SourcePlatform` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:49>) |
| `enum ContentIdeaStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:60>) |
| `enum TrendPlatform` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:68>) |
| `enum TrendType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:74>) |
| `enum SourceItemStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:80>) |
| `enum IngestJobType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:88>) |
| `enum JobStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:97>) |
| `enum ProviderMode` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:105>) |
| `enum AssetType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:110>) |
| `enum ArtifactType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:117>) |
| `enum AssetStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:121>) |
| `enum ContentProjectStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:128>) |
| `enum ProjectSourceRole` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:138>) |
| `enum EvidenceType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:145>) |
| `enum EvidenceOwnership` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:159>) |
| `enum EvidenceStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:165>) |
| `enum PromptType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:171>) |
| `enum MaterialAnalysisStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:197>) |
| `enum BenchmarkStudyStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:203>) |
| `enum BenchmarkCollectionRunStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:209>) |
| `enum MaterialAnalysisOrigin` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:217>) |
| `enum MaterialDistillationMode` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:222>) |
| `enum MaterialDistillationStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:227>) |
| `enum UnifiedCreativeAnalysisStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:233>) |
| `enum RecommendationMode` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:239>) |
| `enum RecommendationItemStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:244>) |
| `enum RecommendationEvidenceType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:251>) |
| `enum ReviewResult` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:260>) |
| `enum PublishStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:267>) |
| `enum AIRunStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:276>) |
| `enum Platform` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:284>) |
| `enum PlatformVariantStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:292>) |
| `enum DeepContentPackageStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:301>) |
| `enum MotherContentOrigin` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:308>) |
| `enum AssistantMessageRole` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:314>) |
| `enum AssistantMessageStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:319>) |
| `enum DraftRevisionOrigin` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:327>) |
| `enum MethodStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:333>) |
| `enum SuggestionStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:340>) |
| `enum MethodSuggestionType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:346>) |
| `enum MethodSuggestionStability` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:357>) |
| `enum CreatorProfileSuggestionType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:362>) |
| `enum CreationFeedbackOutcome` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:372>) |
| `enum MethodUsageFeedbackRating` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:378>) |
| `enum CanvasObjectType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:384>) |
| `enum CanvasSnapshotReason` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:390>) |
| `enum CanvasRelationType` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:396>) |
| `enum CanvasReferencePurpose` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:400>) |
| `model User` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:405>) |
| `model Session` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:476>) |
| `model Account` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:491>) |
| `model Verification` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:512>) |
| `model Workspace` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:523>) |
| `model WorkspaceMember` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:596>) |
| `model IntegrationConfig` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:611>) |
| `model AuditLog` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:628>) |
| `model SourceItem` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:644>) |
| `enum SourceUnderstandingStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:689>) |
| `model SourceUnderstanding` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:696>) |
| `model SourceAsset` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:718>) |
| `model ApiUsage` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:742>) |
| `model IngestJob` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:765>) |
| `model Transcript` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:793>) |
| `model ContentTag` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:813>) |
| `model SourceItemTag` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:827>) |
| `model Collection` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:838>) |
| `model CollectionItem` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:854>) |
| `model ContentProject` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:865>) |
| `model ProjectFolder` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:921>) |
| `model UserProjectPreference` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:937>) |
| `model DraftBranch` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:959>) |
| `model DraftRevision` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:997>) |
| `model CanvasObject` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1026>) |
| `model CanvasObjectSnapshot` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1067>) |
| `model CanvasRelation` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1093>) |
| `model CanvasMaterialReference` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1117>) |
| `model BenchmarkAccount` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1141>) |
| `model BenchmarkContentSnapshot` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1171>) |
| `model BenchmarkComment` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1196>) |
| `model BenchmarkMetricObservation` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1211>) |
| `model BenchmarkCollectionRun` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1225>) |
| `model BenchmarkCollectionRunItem` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1256>) |
| `model BenchmarkStudy` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1275>) |
| `model BenchmarkStudySample` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1308>) |
| `model ContentIdea` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1326>) |
| `model ContentIdeaReference` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1350>) |
| `model TrendSnapshot` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1373>) |
| `model ResearchObjectPreference` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1395>) |
| `model RecommendationBatch` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1418>) |
| `model RecommendationItem` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1437>) |
| `model RecommendationEvidence` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1469>) |
| `model ProjectSource` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1484>) |
| `model MaterialAnalysis` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1499>) |
| `model MaterialDistillation` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1537>) |
| `model MethodAsset` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1565>) |
| `model MethodSuggestion` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1583>) |
| `model MethodVersion` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1619>) |
| `model ProjectMethodSelection` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1658>) |
| `model MethodUsage` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1676>) |
| `model EvidenceItem` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1696>) |
| `model CreativeBrief` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1735>) |
| `model MotherContent` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1762>) |
| `model CreationFeedback` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1787>) |
| `model MethodUsageFeedback` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1811>) |
| `model CreatorProfile` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1831>) |
| `model CreatorProfileSuggestion` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1865>) |
| `model DeepContentPackage` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1894>) |
| `model PromptTemplate` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1924>) |
| `model PlatformTemplate` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1943>) |
| `model PlatformVariant` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1962>) |
| `model ReviewRecord` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:1995>) |
| `model PublishTask` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2020>) |
| `model AIRun` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2051>) |
| `model AssistantThread` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2101>) |
| `model AssistantMessage` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2121>) |
| `model Artifact` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2142>) |
| `enum CanvasGenerateRunStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2167>) |
| `model CanvasGenerateRun` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2175>) |
| `model UnifiedCreativeAnalysis` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2203>) |
| `enum ResearchRunStatus` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2230>) |
| `model ResearchSession` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2237>) |
| `model ResearchRun` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2257>) |
| `model WorkspaceContentPolicy` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2295>) |
| `model ContentTopic` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2303>) |
| `model ContentTopicVersion` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2319>) |
| `model ContentTopicDecision` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2333>) |
| `model KnowledgeEntry` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2344>) |
| `model FactRecord` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2364>) |
| `model FactConfirmation` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2379>) |
| `model FactApproval` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2391>) |
| `model IPContextVersion` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2402>) |
| `model VideoAccount` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2419>) |
| `model VideoDailyMetric` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2436>) |
| `model VideoContent` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2462>) |
| `model VideoTask` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2480>) |
| `model FeishuConnection` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2503>) |
| `model FeishuDocument` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2524>) |
| `model FeishuChunk` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2551>) |
| `model FeishuSubscription` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2565>) |
| `model FeishuSubscriptionNode` | [packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma:2592>) |

## 测试资产

以下均为测试文件存在证据，不是本次通过结果。

- [apps/web/e2e/ai-creation.spec.ts](<E:/AI工作台1.2/apps/web/e2e/ai-creation.spec.ts>)
- [apps/web/e2e/app-shell.spec.ts](<E:/AI工作台1.2/apps/web/e2e/app-shell.spec.ts>)
- [apps/web/e2e/benchmark-studies.spec.ts](<E:/AI工作台1.2/apps/web/e2e/benchmark-studies.spec.ts>)
- [apps/web/e2e/canvas-node-ai.spec.ts](<E:/AI工作台1.2/apps/web/e2e/canvas-node-ai.spec.ts>)
- [apps/web/e2e/content-discovery-trends.spec.ts](<E:/AI工作台1.2/apps/web/e2e/content-discovery-trends.spec.ts>)
- [apps/web/e2e/content-discovery.spec.ts](<E:/AI工作台1.2/apps/web/e2e/content-discovery.spec.ts>)
- [apps/web/e2e/content-ingest.spec.ts](<E:/AI工作台1.2/apps/web/e2e/content-ingest.spec.ts>)
- [apps/web/e2e/content-project.spec.ts](<E:/AI工作台1.2/apps/web/e2e/content-project.spec.ts>)
- [apps/web/e2e/content-quality-review.spec.ts](<E:/AI工作台1.2/apps/web/e2e/content-quality-review.spec.ts>)
- [apps/web/e2e/creation-feedback.spec.ts](<E:/AI工作台1.2/apps/web/e2e/creation-feedback.spec.ts>)
- [apps/web/e2e/deep-content-package.spec.ts](<E:/AI工作台1.2/apps/web/e2e/deep-content-package.spec.ts>)
- [apps/web/e2e/desktop-layout.spec.ts](<E:/AI工作台1.2/apps/web/e2e/desktop-layout.spec.ts>)
- [apps/web/e2e/doubao-asr.spec.ts](<E:/AI工作台1.2/apps/web/e2e/doubao-asr.spec.ts>)
- [apps/web/e2e/drafts.spec.ts](<E:/AI工作台1.2/apps/web/e2e/drafts.spec.ts>)
- [apps/web/e2e/foundation.spec.ts](<E:/AI工作台1.2/apps/web/e2e/foundation.spec.ts>)
- [apps/web/e2e/generic-artifact.spec.ts](<E:/AI工作台1.2/apps/web/e2e/generic-artifact.spec.ts>)
- [apps/web/e2e/home-composer.spec.ts](<E:/AI工作台1.2/apps/web/e2e/home-composer.spec.ts>)
- [apps/web/e2e/home-reference.spec.ts](<E:/AI工作台1.2/apps/web/e2e/home-reference.spec.ts>)
- [apps/web/e2e/integration-secrets.spec.ts](<E:/AI工作台1.2/apps/web/e2e/integration-secrets.spec.ts>)
- [apps/web/e2e/local-asr.spec.ts](<E:/AI工作台1.2/apps/web/e2e/local-asr.spec.ts>)
- [apps/web/e2e/m12-shell.spec.ts](<E:/AI工作台1.2/apps/web/e2e/m12-shell.spec.ts>)
- [apps/web/e2e/material-analysis.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-analysis.spec.ts>)
- [apps/web/e2e/material-completion.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-completion.spec.ts>)
- [apps/web/e2e/material-detail-functional-recovery.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-detail-functional-recovery.spec.ts>)
- [apps/web/e2e/material-detail-integrated-recovery.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-detail-integrated-recovery.spec.ts>)
- [apps/web/e2e/material-distillation.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-distillation.spec.ts>)
- [apps/web/e2e/material-knowledge.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-knowledge.spec.ts>)
- [apps/web/e2e/material-workflow-ux.spec.ts](<E:/AI工作台1.2/apps/web/e2e/material-workflow-ux.spec.ts>)
- [apps/web/e2e/methods.spec.ts](<E:/AI工作台1.2/apps/web/e2e/methods.spec.ts>)
- [apps/web/e2e/multi-user-security.spec.ts](<E:/AI工作台1.2/apps/web/e2e/multi-user-security.spec.ts>)
- [apps/web/e2e/platform-content-factory.spec.ts](<E:/AI工作台1.2/apps/web/e2e/platform-content-factory.spec.ts>)
- [apps/web/e2e/pre-launch-product-closure.spec.ts](<E:/AI工作台1.2/apps/web/e2e/pre-launch-product-closure.spec.ts>)
- [apps/web/e2e/product-simplification.spec.ts](<E:/AI工作台1.2/apps/web/e2e/product-simplification.spec.ts>)
- [apps/web/e2e/project-agent-core.spec.ts](<E:/AI工作台1.2/apps/web/e2e/project-agent-core.spec.ts>)
- [apps/web/e2e/project-assistant.spec.ts](<E:/AI工作台1.2/apps/web/e2e/project-assistant.spec.ts>)
- [apps/web/e2e/project-materials-panel.spec.ts](<E:/AI工作台1.2/apps/web/e2e/project-materials-panel.spec.ts>)
- [apps/web/e2e/publishing-center.spec.ts](<E:/AI工作台1.2/apps/web/e2e/publishing-center.spec.ts>)
- [apps/web/e2e/qa-prelaunch.spec.ts](<E:/AI工作台1.2/apps/web/e2e/qa-prelaunch.spec.ts>)
- [apps/web/e2e/redfox-ingest.spec.ts](<E:/AI工作台1.2/apps/web/e2e/redfox-ingest.spec.ts>)
- [apps/web/e2e/render-media-relay.spec.ts](<E:/AI工作台1.2/apps/web/e2e/render-media-relay.spec.ts>)
- [apps/web/e2e/research-center.spec.ts](<E:/AI工作台1.2/apps/web/e2e/research-center.spec.ts>)
- [apps/web/e2e/sidebar-core.spec.ts](<E:/AI工作台1.2/apps/web/e2e/sidebar-core.spec.ts>)
- [apps/web/e2e/sidebar-foundation.spec.ts](<E:/AI工作台1.2/apps/web/e2e/sidebar-foundation.spec.ts>)
- [apps/web/e2e/sidebar-project-organization.spec.ts](<E:/AI工作台1.2/apps/web/e2e/sidebar-project-organization.spec.ts>)
- [apps/web/e2e/source-inputs.spec.ts](<E:/AI工作台1.2/apps/web/e2e/source-inputs.spec.ts>)
- [apps/web/e2e/source-workspace.spec.ts](<E:/AI工作台1.2/apps/web/e2e/source-workspace.spec.ts>)
- [apps/web/e2e/storage-access-security.spec.ts](<E:/AI工作台1.2/apps/web/e2e/storage-access-security.spec.ts>)
- [apps/web/e2e/teardown.spec.ts](<E:/AI工作台1.2/apps/web/e2e/teardown.spec.ts>)
- [apps/web/e2e/today-recommendations.spec.ts](<E:/AI工作台1.2/apps/web/e2e/today-recommendations.spec.ts>)
- [apps/web/e2e/upload-browser-stability.spec.ts](<E:/AI工作台1.2/apps/web/e2e/upload-browser-stability.spec.ts>)
- [apps/web/e2e/v1-happy-path.spec.ts](<E:/AI工作台1.2/apps/web/e2e/v1-happy-path.spec.ts>)
- [apps/web/e2e/workflow-skill.spec.ts](<E:/AI工作台1.2/apps/web/e2e/workflow-skill.spec.ts>)
- [apps/web/tests/account-api-connection.test.ts](<E:/AI工作台1.2/apps/web/tests/account-api-connection.test.ts>)
- [apps/web/tests/account-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/account-browser.test.ts>)
- [apps/web/tests/account-final-boundaries.test.ts](<E:/AI工作台1.2/apps/web/tests/account-final-boundaries.test.ts>)
- [apps/web/tests/account-http-isolation.test.ts](<E:/AI工作台1.2/apps/web/tests/account-http-isolation.test.ts>)
- [apps/web/tests/account-report-tables.test.ts](<E:/AI工作台1.2/apps/web/tests/account-report-tables.test.ts>)
- [apps/web/tests/account-research-analysis.test.ts](<E:/AI工作台1.2/apps/web/tests/account-research-analysis.test.ts>)
- [apps/web/tests/account-research-service.test.ts](<E:/AI工作台1.2/apps/web/tests/account-research-service.test.ts>)
- [apps/web/tests/account-safety.test.ts](<E:/AI工作台1.2/apps/web/tests/account-safety.test.ts>)
- [apps/web/tests/account-security-http.test.ts](<E:/AI工作台1.2/apps/web/tests/account-security-http.test.ts>)
- [apps/web/tests/account-security.test.ts](<E:/AI工作台1.2/apps/web/tests/account-security.test.ts>)
- [apps/web/tests/account-sessions.test.ts](<E:/AI工作台1.2/apps/web/tests/account-sessions.test.ts>)
- [apps/web/tests/account-space.test.ts](<E:/AI工作台1.2/apps/web/tests/account-space.test.ts>)
- [apps/web/tests/account-v2-analysis.test.ts](<E:/AI工作台1.2/apps/web/tests/account-v2-analysis.test.ts>)
- [apps/web/tests/account-v2-service.test.ts](<E:/AI工作台1.2/apps/web/tests/account-v2-service.test.ts>)
- [apps/web/tests/ai-control.test.ts](<E:/AI工作台1.2/apps/web/tests/ai-control.test.ts>)
- [apps/web/tests/ai-creation.test.ts](<E:/AI工作台1.2/apps/web/tests/ai-creation.test.ts>)
- [apps/web/tests/artifact-final-navigation-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/artifact-final-navigation-browser.test.ts>)
- [apps/web/tests/artifacts.test.ts](<E:/AI工作台1.2/apps/web/tests/artifacts.test.ts>)
- [apps/web/tests/assistant-capacity.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-capacity.test.ts>)
- [apps/web/tests/assistant-feishu-cache.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-feishu-cache.test.ts>)
- [apps/web/tests/assistant-media-link.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-media-link.test.ts>)
- [apps/web/tests/assistant-memory.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-memory.test.ts>)
- [apps/web/tests/assistant-read-and-shortcut-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-read-and-shortcut-browser.test.ts>)
- [apps/web/tests/assistant-redis.integration.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-redis.integration.test.ts>)
- [apps/web/tests/assistant-runtime.integration.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-runtime.integration.test.ts>)
- [apps/web/tests/assistant-stream-route.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-stream-route.test.ts>)
- [apps/web/tests/assistant-task-state.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-task-state.test.ts>)
- [apps/web/tests/assistant-web-search.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-web-search.test.ts>)
- [apps/web/tests/assistant-writing-real.test.ts](<E:/AI工作台1.2/apps/web/tests/assistant-writing-real.test.ts>)
- [apps/web/tests/auth-errors.test.ts](<E:/AI工作台1.2/apps/web/tests/auth-errors.test.ts>)
- [apps/web/tests/auth.integration.test.ts](<E:/AI工作台1.2/apps/web/tests/auth.integration.test.ts>)
- [apps/web/tests/benchmark-cohort.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-cohort.test.ts>)
- [apps/web/tests/benchmark-collection-contract.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-collection-contract.test.ts>)
- [apps/web/tests/benchmark-creator-profile.test.tsx](<E:/AI工作台1.2/apps/web/tests/benchmark-creator-profile.test.tsx>)
- [apps/web/tests/benchmark-dossier-math.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-dossier-math.test.ts>)
- [apps/web/tests/benchmark-dossier.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-dossier.test.ts>)
- [apps/web/tests/benchmark-studies.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-studies.test.ts>)
- [apps/web/tests/benchmark-topics.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-topics.test.ts>)
- [apps/web/tests/benchmark-workbench-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-workbench-browser.test.ts>)
- [apps/web/tests/benchmark-workbench.test.ts](<E:/AI工作台1.2/apps/web/tests/benchmark-workbench.test.ts>)
- [apps/web/tests/bootstrap-admin.test.ts](<E:/AI工作台1.2/apps/web/tests/bootstrap-admin.test.ts>)
- [apps/web/tests/canvas-node-ai.test.ts](<E:/AI工作台1.2/apps/web/tests/canvas-node-ai.test.ts>)
- [apps/web/tests/canvas-objects.test.ts](<E:/AI工作台1.2/apps/web/tests/canvas-objects.test.ts>)
- [apps/web/tests/canvas-ui-contract.test.ts](<E:/AI工作台1.2/apps/web/tests/canvas-ui-contract.test.ts>)
- [apps/web/tests/connection-failures.test.ts](<E:/AI工作台1.2/apps/web/tests/connection-failures.test.ts>)
- [apps/web/tests/content-discovery-trends.test.ts](<E:/AI工作台1.2/apps/web/tests/content-discovery-trends.test.ts>)
- [apps/web/tests/content-discovery.test.ts](<E:/AI工作台1.2/apps/web/tests/content-discovery.test.ts>)
- [apps/web/tests/content-governance.test.ts](<E:/AI工作台1.2/apps/web/tests/content-governance.test.ts>)
- [apps/web/tests/content-production.test.ts](<E:/AI工作台1.2/apps/web/tests/content-production.test.ts>)
- [apps/web/tests/content-projects.test.ts](<E:/AI工作台1.2/apps/web/tests/content-projects.test.ts>)
- [apps/web/tests/content-quality-review.test.ts](<E:/AI工作台1.2/apps/web/tests/content-quality-review.test.ts>)
- [apps/web/tests/creation-composer.test.ts](<E:/AI工作台1.2/apps/web/tests/creation-composer.test.ts>)
- [apps/web/tests/creation-feedback.test.ts](<E:/AI工作台1.2/apps/web/tests/creation-feedback.test.ts>)
- [apps/web/tests/creative-basis.test.ts](<E:/AI工作台1.2/apps/web/tests/creative-basis.test.ts>)
- [apps/web/tests/creative-brief-prefill.test.ts](<E:/AI工作台1.2/apps/web/tests/creative-brief-prefill.test.ts>)
- [apps/web/tests/creator-methods.test.ts](<E:/AI工作台1.2/apps/web/tests/creator-methods.test.ts>)
- [apps/web/tests/deep-content-package.test.ts](<E:/AI工作台1.2/apps/web/tests/deep-content-package.test.ts>)
- [apps/web/tests/default-content-method-generation.test.ts](<E:/AI工作台1.2/apps/web/tests/default-content-method-generation.test.ts>)
- [apps/web/tests/default-content-method.test.ts](<E:/AI工作台1.2/apps/web/tests/default-content-method.test.ts>)
- [apps/web/tests/draft-ui-contract.test.ts](<E:/AI工作台1.2/apps/web/tests/draft-ui-contract.test.ts>)
- [apps/web/tests/drafts.test.ts](<E:/AI工作台1.2/apps/web/tests/drafts.test.ts>)
- [apps/web/tests/experience-research-permission.test.ts](<E:/AI工作台1.2/apps/web/tests/experience-research-permission.test.ts>)
- [apps/web/tests/feishu-browse.test.ts](<E:/AI工作台1.2/apps/web/tests/feishu-browse.test.ts>)
- [apps/web/tests/feishu-knowledge-subscriptions.test.tsx](<E:/AI工作台1.2/apps/web/tests/feishu-knowledge-subscriptions.test.tsx>)
- [apps/web/tests/feishu-wiki-browser.test.tsx](<E:/AI工作台1.2/apps/web/tests/feishu-wiki-browser.test.tsx>)
- [apps/web/tests/feishu.test.ts](<E:/AI工作台1.2/apps/web/tests/feishu.test.ts>)
- [apps/web/tests/format-metric-count.test.ts](<E:/AI工作台1.2/apps/web/tests/format-metric-count.test.ts>)
- [apps/web/tests/global-artifact-search.test.ts](<E:/AI工作台1.2/apps/web/tests/global-artifact-search.test.ts>)
- [apps/web/tests/home-performance-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/home-performance-browser.test.ts>)
- [apps/web/tests/ingest-job-recovery.test.ts](<E:/AI工作台1.2/apps/web/tests/ingest-job-recovery.test.ts>)
- [apps/web/tests/integration-card-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/integration-card-browser.test.ts>)
- [apps/web/tests/integration-external-policy.test.ts](<E:/AI工作台1.2/apps/web/tests/integration-external-policy.test.ts>)
- [apps/web/tests/integrations.test.ts](<E:/AI工作台1.2/apps/web/tests/integrations.test.ts>)
- [apps/web/tests/internal-signup.test.ts](<E:/AI工作台1.2/apps/web/tests/internal-signup.test.ts>)
- [apps/web/tests/learning-suggestions.test.ts](<E:/AI工作台1.2/apps/web/tests/learning-suggestions.test.ts>)
- [apps/web/tests/llm-runtime-vision.test.ts](<E:/AI工作台1.2/apps/web/tests/llm-runtime-vision.test.ts>)
- [apps/web/tests/local-directory-picker.test.ts](<E:/AI工作台1.2/apps/web/tests/local-directory-picker.test.ts>)
- [apps/web/tests/local-storage.test.ts](<E:/AI工作台1.2/apps/web/tests/local-storage.test.ts>)
- [apps/web/tests/material-analysis-to-brief-mapper.test.ts](<E:/AI工作台1.2/apps/web/tests/material-analysis-to-brief-mapper.test.ts>)
- [apps/web/tests/material-analysis.test.ts](<E:/AI工作台1.2/apps/web/tests/material-analysis.test.ts>)
- [apps/web/tests/material-chain.integration.test.ts](<E:/AI工作台1.2/apps/web/tests/material-chain.integration.test.ts>)
- [apps/web/tests/material-detail-read-model.test.ts](<E:/AI工作台1.2/apps/web/tests/material-detail-read-model.test.ts>)
- [apps/web/tests/material-detail-view.test.ts](<E:/AI工作台1.2/apps/web/tests/material-detail-view.test.ts>)
- [apps/web/tests/material-distillation.test.ts](<E:/AI工作台1.2/apps/web/tests/material-distillation.test.ts>)
- [apps/web/tests/material-knowledge.test.ts](<E:/AI工作台1.2/apps/web/tests/material-knowledge.test.ts>)
- [apps/web/tests/material-processing-timeout.test.ts](<E:/AI工作台1.2/apps/web/tests/material-processing-timeout.test.ts>)
- [apps/web/tests/material-readable-content.test.ts](<E:/AI工作台1.2/apps/web/tests/material-readable-content.test.ts>)
- [apps/web/tests/material-storage-roundtrip.test.ts](<E:/AI工作台1.2/apps/web/tests/material-storage-roundtrip.test.ts>)
- [apps/web/tests/material-upload-api.test.ts](<E:/AI工作台1.2/apps/web/tests/material-upload-api.test.ts>)
- [apps/web/tests/material-workspace-state.test.ts](<E:/AI工作台1.2/apps/web/tests/material-workspace-state.test.ts>)
- [apps/web/tests/methods.test.ts](<E:/AI工作台1.2/apps/web/tests/methods.test.ts>)
- [apps/web/tests/mother-confirmation.test.ts](<E:/AI工作台1.2/apps/web/tests/mother-confirmation.test.ts>)
- [apps/web/tests/platform-content-factory.test.ts](<E:/AI工作台1.2/apps/web/tests/platform-content-factory.test.ts>)
- [apps/web/tests/product-simplification.test.ts](<E:/AI工作台1.2/apps/web/tests/product-simplification.test.ts>)
- [apps/web/tests/project-agent-core.test.ts](<E:/AI工作台1.2/apps/web/tests/project-agent-core.test.ts>)
- [apps/web/tests/project-assistant.test.ts](<E:/AI工作台1.2/apps/web/tests/project-assistant.test.ts>)
- [apps/web/tests/project-materials-panel.test.ts](<E:/AI工作台1.2/apps/web/tests/project-materials-panel.test.ts>)
- [apps/web/tests/project-methods-ai.test.ts](<E:/AI工作台1.2/apps/web/tests/project-methods-ai.test.ts>)
- [apps/web/tests/project-methods.test.ts](<E:/AI工作台1.2/apps/web/tests/project-methods.test.ts>)
- [apps/web/tests/project-next-action.test.ts](<E:/AI工作台1.2/apps/web/tests/project-next-action.test.ts>)
- [apps/web/tests/provider-v0-policy.test.ts](<E:/AI工作台1.2/apps/web/tests/provider-v0-policy.test.ts>)
- [apps/web/tests/publishing-center.test.ts](<E:/AI工作台1.2/apps/web/tests/publishing-center.test.ts>)
- [apps/web/tests/qa-prelaunch-core.test.ts](<E:/AI工作台1.2/apps/web/tests/qa-prelaunch-core.test.ts>)
- [apps/web/tests/reference-safety.test.ts](<E:/AI工作台1.2/apps/web/tests/reference-safety.test.ts>)
- [apps/web/tests/release-readiness.test.ts](<E:/AI工作台1.2/apps/web/tests/release-readiness.test.ts>)
- [apps/web/tests/research-abc-flow.test.ts](<E:/AI工作台1.2/apps/web/tests/research-abc-flow.test.ts>)
- [apps/web/tests/research-account-trend-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/research-account-trend-browser.test.ts>)
- [apps/web/tests/research-api.test.ts](<E:/AI工作台1.2/apps/web/tests/research-api.test.ts>)
- [apps/web/tests/research-benchmarks.test.ts](<E:/AI工作台1.2/apps/web/tests/research-benchmarks.test.ts>)
- [apps/web/tests/research-blocks.test.ts](<E:/AI工作台1.2/apps/web/tests/research-blocks.test.ts>)
- [apps/web/tests/research-core-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/research-core-browser.test.ts>)
- [apps/web/tests/research-creation-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/research-creation-browser.test.ts>)
- [apps/web/tests/research-creation-selection.test.ts](<E:/AI工作台1.2/apps/web/tests/research-creation-selection.test.ts>)
- [apps/web/tests/research-creation.test.ts](<E:/AI工作台1.2/apps/web/tests/research-creation.test.ts>)
- [apps/web/tests/research-experience-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/research-experience-browser.test.ts>)
- [apps/web/tests/research-home-inputs.test.ts](<E:/AI工作台1.2/apps/web/tests/research-home-inputs.test.ts>)
- [apps/web/tests/research-library.test.ts](<E:/AI工作台1.2/apps/web/tests/research-library.test.ts>)
- [apps/web/tests/research-mode-output.test.ts](<E:/AI工作台1.2/apps/web/tests/research-mode-output.test.ts>)
- [apps/web/tests/research-navigation.test.tsx](<E:/AI工作台1.2/apps/web/tests/research-navigation.test.tsx>)
- [apps/web/tests/research-news-api.test.ts](<E:/AI工作台1.2/apps/web/tests/research-news-api.test.ts>)
- [apps/web/tests/research-news-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/research-news-browser.test.ts>)
- [apps/web/tests/research-news-runtime.test.ts](<E:/AI工作台1.2/apps/web/tests/research-news-runtime.test.ts>)
- [apps/web/tests/research-news.test.ts](<E:/AI工作台1.2/apps/web/tests/research-news.test.ts>)
- [apps/web/tests/research-project-handoff.test.ts](<E:/AI工作台1.2/apps/web/tests/research-project-handoff.test.ts>)
- [apps/web/tests/research-queued-timeout.test.ts](<E:/AI工作台1.2/apps/web/tests/research-queued-timeout.test.ts>)
- [apps/web/tests/research-session.test.ts](<E:/AI工作台1.2/apps/web/tests/research-session.test.ts>)
- [apps/web/tests/research-sharing.test.ts](<E:/AI工作台1.2/apps/web/tests/research-sharing.test.ts>)
- [apps/web/tests/research-source-inbox.test.ts](<E:/AI工作台1.2/apps/web/tests/research-source-inbox.test.ts>)
- [apps/web/tests/research-trends.test.ts](<E:/AI工作台1.2/apps/web/tests/research-trends.test.ts>)
- [apps/web/tests/review-asr-probes.test.ts](<E:/AI工作台1.2/apps/web/tests/review-asr-probes.test.ts>)
- [apps/web/tests/review-external-boundaries.test.ts](<E:/AI工作台1.2/apps/web/tests/review-external-boundaries.test.ts>)
- [apps/web/tests/shared-artifact-editor-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/shared-artifact-editor-browser.test.ts>)
- [apps/web/tests/sidebar-organization.test.ts](<E:/AI工作台1.2/apps/web/tests/sidebar-organization.test.ts>)
- [apps/web/tests/sidebar-state.test.ts](<E:/AI工作台1.2/apps/web/tests/sidebar-state.test.ts>)
- [apps/web/tests/skill-resolver.test.ts](<E:/AI工作台1.2/apps/web/tests/skill-resolver.test.ts>)
- [apps/web/tests/source-metadata-refresh.test.ts](<E:/AI工作台1.2/apps/web/tests/source-metadata-refresh.test.ts>)
- [apps/web/tests/source-processing-state.test.ts](<E:/AI工作台1.2/apps/web/tests/source-processing-state.test.ts>)
- [apps/web/tests/source-understanding.test.ts](<E:/AI工作台1.2/apps/web/tests/source-understanding.test.ts>)
- [apps/web/tests/source-upload.test.ts](<E:/AI工作台1.2/apps/web/tests/source-upload.test.ts>)
- [apps/web/tests/staging-admin-bootstrap.test.ts](<E:/AI工作台1.2/apps/web/tests/staging-admin-bootstrap.test.ts>)
- [apps/web/tests/starship-frontend-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/starship-frontend-browser.test.ts>)
- [apps/web/tests/studio-creation-context.test.ts](<E:/AI工作台1.2/apps/web/tests/studio-creation-context.test.ts>)
- [apps/web/tests/studio-default-method.test.ts](<E:/AI工作台1.2/apps/web/tests/studio-default-method.test.ts>)
- [apps/web/tests/studio-fact-safety.test.ts](<E:/AI工作台1.2/apps/web/tests/studio-fact-safety.test.ts>)
- [apps/web/tests/teardown-chain.test.ts](<E:/AI工作台1.2/apps/web/tests/teardown-chain.test.ts>)
- [apps/web/tests/today-recommendations.test.ts](<E:/AI工作台1.2/apps/web/tests/today-recommendations.test.ts>)
- [apps/web/tests/topic-opportunity-v2.test.ts](<E:/AI工作台1.2/apps/web/tests/topic-opportunity-v2.test.ts>)
- [apps/web/tests/unified-creative-analysis.test.ts](<E:/AI工作台1.2/apps/web/tests/unified-creative-analysis.test.ts>)
- [apps/web/tests/usage.test.ts](<E:/AI工作台1.2/apps/web/tests/usage.test.ts>)
- [apps/web/tests/user-lifecycle.test.ts](<E:/AI工作台1.2/apps/web/tests/user-lifecycle.test.ts>)
- [apps/web/tests/video-analytics-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/video-analytics-browser.test.ts>)
- [apps/web/tests/video-analytics.test.ts](<E:/AI工作台1.2/apps/web/tests/video-analytics.test.ts>)
- [apps/web/tests/video-link-ingest.test.ts](<E:/AI工作台1.2/apps/web/tests/video-link-ingest.test.ts>)
- [apps/web/tests/video-operations.test.ts](<E:/AI工作台1.2/apps/web/tests/video-operations.test.ts>)
- [apps/web/tests/voice-input-api.test.ts](<E:/AI工作台1.2/apps/web/tests/voice-input-api.test.ts>)
- [apps/web/tests/voice-input-browser.test.ts](<E:/AI工作台1.2/apps/web/tests/voice-input-browser.test.ts>)
- [apps/web/tests/voice-recording-roundtrip.test.ts](<E:/AI工作台1.2/apps/web/tests/voice-recording-roundtrip.test.ts>)
- [apps/web/tests/voice-transcription.test.ts](<E:/AI工作台1.2/apps/web/tests/voice-transcription.test.ts>)
- [apps/web/tests/work-research-analysis.test.ts](<E:/AI工作台1.2/apps/web/tests/work-research-analysis.test.ts>)
- [apps/web/tests/work-research-collect.test.ts](<E:/AI工作台1.2/apps/web/tests/work-research-collect.test.ts>)
- [apps/web/tests/work-research-markdown.test.ts](<E:/AI工作台1.2/apps/web/tests/work-research-markdown.test.ts>)
- [apps/web/tests/work-research-recommendations.test.ts](<E:/AI工作台1.2/apps/web/tests/work-research-recommendations.test.ts>)
- [apps/web/tests/work-research-service.test.ts](<E:/AI工作台1.2/apps/web/tests/work-research-service.test.ts>)
- [apps/web/tests/workflow-skill.test.ts](<E:/AI工作台1.2/apps/web/tests/workflow-skill.test.ts>)
- [apps/web/tests/writing-method.test.ts](<E:/AI工作台1.2/apps/web/tests/writing-method.test.ts>)
- [apps/worker/src/benchmark-analysis.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-analysis.test.ts>)
- [apps/worker/src/benchmark-collection-utils.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-collection-utils.test.ts>)
- [apps/worker/src/benchmark-creator-profile-v2.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-creator-profile-v2.test.ts>)
- [apps/worker/src/benchmark-creator-profile-v3.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-creator-profile-v3.test.ts>)
- [apps/worker/src/benchmark-creator-profile-v4.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-creator-profile-v4.test.ts>)
- [apps/worker/src/benchmark-creator-profile.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-creator-profile.test.ts>)
- [apps/worker/src/benchmark-playbook.test.ts](<E:/AI工作台1.2/apps/worker/src/benchmark-playbook.test.ts>)
- [apps/worker/src/experience-limits.test.ts](<E:/AI工作台1.2/apps/worker/src/experience-limits.test.ts>)
- [apps/worker/src/free-runtime.test.ts](<E:/AI工作台1.2/apps/worker/src/free-runtime.test.ts>)
- [apps/worker/src/ingest.integration.test.ts](<E:/AI工作台1.2/apps/worker/src/ingest.integration.test.ts>)
- [apps/worker/src/integrations.test.ts](<E:/AI工作台1.2/apps/worker/src/integrations.test.ts>)
- [apps/worker/src/job-recovery.integration.test.ts](<E:/AI工作台1.2/apps/worker/src/job-recovery.integration.test.ts>)
- [apps/worker/src/material-analysis.test.ts](<E:/AI工作台1.2/apps/worker/src/material-analysis.test.ts>)
- [apps/worker/src/material-distillation.test.ts](<E:/AI工作台1.2/apps/worker/src/material-distillation.test.ts>)
- [apps/worker/src/queue.test.ts](<E:/AI工作台1.2/apps/worker/src/queue.test.ts>)
- [apps/worker/src/redis-connection.test.ts](<E:/AI工作台1.2/apps/worker/src/redis-connection.test.ts>)
- [apps/worker/src/teardown/worker.test.ts](<E:/AI工作台1.2/apps/worker/src/teardown/worker.test.ts>)
- [apps/worker/src/transcription-chunks.test.ts](<E:/AI工作台1.2/apps/worker/src/transcription-chunks.test.ts>)
- [apps/worker/src/transcription-policy.test.ts](<E:/AI工作台1.2/apps/worker/src/transcription-policy.test.ts>)
- [apps/worker/src/transcription.integration.test.ts](<E:/AI工作台1.2/apps/worker/src/transcription.integration.test.ts>)
- [apps/worker/src/transcription.test.ts](<E:/AI工作台1.2/apps/worker/src/transcription.test.ts>)
- [packages/config/src/media.test.ts](<E:/AI工作台1.2/packages/config/src/media.test.ts>)
- [packages/core/src/content-project-state.test.ts](<E:/AI工作台1.2/packages/core/src/content-project-state.test.ts>)
- [packages/core/src/discovery-query.test.ts](<E:/AI工作台1.2/packages/core/src/discovery-query.test.ts>)
- [packages/core/src/rbac.test.ts](<E:/AI工作台1.2/packages/core/src/rbac.test.ts>)
- [packages/core/src/slug.test.ts](<E:/AI工作台1.2/packages/core/src/slug.test.ts>)
- [packages/core/src/source-capability.test.ts](<E:/AI工作台1.2/packages/core/src/source-capability.test.ts>)
- [packages/core/src/source-content.test.ts](<E:/AI工作台1.2/packages/core/src/source-content.test.ts>)
- [packages/core/src/source-domain.test.ts](<E:/AI工作台1.2/packages/core/src/source-domain.test.ts>)
- [packages/core/src/source-url.test.ts](<E:/AI工作台1.2/packages/core/src/source-url.test.ts>)
- [packages/core/src/tag-slug.test.ts](<E:/AI工作台1.2/packages/core/src/tag-slug.test.ts>)
- [packages/core/src/teardown.test.ts](<E:/AI工作台1.2/packages/core/src/teardown.test.ts>)
- [packages/core/src/today-recommendation.test.ts](<E:/AI工作台1.2/packages/core/src/today-recommendation.test.ts>)
- [packages/core/src/trend.test.ts](<E:/AI工作台1.2/packages/core/src/trend.test.ts>)
- [packages/db/src/projects.test.ts](<E:/AI工作台1.2/packages/db/src/projects.test.ts>)
- [packages/db/src/review-target.test.ts](<E:/AI工作台1.2/packages/db/src/review-target.test.ts>)
- [packages/db/src/sources.test.ts](<E:/AI工作台1.2/packages/db/src/sources.test.ts>)
- [packages/db/src/test-target.test.ts](<E:/AI工作台1.2/packages/db/src/test-target.test.ts>)
- [packages/db/src/workspaces.test.ts](<E:/AI工作台1.2/packages/db/src/workspaces.test.ts>)
- [packages/integrations/src/encryption.test.ts](<E:/AI工作台1.2/packages/integrations/src/encryption.test.ts>)
- [packages/integrations/src/feishu/client.test.ts](<E:/AI工作台1.2/packages/integrations/src/feishu/client.test.ts>)
- [packages/integrations/src/feishu/docx.test.ts](<E:/AI工作台1.2/packages/integrations/src/feishu/docx.test.ts>)
- [packages/integrations/src/feishu/service-boundary.test.ts](<E:/AI工作台1.2/packages/integrations/src/feishu/service-boundary.test.ts>)
- [packages/integrations/src/kimi-model-policy.test.ts](<E:/AI工作台1.2/packages/integrations/src/kimi-model-policy.test.ts>)
- [packages/integrations/src/knowledge/feishu-wiki.test.ts](<E:/AI工作台1.2/packages/integrations/src/knowledge/feishu-wiki.test.ts>)
- [packages/integrations/src/model-catalog.test.ts](<E:/AI工作台1.2/packages/integrations/src/model-catalog.test.ts>)
- [packages/integrations/src/schemas.test.ts](<E:/AI工作台1.2/packages/integrations/src/schemas.test.ts>)
- [packages/integrations/src/service.integration.test.ts](<E:/AI工作台1.2/packages/integrations/src/service.integration.test.ts>)
- [packages/integrations/src/system-config.test.ts](<E:/AI工作台1.2/packages/integrations/src/system-config.test.ts>)
- [packages/integrations/src/system-provider-policy.test.ts](<E:/AI工作台1.2/packages/integrations/src/system-provider-policy.test.ts>)
- [packages/integrations/src/tester.test.ts](<E:/AI工作台1.2/packages/integrations/src/tester.test.ts>)
- [packages/providers/src/docx-text.test.ts](<E:/AI工作台1.2/packages/providers/src/docx-text.test.ts>)
- [packages/providers/src/doubao/client.test.ts](<E:/AI工作台1.2/packages/providers/src/doubao/client.test.ts>)
- [packages/providers/src/doubao/recording-file-client.test.ts](<E:/AI工作台1.2/packages/providers/src/doubao/recording-file-client.test.ts>)
- [packages/providers/src/doubao/streaming-client.test.ts](<E:/AI工作台1.2/packages/providers/src/doubao/streaming-client.test.ts>)
- [packages/providers/src/ffmpeg-media-processor.test.ts](<E:/AI工作台1.2/packages/providers/src/ffmpeg-media-processor.test.ts>)
- [packages/providers/src/generation-quality.test.ts](<E:/AI工作台1.2/packages/providers/src/generation-quality.test.ts>)
- [packages/providers/src/image-validation.test.ts](<E:/AI工作台1.2/packages/providers/src/image-validation.test.ts>)
- [packages/providers/src/local-asr/client.test.ts](<E:/AI工作台1.2/packages/providers/src/local-asr/client.test.ts>)
- [packages/providers/src/local-asr/quality-resolver.test.ts](<E:/AI工作台1.2/packages/providers/src/local-asr/quality-resolver.test.ts>)
- [packages/providers/src/media-fetcher.test.ts](<E:/AI工作台1.2/packages/providers/src/media-fetcher.test.ts>)
- [packages/providers/src/minio-storage.test.ts](<E:/AI工作台1.2/packages/providers/src/minio-storage.test.ts>)
- [packages/providers/src/mocks.test.ts](<E:/AI工作台1.2/packages/providers/src/mocks.test.ts>)
- [packages/providers/src/openai-compatible/provider.test.ts](<E:/AI工作台1.2/packages/providers/src/openai-compatible/provider.test.ts>)
- [packages/providers/src/pdf-text.test.ts](<E:/AI工作台1.2/packages/providers/src/pdf-text.test.ts>)
- [packages/providers/src/provider-fetch-review.test.ts](<E:/AI工作台1.2/packages/providers/src/provider-fetch-review.test.ts>)
- [packages/providers/src/redfox/client.test.ts](<E:/AI工作台1.2/packages/providers/src/redfox/client.test.ts>)
- [packages/providers/src/redfox/discovery-adapters.test.ts](<E:/AI工作台1.2/packages/providers/src/redfox/discovery-adapters.test.ts>)
- [packages/providers/src/redfox/discovery-normalize.test.ts](<E:/AI工作台1.2/packages/providers/src/redfox/discovery-normalize.test.ts>)
- [packages/providers/src/redfox/platform.test.ts](<E:/AI工作台1.2/packages/providers/src/redfox/platform.test.ts>)
- [packages/providers/src/redfox/trend-normalize.test.ts](<E:/AI工作台1.2/packages/providers/src/redfox/trend-normalize.test.ts>)
- [packages/providers/src/redfox/trend-provider.test.ts](<E:/AI工作台1.2/packages/providers/src/redfox/trend-provider.test.ts>)
- [packages/providers/src/render-media-relay.test.ts](<E:/AI工作台1.2/packages/providers/src/render-media-relay.test.ts>)
- [packages/providers/src/review-policy.test.ts](<E:/AI工作台1.2/packages/providers/src/review-policy.test.ts>)
- [packages/providers/src/s3-compatible-storage.test.ts](<E:/AI工作台1.2/packages/providers/src/s3-compatible-storage.test.ts>)
- [packages/providers/src/safe-url.test.ts](<E:/AI工作台1.2/packages/providers/src/safe-url.test.ts>)
- [packages/providers/src/source-external-metadata.test.ts](<E:/AI工作台1.2/packages/providers/src/source-external-metadata.test.ts>)
- [packages/providers/src/source-index.test.ts](<E:/AI工作台1.2/packages/providers/src/source-index.test.ts>)
- [packages/providers/src/source-providers.test.ts](<E:/AI工作台1.2/packages/providers/src/source-providers.test.ts>)
- [packages/providers/src/storage-object-key.test.ts](<E:/AI工作台1.2/packages/providers/src/storage-object-key.test.ts>)
- [packages/providers/src/storage-path.test.ts](<E:/AI工作台1.2/packages/providers/src/storage-path.test.ts>)
- [scripts/check-client-boundaries.test.mjs](<E:/AI工作台1.2/scripts/check-client-boundaries.test.mjs>)
- [scripts/fusion-config.test.mjs](<E:/AI工作台1.2/scripts/fusion-config.test.mjs>)
- [scripts/local-profile.test.mjs](<E:/AI工作台1.2/scripts/local-profile.test.mjs>)
- [scripts/release-profile.test.mjs](<E:/AI工作台1.2/scripts/release-profile.test.mjs>)
- [services/local-asr/test_bounded_runtime.py](<E:/AI工作台1.2/services/local-asr/test_bounded_runtime.py>)
