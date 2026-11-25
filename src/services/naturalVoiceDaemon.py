# -*- coding: utf-8 -*-
"""
ZIRO NATURAL CONVERSATION ENGINE — Persistent In-Memory TTS & STT Daemon
Elimina el costo de crear un subproceso frío de Python (450ms–3500ms) en cada frase.
Mantiene en memoria:
- Loop asíncrono persistente para Edge-TTS Streaming por cláusulas (es-AR-TomasNeural, es-AR-ElenaNeural, etc.)
- Instancias pre-cargadas de Piper ONNX Local (es_AR-daniela-high.onnx, es_MX-claude-high.onnx, es_ES-carlfm-x_low.onnx)
- Normalizador prosódico conversacional rioplatense (limpia signos, markdown y pausas artificiales sin filtros destructivos).
Protocolo: JSON Lines por stdin -> stdout.
"""
import os
import re
import sys
import json
import time
import wave
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional

try:
    import edge_tts
except Exception:
    edge_tts = None

try:
    from piper import PiperVoice
except Exception:
    PiperVoice = None

try:
    import speech_recognition as sr
    GLOBAL_RECOGNIZER = sr.Recognizer()
    GLOBAL_RECOGNIZER.dynamic_energy_threshold = False
    GLOBAL_RECOGNIZER.energy_threshold = 30
except Exception:
    sr = None
    GLOBAL_RECOGNIZER = None

PIPER_SNAPSHOT_DIR = Path(
    r"D:\ZIRO_AI\Cache\huggingface\hub\models--rhasspy--piper-voices\snapshots\42301ec547bc2939386cf0ae9f9050ca05b1d3af"
)

PIPER_MODELS_MAP = {
    "piper-es-AR-daniela": PIPER_SNAPSHOT_DIR / "es" / "es_AR" / "daniela" / "high" / "es_AR-daniela-high.onnx",
    "piper-es-MX-claude": PIPER_SNAPSHOT_DIR / "es" / "es_MX" / "claude" / "high" / "es_MX-claude-high.onnx",
    "piper-es-MX-ald": PIPER_SNAPSHOT_DIR / "es" / "es_MX" / "ald" / "medium" / "es_MX-ald-medium.onnx",
    "piper-es-ES-davefx": PIPER_SNAPSHOT_DIR / "es" / "es_ES" / "davefx" / "medium" / "es_ES-davefx-medium.onnx",
    "piper-es-ES-carlfm": PIPER_SNAPSHOT_DIR / "es" / "es_ES" / "carlfm" / "x_low" / "es_ES-carlfm-x_low.onnx",
}

LOADED_PIPER_VOICES: Dict[str, Any] = {}


def sanitize_conversational_spanish(text: str) -> str:
    """
    FASE 4: Limpieza prosódica conversacional.
    - Elimina acotaciones teatrales entre asteriscos (*ronronea*, *gira en 3D*).
    - Elimina bloques de código, markdown (*, _, #, `, ~, >) y signos que los motores TTS deletrean.
    - Conserva únicamente la puntuación que guía la entonación natural (?, !, ., ,).
    """
    if not text:
        return ""
    # Quitar acciones entre asteriscos tipo *gira en 3D*
    t = re.sub(r"\*[^*]{1,80}\*", " ", text)
    # Quitar bloques de código
    t = re.sub(r"```[\s\S]*?```", " ", t)
    # Quitar emojis y pictogramas
    t = re.sub(
        r"[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]",
        " ",
        t,
    )
    # Quitar caracteres markdown que el TTS podría leer en voz alta
    t = re.sub(r"[*_`#~>|\\/\[\]{}()<>]", " ", t)
    # Reemplazar guiones largos o múltiples puntos por pausa suave de coma
    t = re.sub(r"\s*[-–—]+\s*", ", ", t)
    t = re.sub(r"\.{2,}", ". ", t)
    # Evitar que lea signos aislados
    t = re.sub(r"\s+", " ", t).strip()
    return t


async def synthesize_edge_chunk(
    text: str,
    voice: str,
    rate_str: str,
    pitch_str: str,
    output_file: str,
) -> Dict[str, Any]:
    t0 = time.perf_counter()
    first_byte_ms = None
    comm = edge_tts.Communicate(text, voice, rate=rate_str, pitch=pitch_str)
    with open(output_file, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                if first_byte_ms is None:
                    first_byte_ms = round((time.perf_counter() - t0) * 1000, 1)
                f.write(chunk["data"])
    total_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "success": os.path.exists(output_file) and os.path.getsize(output_file) > 100,
        "filePath": output_file,
        "engine": "edge-neural-stream",
        "firstByteMs": first_byte_ms or total_ms,
        "synthMs": total_ms,
    }


