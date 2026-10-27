"""
OpenAI-compatible POST /v1/audio/transcriptions for one mlx-audio STT model (Qwen3-ASR), for
Ovis voice input on this machine. Run by scripts/local-asr.sh, on loopback only.

mlx-audio's own server writes each clip back to a temp file named after the upload (an ffmpeg
encode for webm, an error for Safari's mp4); this one has ffmpeg decode it straight to the
model's 16 kHz mono and answers OpenAI's
`transcript.text.delta` / `transcript.text.done` events. Ovis's prompt and keywords become the
model's context, so code terms said aloud come out as written.
"""

import asyncio
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from mlx_audio.stt.utils import load_model

MODEL_PATH, PORT = sys.argv[1], int(sys.argv[2])
# MLX binds its GPU stream to the thread that loaded the model: every call runs on that one
# thread, so a second dictation also waits for the first
mlx = ThreadPoolExecutor(max_workers=1)
model = mlx.submit(load_model, MODEL_PATH).result()
app = FastAPI()


def decode(data: bytes, suffix: str) -> np.ndarray:
    # from a file, not a pipe: an mp4 keeps its index at the end
    with tempfile.NamedTemporaryFile(suffix=suffix) as clip:
        clip.write(data)
        clip.flush()
        pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", clip.name, "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
                             capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def transcribe(audio: np.ndarray, context: str | None) -> str:
    # a clip takes a fraction of a second whole, so it is not streamed token by token
    return "".join(chunk.text for chunk in model.stream_transcribe(audio, system_prompt=context)).strip()


@app.post("/v1/audio/transcriptions")
async def transcriptions(request: Request, file: UploadFile = File(...), stream: str = Form("false"), prompt: str | None = Form(None)):
    form = await request.form()
    keywords = [str(word) for word in form.getlist("keywords[]")]
    context = " ".join(part for part in [prompt, ", ".join(keywords)] if part) or None
    audio = await asyncio.to_thread(decode, await file.read(), os.path.splitext(file.filename or "")[1])
    text = await asyncio.get_running_loop().run_in_executor(mlx, transcribe, audio, context)
    if stream != "true":
        return JSONResponse({"text": text})
    events = [{"type": "transcript.text.delta", "delta": text}, {"type": "transcript.text.done", "text": text}]
    return StreamingResponse((f"data: {json.dumps(event)}\n\n" for event in events), media_type="text/event-stream")


@app.get("/v1/models")
def models():
    return {"data": [{"id": MODEL_PATH, "object": "model"}]}


uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
