#!/usr/bin/env bash
# Local speech-to-text for voice input: Qwen3-ASR on mlx-audio, served OpenAI-style by
# scripts/local-asr-server.py on loopback only. Apple Silicon only (MLX). First run makes the
# venv and fetches the model; every run starts the server and warms it, so the first dictation
# is not the slow one.
#   scripts/local-asr.sh            # serves http://127.0.0.1:8765/v1 until Ctrl+C
#   OVIS_ASR_PORT=9000 scripts/local-asr.sh
set -euo pipefail

home="${OVIS_ASR_HOME:-$HOME/.local/share/ovis-asr}"
port="${OVIS_ASR_PORT:-8765}"
repo="${OVIS_ASR_REPO:-mlx-community/Qwen3-ASR-0.6B-4bit}"
model="$home/models/${repo##*/}"
venv="$home/venv"

command -v ffmpeg >/dev/null || { echo "ffmpeg is needed: brew install ffmpeg" >&2; exit 1; }

if [ ! -x "$venv/bin/python" ]; then
  command -v uv >/dev/null || { echo "uv is needed: brew install uv" >&2; exit 1; }
  uv venv --python 3.12 "$venv"
  UV_HTTP_TIMEOUT=900 VIRTUAL_ENV="$venv" uv pip install "mlx-audio[stt,server]==0.4.3"
fi

if [ ! -f "$model/preprocessor_config.json" ] || [ ! -f "$model/model.safetensors" ]; then
  "$venv/bin/hf" download "$repo" --local-dir "$model"
fi

"$venv/bin/python" -I "$(dirname "$0")/local-asr-server.py" "$model" "$port" &
server=$!
trap 'kill "$server" 2>/dev/null' EXIT INT TERM

until curl -sf -o /dev/null "http://127.0.0.1:$port/v1/models"; do
  kill -0 "$server" 2>/dev/null || { echo "the speech server exited" >&2; exit 1; }
  sleep 0.5
done

# warm the model and the decoders a browser sends (Chrome webm/opus, Safari mp4/aac)
warm="$(mktemp -d)"
"$venv/bin/python" -c "import sys,wave; w=wave.open(sys.argv[1],'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b'\0\0'*16000); w.close()" "$warm/a.wav"
ffmpeg -loglevel error -i "$warm/a.wav" -c:a libopus "$warm/a.webm"
ffmpeg -loglevel error -i "$warm/a.wav" -c:a aac "$warm/a.mp4"
for clip in "$warm"/a.*; do
  curl -sf -o /dev/null "http://127.0.0.1:$port/v1/audio/transcriptions" -F "file=@$clip" -F stream=true || echo "warmup failed: ${clip##*/}" >&2
done
rm -rf "$warm"

echo "Ready. In Ovis: Settings > Voice input > Speech recognition"
echo "  Server URL: http://127.0.0.1:$port/v1"
echo "  Model name: $model"
wait "$server"
