import React, {useEffect,useMemo,useState} from 'react';
import { ClipboardCheck, Download, Save, Search, ShieldCheck } from 'lucide-react';

/*
  Source: NIMIS Concept and GUI Illustrations, section 12 (24 mandatory fields);
  mWater Irrigation Schemes Survey Questionnaire, pages 1-11.
  The browser assessment is an editable prototype and NOT an approved national record.
*/
export const ASSESSMENT_SECTIONS = [
  {label:'Scheme identity & location',fields:[
    ['schemeId','Unique scheme identification number','text',true],
    ['name','Scheme name','text',true],
    ['aliases','Scheme name aliases','text',false],
    ['province','Province','text',true],
    ['district','District','text',true],
    ['ward','Ward','text',true],
    ['latitude','Latitude (WGS84)','number',true],
    ['longitude','Longitude (WGS84)','number',true],
    ['boundaryReference','GIS boundary / survey reference','text',true],
    ['category','Scheme category (Communal, A1, A2, Estate, etc.)','text',true],
    ['ownership','Ownership or responsible institution','text',true],
    ['commissionedYear','Year established / commissioned','number',true],
  ]},
  {label:'Area, beneficiaries & irrigation technology',fields:[
    ['designArea','Original design area (ha)','number',true],
    ['irrigableArea','Irrigable area (ha)','number',true],
    ['equippedArea','Equipped area (ha)','number',true],
    ['developedArea','Developed area (ha)','number',true],
    ['functionalArea','Functional area (ha)','number',true],
    ['irrigatedArea','Actually irrigated area (ha)','number',true],
    ['season','Reporting season for actually irrigated area','text',true],
    ['beneficiaries','Number of beneficiaries','number',true],
    ['activeFarmers','Number of active farmers','number',true],
    ['technology','Irrigation technology','text',true],
  ]},
  {label:'Water & energy',fields:[
    ['waterSource','Water source type and name','text',true],
    ['abstractionCapacity','Water abstraction capacity (m³/day)','number',true],
    ['energyStatus','Electricity or energy source/status','text',true],
  ]},
  {label:'Operations, agronomy & infrastructure',fields:[
    ['assetCondition','Infrastructure condition (headworks, conveyance, storage, infield)','text',true],
    ['assessmentDate','Last infrastructure assessment date','date',true],
    ['crops','Crops grown','text',true],
    ['productionTonnes','Seasonal production (tonnes)','number',true],
    ['yieldTonnesHa','Crop yield (tonnes/ha)','number',true],
    ['omStatus','Operation & Maintenance fund and maintenance status','text',true],
    ['operationalStatus','Current operational status','select',true,['Fully functional','Partially functional','Under construction','Under rehabilitation','Non-functional']],
    ['rehabilitationRequirements','Rehabilitation and investment requirements','text',true],
  ]},
  {label:'Data verification & supporting evidence',fields:[
    ['officerRole','Responsible officer / contributing role','text',true],
    ['lastVerifiedAt','Date of last verification','date',true],
    ['verificationMethod','Verification method (e.g., site visit)','text',true],
    ['documentReferences','Supporting document / photograph references','text',true],
    ['source','Source of this assessment','text',true],
    ['remarks','Assessment notes','text',false],
  ]},
];

const STORE='nimis-scheme-assessments-draft-v1';
const fields=ASSESSMENT_SECTIONS.flatMap(section=>section.fields);
const numbered=['designArea','irrigableArea','equippedArea','developedArea','functionalArea','irrigatedArea','beneficiaries','activeFarmers','abstractionCapacity','productionTonnes','yieldTonnesHa'];

