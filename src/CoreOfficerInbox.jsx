import React,{useCallback,useEffect,useState} from 'react';
import {ClipboardCheck,RefreshCw,ShieldCheck,Eye,AlertCircle,CheckCircle2} from 'lucide-react';

// One authoritative backend for every officer screen. The former :8765
// independent review database must never advance these Core field forms.
const API='http://127.0.0.1:8775/api/v1/stage';
const OFFICERS={
  district:{id:'00000000-0000-4000-8000-000000000003',
    title:'District Collector Inbox',subtitle:'Verify assigned collector surveys or return them for correction.',
    status:'AWAITING_FORM_APPROVAL',actions:[['VERIFY','Verify form']]},
  provincial:{id:'00000000-0000-4000-8000-000000000002',
    title:'Provincial Review',subtitle:'Review district-verified field records across the assigned province.',
    status:'DISTRICT_VERIFIED',actions:[['REVIEW','Approve provincial review']]},
  admin:{id:'00000000-0000-4000-8000-000000000001',
    title:'Admin Publication',subtitle:'Complete delegated technical approval, then publish verified observations.',
    status:'PROVINCIAL_REVIEWED',actions:[['TECHNICAL_APPROVE','Technical approval'],['PUBLISH','Publish']]}
};
const NEXT={
  VERIFY:'DISTRICT_VERIFIED',
  REVIEW:'PROVINCIAL_REVIEWED',
  TECHNICAL_APPROVE:'TECHNICAL_APPROVED',
  PUBLISH:'PUBLISHED',
  RETURN:'RETURNED',
};
const canAct=(stage,row,action)=>{
  if(action==='RETURN')return (stage==='district'&&row.status==='AWAITING_FORM_APPROVAL')||
    (stage==='provincial'&&row.status==='DISTRICT_VERIFIED');
  if(stage==='admin')return (action==='TECHNICAL_APPROVE'&&row.status==='PROVINCIAL_REVIEWED')||
    (action==='PUBLISH'&&row.status==='TECHNICAL_APPROVED');
  return OFFICERS[stage].actions.some(([name])=>name===action)&&row.status===OFFICERS[stage].status;
};
const label=status=>String(status||'Unknown').replaceAll('_',' ').toLowerCase().replace(/^./,x=>x.toUpperCase());

