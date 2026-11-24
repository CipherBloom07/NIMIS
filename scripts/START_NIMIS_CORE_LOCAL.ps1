<#
NIMIS Core — isolated local development launcher.
Uses existing Collector portable PostgreSQL, creates/updates only nimis_core_dev.
No real Ministry records, no public network listeners, no destructive database operations.
#>
[CmdletBinding()]
param(
    [string]$CollectorProject = "C:\Users\2025\Desktop\DCA NIMIS",
    [switch]$SetupOnly,
    [switch]$SeedFictional
)
$ErrorActionPreference = 'Stop'
$Project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DbName = 'nimis_core_dev'
$PgHost = '127.0.0.1'
$PgPort = 55432
$Psql = Join-Path $CollectorProject 'database\postgresql\bin\psql.exe'
$Createdb = Join-Path $CollectorProject 'database\postgresql\bin\createdb.exe'
$CollectorSecrets = Join-Path $CollectorProject 'database\.env.local'
$LocalFolder = Join-Path $Project 'database\local'
$CoreSecrets = Join-Path $LocalFolder 'core.env'

Write-Host '=== NIMIS ISOLATED CORE REVIEW ===' -ForegroundColor Cyan
Write-Host 'Local fictional database only. Not official Ministry data.' -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath $Psql) -or -not (Test-Path -LiteralPath $Createdb)) {
    throw 'COLLECT_PORTABLE_POSTGRESQL_NOT_INSTALLED'
}
if (-not (Test-Path -LiteralPath $CollectorSecrets)) {
    throw 'COLLECT_POSTGRESQL_ADMIN_PASSWORD_FILE_NOT_FOUND'
}
$AdminLine = Get-Content -LiteralPath $CollectorSecrets |
    Where-Object { $_ -match '^NIMIS_PG_ADMIN_PASSWORD=[a-fA-F0-9]{64}$' } |
    Select-Object -First 1
if (-not $AdminLine) { throw 'COLLECT_LOCAL_POSTGRESQL_ADMIN_PASSWORD_NOT_FOUND' }
$AdminPassword = $AdminLine.Split('=')[1]

if (-not (Test-Path -LiteralPath $LocalFolder)) {
    New-Item -ItemType Directory -Path $LocalFolder -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $CoreSecrets)) {
    $Entropy = New-Object byte[] 32
    $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Rng.GetBytes($Entropy) } finally { $Rng.Dispose() }
    $AppPassword = ([BitConverter]::ToString($Entropy)).Replace('-', '').ToLowerInvariant()
    Set-Content -LiteralPath $CoreSecrets -Value "NIMIS_CORE_STAGE_PASSWORD=$AppPassword" -Encoding ASCII
} else {
    $AppLine = Get-Content -LiteralPath $CoreSecrets |
        Where-Object { $_ -match '^NIMIS_CORE_STAGE_PASSWORD=[a-f0-9]{64}$' } |
        Select-Object -First 1
    if (-not $AppLine) { throw 'NIMIS_CORE_STAGE_PASSWORD_FILE_INVALID' }
    $AppPassword = $AppLine.Split('=')[1]
}
$OldPgPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $AdminPassword
    $Exists = & $Psql -X -w -q -h $PgHost -p $PgPort -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='nimis_core_dev'"
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_POSTGRESQL_NOT_RUNNING_OR_LOGIN_FAILED' }
    if (([string]$Exists).Trim() -ne '1') {
        & $Createdb -w -h $PgHost -p $PgPort -U postgres $DbName
        if ($LASTEXITCODE -ne 0) { throw 'CREATE_ISOLATED_NIMIS_CORE_DATABASE_FAILED' }
        Write-Host 'ISOLATED_DB_CREATED: nimis_core_dev' -ForegroundColor Green
    } else {
        Write-Host 'ISOLATED_DB_EXISTS: nimis_core_dev' -ForegroundColor Green
    }
    $Schema = Join-Path $Project 'server\core\schema.sql'
    $LimitedRole = Join-Path $Project 'server\core\local_role.sql'
    & $Psql -X -w -h $PgHost -p $PgPort -U postgres -d $DbName -v ON_ERROR_STOP=1 -f $Schema
    if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_SCHEMA_APPLY_FAILED' }
    & $Psql -X -w -h $PgHost -p $PgPort -U postgres -d $DbName -v ON_ERROR_STOP=1 -v "app_password=$AppPassword" -f $LimitedRole
    if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_LOCAL_ROLE_SETUP_FAILED' }
    if ($SeedFictional) {
        & $Psql -X -w -h $PgHost -p $PgPort -U postgres -d $DbName -v ON_ERROR_STOP=1 -f (Join-Path $Project 'server\core\demo_seed.sql')
        if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_FICTIONAL_SEED_FAILED' }
        Write-Host 'FICTIONAL_SCHEME_AND_ROLES: SEEDED' -ForegroundColor Green
    }
} finally {
    if ($null -ne $OldPgPassword) { $env:PGPASSWORD = $OldPgPassword }
    else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}
Write-Host 'NIMIS_CORE_DB_AND_ROLE: PASS' -ForegroundColor Green
$env:NIMIS_STAGE_ENABLE = '1'
$env:NIMIS_STAGE_DEV_AUTH = '1'
$env:NIMIS_STAGE_OIDC_ENABLED = '0'
$env:NIMIS_STAGE_DATABASE_URL = "postgresql://nimis_stage_demo:$AppPassword@127.0.0.1:$PgPort/$DbName"
$Python = Join-Path $Project '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { $Python = 'python' }
if ($SetupOnly) {
    Write-Host 'NIMIS_CORE_SETUP_ONLY: PASS' -ForegroundColor Green
    return
}
& $Python -m pip install -r (Join-Path $Project 'server\core\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'NIMIS_CORE_PYTHON_DEPENDENCIES_FAILED' }
if (Get-NetTCPConnection -LocalPort 8775 -State Listen -ErrorAction SilentlyContinue) {
    throw 'NIMIS_CORE_PORT_8775_IN_USE'
}
Push-Location $Project
try {
    Write-Host 'NIMIS_CORE_API: http://127.0.0.1:8775/api/v1/stage/health' -ForegroundColor Green
    Write-Host 'Synthetic actors work only within the local review environment.' -ForegroundColor Yellow
    & $Python -m uvicorn server.core.app:app --host 127.0.0.1 --port 8775
} finally { Pop-Location }
