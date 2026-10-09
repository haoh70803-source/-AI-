from __future__ import annotations

import asyncio
import multiprocessing
import time
from pathlib import Path
from typing import Callable


class BoundedRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def inference_worker(connection):
    # Keep model caching in a reusable process that can actually be terminated.
    from runtime import ModelRuntime, LocalAsrRuntimeError
    runtime = ModelRuntime()
    try:
        while True:
            arguments = connection.recv()
            try:
                result = runtime.transcribe(Path(arguments[0]), *arguments[1:])
                connection.send((True, result, runtime.model_statuses()))
            except LocalAsrRuntimeError as error:
                connection.send((False, (error.code, str(error))))
            except Exception:
                connection.send((False, ("LOCAL_ASR_TRANSCRIPTION_FAILED", "本地转录失败，请重试。")))
    except (EOFError, BrokenPipeError):
        pass
    finally:
        connection.close()


class BoundedModelRuntime:
    def __init__(self, timeout_seconds=450, target=inference_worker):
        self.timeout_seconds = timeout_seconds
        self.target = target
        self.context = multiprocessing.get_context("spawn")
        self.lock = asyncio.Lock()
        self.process = None
        self.connection = None
        self.loaded_models = []

    def close(self):
        if self.process:
            if self.process.is_alive():
                self.process.terminate()
            self.process.join(timeout=2)
            if self.process.is_alive():
                self.process.kill()
                self.process.join(timeout=2)
            self.process.close()
        if self.connection:
            self.connection.close()
        self.process = None
        self.connection = None
        self.loaded_models = []

    async def transcribe(self, arguments, disconnected: Callable):
        if self.lock.locked():
            raise BoundedRuntimeError("LOCAL_ASR_TRANSCRIPTION_FAILED", "已有转录任务正在处理，请稍后重试。")
        async with self.lock:
            try:
                if not self.process or not self.process.is_alive():
                    self.close()
                    parent, child = self.context.Pipe()
                    self.process = self.context.Process(target=self.target, args=(child,), daemon=True)
                    self.process.start()
                    child.close()
                    self.connection = parent
                self.connection.send(arguments)
                deadline = time.monotonic() + self.timeout_seconds
                while True:
                    if await disconnected():
                        raise BoundedRuntimeError("LOCAL_ASR_TIMEOUT", "请求已取消，转录进程已停止。")
                    if time.monotonic() >= deadline:
                        raise BoundedRuntimeError("LOCAL_ASR_TIMEOUT", "转录时间过长，进程已停止，请重试。")
                    if self.connection.poll():
                        response = self.connection.recv()
                        success, result = response[:2]
                        if not success:
                            raise BoundedRuntimeError(*result)
                        self.loaded_models = response[2] if len(response) > 2 else []
                        return result
                    if not self.process.is_alive():
                        raise BoundedRuntimeError("LOCAL_ASR_TRANSCRIPTION_FAILED", "转录进程中断，请重试。")
                    await asyncio.sleep(0.05)
            except BaseException:
                self.close()
                raise