export default function CoreOfficerInbox({stage='district'}){
  const officer=OFFICERS[stage]||OFFICERS.district;
  const [rows,setRows]=useState([]);
  const [selected,setSelected]=useState(null);
  const [history,setHistory]=useState([]);
  const [filter,setFilter]=useState('action');
  const [reasons,setReasons]=useState({});
  const [message,setMessage]=useState('Connecting to the NIMIS Core service.');
  const [online,setOnline]=useState(false);
  const [lastRefresh,setLastRefresh]=useState('');
  const [busy,setBusy]=useState(false);
  const call=useCallback(async(path,method='GET',data)=>{
    const response=await fetch(API+path,{
      method,cache:'no-store',credentials:'omit',
      headers:{'X-Nimis-Dev-Actor':officer.id,...(data?{'Content-Type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      let explanation=payload.detail;
      if(Array.isArray(explanation))explanation=explanation.map(x=>x.msg).join(', ');
      throw new Error((typeof explanation==='string'&&explanation)||'Core HTTP '+response.status);
    }
    return payload;
  },[officer.id]);

  const refresh=useCallback(async()=>{
    const [health,inbox]=await Promise.all([call('/health'),call('/forms/inbox')]);
    if(health.mode!=='isolated-development'||health.production_ready!==false||
      inbox.source!=='ISOLATED_DEVELOPMENT'||inbox.official!==false||
      !Array.isArray(inbox.items))throw new Error('Incorrect Core server identity');
    setRows(inbox.items);
    setOnline(true);
    setLastRefresh(new Date().toLocaleTimeString());
    setMessage('Officer inbox connected. '+inbox.items.length+' scoped field submissions received.');
  },[call]);

  useEffect(()=>{
    let active=true;
    setRows([]);setSelected(null);setHistory([]);setOnline(false);
    async function poll(){
      if(!active)return;
      try{await refresh()}catch(error){
        if(active){setOnline(false);setMessage('Core unavailable: '+String(error)+'. Already saved submissions are not lost.')}
      }
    }
    void poll();
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='visible'&&!busy)void poll();
    },9000);
    return()=>{active=false;window.clearInterval(timer)};
  },[refresh,stage]);

  async function inspect(row){
    setBusy(true);
    try{
      const [detail,receipt]=await Promise.all([
        call('/forms/submissions/'+encodeURIComponent(row.event_id)),
        call('/forms/sync/status/'+encodeURIComponent(row.event_id))
      ]);
      if(detail.official!==false||receipt.source!=='ISOLATED_DEVELOPMENT')throw new Error('Invalid scoped review');
      setSelected(detail);
      setHistory(receipt.decisions||[]);
      setMessage('Showing server-stored revision '+detail.revision+' for '+detail.form_id+'.');
    }catch(error){setMessage('Unable to inspect: '+String(error));}
    finally{setBusy(false)}
  }

  async function decide(row,action){
    let reason='';
    if(action==='RETURN'){
      reason=(reasons[row.event_id]||'').trim();
      if(!reason){setMessage('A meaningful return reason is required.');return;}
      if(reason.length>500){setMessage('Return reason must contain at most 500 characters.');return;}
    }
    if(!canAct(stage,row,action)){setMessage('This stage cannot perform the requested action.');return;}
    setBusy(true);
    try{
      const result=await call('/forms/submissions/'+encodeURIComponent(row.event_id)+'/decisions',
        'POST',{decision_id:crypto.randomUUID(),action,reason});
      if(!['accepted','duplicate'].includes(result.outcome)||result.status!==NEXT[action])
        throw new Error('Server did not confirm the expected transition');
      const fresh=await call('/forms/inbox');
      if(fresh.source!=='ISOLATED_DEVELOPMENT')throw new Error('Inconsistent review inbox');
      setRows(fresh.items||[]);
      setSelected(null);setHistory([]);
      setMessage(label(result.status)+' — saved to the NIMIS Core audit history.');
    }catch(error){setMessage('Review not saved: '+String(error));}
    finally{setBusy(false)}
  }

  const actionable=rows.filter(row=>
    OFFICERS[stage].actions.some(([action])=>canAct(stage,row,action)));
  const visible=filter==='action'?actionable:
    filter==='completed'?rows.filter(x=>['PUBLISHED','RETURNED','TECHNICAL_APPROVED','PROVINCIAL_REVIEWED','DISTRICT_VERIFIED'].includes(x.status)):
    rows;
  if(!import.meta.env.DEV)return <p>Development officer workflow is unavailable on this deployment.</p>;
  return <div className="module-page data-management-page">
    <div className="welcome-row"><div>
      <div className="eyebrow">NIMIS CORE / OFFICER WORKFLOW</div>
      <h1>{officer.title}</h1><p className="subtitle">{officer.subtitle}</p>
    </div></div>
    <div className="data-note"><ShieldCheck size={17}/><span>
      <strong>Development test account.</strong> Submissions and decisions come from one local PostgreSQL Core. No fake approvals are applied to real records.
    </span></div>
    <section className="panel" style={{padding:18,marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        {online?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}
        <strong>{online?'Connected to NIMIS Core':'Core not connected'}</strong>
        <span>Last refresh: {lastRefresh||'not connected'}</span>
        <button type="button" className="ghost-btn" disabled={busy}
          onClick={()=>void refresh().catch(e=>{setOnline(false);setMessage(String(e))})}>
          <RefreshCw size={15}/> Refresh now
        </button>
      </div>
      <p role="status">{message}</p>
      <div className="kpi-grid module-kpis">
        <div className="kpi-card"><div className="kpi-label">Accessible records</div><strong className="kpi-value">{rows.length}</strong></div>
        <div className="kpi-card"><div className="kpi-label">Awaiting my decision</div><strong className="kpi-value">{actionable.length}</strong></div>
        <div className="kpi-card"><div className="kpi-label">Returned for correction</div><strong className="kpi-value">{rows.filter(row=>row.status==='RETURNED').length}</strong></div>
      </div>
    </section>
    <section className="panel schemes-panel">
      <div className="panel-head"><div><h2>Field survey records</h2>
        <p>Automatically refreshed every nine seconds while this page is open. Submissions come from the collector's synced form queue.</p>
      </div></div>
      <div style={{display:'flex',gap:8,padding:14,flexWrap:'wrap'}}>
        {[['action','Needs my action'],['all','All accessible'],['completed','Reviewed / returned']].map(([id,name])=>
          <button type="button" key={id} className={filter===id?'reg-primary':'ghost-btn'}
            onClick={()=>setFilter(id)}>{name}</button>)}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Scheme</th><th>Survey / period</th><th>Status</th><th>Evidence</th><th>Action</th></tr></thead>
        <tbody>{visible.map(row=><tr key={row.event_id}>
          <td><strong>{row.scheme_name||'Unregistered scheme'}</strong>
            <small style={{display:'block'}}>Record {row.record_id?.slice(0,8)} · Event {row.event_id.slice(0,8)}</small></td>
          <td>{row.form_id.replaceAll('_',' ')}<small style={{display:'block'}}>{row.period_code}</small></td>
          <td><strong>{label(row.status)}</strong></td>
          <td>{row.evidence_pending?'Photographs pending':'Ready / none'}</td>
          <td><div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            <button type="button" className="ghost-btn" disabled={busy} onClick={()=>void inspect(row)}>
              <Eye size={14}/> Inspect
            </button>
            {officer.actions.filter(([action])=>canAct(stage,row,action)).map(([action,name])=>
              <button type="button" key={action} className="reg-primary" disabled={busy}
                onClick={()=>void decide(row,action)}><ClipboardCheck size={14}/>{name}</button>)}
            {canAct(stage,row,'RETURN')&&<div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              <input aria-label={'Correction reason for '+row.event_id} maxLength={500}
                placeholder="Reason to return"
                value={reasons[row.event_id]||''}
                onChange={event=>setReasons(before=>({...before,[row.event_id]:event.target.value}))}/>
              <button type="button" className="ghost-btn" disabled={busy||!(reasons[row.event_id]||'').trim()}
                onClick={()=>void decide(row,'RETURN')}>Return</button>
            </div>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {visible.length===0&&<p style={{padding:18}}>No field submissions in this view. Synced collector forms will appear here automatically.</p>}
    </section>
    {selected&&<section className="panel" style={{padding:18,marginTop:16}}>
      <div className="panel-head"><div><h2>Inspect submitted survey</h2>
        <p>{selected.form_id.replaceAll('_',' ')} · Revision {selected.revision} · {label(selected.status)}</p>
      </div><button className="ghost-btn" onClick={()=>{setSelected(null);setHistory([])}}>Close</button></div>
      <div className="table-wrap"><table><thead><tr><th>Field</th><th>Submitted answer</th></tr></thead>
        <tbody>{Object.entries(selected.answers||{}).map(([key,value])=>
          <tr key={key}><td>{key.replaceAll('_',' ')}</td>
          <td>{typeof value==='object'?JSON.stringify(value):String(value)}</td></tr>)}
        </tbody></table></div>
      <h3>Officer decision history</h3>
      {history.length?history.map((item,index)=><p key={index}>
        <strong>{label(item.action)}</strong> · {new Date(item.decided_at).toLocaleString()}
        {item.reason?' · '+item.reason:''}
      </p>):<p>No recorded officer decision yet.</p>}
    </section>}
  </div>;
}
