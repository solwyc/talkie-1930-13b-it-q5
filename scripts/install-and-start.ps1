param(
  [int]$Port = 5177,
  [int]$LlamaPort = 8187,
  [int]$GpuLayers = 26,
  [int]$ContextSize = 1024,
  [string]$ModelPath = "",
  [string]$RuntimeDir = "",
  [string]$ServerBin = "",
  [string]$CudaBin = "",
  [switch]$SkipModel,
  [switch]$SkipRuntime
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ReleaseTag = "v0.1.0"
$RuntimeAsset = "talkie-1930-13b-it-q5-runtime-win-cuda12.8.zip"
$RuntimeUrl = "https://github.com/solwyc/talkie-1930-13b-it-q5/releases/download/$ReleaseTag/$RuntimeAsset"
$CustomServerBin = [bool]$ServerBin

if (-not $ModelPath) {
  $ModelPath = Join-Path $Root "models\talkie-1930-13b-it-q5.gguf"
}
if (-not $RuntimeDir) {
  $RuntimeDir = Join-Path $Root "runtime\win-cuda12.8"
}
if (-not $ServerBin -and $env:LLAMA_SERVER_BIN) {
  $ServerBin = $env:LLAMA_SERVER_BIN
  $CustomServerBin = $true
}
if (-not $ServerBin) {
  $ServerBin = Join-Path $RuntimeDir "llama-server.exe"
}

function Assert-Node20 {
  $nodeVersion = (& node --version) 2>$null
  if (-not $nodeVersion) {
    throw "Node.js 20+ is required. Install Node.js, then run this installer again."
  }
  $major = [int]($nodeVersion.TrimStart("v").Split(".")[0])
  if ($major -lt 20) {
    throw "Node.js 20+ is required. Found $nodeVersion."
  }
  Write-Host "Node.js $nodeVersion found."
}

function Download-File {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][string]$OutFile
  )

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
  Write-Host "Downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile
}

Assert-Node20

if (-not $SkipModel) {
  if (Test-Path $ModelPath) {
    Write-Host "Model already exists at $ModelPath"
  } else {
    & node (Join-Path $Root "scripts\download-model.js") --out $ModelPath
    if ($LASTEXITCODE -ne 0) {
      throw "Model download failed."
    }
  }
}

if (-not $SkipRuntime) {
  if (Test-Path $ServerBin) {
    Write-Host "Runtime already exists at $ServerBin"
  } elseif ($CustomServerBin) {
    throw "Custom llama-server path was not found at $ServerBin."
  } else {
    $ArchivePath = Join-Path $Root "release-assets\$RuntimeAsset"
    if (-not (Test-Path $ArchivePath)) {
      Download-File -Url $RuntimeUrl -OutFile $ArchivePath
    }
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    Expand-Archive -Path $ArchivePath -DestinationPath $RuntimeDir -Force
    if (-not (Test-Path $ServerBin)) {
      throw "Runtime archive extracted, but llama-server.exe was not found at $ServerBin."
    }
  }
}

Write-Host ""
Write-Host "Starting Talkie. Leave this terminal open while you chat."
Write-Host "Open http://localhost:$Port when the app is ready."

& (Join-Path $Root "scripts\start.ps1") `
  -Port $Port `
  -LlamaPort $LlamaPort `
  -GpuLayers $GpuLayers `
  -ContextSize $ContextSize `
  -ModelPath $ModelPath `
  -RuntimeDir $RuntimeDir `
  -ServerBin $ServerBin `
  -CudaBin $CudaBin `
  -Autoload
