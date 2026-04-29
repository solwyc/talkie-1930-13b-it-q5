param(
  [string]$Source = "",
  [string]$OutDir = "",
  [int64]$ChunkBytes = 1900MB
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $Source) {
  $Source = Resolve-Path (Join-Path $Root "..\talkie-web\distill-runs\gguf\talkie-1930-13b-it-polish4-pc-q5_0.gguf")
}
if (-not $OutDir) {
  $OutDir = Join-Path $Root "release-assets"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$BaseName = "talkie-1930-13b-it-q5.gguf"
$ExpectedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Source).Hash
$Buffer = New-Object byte[] (8MB)
$InputStream = [System.IO.File]::OpenRead($Source)

try {
  $Index = 1
  while ($InputStream.Position -lt $InputStream.Length) {
    $PartPath = Join-Path $OutDir ("{0}.part{1:D3}" -f $BaseName, $Index)
    $OutputStream = [System.IO.File]::Create($PartPath)
    try {
      $Written = [int64]0
      while ($Written -lt $ChunkBytes -and $InputStream.Position -lt $InputStream.Length) {
        $ToRead = [Math]::Min($Buffer.Length, $ChunkBytes - $Written)
        $Read = $InputStream.Read($Buffer, 0, $ToRead)
        if ($Read -le 0) { break }
        $OutputStream.Write($Buffer, 0, $Read)
        $Written += $Read
      }
    } finally {
      $OutputStream.Dispose()
    }
    $Index += 1
  }
} finally {
  $InputStream.Dispose()
}

$HashPath = Join-Path $OutDir "$BaseName.sha256"
$ExpectedHash | Set-Content -NoNewline -Encoding ascii -Path $HashPath
Get-ChildItem -LiteralPath $OutDir -Filter "$BaseName.part*" | Sort-Object Name
Get-Item $HashPath
