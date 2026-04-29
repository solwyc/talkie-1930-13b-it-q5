#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-5177}"
LLAMA_PORT="${LLAMA_PORT:-8187}"
LLAMA_N_GPU_LAYERS="${LLAMA_N_GPU_LAYERS:-26}"
LLAMA_CTX_SIZE="${LLAMA_CTX_SIZE:-1024}"
LLAMA_MODEL="${LLAMA_MODEL:-"$ROOT/models/talkie-1930-13b-it-q5.gguf"}"

case "$(uname -s)" in
  Darwin)
    RUNTIME_DIR="${RUNTIME_DIR:-"$ROOT/runtime/macos-metal"}"
    ;;
  Linux)
    RUNTIME_DIR="${RUNTIME_DIR:-"$ROOT/runtime/linux-cuda"}"
    ;;
  *)
    echo "Unsupported platform for start.sh. Use scripts/start.ps1 on Windows." >&2
    exit 1
    ;;
esac

export PORT
export TALKIE_BACKEND=llama
export LLAMA_PORT
export LLAMA_N_GPU_LAYERS
export LLAMA_CTX_SIZE
export LLAMA_MODEL
export LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-"$RUNTIME_DIR/llama-server"}"
export LLAMA_CUDA_BIN="${LLAMA_CUDA_BIN:-"$RUNTIME_DIR"}"

if [[ "${1:-}" == "--autoload" || "${LLAMA_AUTOSTART:-}" == "1" ]]; then
  export LLAMA_AUTOSTART=1
fi

cd "$ROOT"
npm run start:llama