function safelyRead(){
  try { const value=JSON.parse(localStorage.getItem(STORE)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
  catch {return {};}
}
function escapeCsv(value){
  let text=String(value??'');
  if(/^[\s]*[=+@-]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function assessDraft(record){
  const issues=[];
  for (const [key,label,,required] of fields){
    if(required && String(record[key]??'').trim()==='')issues.push(label+' is required');
  }
  for(const key of numbered){
    if(record[key]!=='' && record[key]!==undefined &&
       (!Number.isFinite(Number(record[key])) || Number(record[key])<0)){
      issues.push((fields.find(f=>f[0]===key)||[])[1]+' must be non-negative');
    }
  }
  if(record.latitude!==''&&record.latitude!==undefined&&(!Number.isFinite(Number(record.latitude))||Number(record.latitude)<-90||Number(record.latitude)>90)) issues.push('Latitude must be between -90 and 90');
  if(record.longitude!==''&&record.longitude!==undefined&&(!Number.isFinite(Number(record.longitude))||Number(record.longitude)<-180||Number(record.longitude)>180)) issues.push('Longitude must be between -180 and 180');
  if(record.commissionedYear && (Number(record.commissionedYear)<1850||Number(record.commissionedYear)>new Date().getFullYear()))issues.push('Year commissioned is outside the valid range');
  // Scheme area definitions are different; avoid inventing a relationship between developed and irrigable.
  if(record.functionalArea!==''&&record.equippedArea!==''&&record.functionalArea!==undefined&&record.equippedArea!==undefined &&
    Number(record.functionalArea)>Number(record.equippedArea))issues.push('Functional area cannot exceed equipped area');
  return issues;
}
function makeDraft(scheme){
  return {...Object.fromEntries(fields.map(([key])=>[key,''])),
    schemeId:scheme.id||'',name:scheme.name||'',province:scheme.province||'',
    district:scheme.district||'',equippedArea:scheme.equipped??'',
    developedArea:scheme.developed??'',irrigatedArea:scheme.irrigated??'',
    waterSource:scheme.water||'',operationalStatus:scheme.status||'',source:'Local prototype — unverified',
  };
}
export default function SchemeAssessment(){
  const [master,setMaster]=useState([]);
  const [records,setRecords]=useState(safelyRead);
  const [scheme,setScheme]=useState('');
  const [sectionIndex,setSectionIndex]=useState(0);
  const [search,setSearch]=useState('');
  const [notice,setNotice]=useState('');
  const [draft,setDraft]=useState(()=>makeDraft({}));
  useEffect(()=>{
    function reload(){
      try{
        const m=JSON.parse(localStorage.getItem('nimis-registry-v1')||'[]');
        setMaster(Array.isArray(m)?m:[]);
      }catch {setMaster([]);}
    }
    reload();
    window.addEventListener('nimis-registry-updated',reload);
    return()=>window.removeEventListener('nimis-registry-updated',reload);
  },[]);
  const saved=Object.values(records);
  const filtered=saved.filter(x=>
    Object.values(x).some(value=>String(value??'').toLowerCase().includes(search.toLowerCase())));
  const complete=useMemo(()=>fields.filter(([, , ,required])=>required).filter(([key])=>String(draft[key]??'').trim()!=='').length,[draft]);
  const mandatory=fields.filter(f=>f[3]).length;
  const issues=useMemo(()=>assessDraft(draft),[draft]);
  function pick(id){
    if(!id){setScheme('');setDraft(makeDraft({}));return;}
    const existing=records[id];
    const source=master.find(x=>x.id===id);
    setScheme(id);
    setDraft(existing?{...makeDraft(source||{}),...existing}:makeDraft(source||{id}));
    setNotice('');
    setSectionIndex(0);
  }
  function save(){
    const id=String(draft.schemeId||'').trim();
    if(!id){setNotice('Select or enter a unique scheme ID before saving.');return;}
    const next={...records,[id]:{...draft,schemeId:id,updatedAt:new Date().toISOString(),recordStatus:'LOCAL_DRAFT'}};
    try{localStorage.setItem(STORE,JSON.stringify(next));setRecords(next);setScheme(id);
      setNotice('Assessment saved on this browser only. It has NOT been verified, approved or uploaded.');}
    catch{setNotice('Storage unavailable: assessment NOT saved. Do not leave until you export a backup.');}
  }
  function exportData(){
    const columns=['schemeId',...fields.map(([key])=>key).filter(k=>k!=='schemeId'),'updatedAt','recordStatus'];
    const csv=[columns.map(escapeCsv).join(','),...filtered.map(row=>columns.map(key=>escapeCsv(row[key])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='NIMIS-scheme-assessments-LOCAL-DRAFT.csv';a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  const selected=ASSESSMENT_SECTIONS[sectionIndex];
  return <div className="module-page assessment-page">
    <div className="welcome-row"><div><div className="eyebrow">SCHEME REGISTRY / DATA QUALITY</div>
      <h1>Scheme Baseline Assessment</h1>
      <p className="subtitle">24-field national minimum dataset, expanded for questionnaire evidence and seasonal reporting.</p></div>
      <span className="map-layer-label">Local draft · not approved</span></div>
    <div className="data-note"><ShieldCheck size={17}/><span><strong>Governance:</strong> assessments remain in this browser until an approved server submission workflow exists. 'Save' does not verify or publish values. Do not enter confidential personal information in this prototype.</span></div>
    <div className="assessment-layout">
      <section className="panel assessment-editor">
        <div className="panel-head"><div><h2>Assessment form</h2><p>Select a scheme from the local register or enter a new unique ID.</p></div>
          <div className="assessment-progress">{complete} / {mandatory} mandatory fields</div></div>
        <div className="assessment-select">
          <label className="reg-field"><span>Registered irrigation scheme</span>
            <select value={scheme} onChange={e=>pick(e.target.value)}><option value="">New scheme / unlinked draft</option>{master.map(x=><option key={x.id} value={x.id}>{x.name} — {x.id}</option>)}</select></label>
        </div>
        <div className="assessment-tabs" role="tablist" aria-label="Scheme assessment sections">
          {ASSESSMENT_SECTIONS.map((section,index)=><button type="button" role="tab" aria-selected={sectionIndex===index}
            key={section.label} className={sectionIndex===index?'active':''} onClick={()=>setSectionIndex(index)}>{index+1}. {section.label}</button>)}
        </div>
        <div className="assessment-fields">
          <h3>{selected.label}</h3>
          <div className="reg-form-grid">
            {selected.fields.map(([key,label,type,required,options])=><label className="reg-field" key={key}>
              <span>{label}{required?' *':''}</span>
              {type==='select'?<select value={draft[key]??''} onChange={e=>setDraft(old=>({...old,[key]:e.target.value}))}>
                <option value="">Select status</option>{options.map(x=><option key={x}>{x}</option>)}</select>
                :<input type={type} step={type==='number'?'any':undefined} min={type==='number'&&key!=='latitude'&&key!=='longitude'?0:undefined}
                  value={draft[key]??''} onChange={e=>setDraft(old=>({...old,[key]:e.target.value}))}
                  placeholder={label} />}</label>)}
          </div>
        </div>
        <div className="assessment-actions">
          <button className="ghost-btn" disabled={sectionIndex===0} onClick={()=>setSectionIndex(x=>x-1)}>Previous section</button>
          <button className="reg-primary" onClick={save}><Save size={15}/> Save local draft</button>
          <button className="ghost-btn" disabled={sectionIndex===ASSESSMENT_SECTIONS.length-1} onClick={()=>setSectionIndex(x=>x+1)}>Next section</button>
        </div>
        {issues.length>0&&<details className="assessment-validation"><summary><ClipboardCheck size={15}/> {issues.length} missing or inconsistent values — expand to review</summary>
          <ul>{issues.slice(0,25).map((error,i)=><li key={i}>{error}</li>)}</ul></details>}
        {notice&&<div className="data-note" role="status">{notice}</div>}
      </section>
      <aside className="panel assessment-list">
        <div className="panel-head"><div><h2>Draft assessments</h2><p>{saved.length} local drafts</p></div>
          <button className="ghost-btn" onClick={exportData}><Download size={14}/> CSV</button></div>
        <div className="reg-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find scheme..."/></div>
        <div className="assessment-items">{filtered.map(row=><button key={row.schemeId} onClick={()=>pick(row.schemeId)}>
          <strong>{row.name||row.schemeId}</strong><span>{row.province||'Unknown province'} · {row.district||'District not set'}</span>
          <small>LOCAL DRAFT · {row.updatedAt?.slice(0,10)||'Not dated'}</small>
        </button>)}
        {!filtered.length&&<p className="reg-empty">No local assessments saved.</p>}</div>
      </aside>
    </div>
  </div>;
}
