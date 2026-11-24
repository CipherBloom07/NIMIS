<#
NIMIS Core Stage 1 development API using EXISTING Collector project-local PostgreSQL.
Creates only the separate nimis_core_dev database; does not touch Collector records.
Never a Windows service and never exposed on public/LAN interfaces.
#>
[CmdletBinding()]
param(
    [string]$CollectorProject = "C:\Users\2025\Desktop\DCA NIMIS",
    [switch]$SetupOnly
)
$ErrorActionPreference = 'Stop'
$Project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Bin = Join-Path $CollectorProject 'database\postgresql\bin'
$Psql = Join-Path $Bin 'psql.exe'
$Createdb = Join-Path $Bin 'createdb.exe'
$CollectorSecrets = Join-Path $CollectorProject 'database\.env.local'
$CoreSecretFolder = Join-Path $Project 'database\local'
$CoreSecrets = Join-Path $CoreSecretFolder 'core.env'
$DatabaseName = 'nimis_core_dev'
$Port = '55432'

Write-Host '=== NIMIS CORE STAGE 1 / ISOLATED LOCAL DATABASE ===' -ForegroundColor Cyan
Write-Host 'NOT a production identity provider or official data store.' -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath $Psql) -or -not (Test-Path -LiteralPath $Createdb)) {
    throw 'COLLECT_PORTABLE_POSTGRESQL_NOT_INSTALLED'
}
if (-not (Test-Path -LiteralPath $CollectorSecrets)) {
    throw 'COLLECT_POSTGRESQL_ADMIN_PASSWORD_FILE_NOT_FOUND'
}
$AdminLine = Get-Content -LiteralPath $CollectorSecrets | Where-Object { $_ -match '^NIMIS_PG_PASSWORD=[a-fA-F0-9]{64}$' } | Select-Object -First 1
if (-not $AdminLine) { throw 'COLLECT_LOCAL_POSTGRESQL_ADMIN_PASSWORD_NOT_FOUND' }
$AdminPassword = $AdminLine.Split('=')[1]
New-Item -ItemType Directory -Path $CoreSecretFolder -Force | Out-Null
if (-not (Test-Path -LiteralPath $CoreSecrets)) {
    $Entropy = New-Object byte[] 32
    $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Rng.GetBytes($Entropy) } finally { $Rng.Dispose() }
    $AppPassword = ([System.BitConverter]::ToString($Entropy)).Replace('-', '').ToLowerInvariant()
    Set-Content -LiteralPath $CoreSecrets -Encoding ASCII -Value "NIMIS_CORE_STAGE_PASSWORD=$AppPassword"
} else {
    $AppLine = Get-Content -LiteralPath $CoreSecrets | Where-Object { $_ -match '^NIMIS_CORE_STAGE_PASSWORD=[a-f0-9]{64}$' } | Select-Object -First 1
    if (-not $AppLine) { throw 'NIMIS_CORE_STAGE_PASSWORD_FILE_INVALID' }
    $AppPassword = $AppLine.Split('=')[1]
}
$OriginalPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $AdminPassword
    $Exists = & $Psql -X -w -q -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='nimis_core_dev'"
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_POSTGRESQL_NOT_RUNNING_OR_LOGIN_FAILED' }
    if (([string]$Exists).Trim() -ne '1') {
        & $Createdb -w -h 127.0.0.1 -p $Port -U postgres $DatabaseName
        if ($LASTEXITCODE -ne 0) { throw 'CREATE_ISOLATED_NIMIS_CORE_DATABASE_FAILED' }
        Write-Host 'ISOLATED_DB_CREATED: nimis_core_dev' -ForegroundColor Green
    } else {
        Write-Host 'ISOLATED_DB_EXISTS: nimis_core_dev' -ForegroundColor Green
    }
    & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $DatabaseName -v ON_ERROR_STOP=1 -f (Join-Path $Project 'server\core\schema.sql')
    if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_SCHEMA_APPLY_FAILED' }
    & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $DatabaseName -v ON_ERROR_STOP=1 -v "app_password=$AppPassword" -f (Join-Path $Project 'server\core\local_role.sql')
    if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_LOCAL_ROLE_SETUP_FAILED' }
} finally {
    if ($null -ne $OriginalPassword) { $env:PGPASSWORD = $OriginalPassword }
    else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}
Write-Host 'NIMIS_CORE_DB_AND_ROLE: PASS' -ForegroundColor Green
$env:NIMIS_STAGE_ENABLE = '1'
$env:NIMIS_STAGE_DEV_AUTH = '1'
$env:NIMIS_STAGE_DATABASE_URL = "postgresql://nimis_stage_demo:$AppPassword@127.0.0.1:$Port/$DatabaseName"
$Python = Join-Path $Project '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { $Python = 'python' }
if ($SetupOnly) {
    Write-Host 'NIMIS_CORE_SETUP_ONLY: PASS' -ForegroundColor Green
    return
}
& $Python -m pip install -r (Join-Path $Project 'server\core\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_PYTHON_DEPENDENCIES_FAILED' }
$Listener = Get-NetTCPConnection -LocalPort 8775 -State Listen -ErrorAction SilentlyContinue
if ($Listener) { throw 'NIMIS_CORE_PORT_8775_IN_USE' }
Set-Location -LiteralPath $Project
Write-Host 'NIMIS_CORE_API: http://127.0.0.1:8775/api/v1/stage/health' -ForegroundColor Green
Write-Host 'Dev-only synthetic actors require an explicit X-Nimis-Dev-Actor header.' -ForegroundColor Yellow
& $Python -m uvicorn server.core.app:app --host 127.0.0.1 --port 8775
