# 本地语音转写

V1.1 在保留豆包云端 ASR 的同时，新增免费的本地 FunASR Provider。产品层只暴露稳定的质量目标：`FAST` 速度优先、`BALANCED` 均衡推荐、`QUALITY` 质量优先。具体模型由 `TranscriptionQualityResolver` 根据当前机器实测档案解析，不在 UI 中固定绑定。

## 运行边界

- Python 服务只监听 `127.0.0.1:8765`，不向局域网或公网开放。
- Worker 以 multipart 二进制把私有 Audio Asset 传给本地服务；不生成公网 URL，不使用 base64。
- 模型在首次转写时载入，之后常驻该本地服务进程。
- 本地调用记录 `ApiUsage.operation = TRANSCRIBE_LOCAL`、`cost = 0`，但仍记录时长、处理耗时和模型技术元数据。
- 当前说话人分离固定关闭。

## 安装

当前 Windows 验证环境使用 Python `3.11.9`。不要把依赖安装到系统 Python。

```powershell
py -3.11 -m venv services/local-asr/.venv
services\local-asr\.venv\Scripts\python.exe -m pip install -r services/local-asr/requirements.txt
pnpm asr:fixtures
pnpm asr:benchmark
```

PyTorch 使用官方 CUDA 13.0 wheel。无 NVIDIA CUDA 的机器可用 SenseVoiceSmall / Paraformer CPU 路径，Fun-ASR-Nano 只在硬件检测通过时开放。

模型由 ModelScope 下载到用户缓存，当前 Windows 默认位置是 `%USERPROFILE%\.cache\modelscope\models`；权重不进入 Git 仓库。管理员也可在「设置 → AI 与外部服务 → 语音转写 → 高级设置」初始化当前质量档所需模型。

## 启动与检查

```powershell
pnpm dev:asr
```

服务接口：

- `GET /health`：硬件、CUDA、模型安装/加载状态。
- `GET /models`：模型状态。
- `POST /models/{model}/install`：显式下载模型。
- `POST /transcribe`：受控的 multipart 音频转写。

```powershell
curl.exe -s http://127.0.0.1:8765/health
```

本地服务未启动、模型未安装、硬件不支持、加载失败、推理失败和超时都返回显式错误，不写入假 Transcript。

## 当前机器实测

生成时间：2026-09-02（完整原始结果见 [`services/local-asr/model-profile.json`](../services/local-asr/model-profile.json)）。

硬件：Intel Core i7-12700KF（20 logical CPUs）、31.8 GiB RAM、NVIDIA GeForce RTX 5060（8151 MiB VRAM）、PyTorch CUDA 13.0。实测时 D: 盘可用 196.24 GiB；系统 Python 为 3.14.6，独立 ASR 环境为 3.11.9，FFmpeg 为 9.0。

| 模型 | 状态 | 平均 CER | 专有词命中 | 标点得分 | 时间戳覆盖 | 平均实时因子 | 峰值 RAM | 峰值 VRAM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SenseVoiceSmall | PASS | 0.0281 | 0.9524 | 0.0000 | 0.0000 | 0.0337 | 3483 MiB | 1130 MiB |
| Paraformer | PASS | 0.0311 | 0.9762 | 0.9286 | 0.0000 | 0.0649 | 4403 MiB | 2246 MiB |
| Fun-ASR-Nano | PASS | 0.0243 | 0.9524 | 0.9286 | 0.0000 | 0.2188 | 7181 MiB | 3647 MiB |

当前缓存中的主 checkpoint 目录粗略大小：SenseVoiceSmall 896 MiB、Paraformer 953 MiB、Fun-ASR-Nano 2046 MiB；共享的 VAD/标点依赖另占空间。

测试集包含普通中文、轻微背景声、较快语速、中英混合、数字/金额、人名/专有词和合成地域口音。文本为项目自有，音频由 Edge TTS 生成；口音项是合成区域声线，不能代替真人方言语料。三模型本次都未在统一调用路径下产生分段时间戳，因此时间戳覆盖实测为 0，没有伪造数据。

当前 Resolver 策略：

- `FAST` → SenseVoiceSmall / CUDA：平均实时因子最低。
- `BALANCED` → SenseVoiceSmall / CUDA：字符错误率与速度综合得分最佳。
- `QUALITY` → Fun-ASR-Nano / CUDA：字符错误率最低。

这个映射只存在实测档案中，普通用户界面不显示它。

## 豆包备用

「本地失败时使用豆包备用」默认关闭。只有管理员显式开启且豆包凭证已配置时才允许 fallback，UI 会提示可能产生云端 API 费用。关闭时，本地失败必须显式失败，不会静默调用豆包。

## 已知边界

- 当前合成 benchmark 规模小，后续应用授权的真人方言、噪声、长音频数据复验。
- 时间戳覆盖为 0，需要独立验证 Fun-ASR-Nano CTC 时间戳路径；本阶段不伪装支持。
- `MOSS-Transcribe-Diarize` 长视频/多说话人候选、说话人分离和内容自动路由均未实现。
