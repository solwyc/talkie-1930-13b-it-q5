#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-"$ROOT/../llama.cpp"}"
PATCH_FILE="$ROOT/patches/llama.cpp-talkie-q5.patch"
BUILD_DIR="${BUILD_DIR:-build-talkie-cuda}"

cd "$LLAMA_CPP_DIR"

if ! git diff --quiet || [[ -n "$(git status --porcelain)" ]]; then
  echo "llama.cpp worktree is not clean. Commit/stash changes before applying the Talkie patch." >&2
  exit 1
fi

git apply "$PATCH_FILE"

cmake -S . -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=ON

cmake --build "$BUILD_DIR" --config Release -j "$(nproc)"

echo "Built patched llama.cpp at $LLAMA_CPP_DIR/$BUILD_DIR"
