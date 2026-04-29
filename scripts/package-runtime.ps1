param(
  [string]$LlamaBinDir = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $LlamaBinDir) {
  $LlamaBinDir = Resolve-Path (Join-Path $Root "..\llama.cpp\build-talkie-cuda\bin")
}
if (-not $OutDir) {
  $OutDir = Join-Path $Root "release-assets"
}

$Stage = Join-Path $OutDir "runtime-win-cuda12.8"
$ZipPath = Join-Path $OutDir "talkie-1930-13b-it-q5-runtime-win-cuda12.8.zip"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $Stage) {
  Remove-Item -LiteralPath $Stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

foreach ($Name in @("llama-server.exe", "llama-cli.exe", "llama-completion.exe", "llama-talkie-logits.exe")) {
  $Source = Join-Path $LlamaBinDir $Name
  if (-not (Test-Path $Source)) {
    throw "Missing runtime executable: $Source"
  }
  Copy-Item -LiteralPath $Source -Destination (Join-Path $Stage $Name) -Force
}

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $Stage -Recurse -Force

Get-Item $ZipPath
