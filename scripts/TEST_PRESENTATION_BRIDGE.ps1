# NIMIS two-app read-only health / authorization / reporting smoke test.
# Never writes, approves, seeds, publishes, or modifies records.
[CmdletBinding()]
param([string]$CoreBase='http://127.0.0.1:8775/api/v1/stage',[string]$Month='2026-11')
$ErrorActionPreference='Stop'
if($CoreBase -ne 'http://127.0.0.1:8775/api/v1/stage'){
  throw 'SMOKE_TEST_ONLY_SUPPORTS_LOCAL_ISOLATED_CORE'
}
if($Month -notmatch '^\d{4}-(0[1-9]|1[0-2])$'){throw 'INVALID_REPORTING_MONTH'}
$Roles=@{
  collector='00000000-0000-4000-8000-000000000004'
  district='00000000-0000-4000-8000-000000000003'
  province='00000000-0000-4000-8000-000000000002'
  admin='00000000-0000-4000-8000-000000000001'
}
function Get-Core([string]$Path,[string]$Role){
 $headers=@{}
 if($Role){$headers['X-Nimis-Dev-Actor']=$Roles[$Role]}
 return Invoke-RestMethod -Uri ($CoreBase+$Path) -Headers $headers -TimeoutSec 6
}
Write-Host '=== NIMIS PRESENTATION BRIDGE READ-ONLY VERIFICATION ===' -ForegroundColor Cyan
$health=Get-Core '/health' ''
if($health.mode -ne 'isolated-development' -or $health.production_ready -ne $false){
 throw 'UNEXPECTED_CORE_ENVIRONMENT'
}
Write-Host 'CORE_HEALTH: PASS (local fictional stage)' -ForegroundColor Green
$collector=Get-Core '/schemes' 'collector'
if($collector.source -ne 'ISOLATED_DEVELOPMENT' -or
   -not @($collector.items | Where-Object {$_.scheme_code -eq 'DEMO-NIMIS-0001'}).Count){
 throw 'COLLECTOR_DEMO_ASSIGNMENT_MISSING'
}
Write-Host 'DISTRICT_ASSIGNED_COLLECTOR: PASS' -ForegroundColor Green
$district=Get-Core '/forms/inbox' 'district'
$province=Get-Core '/forms/inbox' 'province'
if($district.source -ne 'ISOLATED_DEVELOPMENT' -or
   $province.source -ne 'ISOLATED_DEVELOPMENT'){
 throw 'OFFICER_INBOX_SOURCE_MISMATCH'
}
Write-Host ('DISTRICT_INBOX_RECORDS: '+@($district.items).Count) -ForegroundColor Green
Write-Host ('PROVINCE_INBOX_RECORDS: '+@($province.items).Count) -ForegroundColor Green
$encoded=[uri]::EscapeDataString($Month)
$report=Get-Core ('/forms/reports/published?period_code='+$encoded) 'district'
if($report.source -ne 'ISOLATED_DEVELOPMENT' -or
   $report.official -ne $false -or
   $report.data_status -ne 'PUBLISHED_DEMO_ONLY'){
 throw 'PUBLISHED_REPORT_CONTRACT_INVALID'
}
Write-Host ('PUBLISHED_DEMO_ONLY_RECORDS: '+$report.record_count) -ForegroundColor Green
try{
  $null=Get-Core ('/forms/reports/published?period_code='+$encoded) 'collector'
  throw 'SECURITY_FAILURE_COLLECTOR_READ_PUBLISHED_REPORT'
}catch{
  if($_.Exception.Message -match 'SECURITY_FAILURE'){throw}
  $code=$null
  try{$code=[int]$_.Exception.Response.StatusCode}catch{}
  if($code -ne 403){throw 'UNEXPECTED_COLLECTOR_REPORT_PERMISSION_RESULT'}
}
Write-Host 'COLLECTOR_REPORT_DENIAL: PASS (HTTP 403)' -ForegroundColor Green
Write-Host 'READ_ONLY_PRESENTATION_PRECHECK: PASS' -ForegroundColor Green
Write-Host 'Manual end-to-end proof: save offline, queue, sync, return/revise, district/province/admin approve, then open published reporting.'
