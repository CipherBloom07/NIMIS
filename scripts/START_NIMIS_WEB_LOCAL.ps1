# NIMIS main frontend — local fictional presentation; leaves existing registry untouched.
[CmdletBinding()]
param([int]$Port=8110)
$ErrorActionPreference='Stop'
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if(-not (Test-Path -LiteralPath (Join-Path $Root 'package.json')) -or
   -not (Test-Path -LiteralPath (Join-Path $Root 'src\CoreWorkflowLab.jsx'))){
    throw 'MAIN_NIMIS_FRONTEND_NOT_FOUND'
}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){
    throw ("NIMIS_MAIN_PORT_IN_USE: "+$Port+"; Existing process was not stopped")
}
Push-Location $Root
try{
    if(-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\vite'))){
        & npm ci
        if($LASTEXITCODE -ne 0){throw 'NIMIS_MAIN_NPM_INSTALL_FAILED'}
    }
    Write-Host ("NIMIS_MAIN_PRESENTATION: http://127.0.0.1:"+$Port+"/") -ForegroundColor Green
    Write-Host 'District, Provincial and Admin review: Core Database Workflow (Test)' -ForegroundColor Cyan
    & npm run dev -- --host 127.0.0.1 --port $Port --strictPort
    if($LASTEXITCODE -ne 0){throw 'NIMIS_MAIN_VITE_FAILED'}
}finally{Pop-Location}
