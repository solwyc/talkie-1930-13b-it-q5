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
---

# Talkie 1930 13B IT Q5

`talkie-1930-13b-it-q5` is an experimental Q5_0 GGUF build derived from Talkie
1930 13B IT. It is intended for local inference through a patched llama.cpp
runtime that implements Talkie's custom architecture.

## Intended Use

- Local chat and experimentation.
- Consumer-GPU testing with CPU/GPU offload.
- Research into compact Talkie GGUF deployment.

## Not Intended For

- Stock LM Studio use.
- Stock llama.cpp use.
- High-stakes historical, legal, medical, or financial advice.

## Runtime

The model currently requires patched llama.cpp support for:

- `general.architecture = talkie`
- Talkie tensor mapping
- Talkie QK norm and gain tensors
- Talkie embedding/logit behavior
- RMSNorm epsilon `1e-5`

Recommended tested setting:

```powershell
.\scripts\start.ps1 -Autoload -GpuLayers 26 -ContextSize 1024
```

## Evaluation Snapshot

The local evaluation loop focused on:

- conversation memory
- 1930-era boundary handling
- pre-1931 factual recall
- conversational usefulness
- identity/persona stability

This Q5 artifact was smoke-tested locally through the patched llama.cpp server
and browser app. On an RTX 4070 12 GB, local short-form generation landed around
7 to 8 tokens per second with `-ngl 26`.

## Limitations

Talkie can still produce plausible but incorrect claims. It may also sometimes
fall into period-character behavior or invent personal details unless prompted
carefully. Treat outputs as model text, not ground truth.

## Attribution

Based on the Talkie 1930 13B IT model and code from `talkie-lm/talkie`.
Packaged with local app and patched runtime notes by this repository.
