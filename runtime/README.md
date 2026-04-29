# Runtime

The app expects a patched Talkie-aware `llama-server` runtime in one of these
platform directories:

```text
runtime/win-cuda12.8/llama-server.exe
runtime/linux-cuda/llama-server
runtime/macos-metal/llama-server
```

The Windows runtime is tested locally. The Linux and macOS lanes are build
scripts plus expected packaging layout, but they have not been maintainer-tested
yet.

For GitHub releases, runtimes are packaged as:

```text
talkie-1930-13b-it-q5-runtime-win-cuda12.8.zip
talkie-1930-13b-it-q5-runtime-linux-cuda.tar.gz
talkie-1930-13b-it-q5-runtime-macos-metal.tar.gz
```

Unpack the archive into this directory so the executable lands at the matching
path above.

The Windows CUDA build may need CUDA 12 runtime DLLs on `PATH`. If you already
have CUDA installed, set `LLAMA_CUDA_BIN` to its `bin` directory before starting
the app.

Linux CUDA and macOS Metal builds are expected to carry their required dynamic
library/runtime assumptions from the local machine used to build them. Test
fresh clones before sharing those binaries widely.
