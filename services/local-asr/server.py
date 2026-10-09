from __future__ import annotations

import atexit
import json
import os
import tempfile
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request

from hardware import hardware_capabilities
from bounded_runtime import BoundedModelRuntime, BoundedRuntimeError
from runtime import LocalAsrRuntimeError, ModelRuntime


HOST = os.environ.get("LOCAL_ASR_HOST", "127.0.0.1")
PORT = int(os.environ.get("LOCAL_ASR_PORT", "8765"))
MAX_UPLOAD_BYTES = int(os.environ.get("LOCAL_ASR_MAX_UPLOAD_BYTES", str(512 * 1024 * 1024)))

if HOST not in {"127.0.0.1", "localhost", "::1"}:
    raise RuntimeError("LOCAL_ASR_HOST must be a loopback address")

app = FastAPI(title="AI Content Center Local ASR", version="1.0.0")
runtime = ModelRuntime()
inference = BoundedModelRuntime()
atexit.register(inference.close)


def http_error(error: LocalAsrRuntimeError) -> HTTPException:
    status = 409 if error.code in {
        "LOCAL_ASR_MODEL_NOT_INSTALLED",
        "LOCAL_ASR_UNSUPPORTED_HARDWARE",
    } else 500
    return HTTPException(status_code=status, detail={"code": error.code, "message": str(error)})


def model_statuses():
    statuses = runtime.model_statuses()
    cached = {item["key"]: item.get("loadedDevices", []) for item in inference.loaded_models} if inference.process and inference.process.is_alive() else {}
    for item in statuses:
        item["loadedDevices"] = cached.get(item["key"], [])
        item["loaded"] = bool(item["loadedDevices"])
    return statuses


@app.get("/health")
def health() -> dict:
    return {
        "status": "NORMAL",
        "service": "LOCAL_FUNASR",
        "hardware": hardware_capabilities(),
        "models": model_statuses(),
    }


@app.get("/models")
def models() -> dict:
    return {"models": model_statuses()}


@app.post("/models/{model_key}/install")
def install_model(model_key: str) -> dict:
    try:
        return runtime.install(model_key)
    except LocalAsrRuntimeError as error:
        raise http_error(error) from error


@app.post("/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form(...),
    device: str = Form(...),
    language: str = Form("auto"),
    hotwords: str = Form("[]"),
    speakerDiarization: bool = Form(False),
) -> dict:
    if speakerDiarization:
        raise HTTPException(
            status_code=400,
            detail={"code": "LOCAL_ASR_INVALID_RESPONSE", "message": "V1 暂未启用说话人分离。"},
        )
    try:
        parsed_hotwords = json.loads(hotwords)
        if not isinstance(parsed_hotwords, list) or any(not isinstance(item, str) for item in parsed_hotwords):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=400, detail={"code": "INVALID_HOTWORDS", "message": "热词格式无效。"})

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="content-center-asr-", suffix=suffix, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            total = 0
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail={"code": "LOCAL_ASR_AUDIO_TOO_LARGE", "message": "音频超过本地服务限制。"})
                temporary.write(chunk)
        return await inference.transcribe((str(temporary_path), model, device, language, parsed_hotwords), request.is_disconnected)
    except (LocalAsrRuntimeError, BoundedRuntimeError) as error:
        raise http_error(error) from error
    finally:
        await file.close()
        if temporary_path:
            temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")

