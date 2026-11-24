<#
ONLY for standalone fictional nimis_core_dev. Explicit opt-in test.
Adds 10 fictional registered-scheme form review/mapping grants and Demo Admin delegation;
does not approve any Ministry form or touch real data.
#>
[CmdletBinding()]
param(
 [string]$CollectorProject="C:\Users\2025\Desktop\DCA NIMIS",
 [switch]$EnableDemoOnly
)
$ErrorActionPreference='Stop'
if (-not $EnableDemoOnly) {
 throw "EXPLICIT_CONSENT_REQUIRED: add -EnableDemoOnly to install fictional test policy"
}
$Project=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Psql=Join-Path $CollectorProject 'database\postgresql\bin\psql.exe'
$File=Join-Path $CollectorProject 'database\.env.local'
$Sql=Join-Path $Project 'server\core\demo_form_approvals.sql'
foreach($item in @($Psql,$File,$Sql)){
 if (-not (Test-Path -LiteralPath $item)) { throw "REQUIRED_FILE_NOT_FOUND: $item" }
}
$AdminLine=Get-Content -LiteralPath $File |
 Where-Object {$_ -match '^NIMIS_PG_ADMIN_PASSWORD=[a-fA-F0-9]{64}$'} |
 Select-Object -First 1
if(-not $AdminLine){throw 'LOCAL_POSTGRESQL_PASSWORD_UNAVAILABLE'}
$Original=$env:PGPASSWORD
try{
 $env:PGPASSWORD=$AdminLine.Split('=')[1]
 $Db=(& $Psql -X -w -q -h 127.0.0.1 -p 55432 -U postgres -d nimis_core_dev -tAc "SELECT current_database()")
 if($LASTEXITCODE -ne 0 -or ([string]$Db).Trim() -ne 'nimis_core_dev'){
   throw 'FICTIONAL_REVIEW_REFUSES_NON_DEMO_DATABASE'
 }
 & $Psql -X -w -h 127.0.0.1 -p 55432 -U postgres -d nimis_core_dev -v ON_ERROR_STOP=1 -1 -f $Sql
 if($LASTEXITCODE -ne 0){throw 'FICTIONAL_REVIEW_FIXTURE_FAILED'}
 Write-Host 'FICTIONAL_FORM_REVIEW: PASS — 10 DEMO registered-scheme forms enabled ONLY in nimis_core_dev' -ForegroundColor Green
 Write-Host 'NOT institutional signoff. No production data modified.' -ForegroundColor Yellow
}finally{
 if($null -eq $Original){Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}
 else {$env:PGPASSWORD=$Original}
}
