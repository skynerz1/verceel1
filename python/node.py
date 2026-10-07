"""
node.py — عُقدة سحب بالبايثون.
تشغيل:  python node.py        (مرة واحدة)
        python node.py loop   (حلقة دائمة)
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time

import httpx

PANEL = (os.getenv("NODE_PANEL_URL") or "").rstrip("/")
TOKEN = os.getenv("NODE_TOKEN") or ""
NAME = os.getenv("NODE_NAME") or "python-node"
BATCH = int(os.getenv("NODE_BATCH") or "50")
CONC = int(os.getenv("NODE_CONCURRENCY") or "8")
INTERVAL = int(os.getenv("NODE_INTERVAL") or "60")


async def call(client: httpx.AsyncClient, action: str, extra: dict | None = None, timeout: float = 45.0) -> dict:
    if not PANEL or not TOKEN:
        raise RuntimeError("NODE_PANEL_URL / NODE_TOKEN غير مضبوطين")
    r = await client.post(
        f"{PANEL}/api/node.php",
        json={"action": action, "token": TOKEN, "node": NAME, **(extra or {})},
        timeout=timeout,
    )
    data = r.json()
    if not r.is_success or data.get("ok") is False:
        raise RuntimeError(data.get("error") or f"HTTP {r.status_code}")
    return data


async def cycle() -> dict:
    t0 = time.time()
    sem = asyncio.Semaphore(CONC)
    handled = errors = 0

    async with httpx.AsyncClient(
        follow_redirects=True,
        verify=False,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ar,en-US;q=0.8,en;q=0.6",
        },
    ) as client:
        await call(client, "hello", timeout=15)
        batch = await call(client, "batch", {"limit": BATCH})
        items = batch.get("items") or []
        if not items:
            return {"handled": 0, "ms": int((time.time() - t0) * 1000)}

        async def one(it: dict) -> None:
            nonlocal handled, errors
            async with sem:
                try:
                    res = await client.get(it["url"], timeout=30)
                    ok = res.is_success
                    if ok:
                        handled += 1
                    else:
                        errors += 1
                    await call(client, "report", {
                        "url": it["url"], "ok": ok, "size": len(res.content),
                    }, timeout=15)
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    try:
                        await call(client, "report", {
                            "url": it["url"], "ok": False, "error": str(exc)[:200],
                        }, timeout=15)
                    except Exception:
                        pass

        await asyncio.gather(*(one(it) for it in items))

        ms = int((time.time() - t0) * 1000)
        try:
            await call(client, "beat", {
                "stats": {"cycles": 1, "jobs": handled, "errors": errors, "ms": ms},
            }, timeout=15)
        except Exception:
            pass

    return {"handled": handled, "errors": errors, "ms": int((time.time() - t0) * 1000)}


async def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    if mode == "loop":
        while True:
            try:
                print(await cycle(), flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"✖ {exc}", flush=True)
            await asyncio.sleep(INTERVAL)
    else:
        print(json.dumps(await cycle(), ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())