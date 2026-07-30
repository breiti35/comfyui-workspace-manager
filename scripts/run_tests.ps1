# Faehrt die komplette Testsuite: Backend (pytest) + Frontend (Node-Testrunner).
#
#   pwsh scripts/run_tests.ps1            # alles
#   pwsh scripts/run_tests.ps1 -Only be   # nur Backend
#   pwsh scripts/run_tests.ps1 -Only fe   # nur Frontend
#
# Es werden keine zusaetzlichen Pakete gebraucht: pytest kommt aus der
# ComfyUI-Python-Umgebung, der Frontend-Runner ist in Node (>= 22) eingebaut.

param(
    [ValidateSet("all", "be", "fe")]
    [string]$Only = "all"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$fehler = @()

if ($Only -in @("all", "be")) {
    Write-Host "`n=== Backend (pytest) ===" -ForegroundColor Cyan
    Push-Location (Join-Path $repo "tests")
    try {
        # Aus tests/ heraus, damit pytest nicht das __init__.py im Repo-Root
        # als Sammel-Wurzel nimmt (siehe tests/pytest.ini).
        python -m pytest -q
        if ($LASTEXITCODE -ne 0) { $fehler += "Backend" }
    }
    finally { Pop-Location }
}

if ($Only -in @("all", "fe")) {
    Write-Host "`n=== Frontend (node --test) ===" -ForegroundColor Cyan
    Push-Location $repo
    try {
        $testdateien = Get-ChildItem "tests/frontend/*.test.ts" | ForEach-Object {
            "tests/frontend/$($_.Name)"
        }
        node --experimental-test-module-mocks `
             --disable-warning=ExperimentalWarning `
             --import ./tests/frontend/setup.mjs `
             --test @testdateien
        if ($LASTEXITCODE -ne 0) { $fehler += "Frontend" }
    }
    finally { Pop-Location }
}

Write-Host ""
if ($fehler.Count -gt 0) {
    Write-Host "FEHLGESCHLAGEN: $($fehler -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "Alle Tests bestanden." -ForegroundColor Green
