$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root ".partykit-static"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$package = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $package.version
if (-not $version) {
  throw "package.json must define a version"
}

try {
  $commit = (git -c core.excludesFile= -C $root rev-parse --short HEAD).Trim()
} catch {
  $commit = "unknown"
}

try {
  $statusLines = git -c core.excludesFile= -C $root status --short
  $dirty = ($statusLines -join "`n").Trim()
  if ($dirty) {
    $commit = "$commit-dirty"
  }
} catch {
  $commit = "$commit-dirty"
}

$deployedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

if (Test-Path -LiteralPath $outDir) {
  Remove-Item -LiteralPath $outDir -Recurse -Force
}

New-Item -ItemType Directory -Path $outDir | Out-Null

$files = @(
  "index.html",
  "game.html",
  "game.js",
  "game-state.js",
  "simulator.html",
  "simulator.js",
  "mpcards-core.js",
  "card-art.js",
  "card-names.js",
  "deck-manager.js",
  "grafica",
  "version.js",
  "README.md",
  "RULES.md",
  "SIMULATOR.md"
)

foreach ($file in $files) {
  $source = Join-Path $root $file
  if (Test-Path -LiteralPath $source) {
    $dest = Join-Path $outDir $file
    if ((Get-Item -LiteralPath $source).PSIsContainer) {
      Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
    } else {
      Copy-Item -LiteralPath $source -Destination $dest -Force
    }
  }
}

$versionInfo = [ordered]@{
  version = $version
  commit = $commit
  deployedAt = $deployedAt
}

$versionJson = $versionInfo | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $outDir "version.json"), $versionJson, $utf8NoBom)

$versionJs = @"
window.MPCARDS_VERSION = $versionJson;

(function showAppVersion() {
  function render() {
    const target = document.getElementById("app-version");
    if (!target || !window.MPCARDS_VERSION) return;
    const info = window.MPCARDS_VERSION;
    target.textContent = ``v`${info.version} `${info.commit}``;
    target.title = ``Versione `${info.version}, commit `${info.commit}, deploy `${info.deployedAt}``;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
}());
"@
[System.IO.File]::WriteAllText((Join-Path $outDir "version.js"), $versionJs, $utf8NoBom)

$htmlFiles = Get-ChildItem -LiteralPath $outDir -Filter "*.html"
$missingScripts = @()
foreach ($html in $htmlFiles) {
  $htmlText = Get-Content -LiteralPath $html.FullName -Raw
  $matches = [regex]::Matches($htmlText, '<script\s+[^>]*src=["'']([^"'']+)["'']')
  foreach ($match in $matches) {
    $src = $match.Groups[1].Value
    if ($src -match '^(https?:|//|data:)') {
      continue
    }
    $assetPath = ($src -split '[?#]')[0]
    $target = Join-Path $outDir $assetPath
    if (-not (Test-Path -LiteralPath $target)) {
      $missingScripts += "$($html.Name) references missing script $src"
    }
  }
}

if ($missingScripts.Count -gt 0) {
  throw ($missingScripts -join [Environment]::NewLine)
}

Write-Host "Prepared PartyKit static assets in $outDir"
Write-Host "Version: $version $commit ($deployedAt)"
