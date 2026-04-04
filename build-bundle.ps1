# Regenerate js/game.bundle.js for opening index.html via file:// (no local server).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsDir = Join-Path $root "js"
$names = @(
    "talents.js",
    "traits.js",
    "companies.js",
    "talentRuntime.js",
    "match.js",
    "state.js",
    "interviews.js",
    "applications.js",
    "events.js",
    "actions.js",
    "endings.js",
    "main.js"
)
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("/* game.bundle.js - auto-built; do not edit; open index.html with double-click */")
foreach ($name in $names) {
    $path = Join-Path $jsDir $name
    $t = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $t = [regex]::Replace($t, '(?ms)^import\s+.*?;\s*\r?\n', '')
    $t = [regex]::Replace($t, '(?m)^export\s+(?=(async\s+)?(function|const|let)\b)', '')
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("/* --- $name --- */")
    [void]$sb.AppendLine($t)
}
$outPath = Join-Path $jsDir "game.bundle.js"
[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "OK:" $outPath
