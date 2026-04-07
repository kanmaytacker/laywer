from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
from datetime import datetime

from .job_runner import mark_job_completed, mark_job_failed, mark_job_running, run_job
from .supabase_data import rest_select


def _log(event: str, **kwargs) -> None:
    payload = {
        "ts": datetime.utcnow().isoformat(),
        "event": event,
        **kwargs,
    }
    print(json.dumps(payload, ensure_ascii=True), flush=True)


async def worker_loop(poll_seconds: float = 2.0) -> None:
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    _log("worker.start", worker_id=worker_id, poll_seconds=poll_seconds)
    while True:
        try:
            queued = await rest_select("jobs", "status=eq.queued&select=*&order=created_at.asc&limit=5")
            if not queued:
                await asyncio.sleep(poll_seconds)
                continue

            for job in queued:
                job_id = job.get("id")
                if not job_id:
                    continue
                claimed = await mark_job_running(job_id, worker_id)
                if not claimed:
                    continue
                _log("job.running", worker_id=worker_id, job_id=job_id, job_type=claimed.get("job_type"))
                try:
                    result = await run_job(claimed)
                    await mark_job_completed(job_id, result)
                    _log("job.completed", worker_id=worker_id, job_id=job_id, result=result)
                except Exception as exc:
                    await mark_job_failed(claimed, str(exc))
                    _log("job.failed", worker_id=worker_id, job_id=job_id, error=str(exc))
        except Exception as exc:
            _log("worker.error", worker_id=worker_id, error=str(exc))
            await asyncio.sleep(max(2.0, poll_seconds))


def main() -> None:
    parser = argparse.ArgumentParser(description="MatterDesk async worker")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args()
    asyncio.run(worker_loop(poll_seconds=args.poll_seconds))


if __name__ == "__main__":
    main()
