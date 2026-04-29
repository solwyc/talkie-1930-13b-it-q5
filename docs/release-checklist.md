# Release Checklist

Before publishing a GitHub release:

1. Build the patched llama.cpp runtime.
2. Package the runtime:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-runtime.ps1
```

Optional blind-port runtime packages, after testing/building on those platforms:

```bash
./scripts/package-runtime-linux-cuda.sh
./scripts/package-runtime-macos-metal.sh
```

3. Split the GGUF into GitHub-sized release assets:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\split-gguf.ps1
```

4. Create a release tag:

```powershell
git tag v0.1.0
git push origin main --tags
```

5. Upload release assets:

```powershell
gh release create v0.1.0 release-assets\* --title "talkie-1930-13b-it-q5 v0.1.0" --notes-file docs\release-notes-v0.1.0.md
```

6. Download the release assets into a fresh clone and verify:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\join-gguf.ps1
powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Autoload
```
