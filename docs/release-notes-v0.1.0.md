# talkie-1930-13b-it-q5 v0.1.0

Initial experimental release.

## Assets

- Q5_0 GGUF split into release chunks.
- SHA256 checksum for reconstructed GGUF.
- Windows CUDA patched llama.cpp runtime zip.
- Node browser chat app in the repository.

## Tested Locally

- RTX 4070 12 GB
- Windows
- `-ngl 26`
- context `1024`
- local browser app at `http://localhost:5177`

## Known Caveat

This model requires the patched Talkie-aware llama.cpp runtime. It is not yet a
stock LM Studio or stock llama.cpp artifact.
