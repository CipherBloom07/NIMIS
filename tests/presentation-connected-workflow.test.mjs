import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync('src/CoreWorkflowLab.jsx','utf8');
const launch=readFileSync('scripts/START_NIMIS_PRESENTATION.ps1','utf8');
const web=readFileSync('scripts/START_NIMIS_WEB_LOCAL.ps1','utf8');
const smoke=readFileSync('scripts/TEST_PRESENTATION_BRIDGE.ps1','utf8');
const published=readFileSync('src/PublishedFieldPreview.jsx','utf8');

test('Core inbox polls authorized server for collector form receipts',()=>{
 assert.match(main,/setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)void refreshLive\(\)\},12000\)/);
 assert.match(main,/call\('\/forms\/inbox'\)/);
 assert.match(main,/health\.production_ready!==false/);
 assert.match(main,/setFieldInbox\(queue\.items\|\|\[\]\)/);
 assert.match(main,/Return for correction/);
});

test('presentation starts services loopback-only without data reset or firewall exposure',()=>{
 for(const marker of ['127.0.0.1:8775','55432','8110','5191','SeedFictional','EnableFictionalSignoffs','-SetupOnly'])
   assert.ok(launch.includes(marker),marker);
 assert.match(launch,/POSTGRES_PORT_55432_ALREADY_OCCUPIED/);
 assert.match(launch,/Get-NetTCPConnection/);
 assert.match(launch,/Start-Window/);
 assert.doesNotMatch(launch,/DROP DATABASE|TRUNCATE|git reset|git clean|New-NetFirewallRule|0\.0\.0\.0/);
 assert.match(web,/--strictPort/);
});

test('smoke checks identity scoping and published report without changing records',()=>{
 assert.match(smoke,/COLLECTOR_REPORT_DENIAL/);
 assert.match(smoke,/PUBLISHED_DEMO_ONLY/);
 assert.match(smoke,/READ_ONLY_PRESENTATION_PRECHECK/);
 assert.doesNotMatch(smoke,/Invoke-RestMethod[^\n]+-Method\s+Post|DELETE FROM|INSERT INTO/);
 assert.match(published,/reports\/published\?period_code=/);
});


test('presentation can initialize a new project-scoped portable Postgres without touching older data',()=>{
 assert.match(launch,/START_POSTGRES_LOCAL\.ps1/);
 assert.match(launch,/& \$Bootstrap -SetupOnly/);
 assert.match(launch,/\$DatabaseProject=\$CollectorApp/);
 assert.match(launch,/COLLECTOR_POSTGRES_BOOTSTRAP_INCOMPLETE/);
});
