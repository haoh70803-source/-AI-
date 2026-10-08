from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from hardware import hardware_capabilities


BENCHMARK_ROOT = Path(__file__).resolve().parent
RESULTS_ROOT = BENCHMARK_ROOT / "results"
MODELS = ("SENSEVOICE_SMALL", "PARAFORMER_ZH", "FUN_ASR_NANO")


def failed_result(model: str, device: str, error: subprocess.CalledProcessError) -> dict:
    return {
        "model": model,
        "device": device,
        "status": "FAIL",
        "error": (error.stderr or error.stdout or str(error))[-4_000:],
    }


def balanced_selection(results: list[dict]) -> dict:
    fastest = min(item["averageRealtimeFactor"] for item in results)
    best_cer = min(item["averageCer"] for item in results)
    def score(item: dict) -> float:
        speed = item["averageRealtimeFactor"] / max(0.0001, fastest)
        accuracy = item["averageCer"] / max(0.0001, best_cer)
        return 0.55 * accuracy + 0.45 * speed
    return min(results, key=score)


def selection(item: dict, reason: str) -> dict:
    return {"model": item["model"], "device": item["device"], "reason": reason}


def write_profile(hardware: dict, results: list[dict]) -> None:
    passed = [item for item in results if item["status"] == "PASS"]
    if not passed:
        raise RuntimeError("No local ASR model completed the benchmark")
    fast = min(passed, key=lambda item: item["averageRealtimeFactor"])
    quality = min(passed, key=lambda item: (item["averageCer"], -item["averageTermAccuracy"]))
    balanced = balanced_selection(passed)
    profile = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "machine": hardware,
        "benchmark": {
            "fixtureCount": 7,
            "fixtureSource": "Project-authored text synthesized with Microsoft Edge TTS; regional-accent case is synthetic, not a natural dialect corpus.",
            "results": results,
        },
        "FAST": selection(fast, "当前机器实测平均实时因子最低。"),
        "BALANCED": selection(balanced, "当前机器实测字符错误率与处理速度综合得分最佳。"),
        "QUALITY": selection(quality, "当前机器实测字符错误率最低，专有词命中率作为次级排序。"),
    }
    (SERVICE_ROOT / "model-profile.json").write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"FAST": profile["FAST"], "BALANCED": profile["BALANCED"], "QUALITY": profile["QUALITY"]}, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile-only", action="store_true", help="rebuild the profile from completed raw result files")
    args = parser.parse_args()
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    hardware = hardware_capabilities()
    device = "CUDA" if hardware["cudaAvailable"] else "CPU"
    results = []
    for model in MODELS:
        output = RESULTS_ROOT / f"{model.lower()}.json"
        if args.profile_only:
            if not output.exists():
                raise RuntimeError(f"Missing benchmark result: {output}")
            results.append(json.loads(output.read_text(encoding="utf-8")))
            continue
        if model == "FUN_ASR_NANO" and not hardware["cudaAvailable"]:
            results.append({"model": model, "device": "CUDA", "status": "NOT_TESTED_HARDWARE_LIMIT", "error": "CUDA unavailable"})
            continue
        try:
            subprocess.run(
                [sys.executable, str(BENCHMARK_ROOT / "benchmark_model.py"), "--model", model, "--device", device, "--output", str(output)],
                cwd=SERVICE_ROOT,
                check=True,
                text=True,
                capture_output=False,
            )
            results.append(json.loads(output.read_text(encoding="utf-8")))
        except subprocess.CalledProcessError as error:
            results.append(failed_result(model, device, error))
    write_profile(hardware, results)


if __name__ == "__main__":
    main()
