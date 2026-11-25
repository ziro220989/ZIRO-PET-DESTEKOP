import asyncio
import json
import os
import re
import subprocess
import sys
import time

import edge_tts

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def clean_speech_text(text: str) -> str:
    if not text:
        return ""
    # Remove URLs
    t = re.sub(r"https?://\S+", "", text)
    # Remove markdown formatting (*, _, `, #, ~)
    t = re.sub(r"[*_`#~>|]+", " ", t)
    # Remove emojis / pictographs
    t = re.sub(
        r"[\U0001F300-\U0001FAFF\u2600-\u27BF]+",
        "",
        t,
    )
    # Remove quotes and parentheses that sound unnatural
    t = t.replace('"', "").replace("'", "").replace("(", ", ").replace(")", ", ")
    # Collapse repeated punctuation and spaces
    t = re.sub(r"\s+", " ", t).strip()
    return t


async def synth_edge(text: str, voice: str, rate: float, pitch: float, out_path: str):
    t0 = time.perf_counter()
    rate_pct = round((rate - 1.0) * 100)
    rate_arg = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
    pitch_hz = round((pitch - 1.0) * 20)
    pitch_arg = f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"

    comm = edge_tts.Communicate(text, voice or "es-AR-TomasNeural", rate=rate_arg, pitch=pitch_arg)
    first_chunk_ms = None
    audio_bytes = bytearray()

    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            if first_chunk_ms is None:
                first_chunk_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            audio_bytes.extend(chunk["data"])

    if not audio_bytes:
        return {"success": False, "error": "edge_tts no devolvió audio"}

    with open(out_path, "wb") as f:
        f.write(audio_bytes)

    total_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    return {
        "success": True,
        "filePath": out_path,
        "engine": "edge-warm-stream",
        "firstChunkMs": first_chunk_ms or total_ms,
        "ttsMs": total_ms,
        "bytes": len(audio_bytes),
    }


def synth_piper(text: str, model_path: str, out_path: str):
    t0 = time.perf_counter()
    if not model_path or not os.path.exists(model_path):
        return {"success": False, "error": f"Modelo Piper no encontrado: {model_path}"}
    proc = subprocess.run(
        ["piper", "--model", model_path, "--output_file", out_path],
        input=text,
        text=True,
        capture_output=True,
        timeout=20,
    )
    total_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    if proc.returncode == 0 and os.path.exists(out_path):
        return {
            "success": True,
            "filePath": out_path,
            "engine": "piper-local",
            "firstChunkMs": total_ms,
            "ttsMs": total_ms,
            "bytes": os.path.getsize(out_path),
        }
    return {"success": False, "error": proc.stderr or "Piper falló"}


async def handle_line(line: str):
    req = json.loads(line)
    req_id = req.get("id")
    text = clean_speech_text(req.get("text", ""))
    if not text:
        return {"id": req_id, "success": False, "error": "Texto vacío tras limpieza"}

    engine = req.get("engine", "edge")
    out_path = req.get("outPath")
    if engine == "piper" and req.get("piperModel"):
        res = synth_piper(text, req.get("piperModel"), out_path)
    else:
        res = await synth_edge(
            text,
            req.get("voice", "es-AR-TomasNeural"),
            float(req.get("rate", 1.0)),
            float(req.get("pitch", 1.0)),
            out_path,
        )
    res["id"] = req_id
    return res


async def main_loop():
    loop = asyncio.get_running_loop()
    print(json.dumps({"ready": True}), flush=True)
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            res = await handle_line(line)
        except Exception as e:
            res = {"success": False, "error": str(e)}
        print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main_loop())
