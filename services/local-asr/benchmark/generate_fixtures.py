from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "fixtures.json"
OUTPUT = ROOT / "audio"


async def synthesize(fixture: dict) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    raw = OUTPUT / f"{fixture['id']}.mp3"
    wav = OUTPUT / f"{fixture['id']}.wav"
    await edge_tts.Communicate(
        fixture["text"],
        fixture["voice"],
        rate=fixture.get("rate", "+0%"),
    ).save(str(raw))
    if fixture.get("background"):
        subprocess.run(
            [
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                "-i", str(raw), "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=16000",
                "-filter_complex", "[1:a]volume=0.035[bg];[0:a][bg]amix=inputs=2:duration=first",
                "-ac", "1", "-ar", "16000", "-y", str(wav),
            ],
            check=True,
        )
    else:
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(raw), "-ac", "1", "-ar", "16000", "-y", str(wav)],
            check=True,
        )
    raw.unlink(missing_ok=True)


async def main() -> None:
    fixtures = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for fixture in fixtures:
        await synthesize(fixture)
    print(json.dumps({"generated": len(fixtures), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

