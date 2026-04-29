# Runtime

The app expects a patched Talkie-aware `llama-server.exe` at:

```text
runtime/win-cuda12.8/llama-server.exe
```

For GitHub releases, this runtime is packaged as:

```text
talkie-1930-13b-it-q5-runtime-win-cuda12.8.zip
```

Unzip that archive into this directory so the executable lands at the path above.

The Windows CUDA build may need CUDA 12 runtime DLLs on `PATH`. If you already
have CUDA installed, set `LLAMA_CUDA_BIN` to its `bin` directory before starting
the app.
