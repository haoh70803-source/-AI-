from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
from pathlib import Path

import psutil
from rapidfuzz.distance import Levenshtein

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from hardware import hardware_capabilities, process_resources
from runtime import ModelRuntime


ROOT = Path(__file__).resolve().parent
PUNCTUATION = "，。！？；：,.!?;:"


def normalized(text: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]", "", text).lower()


def cer(reference: str, hypothesis: str) -> float:
    expected = normalized(reference)
    actual = normalized(hypothesis)
    return Levenshtein.distance(expected, actual) / max(1, len(expected))


def punctuation_score(reference: str, hypothesis: str) -> float:
    expected = sum(reference.count(mark) for mark in PUNCTUATION)
    actual = sum(hypothesis.count(mark) for mark in PUNCTUATION)
    return min(1.0, actual / max(1, expected))


class ResourceSampler:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.process = psutil.Process()
        self.peak_ram_mb = 0
        self.peak_cpu_percent = 0.0
        self.lowest_vram_free_mb: int | None = None
        self.thread = threading.Thread(target=self._sample, daemon=True)

    def _sample(self) -> None:
        self.process.cpu_percent(None)
        while not self.stop_event.wait(0.2):
            self.peak_ram_mb = max(self.peak_ram_mb, round(self.process.memory_info().rss / 1024 / 1024))
            self.peak_cpu_percent = max(self.peak_cpu_percent, self.process.cpu_percent(None))
            free = process_resources().get("vramFreeMb")
            if isinstance(free, int):
                self.lowest_vram_free_mb = free if self.lowest_vram_free_mb is None else min(self.lowest_vram_free_mb, free)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.stop_event.set()
        self.thread.join(timeout=2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    fixtures = json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
    hardware = hardware_capabilities()
    initial_vram_free = hardware.get("vramFreeMb")
    runtime = ModelRuntime()
    results = []
    model_started = time.perf_counter()
    with ResourceSampler() as resources:
        for fixture in fixtures:
            result = runtime.transcribe(
                ROOT / "audio" / f"{fixture['id']}.wav",
                args.model,
                args.device,
                "auto",
                fixture.get("expectedTerms", []),
            )
            reference = fixture["text"]
            hypothesis = result["fullText"]
            term_hits = sum(normalized(term) in normalized(hypothesis) for term in fixture.get("expectedTerms", []))
            term_count = len(fixture.get("expectedTerms", []))
            results.append({
                "id": fixture["id"],
                "category": fixture["category"],
                "reference": reference,
                "hypothesis": hypothesis,
                "cer": round(cer(reference, hypothesis), 4),
                "termAccuracy": round(term_hits / max(1, term_count), 4),
                "punctuationScore": round(punctuation_score(reference, hypothesis), 4),
                "timestampSegments": len(result["segments"]),
                "timestampAvailable": len(result["segments"]) > 0,
                "durationMs": result["durationMs"],
                "processingMs": result["processingMs"],
                "realtimeFactor": round(result["processingMs"] / max(1, result["durationMs"]), 4),
            })
    final = {
        "model": args.model,
        "device": args.device.upper(),
        "status": "PASS",
        "modelLoadAndRunMs": round((time.perf_counter() - model_started) * 1000),
        "averageCer": round(sum(item["cer"] for item in results) / len(results), 4),
        "averageTermAccuracy": round(sum(item["termAccuracy"] for item in results) / len(results), 4),
        "averagePunctuationScore": round(sum(item["punctuationScore"] for item in results) / len(results), 4),
        "timestampCoverage": round(sum(item["timestampAvailable"] for item in results) / len(results), 4),
        "averageRealtimeFactor": round(sum(item["realtimeFactor"] for item in results) / len(results), 4),
        "peakCpuPercent": round(resources.peak_cpu_percent, 1),
        "peakRamMb": resources.peak_ram_mb,
        "peakVramMb": max(0, initial_vram_free - resources.lowest_vram_free_mb) if isinstance(initial_vram_free, int) and isinstance(resources.lowest_vram_free_mb, int) else None,
        "fixtures": results,
    }
    Path(args.output).write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in final.items() if key != "fixtures"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
