import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dashboard=readFileSync('src/ExecutiveOverview.jsx','utf8');
const panel=readFileSync('src/PublishedFieldPreview.jsx','utf8');
const lab=readFileSync('src/CoreWorkflowLab.jsx','utf8');
const approval=readFileSync('server/core/demo_form_approvals.sql','utf8');
const installer=readFileSync('scripts/ENABLE_FICTIONAL_FORM_REVIEW.ps1','utf8');

test('executive dashboard preview is dev-only and cannot mutate the registry totals',()=>{
  assert.match(dashboard,/import\.meta\.env\.DEV&&<PublishedFieldPreview\/>/);
  assert.match(panel,/if\(!import\.meta\.env\.DEV\)return null/);
  assert.match(panel,/data\.official!==false/);
  assert.match(panel,/PUBLISHED_DEMO_ONLY/);
  assert.match(panel,/reports\/published\?period_code=/);
  assert.doesNotMatch(panel,/localStorage\.setItem|enqueueSyncChange|UPDATE nimis_stage/);
});

test('officer can actually return a fictional form with a reason',()=>{
  assert.match(lab,/Return for correction/);
  assert.match(lab,/window\.prompt\(/);
  assert.match(lab,/action==='RETURN'/);
  assert.match(lab,/reason/);
});

test('fictional approval fixture is explicitly isolated, opted in, and not official',()=>{
  assert.match(installer,/-EnableDemoOnly/);
  assert.match(installer,/nimis_core_dev/);
  assert.match(approval,/current_database\(\)<>'nimis_core_dev'/);
  assert.match(approval,/DEMO_ADMIN_NOT_SEEDED/);
  assert.match(approval,/DEMO_SCHEME_NOT_SEEDED/);
  assert.match(approval,/NOT MINISTRY APPROVAL/);
});
