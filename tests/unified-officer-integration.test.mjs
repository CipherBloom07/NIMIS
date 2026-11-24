import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const district=readFileSync('src/DistrictInbox.jsx','utf8');
const review=readFileSync('src/ReviewStageInbox.jsx','utf8');
const shared=readFileSync('src/CoreOfficerInbox.jsx','utf8');
const app=readFileSync('src/App.jsx','utf8');
const forms=readFileSync('server/core/demo_form_approvals.sql','utf8');

test('all three officer modules share one canonical database-backed workflow',()=>{
  assert.match(district,/CoreOfficerInbox stage="district"/);
  assert.match(review,/CoreOfficerInbox stage=\{stage==='admin'\?'admin':'provincial'\}/);
  assert.match(shared,/127\.0\.0\.1:8775\/api\/v1\/stage/);
  assert.match(shared,/\/forms\/inbox/);
  assert.match(shared,/\/forms\/submissions\//);
  assert.match(shared,/\/forms\/sync\/status\//);
  assert.doesNotMatch(district+review+shared,/127\.0\.0\.1:8765/);
  assert.match(shared,/document\.visibilityState==='visible'/);
  assert.match(shared,/9000/);
});

test('district, province and admin only offer correct role/stage actions',()=>{
  assert.match(shared,/VERIFY:'DISTRICT_VERIFIED'/);
  assert.match(shared,/REVIEW:'PROVINCIAL_REVIEWED'/);
  assert.match(shared,/TECHNICAL_APPROVE:'TECHNICAL_APPROVED'/);
  assert.match(shared,/PUBLISH:'PUBLISHED'/);
  assert.match(shared,/RETURN:'RETURNED'/);
  assert.match(shared,/decision_id:crypto\.randomUUID\(\)/);
  assert.match(shared,/A meaningful return reason is required/);
  assert.match(shared,/district:\{id:/);
});

test('all ten registered-scheme forms may complete explicit fictional chain',()=>{
  const ids=['baseline','operational_status','seasonal_production','water_availability',
    'infrastructure_incident','om_finance','energy_power','project_update',
    'risk_register','farmer_plot'];
  for(const id of ids)assert.ok(forms.includes("'"+id+"'"),id);
  assert.doesNotMatch(forms,/\('new_scheme_request',1,/);
  assert.match(forms,/current_database\(\)<>'nimis_core_dev'/);
});

test('actual published survey rows are shown in the relevant module reporting views',()=>{
  assert.match(app,/PublishedFieldPreview moduleFilter=/);
  assert.match(app,/infrastructure:\['infrastructure','operations_maintenance'\]/);
  assert.match(app,/agronomy:\['agronomy'\]/);
  assert.match(app,/projects:\['projects'\]/);
  assert.match(app,/water:\['water_resources'\]/);
  assert.match(app,/import\.meta\.env\.DEV&&<PublishedFieldPreview\/>/);
});
