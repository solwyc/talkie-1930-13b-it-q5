# talkie-1930-13b-it-q5

An experimental consumer-GPU GGUF build of Talkie 1930 13B IT, packaged with a
small local Node chat app and a patched llama.cpp runtime path.

This release is for people who want to try a fast-ish, local, conversational
Talkie on hardware like an RTX 4070 12 GB. It is not yet a stock LM Studio or
stock llama.cpp model. The GGUF uses `general.architecture = talkie`, so it
requires a runtime with Talkie architecture support.

## What Is Included

- `talkie-1930-13b-it-q5.gguf`: Q5_0 GGUF, about 9.13 GB.
- `server.js` and `public/`: local browser chat app with streaming and TPS.
- `scripts/start.ps1`: launches the app against a patched `llama-server.exe`.
- `patches/`: Talkie support patch for llama.cpp.
- `scripts/package-runtime.ps1`: builds a Windows runtime zip from a local patched build.
- `scripts/split-gguf.ps1` and `scripts/join-gguf.ps1`: GitHub release helpers for the large GGUF.

## Quick Start

Requirements:

- Windows
- Node.js 20+
- NVIDIA GPU recommended
- CUDA 12 runtime DLLs on `PATH`, or pass `-CudaBin`
- Patched Talkie-aware `llama-server.exe`
- The Q5 GGUF at `models\talkie-1930-13b-it-q5.gguf`

From this repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Autoload
```

Then open:

```text
http://localhost:5177
```

Default runtime settings:

```text
web app:      http://localhost:5177
llama.cpp:    http://127.0.0.1:8187
GPU layers:   26
context:      1024
batch:        256
ubatch:       128
threads:      4
```

These defaults were selected for an RTX 4070 12 GB after testing that `-ngl 26`
was stable and `-ngl 27` produced NaNs in the local diagnostic build.

## Downloading The Model From A GitHub Release

GitHub release assets must each be under 2 GiB, so the GGUF may be published as
split parts:

```text
talkie-1930-13b-it-q5.gguf.part001
talkie-1930-13b-it-q5.gguf.part002
...
talkie-1930-13b-it-q5.gguf.sha256
```

Put all parts in `release-assets\`, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\join-gguf.ps1
```

Expected SHA256:

```text
B6025276018B228CB35CDC76F2D957EB8037EA595F7C9486BC2971ECAFEAD0BA
```

When this model is uploaded to Hugging Face, the HF repo can host the GGUF as a
single file, which is much nicer for normal users.

## Runtime Compatibility

Works:

- This repo's Node app plus a patched Talkie-aware llama.cpp runtime.
- OpenAI-compatible local requests through the patched `llama-server.exe`.

Does not currently work:

- Stock LM Studio.
- Stock llama.cpp.
- Transformers loading this Q5 GGUF as an efficient inference artifact.

Transformers users should start from a Transformers-format Talkie checkpoint
instead. The Q5 GGUF is intended for llama.cpp-style inference.

## How We Built It

The short version:

1. Started from `talkie-lm/talkie-1930-13b-it`.
2. Built a local evaluation loop around conversation memory, 1930-era boundary
   behavior, factual recall, and conversational usefulness.
3. Curated correction and paraphrase data for hard failures.
4. Trained a small tail-layer LoRA polish adapter locally.
5. Merged the selected adapter into the BF16 checkpoint.
6. Converted the merged checkpoint into a Talkie GGUF container.
7. Quantized the GGUF to Q5_0.
8. Patched llama.cpp with Talkie architecture support, including the correct
   RMSNorm epsilon fallback of `1e-5`.
9. Validated local inference with CPU/GPU offload on an RTX 4070 12 GB.

More detail is in [docs/build-notes.md](docs/build-notes.md).

## Local Performance Snapshot

On an RTX 4070 12 GB:

```text
GGUF:          Q5_0, about 9.13 GB
offload:       -ngl 26
context:       1024
VRAM used:     roughly 7.5 GB during local app testing
decode speed:  around 7 to 8 tok/s in short local tests
```

Short responses undercount throughput because prompt setup and request overhead
dominate. llama.cpp timing on a 53-token smoke response reported about
`8.20 tok/s` eval speed.

## Known Limitations

- This is an experimental model artifact and runtime patch.
- The model may still invent personal identity details if sampling or prompting
  is loose.
- It is period-oriented but not a perfect historical oracle.
- The patch needs upstreaming or a custom runtime distribution before normal
  LM Studio users can load the GGUF directly.
- CUDA/Windows packaging is the only runtime path prepared in this repo today.

## License And Attribution

This repository follows the Apache-2.0 license used by the upstream Talkie
project. See [NOTICE](NOTICE) for attribution and caveats.

Upstream projects:

- Talkie: https://github.com/talkie-lm/talkie
- llama.cpp: https://github.com/ggml-org/llama.cpp
