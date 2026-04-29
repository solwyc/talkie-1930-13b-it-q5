param(
  [int]$Port = 5177,
  [int]$LlamaPort = 8187,
  [int]$GpuLayers = 26,
  [int]$ContextSize = 1024,
  [string]$ModelPath = "",
  [string]$RuntimeDir = "",
  [string]$ServerBin = "",
  [string]$CudaBin = "",
  [switch]$Autoload
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $ModelPath) {
  $ModelPath = Join-Path $Root "models\talkie-1930-13b-it-q5.gguf"
}
if (-not $RuntimeDir) {
  $RuntimeDir = Join-Path $Root "runtime\win-cuda12.8"
}
if (-not $ServerBin) {
  $ServerBin = Join-Path $RuntimeDir "llama-server.exe"
}
if (-not $CudaBin) {
  $DefaultCuda = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8\bin"
  if (Test-Path $DefaultCuda) {
    $CudaBin = $DefaultCuda
  } else {
    $CudaBin = $RuntimeDir
  }
}

$env:PORT = "$Port"
$env:TALKIE_BACKEND = "llama"
$env:LLAMA_PORT = "$LlamaPort"
$env:LLAMA_N_GPU_LAYERS = "$GpuLayers"
$env:LLAMA_CTX_SIZE = "$ContextSize"
$env:LLAMA_MODEL = $ModelPath
$env:LLAMA_SERVER_BIN = $ServerBin
$env:LLAMA_CUDA_BIN = $CudaBin

if ($Autoload) {
  $env:LLAMA_AUTOSTART = "1"
} else {
  Remove-Item Env:\LLAMA_AUTOSTART -ErrorAction SilentlyContinue
}

Set-Location $Root
npm run start:llama
