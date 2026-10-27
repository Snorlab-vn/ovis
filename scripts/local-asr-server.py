"""
OpenAI-compatible speech-to-text for Ovis voice input on this machine, on loopback only. Run by
scripts/local-asr.sh.

GET /v1/models lists the mlx-audio models under the models folder and the models Handy has
downloaded (`handy:<id>`); POST /v1/audio/transcriptions picks one by `model`, the default mlx
one when the name is unknown. An mlx model stays loaded (one at a time) and answers in a fraction
of a second; a Handy model runs Handy headless per clip, which loads it each time.

mlx-audio's own server writes each clip back to a temp file named after the upload (an ffmpeg
encode for webm, an error for Safari's mp4); this one has ffmpeg decode it straight to the
model's 16 kHz mono and answers OpenAI's `transcript.text.delta` / `transcript.text.done`
events. Ovis's prompt and keywords become an mlx model's context, so code terms said aloud come
out as written.
"""

import asyncio
import json
import os
import threading
import time
import subprocess
import sys
import tempfile
import wave
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from mlx_audio.stt.utils import load_model

MODELS_DIR, DEFAULT, PORT = sys.argv[1], sys.argv[2], int(sys.argv[3])
HANDY = "/Applications/Handy.app/Contents/MacOS/handy"


def mlx_models() -> list[str]:
    return sorted(name for name in os.listdir(MODELS_DIR) if os.path.isfile(os.path.join(MODELS_DIR, name, "config.json")))


def handy_models() -> list[dict]:
    if not os.access(HANDY, os.X_OK):
        return []
    try:
        listed = json.loads(subprocess.run([HANDY, "--list-models", "--json"], capture_output=True, check=True, timeout=30).stdout)
    except (subprocess.SubprocessError, ValueError):
        return []
    return [{"id": f"handy:{model['id']}", "name": f"{model['name']} (Handy)"} for model in listed if model.get("is_downloaded")]


# MLX binds its GPU stream to the thread that loaded the model: every call runs on that one
# thread, so a second dictation also waits for the first
mlx = ThreadPoolExecutor(max_workers=1)
loaded: dict[str, object] = {}


def mlx_model(name: str):
    # ponytail: one model in memory, a switch reloads it (~4 s); keep several if switching is common
    if name not in loaded:
        loaded.clear()
        loaded[name] = load_model(os.path.join(MODELS_DIR, name))
    return loaded[name]


mlx.submit(mlx_model, DEFAULT).result()
app = FastAPI()

# Tasky's warm-keeping: macOS pages a model out after a while unused, and the next dictation then
# waits seconds for it. Half a second of silence through the loaded model every minute keeps it in;
# a pass that took long says it had been paged out.
WARM_EVERY_S = 60
SILENCE = np.zeros(8000, np.float32)


def keep_warm() -> None:
    while True:
        time.sleep(WARM_EVERY_S)
        name = next(iter(loaded), None)
        if name is None:
            continue
        started = time.monotonic()
        try:
            mlx.submit(transcribe_mlx, name, SILENCE, None).result()
        except Exception as error:  # a failed pass must not end the loop
            print(f"warm pass failed: {error}", flush=True)
            continue
        took = time.monotonic() - started
        if took > 2:
            print(f"{name} had been paged out: the warm pass took {took:.1f}s", flush=True)


threading.Thread(target=keep_warm, daemon=True).start()


def decode(data: bytes, suffix: str) -> np.ndarray:
    # from a file, not a pipe: an mp4 keeps its index at the end
    with tempfile.NamedTemporaryFile(suffix=suffix) as clip:
        clip.write(data)
        clip.flush()
        pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", clip.name, "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
                             capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def transcribe_mlx(name: str, audio: np.ndarray, context: str | None) -> str:
    # a clip takes a fraction of a second whole, so it is not streamed token by token
    return "".join(chunk.text for chunk in mlx_model(name).stream_transcribe(audio, system_prompt=context)).strip()


def transcribe_handy(model_id: str, audio: np.ndarray) -> str:
    with tempfile.NamedTemporaryFile(suffix=".wav") as clip:
        with wave.open(clip.name, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(16000)
            out.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
        result = subprocess.run([HANDY, "-f", clip.name, "--model", model_id, "--json"], capture_output=True, check=True, timeout=120)
    return str(json.loads(result.stdout).get("text") or "").strip()


@app.post("/v1/audio/transcriptions")
async def transcriptions(request: Request, file: UploadFile = File(...), model: str = Form(""), stream: str = Form("false"),
                         prompt: str | None = Form(None)):
    form = await request.form()
    keywords = [str(word) for word in form.getlist("keywords[]")]
    context = " ".join(part for part in [prompt, ", ".join(keywords)] if part) or None
    audio = await asyncio.to_thread(decode, await file.read(), os.path.splitext(file.filename or "")[1])
    if model.startswith("handy:"):
        text = await asyncio.to_thread(transcribe_handy, model.removeprefix("handy:"), audio)
    else:
        name = model if model in mlx_models() else DEFAULT
        text = await asyncio.get_running_loop().run_in_executor(mlx, transcribe_mlx, name, audio, context)
    if stream != "true":
        return JSONResponse({"text": text})
    events = [{"type": "transcript.text.delta", "delta": text}, {"type": "transcript.text.done", "text": text}]
    return StreamingResponse((f"data: {json.dumps(event)}\n\n" for event in events), media_type="text/event-stream")


@app.get("/v1/models")
def models():
    entries = [{"id": name, "name": f"{name} (MLX)"} for name in mlx_models()] + handy_models()
    return {"object": "list", "data": [{**entry, "object": "model"} for entry in entries]}


uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
