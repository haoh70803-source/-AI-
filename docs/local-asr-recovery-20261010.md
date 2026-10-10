# 本地语音输入恢复记录（2026-10-10）

## 原因及修改边界

语音按钮在录音前请求 `/api/voice-input` 检查工作空间的转写能力。本机 `127.0.0.1:8765` 没有监听服务，项目 `services/local-asr/.venv` 不存在，导致服务连接被拒绝并返回“本地语音识别服务未启动”。对话模型选择与独立 ASR 服务无关。

本次恢复项目专用 Python 环境，安装现有固定依赖，下载默认均衡/速度优先所需的 SenseVoiceSmall 和 VAD 模型。已有 FFmpeg 9.0.2 可复用。未修改语音鉴权、工作空间数据政策、数据库或云端备用配置。

新增 `scripts/start-local-asr.ps1`：本机后台启动、已有服务检查、端口占用检查、就绪检测、日志输出；复用当前项目媒体工具，不修改系统 PATH。不会自动下载模型、安装依赖或注册系统开机任务。服务关闭或机器重启后需再次执行该脚本。

实际首次加载超过 60 秒，原启动等待时限不够；改为 180 秒，并在进程已存在但尚未监听时复用该进程，避免重复启动。实际健康响应可能超过 3 秒，检查等待改为 15 秒。上述问题均在本次实际启动和重复启动验证中发现并修复，没有把失败记录计为通过。

## 安装记录

当前已有 Python 为 3.12.13，使用独立 venv，不向系统 Python 安装包。

```powershell
uv venv --python python services/local-asr/.venv
uv pip install --python services/local-asr/.venv/Scripts/python.exe --index-url https://pypi.org/simple --index-strategy unsafe-best-match -r services/local-asr/requirements.txt
```

首次直接使用 uv 默认优先索引策略时失败：PyTorch 索引中的旧 certifi 不满足 edge-tts 要求。改用官方 PyPI + 官方 PyTorch 索引的 best-match 参数，保留原有依赖版本，不修改 requirements.txt。

模型通过 ModelScope 的标准 snapshot_download 下载到用户缓存；无云端识别请求。临时下载辅助包位于忽略的 `output/local-asr/download-tools`，不属于第二套语音服务。

## 验证记录

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| Python 进程复用、超时、取消和重试 | PASS，4 项 | `python -m unittest discover -s services/local-asr -p test_bounded_runtime.py` |
| 后台脚本 PowerShell 语法 | PASS | PowerShell Parser，无错误 |
| 语音 API 与本地客户端回归 | PASS，11 项（Mock） | 隔离 LOCAL_TEST；`output/local-asr/api-tests.json` |
| 服务启动与健康检查 | PASS | `/health` 返回 NORMAL / LOCAL_FUNASR；监听进程 PID 25488 |
| 重复启动保持原服务 | PASS（修复等待时限后） | 输出 existing service；监听 PID 仍为 25488 |
| 中文 MP3 真实模型识别 | PASS，CUDA / SENSEVOICE_SMALL | `output/local-asr/transcription-evidence.json` |
| 用户实际浏览器麦克风录音 | NOT RUN | 需用户设备实际录音验证 |
| 云端 ASR | NOT RUN | 本次不调用付费服务 |
| Web/Worker 类型检查 | NOT RUN | 未修改 TypeScript |

真实识别使用项目已有 `normal_zh.wav` 合成中文样本，转换为与 Web 录音处理链一致的单声道 16kHz MP3。检查输出非空，并保留“零散素材”“内容项目”。它可以证明当前模型加载与本地识别路径可用，不能替代真实麦克风、噪声或方言验收。

实际识别正文：“今天我们来聊一聊如何把零散素材整理成清晰可靠的内容项目”。音频时长 6528ms，模型推理 1134ms，首次请求总耗时约 26.61 秒（包含识别子进程冷启动）。当前硬件为 RTX 5060 Ti / 16GB，CUDA 可用；这些结果来自本次运行，未复用旧 benchmark。安装版本为 Python 3.12.13、torch/torchaudio 2.11.0+cu130、FunASR 1.4.12。

接口定向测试命令：

```powershell
node output/v4/run-local-test.mjs run apps/web/tests/voice-input-api.test.ts packages/providers/src/local-asr/client.test.ts --no-file-parallelism --reporter=json --outputFile=output/local-asr/api-tests.json
services/local-asr/.venv/Scripts/python.exe -u output/local-asr/verify-transcription.py
```

## 后续启动

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-asr.ps1
```

日志及本次转写证据保存在 `output/local-asr/`。本次只恢复默认模型；质量优先所用的 Fun-ASR-Nano 尚未安装或验收。未提交、暂存或推送 Git 改动。
