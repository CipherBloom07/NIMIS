import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {functionalityRate,reportedYieldTonnesPerHa,croppingIntensity,physicalMilestoneProgress} from '../src/kpi-rules.mjs';

test('functionality definition does not equate equipped, functional and irrigated',()=>{
  assert.equal(functionalityRate(100,85),85);
  assert.equal(functionalityRate(0,0),null);
  assert.equal(functionalityRate('',0),null);
  assert.equal(functionalityRate(25,30),null);
  assert.equal(functionalityRate(-1,0),null);
  assert.equal(functionalityRate(100,'unavailable'),null);
});
test('seasonal yield and cropping intensity respect denominators',()=>{
  assert.equal(reportedYieldTonnesPerHa(45,9),5);
  assert.equal(reportedYieldTonnesPerHa(45,0),null);
  assert.equal(croppingIntensity(200,100),200);
  assert.equal(croppingIntensity(0,0),null);
});
test('physical project progress uses approved weights, not expenditure',()=>{
  assert.equal(physicalMilestoneProgress([{approvedWeight:3,verified:true},{approvedWeight:1,verified:false}]),75);
  assert.equal(physicalMilestoneProgress([]),null);
  assert.equal(physicalMilestoneProgress([{approvedWeight:-1,verified:true}]),null);
});
test('NIMIS source-aligned GUI assets and questionnaire assessment are present',()=>{
  for(const path of ['src/requirements-theme.css','src/SchemeAssessment.jsx','src/HistoricalBriefing.jsx',
    'docs/REQUIREMENTS_TRACEABILITY_2026.md','database/proposed/001_nimis_core_REVIEW_ONLY.sql']){
    assert.ok(existsSync(path),path);
  }
  const form=readFileSync('src/SchemeAssessment.jsx','utf8');
  for(const key of ['schemeId','ward','latitude','longitude','designArea','equippedArea','functionalArea','irrigatedArea','beneficiaries','waterSource','energyStatus','omStatus','lastVerifiedAt','documentReferences'])
    assert.ok(form.includes("'"+key+"'"),'Missing minimum field: '+key);
  const scheme=readFileSync('database/proposed/001_nimis_core_REVIEW_ONLY.sql','utf8');
  assert.match(scheme,/ROLLBACK;/);
  assert.match(scheme,/event_id uuid NOT NULL UNIQUE/);
  assert.match(scheme,/geography\(Point,4326\)/);
  assert.match(scheme,/workflow_decision/);
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(app,/id: 'assessment'/);
  assert.match(app,/id: 'briefing'/);
});
test('historical briefing is clearly not current dashboard data',()=>{
  const source=readFileSync('src/HistoricalBriefing.jsx','utf8');
  assert.match(source,/308,969|308969|sum\+row.irrigated/);
  assert.match(source,/30 October 2026/);
  assert.match(source,/not live NIMIS reporting/);
});

test('readable NIMIS theme replaces compressed legacy styling and preserves demo isolation',()=>{
  const main=readFileSync('src/main.jsx','utf8');
  const css=readFileSync('src/readable-ui.css','utf8');
  const dashboard=readFileSync('src/ExecutiveOverview.jsx','utf8');
  assert.match(main,/readable-ui\.css/);
  assert.doesNotMatch(main,/import ['"]\.\/reference-fidelity\.css['"]/);
  assert.match(css,/font-size:13\.5px!important/);
  assert.match(css,/\.app-shell>\.sidebar/);
  assert.match(css,/min-height:43px!important/);
  assert.match(css,/width:calc\(100% - 268px\)!important/);
  assert.match(css,/width:100%!important/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(dashboard,/PREVIEW_SCHEMES/);
  assert.match(dashboard,/displayedRecords=preview\?PREVIEW_SCHEMES:records/);
  assert.match(dashboard,/FICTIONAL LAYOUT PREVIEW/);
  assert.doesNotMatch(dashboard,/localStorage\.setItem/);
});

test('all JSX modules include a React binding for classic JSX runtime',()=>{
  const jsxNames=['App','DataManagement','DistrictInbox','ExecutiveOverview','HistoricalBriefing','NimisErrorBoundary','OfficialLogo','Registry','ReviewStageInbox','SchemeAssessment','main'];
  for(const name of jsxNames){
    const content=readFileSync('src/'+name+'.jsx','utf8');
    assert.match(content,/import\s+React\b/,name+' must import React when JSX is transformed by Vite');
  }
});

test('balanced-scale UI has normal desktop typography and responsive layout',()=>{
  const main=readFileSync('src/main.jsx','utf8');
  const css=readFileSync('src/balanced-scale.css','utf8');
  assert.match(main,/import '\.\/balanced-scale\.css'/);
  assert.match(css,/body\{font-size:13px!important/);
  assert.match(css,/\.app-shell>\.sidebar\{width:224px!important/);
  assert.match(css,/font-size:12px!important/);
  assert.match(css,/@media\(max-width:1080px\)/);
  assert.match(css,/\.app-shell>\.main-area\{margin-left:0!important;width:100%!important\}/);
});
