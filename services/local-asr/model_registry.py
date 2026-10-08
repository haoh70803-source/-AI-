from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelSpec:
    key: str
    label: str
    model_id: str
    minimum_vram_mb: int
    supports_cpu: bool
    dependencies: tuple[str, ...]


MODEL_SPECS = {
    "SENSEVOICE_SMALL": ModelSpec(
        key="SENSEVOICE_SMALL",
        label="SenseVoiceSmall",
        model_id="iic/SenseVoiceSmall",
        minimum_vram_mb=0,
        supports_cpu=True,
        dependencies=("iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",),
    ),
    "PARAFORMER_ZH": ModelSpec(
        key="PARAFORMER_ZH",
        label="Paraformer",
        model_id="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        minimum_vram_mb=0,
        supports_cpu=True,
        dependencies=(
            "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
            "iic/punc_ct-transformer_cn-en-common-vocab471067-large",
        ),
    ),
    "FUN_ASR_NANO": ModelSpec(
        key="FUN_ASR_NANO",
        label="Fun-ASR-Nano",
        model_id="FunAudioLLM/Fun-ASR-Nano-2512",
        minimum_vram_mb=6_000,
        supports_cpu=False,
        dependencies=("iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",),
    ),
}


def require_model(model_key: str) -> ModelSpec:
    normalized = model_key.strip().upper()
    if normalized not in MODEL_SPECS:
        raise KeyError(normalized)
    return MODEL_SPECS[normalized]
