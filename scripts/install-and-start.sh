#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_TAG="${RELEASE_TAG:-v0.1.0}"
PORT="${PORT:-5177}"
LLAMA_PORT="${LLAMA_PORT:-8187}"
LLAMA_N_GPU_LAYERS="${LLAMA_N_GPU_LAYERS:-26}"
LLAMA_CTX_SIZE="${LLAMA_CTX_SIZE:-1024}"
LLAMA_MODEL="${LLAMA_MODEL:-"$ROOT/models/talkie-1930-13b-it-q5.gguf"}"

case "$(uname -s)" in
  Darwin)
    RUNTIME_NAME="macos-metal"
    RUNTIME_DIR="${RUNTIME_DIR:-"$ROOT/runtime/macos-metal"}"
    RUNTIME_ASSET="talkie-1930-13b-it-q5-runtime-macos-metal.tar.gz"
    ;;
  Linux)
    RUNTIME_NAME="linux-cuda"
    RUNTIME_DIR="${RUNTIME_DIR:-"$ROOT/runtime/linux-cuda"}"
    RUNTIME_ASSET="talkie-1930-13b-it-q5-runtime-linux-cuda.tar.gz"
    ;;
  *)
    echo "Unsupported platform. Use scripts/install-and-start.ps1 on Windows." >&2
    exit 1
    ;;
esac

RUNTIME_URL="https://github.com/solwyc/talkie-1930-13b-it-q5/releases/download/$RELEASE_TAG/$RUNTIME_ASSET"
ARCHIVE_PATH="$ROOT/release-assets/$RUNTIME_ASSET"
CUSTOM_SERVER_BIN=0
if [[ -n "${LLAMA_SERVER_BIN:-}" ]]; then
  SERVER_BIN="$LLAMA_SERVER_BIN"
  CUSTOM_SERVER_BIN=1
else
  SERVER_BIN="$RUNTIME_DIR/llama-server"
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required. Install it, then run this installer again." >&2
    exit 1
  fi
}

require_node20() {
  require_cmd node
  local version major
  version="$(node --version)"
  major="${version#v}"
  major="${major%%.*}"
  if [[ "$major" -lt 20 ]]; then
    echo "Node.js 20+ is required. Found $version." >&2
    exit 1
  fi
  echo "Node.js $version found."
}

download_file() {
  local url="$1"
  local out="$2"
  mkdir -p "$(dirname "$out")"
  echo "Downloading $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget "$url" -O "$out"
  else
    echo "curl or wget is required for runtime downloads." >&2
    exit 1
  fi
}

require_node20
require_cmd tar

if [[ ! -f "$LLAMA_MODEL" ]]; then
  node "$ROOT/scripts/download-model.js" --out "$LLAMA_MODEL"
else
  echo "Model already exists at $LLAMA_MODEL"
fi

if [[ ! -x "$SERVER_BIN" && "$CUSTOM_SERVER_BIN" -eq 1 ]]; then
  echo "Custom llama-server path was not found or is not executable: $SERVER_BIN" >&2
  exit 1
fi

if [[ ! -x "$SERVER_BIN" ]]; then
  if [[ ! -f "$ARCHIVE_PATH" ]]; then
    if ! download_file "$RUNTIME_URL" "$ARCHIVE_PATH"; then
      cat >&2 <<EOF

Could not download the $RUNTIME_NAME runtime archive.

The Linux and macOS runtime packages are blind ports until someone tests and
uploads those release assets. You can still build the runtime locally:

  Linux CUDA:  LLAMA_CPP_DIR=/path/to/llama.cpp ./scripts/build-llama-linux-cuda.sh
  macOS Metal: LLAMA_CPP_DIR=/path/to/llama.cpp ./scripts/build-llama-macos-metal.sh

Then package it with the matching package-runtime script, or set
LLAMA_SERVER_BIN to an existing patched llama-server binary.
EOF
      exit 1
    fi
  fi
  mkdir -p "$RUNTIME_DIR"
  tar -xzf "$ARCHIVE_PATH" -C "$RUNTIME_DIR"
  chmod +x "$RUNTIME_DIR"/llama-* 2>/dev/null || true
fi

if [[ ! -x "$SERVER_BIN" ]]; then
  echo "Runtime archive extracted, but llama-server was not found at $SERVER_BIN." >&2
  exit 1
fi

echo
echo "Starting Talkie. Leave this terminal open while you chat."
echo "Open http://localhost:$PORT when the app is ready."

export PORT
export LLAMA_PORT
export LLAMA_N_GPU_LAYERS
export LLAMA_CTX_SIZE
export LLAMA_MODEL
export RUNTIME_DIR
export LLAMA_SERVER_BIN="$SERVER_BIN"

exec "$ROOT/scripts/start.sh" --autoload
