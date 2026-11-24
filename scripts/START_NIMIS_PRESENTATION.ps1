<#
NIMIS PRESENTATION: one coordinated local-only start.
Runs one existing project-scoped PostgreSQL cluster, Main Core,
Main frontend and Collector frontend. Never drops data, resets git,
opens Windows firewall or exposes a development actor over the LAN.
Use fictional irrigation schemes ONLY.
#>
[CmdletBinding()]
param(
 [string]$CollectorApp='',
 [string]$DatabaseProject='',
 [switch]$EnableFictionalSignoffs,
 [switch]$NoBrowser
)
$ErrorActionPreference='Stop'
$Main=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if(-not $CollectorApp){
 $Candidate=Join-Path (Split-Path -Parent $Main) 'NIMIS-Data-Collection'
 if(-not (Test-Path -LiteralPath $Candidate)){
   $Candidate=Join-Path $env:USERPROFILE 'Desktop\NIMIS_PAIRED_MANUAL_TEST\NIMIS_COLLECTOR_TEST'
 }
 $CollectorApp=$Candidate
}
if(-not (Test-Path -LiteralPath (Join-Path $CollectorApp 'src\RequirementsForms.tsx'))){
 throw 'COLLECTOR_APP_NOT_FOUND: supply -CollectorApp with the full Collector source directory'
}
$CollectorApp=(Resolve-Path -LiteralPath $CollectorApp).Path
if(-not $DatabaseProject){
 foreach($candidate in @(
    $CollectorApp,
    (Join-Path $env:USERPROFILE 'Desktop\DCA NIMIS'),
    (Join-Path $env:USERPROFILE 'OneDrive\Desktop\DCA NIMIS')
 )){
   if(Test-Path -LiteralPath (Join-Path $candidate 'database\postgresql\bin\pg_ctl.exe')){
     $DatabaseProject=$candidate;break
   }
 }
}
if(-not $DatabaseProject){throw 'INSTALLED_PORTABLE_POSTGRES_NOT_FOUND: supply -DatabaseProject'}
$DatabaseProject=(Resolve-Path -LiteralPath $DatabaseProject).Path
$Data=Join-Path $DatabaseProject 'database\data'
$Bin=Join-Path $DatabaseProject 'database\postgresql\bin'
$Ctl=Join-Path $Bin 'pg_ctl.exe'
$Psql=Join-Path $Bin 'psql.exe'
$Secrets=Join-Path $DatabaseProject 'database\.env.local'
$Logs=Join-Path $DatabaseProject 'database\logs'
foreach($file in @($Ctl,$Psql,$Secrets,(Join-Path $Data 'PG_VERSION'))){
 if(-not (Test-Path -LiteralPath $file)){throw ("LOCAL_DATABASE_COMPONENT_MISSING: "+$file)}
}
if(-not (Test-Path -LiteralPath $Logs)){New-Item -ItemType Directory -Path $Logs|Out-Null}
Write-Host '=== NIMIS CROSS-APP FICTIONAL PRESENTATION ===' -ForegroundColor Cyan
Write-Host 'The two applications connect to one isolated Core API at 127.0.0.1:8775' -ForegroundColor Cyan
Write-Host 'Same Windows laptop only; institutional production security not configured.' -ForegroundColor Yellow
$OldAction=$ErrorActionPreference
try{
  $ErrorActionPreference='Continue'
  & $Ctl -D $Data status 2>$null|Out-Null
  $DbRunning=($LASTEXITCODE -eq 0)
}finally{$ErrorActionPreference=$OldAction}
if(-not $DbRunning){
 if(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue){
    throw 'POSTGRES_PORT_55432_ALREADY_OCCUPIED: will not start a second database'
 }
 & $Ctl -D $Data -l (Join-Path $Logs 'postgres.log') -o '-h 127.0.0.1 -p 55432' -w -t 60 start
 if($LASTEXITCODE -ne 0){throw 'PROJECT_LOCAL_POSTGRES_FAILED'}
}
$EarlierPwd=$env:PGPASSWORD
try{
  $Line=Get-Content -LiteralPath $Secrets|
    Where-Object {$_ -match '^NIMIS_PG_ADMIN_PASSWORD=[a-fA-F0-9]{64}$'}|
    Select-Object -First 1
  if(-not $Line){throw 'LOCAL_POSTGRES_ADMIN_PASSWORD_INVALID'}
  $env:PGPASSWORD=$Line.Split('=')[1]
  $Check=(& $Psql -X -w -q -h 127.0.0.1 -p 55432 -U postgres -d postgres -tAc 'SELECT 1'|Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $Check -ne '1'){throw 'PROJECT_POSTGRES_AUTH_FAILED'}
}finally{
  if($null -eq $EarlierPwd){Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}
  else{$env:PGPASSWORD=$EarlierPwd}
}
$Setup=Join-Path $Main 'scripts\START_NIMIS_CORE_LOCAL.ps1'
$Approval=Join-Path $Main 'scripts\ENABLE_FICTIONAL_FORM_REVIEW.ps1'
& $Setup -CollectorProject $DatabaseProject -SeedFictional -SetupOnly
if($EnableFictionalSignoffs){
  & $Approval -CollectorProject $DatabaseProject -EnableDemoOnly
}else{
  Write-Warning 'FORM_APPROVAL_GATE: no demo approval fixture. Officer VERIFY intentionally requires an approved test form.'
}
foreach($port in @(8110,5191,8775)){
 if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){
   throw ("PRESENTATION_PORT_BUSY: "+$port+"; existing application was not stopped")
 }
}
function Start-Window([string]$Script,[string[]]$Params,[string]$Title){
 $argsList=@('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File',('"' + $Script + '"'))
 foreach($param in $Params){$argsList+=('"' + $param + '"')}
 $process=Start-Process -FilePath 'powershell.exe' -ArgumentList $argsList -PassThru
 Write-Host ($Title+' started (PID '+$process.Id+')') -ForegroundColor Cyan
}
Start-Window (Join-Path $Main 'scripts\START_NIMIS_CORE_LOCAL.ps1') @(
 '-CollectorProject',$DatabaseProject,'-SeedFictional'
) 'Core API'
$Health=$null
for($i=0;$i -lt 60;$i++){
  try{
    $Health=Invoke-RestMethod -Uri 'http://127.0.0.1:8775/api/v1/stage/health' -TimeoutSec 2
    if($Health.mode -eq 'isolated-development' -and $Health.production_ready -eq $false){break}
    throw 'UNEXPECTED_CORE_SERVICE_IDENTITY'
  }catch{
    if($i -eq 59){throw 'MAIN_NIMIS_CORE_DID_NOT_START: inspect Core API window'}
    Start-Sleep -Milliseconds 1000
  }
}
Start-Window (Join-Path $Main 'scripts\START_NIMIS_WEB_LOCAL.ps1') @('-Port','8110') 'Main NIMIS'
Start-Window (Join-Path $CollectorApp 'scripts\START_CONNECTED_COLLECTOR_PILOT.ps1') @(
 '-CollectorPath',$CollectorApp,'-CollectorPort','5191'
) 'Data Collector'
Write-Host 'NIMIS_MAIN: http://127.0.0.1:8110/' -ForegroundColor Green
Write-Host 'NIMIS_COLLECTOR: http://127.0.0.1:5191/' -ForegroundColor Green
Write-Host 'NIMIS_CORE: http://127.0.0.1:8775/api/v1/stage/health' -ForegroundColor Green
Write-Host 'Use fictional data only; do not use this local development login for real field records.' -ForegroundColor Yellow
if(-not $NoBrowser){
 Start-Process 'http://127.0.0.1:8110/'
 Start-Process 'http://127.0.0.1:5191/'
}
