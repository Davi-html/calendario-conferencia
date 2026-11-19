$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

$payloadPath = Join-Path $env:TEMP ("calendario-payload-" + [Guid]::NewGuid().ToString("N") + ".zip")
$generatedSource = Join-Path $env:TEMP ("calendario-launcher-" + [Guid]::NewGuid().ToString("N") + ".cs")

try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "O build do aplicativo falhou." }

  & ".\node_modules\.bin\electron-builder.cmd" --dir --win --x64
  if ($LASTEXITCODE -ne 0) { throw "O empacotamento dos arquivos do aplicativo falhou." }

  $unpackedPath = Join-Path $projectRoot "release\win-unpacked"
  if (-not (Test-Path (Join-Path $unpackedPath "Calendario.exe"))) {
    throw "O executável do aplicativo não foi encontrado em release\win-unpacked."
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $unpackedPath,
    $payloadPath,
    [System.IO.Compression.CompressionLevel]::Fastest,
    $false
  )

  $payloadId = (Get-FileHash -Path $payloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $launcherSource = Join-Path $PSScriptRoot "PortableLauncher.cs"
  $source = [System.IO.File]::ReadAllText($launcherSource).Replace("__PAYLOAD_ID__", $payloadId)
  [System.IO.File]::WriteAllText(
    $generatedSource,
    $source,
    (New-Object System.Text.UTF8Encoding($false))
  )

  $compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  if (-not (Test-Path $compiler)) {
    throw ".NET Framework C# Compiler não encontrado: $compiler"
  }

  $outputPath = Join-Path $projectRoot "release\Calendario.exe"
  & $compiler `
    /nologo `
    /target:winexe `
    /platform:anycpu `
    /reference:System.IO.Compression.dll `
    /reference:System.Windows.Forms.dll `
    /reference:System.Drawing.dll `
    "/resource:$payloadPath,Calendario.Payload.zip" `
    "/out:$outputPath" `
    $generatedSource

  if ($LASTEXITCODE -ne 0) { throw "A criação do executável portátil falhou." }
  Write-Host "Executável portátil criado: $outputPath"
}
finally {
  if (Test-Path $payloadPath) { Remove-Item -LiteralPath $payloadPath -Force }
  if (Test-Path $generatedSource) { Remove-Item -LiteralPath $generatedSource -Force }
  Pop-Location
}
