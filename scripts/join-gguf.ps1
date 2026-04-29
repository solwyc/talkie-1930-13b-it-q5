param(
  [string]$PartsDir = "",
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $PartsDir) {
  $PartsDir = Join-Path $Root "release-assets"
}
if (-not $OutFile) {
  $OutFile = Join-Path $Root "models\talkie-1930-13b-it-q5.gguf"
}

$BaseName = "talkie-1930-13b-it-q5.gguf"
$Parts = Get-ChildItem -LiteralPath $PartsDir -Filter "$BaseName.part*" | Sort-Object Name
if (-not $Parts) {
  throw "No GGUF parts found in $PartsDir"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
if (Test-Path $OutFile) {
  Remove-Item -LiteralPath $OutFile -Force
}

$OutputStream = [System.IO.File]::Create($OutFile)
try {
  foreach ($Part in $Parts) {
    $InputStream = [System.IO.File]::OpenRead($Part.FullName)
    try {
      $InputStream.CopyTo($OutputStream)
    } finally {
      $InputStream.Dispose()
    }
  }
} finally {
  $OutputStream.Dispose()
}

$ExpectedHashPath = Join-Path $PartsDir "$BaseName.sha256"
if (Test-Path $ExpectedHashPath) {
  $ExpectedHash = (Get-Content -Raw -LiteralPath $ExpectedHashPath).Trim().ToUpperInvariant()
  $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutFile).Hash.ToUpperInvariant()
  if ($ActualHash -ne $ExpectedHash) {
    throw "SHA256 mismatch. Expected $ExpectedHash but got $ActualHash"
  }
}

Get-Item $OutFile
