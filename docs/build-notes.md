# Build Notes

This document records the local path used to produce
`talkie-1930-13b-it-q5.gguf`.

## Source

Base model:

```text
talkie-lm/talkie-1930-13b-it
```

Architecture:

```text
Talkie 13B, 40 layers, 5120 hidden size, 65540-token BPE vocabulary
```

## Polish Adapter

The local improvement loop used a held-out evaluation suite and a small set of
verified paraphrases and adjacent questions. The goal was not to stuff exact
eval answers into the model, but to make the model better at:

- remembering conversational facts
- refusing impossible personal biography claims
- staying inside a pre-1931 knowledge boundary when appropriate
- answering with useful, non-sloppy conversational texture

Selected local adapter:

```text
tail6-r8-attnmlp-s192-combined-e2-polish4-pc
```

This adapter targeted the last six transformer blocks with rank 8 LoRA modules
over attention and MLP projections.

## Merge

The selected LoRA adapter was merged into the unquantized Talkie PyTorch
checkpoint and saved as a plain sharded BF16 checkpoint. Local verification
checked that:

- all expected shard keys were present
- no LoRA wrapper keys remained
- merged target weights matched recomputed base-plus-LoRA deltas

## GGUF Conversion

The merged BF16 checkpoint was converted into a Talkie GGUF container with:

```text
general.architecture = talkie
general.name = Talkie 1930 13B IT Polish4 PC
```

The BF16 GGUF was about 26.56 GB.

## Quantization

The BF16 GGUF was quantized to Q5_0:

```text
file type: MOSTLY_Q5_0
size:      about 9.13 GB
tensors:   443 total
quantized: 282 large tensors
kept BF16: 161 small gain/scalar tensors
```

Expected Q5 SHA256:

```text
B6025276018B228CB35CDC76F2D957EB8037EA595F7C9486BC2971ECAFEAD0BA
```

## Runtime Patch

The local llama.cpp patch was developed against:

```text
fc2b0053ffe878ff5a26934bdb555681f15bc699
```

Important runtime detail:

```text
Talkie RMSNorm epsilon must be 1e-5.
```

Earlier GGUFs did not include the epsilon metadata, so the patched runtime falls
back to `1e-5` for Talkie when the GGUF key is absent. Without this, generation
can collapse into punctuation or special-token behavior.

## Local Offload Boundary

On an RTX 4070 12 GB:

```text
-ngl 26: stable
-ngl 27: NaNs in local diagnostic logits probe
```

At `-ngl 26`, llama.cpp reported:

```text
offloading output layer to GPU
offloading 25 repeating layers to GPU
offloaded 26/41 layers to GPU
CPU_Mapped model buffer: about 3320 MiB
CUDA0 model buffer:      about 5387 MiB
KV cache at ctx 1024:    about 800 MiB
```
