import React,{useCallback,useState} from 'react';
import {CheckCircle2,Database,RefreshCw,ShieldCheck,AlertTriangle,Send} from 'lucide-react';

const ROOT='http://127.0.0.1:8775/api/v1/stage';
const DEMO={
 admin:{id:'00000000-0000-4000-8000-000000000001',label:'Demo Admin'},
 province:{id:'00000000-0000-4000-8000-000000000002',label:'Demo Provincial Officer'},
 district:{id:'00000000-0000-4000-8000-000000000003',label:'Demo District Officer'},
 collector:{id:'00000000-0000-4000-8000-000000000004',label:'Demo Data Collector'},
};
function uid(){return crypto.randomUUID()}
const now=()=>new Date().toISOString();
export default function CoreWorkflowLab(){
 const [who,setWho]=useState('district');
 const [schemes,setSchemes]=useState([]);
 const [inbox,setInbox]=useState([]);
 const [report,setReport]=useState(null);
 const [schemeId,setSchemeId]=useState('00000000-0000-4000-8000-000000001000');
 const [note,setNote]=useState('Fictional scheme inspection — no real data');
 const [message,setMessage]=useState('Start the isolated PostgreSQL API, then use the controls below.');
 const [busy,setBusy]=useState(false);

 const call=useCallback(async(path,method='GET',body,role=who)=>{
  const response=await fetch(ROOT+path,{
   method,cache:'no-store',headers:{
    'X-Nimis-Dev-Actor':DEMO[role].id,
    ...(body?{'Content-Type':'application/json'}:{})
   },...(body?{body:JSON.stringify(body)}:{})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error((typeof payload.detail==='string'?payload.detail:JSON.stringify(payload.detail))||'API HTTP '+response.status);
  return payload;
 },[who]);

 const perform=async(label,task)=>{
  setBusy(true);
  try{const result=await task();setMessage(label+' ✓ '+(result?.status||result?.outcome||result?.message||'Success'));return result}
  catch(error){setMessage(label+' failed: '+error.message);return null}
  finally{setBusy(false)}
 };

 async function load(){
  await perform('Load operational inbox',async()=>{
    const [health,data]=await Promise.all([call('/health'),call('/schemes')]);
    if(health.production_ready!==false)throw new Error('Expected isolated development API');
    setSchemes(data.items||[]);
    if(who!=='collector'){
     const queue=await call('/inbox').catch(()=>({items:[]}));
     setInbox(queue.items||[]);
    }else setInbox([]);
    return {message:(data.items||[]).length+' accessible schemes, synthetic demo only'};
  });
 }
 async function createScheme(){
  await perform('Create fictional scheme',async()=>{
    const result=await call('/schemes','POST',{
      scheme_code:'DEMO-'+uid().slice(0,8).toUpperCase(),
      scheme_name:'Example Irrigation Scheme — Fictional',
      province_code:'DEMO-P',district_code:'DEMO-D',
    },'district');
    setSchemeId(result.scheme_id);
    return {message:'Created '+result.scheme_id+' (revision 1)'};
  });
 }
 async function assign(){
  await perform('Assign collector',async()=>call('/schemes/'+encodeURIComponent(schemeId)+'/assign',
    'POST',{collector_id:DEMO.collector.id},'district'));
 }
 async function submit(){
  await perform('Submit measured observation',async()=>{
    const server=await call('/schemes','GET',undefined,'collector');
    const scheme=server.items.find(row=>row.scheme_id===schemeId);
    if(!scheme)throw new Error('Assign this fictional scheme to the collector first.');
    const time=now();
    return call('/submissions','POST',{
      event_id:uid(),submission_id:uid(),scheme_id:schemeId,device_id:uid(),
      form_id:'operational_status',form_version:1,period_code:time.slice(0,7),
      base_scheme_revision:scheme.revision,captured_at:time,
      measurements:[
        {name:'equipped_area_ha',value:'20.00',unit:'ha',observed_at:time,source:'Fictional test reading'},
        {name:'functional_area_ha',value:'12.50',unit:'ha',observed_at:time,source:'Fictional test reading'},
      ],note:note.trim().slice(0,500),
    },'collector');
  });
 }
 async function decide(row,action,role){
  await perform(action+' fictional submission',async()=>{
    const result=await call('/submissions/'+encodeURIComponent(row.submission_id)+'/decisions','POST',
     {event_id:uid(),action,reason:action==='RETURN'?'Fictional correction required':''},role);
    const queue=await call('/inbox','GET',undefined,role);
    setInbox(queue.items||[]);
    return result;
  });
 }
 async function loadReport(){
  await perform('Published area report',async()=>{
    const period=now().slice(0,7);
    const data=await call('/report/area?period_code='+encodeURIComponent(period),'GET',undefined,'admin');
    setReport(data);
    return {message:data.schemes_reporting+' published synthetic schemes'};
  });
 }
 return <div className="module-page data-management-page">
  <div className="welcome-row"><div><div className="eyebrow">LOCAL DATABASE / FUNCTIONAL VALIDATION</div>
    <h1>NIMIS Core — Operational Integration Lab</h1>
    <p className="subtitle">Test PostgreSQL concurrency, scheme assignments, submission workflow and published-only reporting.</p>
  </div></div>
  <div className="data-note"><AlertTriangle size={18}/><span>
    <strong>FICTIONAL TEST ENVIRONMENT.</strong> These controls use a synthetic test identity on your own computer. They do not authenticate Ministry officers, collect real surveys, upload photos or publish official statistics. Never enter personal or real operational data here.
  </span></div>
  <section className="panel" style={{padding:18,display:'grid',gap:15}}>
    <label className="reg-field"><span>Development test persona</span>
      <select value={who} onChange={e=>{setWho(e.target.value);setInbox([])}}>
        {Object.entries(DEMO).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}
      </select></label>
    <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
      <button className="reg-primary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/> Connect / Refresh</button>
      <button className="ghost-btn" disabled={busy} onClick={()=>void createScheme()}><Database size={16}/> Create fictitious scheme</button>
      <button className="ghost-btn" disabled={busy||!schemeId} onClick={()=>void assign()}><ShieldCheck size={16}/> Assign demo collector</button>
    </div>
    <label className="reg-field"><span>Selected fictional scheme UUID</span><input value={schemeId} onChange={e=>setSchemeId(e.target.value)}/></label>
    <label className="reg-field"><span>Fictional observation</span><input value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></label>
    <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
      <button className="reg-primary" disabled={busy||!schemeId||!note.trim()} onClick={()=>void submit()}><Send size={16}/> Send collector test</button>
      <button className="ghost-btn" disabled={busy} onClick={()=>void loadReport()}><CheckCircle2 size={16}/> View published-only report</button>
    </div>
    <p role="status" style={{color:'#20573c',fontWeight:750,margin:0}}>{message}</p>
  </section>
  <section className="panel"><div className="panel-head"><div><h2>Accessible scheme records</h2>
    <p>Development data filtered by the selected actor and assigned geography</p></div></div>
    <div className="table-wrap"><table><thead><tr><th>Scheme</th><th>District</th><th>Revision</th></tr></thead>
      <tbody>{schemes.map(row=><tr key={row.scheme_id}><td>{row.scheme_name}<small style={{display:'block'}}>{row.scheme_code}</small></td><td>{row.district_code}</td><td>{row.revision}</td></tr>)}</tbody></table></div>
    {!schemes.length&&<p style={{padding:18}}>No accessible synthetic scheme records. Use Connect / Refresh.</p>}
  </section>
  {who!=='collector'&&<section className="panel"><div className="panel-head"><div><h2>Officer review queue</h2>
    <p>Server-controlled stages: Submitted → District Verified → Provincial Reviewed → Technical Approved → Published</p></div></div>
   <div className="table-wrap"><table><thead><tr><th>Scheme</th><th>Form / period</th><th>Status</th><th>Allowed action</th></tr></thead>
    <tbody>{inbox.map(row=>{
      const allowed=who==='district'&&row.status==='SUBMITTED'?'VERIFY':
       who==='province'&&row.status==='DISTRICT_VERIFIED'?'REVIEW':
       who==='admin'&&row.status==='PROVINCIAL_REVIEWED'?'TECHNICAL_APPROVE':
       who==='admin'&&row.status==='TECHNICAL_APPROVED'?'PUBLISH':null;
      return <tr key={row.submission_id}><td>{row.scheme_name}</td><td>{row.form_id} · {row.period_code}</td>
       <td><strong>{row.status}</strong></td>
       <td>{allowed?<button disabled={busy} className="reg-primary" onClick={()=>void decide(row,allowed,who)}>{allowed.replaceAll('_',' ')}</button>:'—'}</td></tr>
    })}</tbody></table></div>
    {!inbox.length&&<p style={{padding:18}}>No accessible submissions, or inbox not refreshed yet.</p>}
  </section>}
  {report&&<section className="panel" style={{padding:18}}><h2>Published-only area report — fictional data</h2>
    <p>Reporting period: {report.period_code} · {report.schemes_reporting} eligible schemes</p>
    <p>Equipped: <strong>{report.total_hectares?.equipped_area_ha||'0'} ha</strong> · Functional: <strong>{report.total_hectares?.functional_area_ha||'0'} ha</strong> · Actually irrigated: <strong>{report.total_hectares?.actually_irrigated_area_ha||'0'} ha</strong></p>
    <p><strong>Source: {report.data_status}.</strong> No official reporting connection exists.</p>
  </section>}
 </div>;
}
