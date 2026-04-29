# llama.cpp Patch

`llama.cpp-talkie-q5.patch` contains the local Talkie architecture support used
to run this GGUF.

It was generated against llama.cpp commit:

```text
fc2b0053ffe878ff5a26934bdb555681f15bc699
```

Apply from a clean llama.cpp checkout:

```powershell
git checkout fc2b0053ffe878ff5a26934bdb555681f15bc699
git apply path\to\llama.cpp-talkie-q5.patch
```

Then build llama.cpp with CUDA enabled. On the local Windows test machine, the
resulting runtime executable was:

```text
llama.cpp\build-talkie-cuda\bin\llama-server.exe
```

The runtime must use Talkie's RMSNorm epsilon of `1e-5`.
