# Model

Place the Q5 GGUF here:

```text
models/talkie-1930-13b-it-q5.gguf
```

The GitHub release may publish the GGUF in split parts because GitHub release
assets must each be under 2 GiB. Download all parts, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\join-gguf.ps1
```

Expected SHA256:

```text
B6025276018B228CB35CDC76F2D957EB8037EA595F7C9486BC2971ECAFEAD0BA
```
