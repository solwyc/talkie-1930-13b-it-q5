param(
  [string]$Tag = "v0.1.0",
  [string]$AssetsDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $AssetsDir) {
  $AssetsDir = Join-Path $Root "release-assets"
}

$Parts = Get-ChildItem -LiteralPath $AssetsDir -Filter "talkie-1930-13b-it-q5.gguf.part*" | Sort-Object Name
if (-not $Parts) {
  throw "No GGUF parts found in $AssetsDir"
}

foreach ($Part in $Parts) {
  $Stamp = Get-Date -Format o
  Write-Output "[$Stamp] uploading $($Part.Name) ($($Part.Length) bytes)"
  gh release upload $Tag $Part.FullName --clobber
  $Stamp = Get-Date -Format o
  Write-Output "[$Stamp] uploaded $($Part.Name)"
}

Write-Output "DONE"
