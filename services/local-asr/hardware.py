from __future__ import annotations

import platform
import subprocess
from typing import Any

import psutil
import torch


def _cpu_name() -> str:
    if platform.system() == "Windows":
        try:
            return subprocess.check_output(
                ["powershell.exe", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name).Trim()"],
                text=True,
                timeout=5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            ).strip()
        except (OSError, subprocess.SubprocessError):
            pass
    return platform.processor() or platform.machine()


def _nvidia_memory() -> dict[str, int | None]:
    try:
        output = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=memory.total,memory.free",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        ).splitlines()[0]
        total, free = (int(value.strip()) for value in output.split(","))
        return {"vramTotalMb": total, "vramFreeMb": free}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return {"vramTotalMb": None, "vramFreeMb": None}


def hardware_capabilities() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    gpu = _nvidia_memory()
    cuda_available = bool(torch.cuda.is_available())
    return {
        "classification": "NVIDIA_CUDA_AVAILABLE" if cuda_available else "CPU_ONLY",
        "cpu": _cpu_name(),
        "logicalCpuCount": psutil.cpu_count(logical=True),
        "ramTotalMb": round(memory.total / 1024 / 1024),
        "ramAvailableMb": round(memory.available / 1024 / 1024),
        "gpu": torch.cuda.get_device_name(0) if cuda_available else None,
        "cudaAvailable": cuda_available,
        "cudaRuntime": torch.version.cuda,
        **gpu,
    }


def process_resources() -> dict[str, int | float | None]:
    process = psutil.Process()
    gpu = _nvidia_memory()
    return {
        "cpuPercent": process.cpu_percent(interval=0.1),
        "ramMb": round(process.memory_info().rss / 1024 / 1024),
        "vramFreeMb": gpu["vramFreeMb"],
    }