def synthesize_piper_chunk(text: str, voice_id: str, output_file: str) -> Dict[str, Any]:
    if PiperVoice is None:
        raise RuntimeError("piper-tts no está disponible")

    model_path = PIPER_MODELS_MAP.get(voice_id)
    if not model_path or not model_path.exists():
        model_path = PIPER_MODELS_MAP["piper-es-AR-daniela"]

    t0 = time.perf_counter()
    if voice_id not in LOADED_PIPER_VOICES:
        LOADED_PIPER_VOICES[voice_id] = PiperVoice.load(str(model_path))

    voice_obj = LOADED_PIPER_VOICES[voice_id]
    t_synth_start = time.perf_counter()

    wav_path = output_file if output_file.endswith(".wav") else (output_file + ".wav")
    with wave.open(wav_path, "wb") as wf:
        voice_obj.synthesize_wav(text, wf)

    synth_ms = round((time.perf_counter() - t_synth_start) * 1000, 1)
    total_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "success": os.path.exists(wav_path) and os.path.getsize(wav_path) > 100,
        "filePath": wav_path,
        "engine": "piper-onnx-local",
        "firstByteMs": synth_ms,
        "synthMs": total_ms,
    }


async def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    req_id = req.get("id")
    action = req.get("action", "synthesize")

    if action == "ping":
        return {"id": req_id, "success": True, "status": "ready"}

    if action == "transcribe":
        audio_path = req.get("audioPath", "")
        lang = req.get("language", "es-AR")
        t0 = time.perf_counter()
        if not audio_path or not os.path.exists(audio_path) or GLOBAL_RECOGNIZER is None:
            return {"id": req_id, "success": False, "text": "", "transcribeMs": 0}
        try:
            with sr.AudioFile(audio_path) as source:
                audio = GLOBAL_RECOGNIZER.record(source)
            candidates = ["es-AR", lang, "es-ES", "es-MX"]
            seen = []
            for c in candidates:
                if c and c not in seen:
                    seen.append(c)
            recognized = ""
            for l_code in seen:
                try:
                    txt = GLOBAL_RECOGNIZER.recognize_google(audio, language=l_code)
                    if txt and txt.strip():
                        recognized = txt.strip()
                        break
                except Exception:
                    continue
            dt_ms = round((time.perf_counter() - t0) * 1000, 1)
            return {
                "id": req_id,
                "success": bool(recognized),
                "text": recognized,
                "transcribeMs": dt_ms,
            }
        except Exception as e:
            dt_ms = round((time.perf_counter() - t0) * 1000, 1)
            return {"id": req_id, "success": False, "text": "", "error": str(e), "transcribeMs": dt_ms}

    if action == "preload_piper":
        v_id = req.get("voice", "piper-es-AR-daniela")
        model_path = PIPER_MODELS_MAP.get(v_id)
        if PiperVoice and model_path and model_path.exists() and v_id not in LOADED_PIPER_VOICES:
            LOADED_PIPER_VOICES[v_id] = PiperVoice.load(str(model_path))
        return {"id": req_id, "success": True, "loaded": list(LOADED_PIPER_VOICES.keys())}

    if action == "synthesize":
        raw_text = req.get("text", "")
        clean_text = sanitize_conversational_spanish(raw_text)
        if not clean_text:
            return {"id": req_id, "success": False, "error": "Texto vacío tras limpieza prosódica"}

        voice = req.get("voice", "es-AR-TomasNeural")
        rate_str = req.get("rate", "+0%")
        pitch_str = req.get("pitch", "+0Hz")
        output_file = req.get("outputFile", "")

        try:
            if voice.startswith("piper-"):
                res = synthesize_piper_chunk(clean_text, voice, output_file)
                res["id"] = req_id
                res["cleanText"] = clean_text
                return res
            else:
                # Si eligió ef_dora u otra voz especial, mapear a voz neuronal argentina natural
                eff_voice = "es-AR-ElenaNeural" if voice == "ef_dora" else voice
                res = await synthesize_edge_chunk(clean_text, eff_voice, rate_str, pitch_str, output_file)
                res["id"] = req_id
                res["cleanText"] = clean_text
                return res
        except Exception as e:
            # Fallback automático a Piper local argentino si falla la red
            try:
                res = synthesize_piper_chunk(clean_text, "piper-es-AR-daniela", output_file)
                res["id"] = req_id
                res["cleanText"] = clean_text
                res["fallbackUsed"] = True
                return res
            except Exception as e2:
                return {"id": req_id, "success": False, "error": f"{e} | {e2}"}

    return {"id": req_id, "success": False, "error": f"Acción desconocida: {action}"}


async def main_loop():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    # Señal de arranque inmediato
    print(json.dumps({"id": "init", "success": True, "status": "daemon_started"}), flush=True)

    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = await handle_request(req)
        except Exception as e:
            resp = {"id": None, "success": False, "error": str(e)}
        print(json.dumps(resp, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main_loop())
