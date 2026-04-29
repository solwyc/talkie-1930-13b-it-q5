#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLAMA_BIN_DIR="${LLAMA_BIN_DIR:-"$ROOT/../llama.cpp/build-talkie-metal/bin"}"
OUT_DIR="${OUT_DIR:-"$ROOT/release-assets"}"
STAGE="$OUT_DIR/runtime-macos-metal"
TARBALL="$OUT_DIR/talkie-1930-13b-it-q5-runtime-macos-metal.tar.gz"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE"

for name in llama-server llama-cli llama-completion llama-talkie-logits; do
  if [[ ! -f "$LLAMA_BIN_DIR/$name" ]]; then
    echo "Missing runtime executable: $LLAMA_BIN_DIR/$name" >&2
    exit 1
  fi
  cp "$LLAMA_BIN_DIR/$name" "$STAGE/$name"
done

tar -C "$STAGE" -czf "$TARBALL" .
rm -rf "$STAGE"

echo "$TARBALL"
