from __future__ import annotations

import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

from hardware import hardware_capabilities, process_resources
from model_registry import MODEL_SPECS, ModelSpec, require_model


class LocalAsrRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class ModelRuntime:
    def __init__(self) -> None:
        self._models: dict[tuple[str, str], Any] = {}
        self._lock = threading.Lock()

    def model_statuses(self) -> list[dict[str, Any]]:
        hardware = hardware_capabilities()
        statuses = []
        for spec in MODEL_SPECS.values():
            loaded_devices = [device for key, device in self._models if key == spec.key]
            supported = spec.supports_cpu or (
                hardware["cudaAvailable"]
                and isinstance(hardware["vramTotalMb"], int)
                and hardware["vramTotalMb"] >= spec.minimum_vram_mb
            )
            statuses.append(
                {
                    "key": spec.key,
                    "label": spec.label,
                    "modelId": spec.model_id,
                    "installed": self._is_cached(spec),
                    "loaded": bool(loaded_devices),
                    "loadedDevices": loaded_devices,
                    "supported": supported,
                    "unavailableReason": None if supported else "UNSUPPORTED_HARDWARE",
                }
            )
        return statuses

    def install(self, model_key: str) -> dict[str, Any]:
        spec = self._spec(model_key)
        hardware = hardware_capabilities()
        if not spec.supports_cpu and (
            not hardware["cudaAvailable"]
            or not isinstance(hardware["vramTotalMb"], int)
            or hardware["vramTotalMb"] < spec.minimum_vram_mb
        ):
            raise LocalAsrRuntimeError(
                "LOCAL_ASR_UNSUPPORTED_HARDWARE",
                "当前设备没有可用的 CUDA 推理环境。",
            )
        try:
            from modelscope.hub.snapshot_download import snapshot_download

            snapshot_download(spec.model_id)
            for dependency in spec.dependencies:
                snapshot_download(dependency)
            return {"model": spec.key, "status": "INSTALLED"}
        except Exception as error:
            raise LocalAsrRuntimeError(
                "LOCAL_ASR_MODEL_LOAD_FAILED",
                f"模型下载或初始化失败：{type(error).__name__}",
            ) from error

    def transcribe(
        self,
        audio_path: Path,
        model_key: str,
        device: str,
        language: str,
        hotwords: list[str],
    ) -> dict[str, Any]:
        spec = self._spec(model_key)
        normalized_device = self._validate_device(spec, device)
        if not self._is_cached(spec):
            raise LocalAsrRuntimeError(
                "LOCAL_ASR_MODEL_NOT_INSTALLED",
                "所选本地语音模型尚未安装。",
            )
        model = self._load(spec, normalized_device)
        started = time.perf_counter()
        try:
            kwargs: dict[str, Any] = {
                "input": str(audio_path),
                "cache": {},
                "batch_size_s": 60,
                "merge_vad": True,
                "merge_length_s": 15,
            }
            if language and language != "auto":
                kwargs["language"] = language
            if hotwords:
                kwargs["hotword"] = " ".join(hotwords)
            result = model.generate(**kwargs)
        except Exception as error:
            raise LocalAsrRuntimeError(
                "LOCAL_ASR_TRANSCRIPTION_FAILED",
                f"本地模型推理失败：{type(error).__name__}",
            ) from error
        processing_ms = round((time.perf_counter() - started) * 1_000)
        if not isinstance(result, list) or not result or not isinstance(result[0], dict):
            raise LocalAsrRuntimeError("LOCAL_ASR_INVALID_RESPONSE", "本地模型返回结构无效。")
        item = result[0]
        text = self._clean_text(str(item.get("text", "")))
        if not text:
            raise LocalAsrRuntimeError("LOCAL_ASR_INVALID_RESPONSE", "本地模型没有返回可用文本。")
        return {
            "language": self._language(item.get("language"), language),
            "durationMs": self._duration_ms(audio_path),
            "fullText": text,
            "segments": self._segments(item),
            "model": spec.key,
            "modelLabel": spec.label,
            "device": normalized_device,
            "processingMs": processing_ms,
            "resources": process_resources(),
        }

    def _load(self, spec: ModelSpec, device: str) -> Any:
        cache_key = (spec.key, device)
        if cache_key in self._models:
            return self._models[cache_key]
        with self._lock:
            if cache_key in self._models:
                return self._models[cache_key]
            try:
                common = {
                    "device": "cuda:0" if device == "CUDA" else "cpu",
                    "disable_update": True,
                    "vad_model": "fsmn-vad",
                    "vad_kwargs": {"max_single_segment_time": 30000},
                }
                if spec.key == "PARAFORMER_ZH":
                    model = AutoModel(model=spec.model_id, punc_model="ct-punc", **common)
                elif spec.key == "FUN_ASR_NANO":
                    model = AutoModel(
                        model=spec.model_id,
                        trust_remote_code=True,
                        hub="ms",
                        **common,
                    )
                else:
                    model = AutoModel(model=spec.model_id, **common)
            except Exception as error:
                raise LocalAsrRuntimeError(
                    "LOCAL_ASR_MODEL_LOAD_FAILED",
                    f"模型加载失败：{type(error).__name__}",
                ) from error
            self._models[cache_key] = model
            return model

    @staticmethod
    def _segments(item: dict[str, Any]) -> list[dict[str, Any]]:
        raw_segments = item.get("sentence_info")
        if not isinstance(raw_segments, list):
            return []
        segments = []
        for raw in raw_segments:
            if not isinstance(raw, dict):
                continue
            start = raw.get("start")
            end = raw.get("end")
            text = ModelRuntime._clean_text(str(raw.get("text", "")))
            if isinstance(start, (int, float)) and isinstance(end, (int, float)) and end >= start and text:
                segments.append({"startMs": round(start), "endMs": round(end), "text": text})
        return segments

    @staticmethod
    def _clean_text(text: str) -> str:
        try:
            cleaned = rich_transcription_postprocess(text)
        except Exception:
            cleaned = text
        return re.sub(r"<\|[^|]+\|>", "", cleaned).strip()

    @staticmethod
    def _language(detected: Any, requested: str) -> str:
        if isinstance(detected, str) and detected.strip():
            return detected.strip()
        return "zh" if requested in {"auto", "zh", "中文", ""} else requested

    @staticmethod
    def _duration_ms(audio_path: Path) -> int:
        try:
            output = subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(audio_path),
                ],
                text=True,
                timeout=30,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return round(float(output.strip()) * 1_000)
        except (OSError, subprocess.SubprocessError, ValueError):
            return 0

    @staticmethod
    def _validate_device(spec: ModelSpec, device: str) -> str:
        normalized = device.strip().upper()
        hardware = hardware_capabilities()
        if normalized == "CUDA":
            if not hardware["cudaAvailable"]:
                raise LocalAsrRuntimeError("LOCAL_ASR_UNSUPPORTED_HARDWARE", "CUDA 推理环境不可用。")
            if not isinstance(hardware["vramTotalMb"], int) or hardware["vramTotalMb"] < spec.minimum_vram_mb:
                raise LocalAsrRuntimeError("LOCAL_ASR_UNSUPPORTED_HARDWARE", "显卡总显存不足。")
            return "CUDA"
        if normalized == "CPU" and spec.supports_cpu:
            return "CPU"
        raise LocalAsrRuntimeError("LOCAL_ASR_UNSUPPORTED_HARDWARE", "所选模型不支持当前运行设备。")

    @staticmethod
    def _spec(model_key: str) -> ModelSpec:
        try:
            return require_model(model_key)
        except KeyError as error:
            raise LocalAsrRuntimeError("LOCAL_ASR_MODEL_NOT_INSTALLED", "未知的本地语音模型。") from error

    @staticmethod
    def _is_cached(spec: ModelSpec) -> bool:
        try:
            from modelscope.hub.snapshot_download import snapshot_download

            snapshot_download(spec.model_id, local_files_only=True)
            for dependency in spec.dependencies:
                snapshot_download(dependency, local_files_only=True)
            return True
        except Exception:
            return False
