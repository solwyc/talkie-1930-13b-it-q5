---
license: apache-2.0
base_model: talkie-lm/talkie-1930-13b-it
tags:
  - talkie
  - gguf
  - q5_0
  - local-llm
  - experimental
language:
  - en
pipeline_tag: text-generation
---

# Talkie 1930 13B IT Q5

`talkie-1930-13b-it-q5` is an experimental Q5_0 GGUF build derived from
`talkie-lm/talkie-1930-13b-it`.

This is a consumer-GPU-oriented artifact for running Talkie locally through a
patched llama.cpp runtime. It is **not yet compatible with stock llama.cpp or
stock LM Studio** because Talkie uses a custom architecture.

## File

```text
talkie-1930-13b-it-q5.gguf
```

Expected SHA256:

```text
B6025276018B228CB35CDC76F2D957EB8037EA595F7C9486BC2971ECAFEAD0BA
```

## Runtime

Use the companion GitHub repo for the Node app, patched llama.cpp runtime, build
scripts, and release notes:

https://github.com/solwyc/talkie-1930-13b-it-q5

Tested local Windows settings:

```text
GPU:          RTX 4070 12 GB
GGUF:         Q5_0, about 9.13 GB
offload:      -ngl 26
context:      1024
speed:        roughly 7-8 tok/s in short local tests
```

The repo includes experimental Linux CUDA and macOS Metal build scaffolding, but
those ports were drafted blindly with GPT-5.5 assistance and have not been
maintainer-tested yet.

## Important Compatibility Note

This GGUF has:

```text
general.architecture = talkie
```

It requires a Talkie-aware llama.cpp runtime with support for Talkie's custom
blocks, tensor mapping, QK norm/gain tensors, and RMSNorm epsilon behavior.

## Build Summary

The local build path was:

1. Start from Talkie 1930 13B IT.
2. Train and select a small local LoRA polish adapter.
3. Merge the adapter into the BF16 checkpoint.
4. Convert the merged checkpoint to a Talkie GGUF.
5. Quantize the GGUF to Q5_0.
6. Validate through patched llama.cpp with CPU/GPU offload.

## Limitations

- Experimental runtime patch required.
- Not a stock LM Studio model yet.
- May produce plausible but wrong historical claims.
- May invent personal identity details unless prompted carefully.
- Not for high-stakes use.

## Attribution

Based on the Talkie 1930 13B IT model and code from:

https://github.com/talkie-lm/talkie

Upstream Talkie authors named in the project README: Alec Radford, Nick Levine,
and David Duvenaud.
