# 鑫世界 Dual Experience 原型

第一轮独立静态原型，不覆盖正式页面、不调用 API。依赖仅使用 Node 和仓库已有的 Playwright，未修改 package.json 或 lockfile。

从仓库根目录运行：

```powershell
node prototypes/dual-experience/server.mjs
```

服务只监听本机 `127.0.0.1:4178`。

| 页面 | Dark Studio | Light Edition |
| --- | --- | --- |
| 首页 | http://127.0.0.1:4178/?theme=dark#home | http://127.0.0.1:4178/?theme=light#home |
| AI 创作 | http://127.0.0.1:4178/?theme=dark#studio | http://127.0.0.1:4178/?theme=light#studio |
| 内容中心 | http://127.0.0.1:4178/?theme=dark#content | http://127.0.0.1:4178/?theme=light#content |
| 数据中台 · 总览 | http://127.0.0.1:4178/?theme=dark#analytics/overview | http://127.0.0.1:4178/?theme=light#analytics/overview |
| 数据中台 · 行为分析 | http://127.0.0.1:4178/?theme=dark#analytics/audience | http://127.0.0.1:4178/?theme=light#analytics/audience |

完整交付总览与截图：http://127.0.0.1:4178/review.html 。支持顶部实时切换主题。

主题保存键：`xinworld.prototype.theme`，不会改动正式系统 `xin-world.appearance`。项目、收藏、输入和显式保存文稿均使用 `xinworld.prototype.*` 前缀，不读写生产数据。文稿、上下文和对话为共享演示模板，不代表真实项目隔离；没有调用 AI 服务。

验证与截图：

```powershell
node prototypes/dual-experience/verify.mjs
```

脚本使用当前 Playwright 浏览器；若默认浏览器路径缺失，可指定已经安装的 Chromium（不自动下载）：

```powershell
$env:DUAL_EXPERIENCE_CHROMIUM='你的 Chromium chrome.exe 绝对路径'
node prototypes/dual-experience/verify.mjs
```

该机器最终验证使用 `E:/agent 开发环境/aegnt开发/06-数据/playwright-browsers/chromium-1243/chrome-win64/chrome.exe`。

当前参考图细化轮的 43 项定向检查结果见 [VERIFICATION.json](VERIFICATION.json)。截图为 10 张桌面、10 张手机、2 张手机成果面板，共 22 张，均位于 [screenshots](screenshots/)。手机长截图采集时临时把底部导航移动到整张画面底部，页面实际使用固定导航。

设计规范：[DESIGN-SPEC.md](DESIGN-SPEC.md)。前端骨架与功能设计：[FRONTEND-DESIGN.md](FRONTEND-DESIGN.md)。审计与改造报告：[AUDIT-REPORT.md](AUDIT-REPORT.md)。素材来源：[assets/ASSETS.md](assets/ASSETS.md)。

数据中台保留用户图三、图四的两种布局，分别为数据总览与行为分析；每种布局都支持双主题，主题切换不改变图表位置。所有统计值、来源、设备、留存及活跃信息都是固定样例，未连接采集、用户分析或实时服务。部分范围切换只改变演示趋势与总览数值，完整统一统计查询尚未实现。

重启或更换端口：设置 `DUAL_EXPERIENCE_PORT` 后运行 server.mjs；验证脚本默认检查 4178。结束服务使用对应终端 Ctrl+C。

## 后端对应后的设计预览
研究：<http://127.0.0.1:4178/?theme=light#research>。
本轮26张完整截图、34项浏览器检查；运行 verify-backend.mjs，结果见 VERIFICATION-BACKEND.json。旧 verify.mjs/VERIFICATION.json 保留为上轮基线，部分旧断言不适用于新的业务标签。
新增研究衔接、引用范围、多技能、版本结构展示；数据为账号运营字段演示，未接入正式接口。详见 FRONTEND-DESIGN.md 第9节。

## 最新：接口核对与视频拆解
运行入口：#teardown（拆解链路）、#settings（设置）、#capabilities（功能接口地图）。
历史检查：verify-coverage.mjs，55项通过、44张截图，VERIFICATION-COVERAGE.json。当前结果见下方数据适配交付。
接口逐项报告：API-COVERAGE.md；机器清单：API-INVENTORY.json；缺口契约：API-GAP-DESIGN.md。
196个路由文件、282个HTTP入口静态登记；571个server函数仅直接调用核对，不是生产运行验收。所有新页面均演示，不调用API；视频封面不是可播放视频。

## 当前交付：保留 UI 的数据适配设计

补充方案：<http://127.0.0.1:4178/?theme=light#analytics/audience>。
现有能力：<http://127.0.0.1:4178/?theme=light&capability=current#analytics/audience>。
完整截图：<http://127.0.0.1:4178/review.html>。

当前定向验证运行 verify-adaptation.mjs，66 项通过、48 张完整截图，结果为 VERIFICATION-ADAPTATION.json；其他验证文件保留为历史结果。所有数据仍为契约样例，无正式 API 请求。前述范围切换的演示算法已替换：已有运营指标、趋势、排名、平台占比和互动构成都从同组 900 条日度样例记录计算，今日指标与周期汇总分开；缺失值保留为空。

小时热力图、留存和设备统计依赖补充采集来源。补充方案展示标记过的视觉样例，现有能力展示原位置的待接入状态。详细字段、聚合口径、可用状态、权限边界与扩展接口草案见 ANALYTICS-ADAPTATION.md。只补充设计与独立原型，未实施正式后端。
