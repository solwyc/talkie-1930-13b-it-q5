# Linux And macOS Porting Notes

The Node app is cross-platform. The model file is cross-platform. The runtime
binary is the platform-specific part.

## Runtime Directories

The app chooses these default runtime paths:

```text
Windows: runtime/win-cuda12.8/llama-server.exe
Linux:   runtime/linux-cuda/llama-server
macOS:   runtime/macos-metal/llama-server
```

You can override any of them with:

```bash
LLAMA_SERVER_BIN=/path/to/llama-server
```

## Linux CUDA

The intended flow is:

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
git checkout fc2b0053ffe878ff5a26934bdb555681f15bc699
cd /path/to/talkie-1930-13b-it-q5
LLAMA_CPP_DIR=/path/to/llama.cpp ./scripts/build-llama-linux-cuda.sh
LLAMA_BIN_DIR=/path/to/llama.cpp/build-talkie-cuda/bin ./scripts/package-runtime-linux-cuda.sh
```

Then unpack the generated tarball into `runtime/linux-cuda/`.

## macOS Metal

The intended flow is:

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
git checkout fc2b0053ffe878ff5a26934bdb555681f15bc699
cd /path/to/talkie-1930-13b-it-q5
LLAMA_CPP_DIR=/path/to/llama.cpp ./scripts/build-llama-macos-metal.sh
LLAMA_BIN_DIR=/path/to/llama.cpp/build-talkie-metal/bin ./scripts/package-runtime-macos-metal.sh
```

Then unpack the generated tarball into `runtime/macos-metal/`.

## Caveat

The Linux/Mac ports were built blindly with GPT-5.5 assistance since I cannot
test them yet. They are intentionally included as transparent scaffolding, not
as verified support claims. If you test them, please open an issue with:

- OS and version
- GPU/accelerator
- llama.cpp compiler output
- app startup log
- generation speed and failure mode, if any
