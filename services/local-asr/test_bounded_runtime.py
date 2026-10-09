import asyncio
import time
import unittest
from bounded_runtime import BoundedModelRuntime, BoundedRuntimeError


def echo_worker(connection):
    while True:
        arguments = connection.recv()
        if arguments[0] == "hang":
            time.sleep(30)
        connection.send((True, {"text": arguments[0]}))


async def connected():
    return False


class BoundedRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_reuses_process_for_success(self):
        runtime = BoundedModelRuntime(3, echo_worker)
        try:
            self.assertEqual(await runtime.transcribe(("one",), connected), {"text": "one"})
            pid = runtime.process.pid
            self.assertEqual(await runtime.transcribe(("two",), connected), {"text": "two"})
            self.assertEqual(runtime.process.pid, pid)
        finally:
            runtime.close()

    async def test_timeout_terminates_process_and_allows_retry(self):
        runtime = BoundedModelRuntime(0.3, echo_worker)
        with self.assertRaises(BoundedRuntimeError) as result:
            await runtime.transcribe(("hang",), connected)
        self.assertEqual(result.exception.code, "LOCAL_ASR_TIMEOUT")
        self.assertIsNone(runtime.process)
        runtime.timeout_seconds = 3
        try:
            self.assertEqual(await runtime.transcribe(("retry",), connected), {"text": "retry"})
        finally:
            runtime.close()

    async def test_disconnect_stops_inference(self):
        async def disconnected():
            return True
        runtime = BoundedModelRuntime(3, echo_worker)
        with self.assertRaises(BoundedRuntimeError):
            await runtime.transcribe(("hang",), disconnected)
        self.assertIsNone(runtime.process)

    async def test_health_loop_is_not_blocked_and_parallel_work_is_rejected(self):
        runtime = BoundedModelRuntime(0.5, echo_worker)
        task = asyncio.create_task(runtime.transcribe(("hang",), connected))
        await asyncio.sleep(0.05)
        with self.assertRaises(BoundedRuntimeError):
            await runtime.transcribe(("second",), connected)
        with self.assertRaises(BoundedRuntimeError):
            await task
        self.assertIsNone(runtime.process)
