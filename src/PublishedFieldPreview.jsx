import React,{useState} from 'react';
import {Database,RefreshCw,ShieldCheck,AlertTriangle} from 'lucide-react';

/**
 * Explicitly opt-in local test view. Never merges staged records into the
 * browser registry, existing official dashboard totals, or Power BI.
 * Development-only synthetic identity must never be included in production.
 */
const ROOT='http://127.0.0.1:8775/api/v1/stage/forms';
const ACTOR_IDS={
  district:'00000000-0000-4000-8000-000000000003',
  province:'00000000-0000-4000-8000-000000000002',
  admin:'00000000-0000-4000-8000-000000000001',
};
const MODULE_LABELS={
  scheme_registry:'Scheme registry',scheme_operations:'Scheme operations',
  water_resources:'Water resources',agronomy:'Agronomy and production',
  infrastructure:'Infrastructure',operations_maintenance:'Operations and maintenance',
  energy:'Energy',projects:'Projects',monitoring_risk:'Risk monitoring',
  beneficiaries:'Beneficiary records'
};
function initialMonth(){return new Date().toISOString().slice(0,7)}
export default function PublishedFieldPreview({moduleFilter=null}){
  const [role,setRole]=useState('district');
  const [month,setMonth]=useState(initialMonth);
  const [rows,setRows]=useState([]);
  const [nextOffset,setNextOffset]=useState(null);
  const [status,setStatus]=useState('Connect to your isolated local Core when it is running. No official figures are displayed.');
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  async function load(offset=0){
    if(!import.meta.env.DEV)return;
    setBusy(true);
    try{
      const response=await fetch(ROOT+'/reports/published?period_code='+encodeURIComponent(month)+
        '&limit=100&offset='+offset,{
          cache:'no-store',credentials:'omit',
          headers:{'X-Nimis-Dev-Actor':ACTOR_IDS[role]},
        });
      if(!response.ok)throw new Error('Core returned HTTP '+response.status);
      const data=await response.json();
      if(data.official!==false||data.source!=='ISOLATED_DEVELOPMENT'||
         data.data_status!=='PUBLISHED_DEMO_ONLY'||data.offset!==offset||
         !Array.isArray(data.items)){
        throw new Error('Core did not return verified isolated-development reporting');
      }
      setRows(old=>offset===0?data.items:[
        ...old,...data.items.filter(item=>!old.some(previous=>previous.event_id===item.event_id))
      ]);
      setLoaded(true);
      setNextOffset(data.has_more?data.next_offset:null);
      setStatus(data.items.length+' development records fetched; publication approval is mandatory before any records appear.');
    }catch(error){
      if(offset===0){setLoaded(false);setRows([]);setNextOffset(null)}
      setStatus('Test report unavailable: '+String(error)+'. Start the isolated Core, check role and assignments.');
    }finally{setBusy(false)}
  }
  if(!import.meta.env.DEV)return null;
  const visibleRows=moduleFilter?rows.filter(row=>moduleFilter.includes(row.module)):rows;
  const modules=[...new Set(visibleRows.map(row=>row.module))];
  return <section className="panel" style={{padding:18,marginBottom:20}}>
    <div className="panel-head"><div>
      <h2><Database size={18} style={{verticalAlign:'middle',marginRight:8}}/>Connected field reporting — Development Test</h2>
      <p>Separate from the browser-based executive KPIs above. Never official national statistics.</p>
    </div><ShieldCheck size={18}/></div>
    <div className="data-note" style={{margin:'12px 0'}}>
      <AlertTriangle size={17}/><span><strong>Fictional local database only.</strong> Records appear here exclusively after explicit form and reporting-mapping approval, District verification, Provincial review, delegated technical approval and publication. Unapproved submissions cannot affect any national figures.</span>
    </div>
    <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
      <label className="reg-field"><span>Test officer</span>
        <select value={role} onChange={event=>{setRole(event.target.value);setRows([]);setLoaded(false);setNextOffset(null)}} aria-label="Fictional local reporting officer">
          <option value="district">District officer — Demo district</option>
          <option value="province">Provincial officer — Demo province</option>
          <option value="admin">Administrator — Demo national</option>
        </select>
      </label>
      <label className="reg-field"><span>Reporting month</span>
        <input type="month" value={month} onChange={event=>{setMonth(event.target.value);setRows([]);setLoaded(false);setNextOffset(null)}}/>
      </label>
      <button type="button" className="reg-primary" disabled={busy||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)}
        onClick={()=>void load(0)}><RefreshCw size={15}/> Read published test records</button>
    </div>
    <p role="status" style={{padding:'10px 0'}}>{status}</p>
    {loaded&&<>
      <p><strong>{visibleRows.length} matching published records</strong> · {modules.map(key=>MODULE_LABELS[key]||key).join(', ')||'No approved published modules for this month'}</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Module</th><th>Scheme</th><th>District</th><th>Form / month</th><th>Published measurements</th></tr></thead>
        <tbody>{visibleRows.map(row=><tr key={row.event_id}>
          <td>{MODULE_LABELS[row.module]||row.module}</td>
          <td>{row.scheme_name}<small style={{display:'block'}}>{row.scheme_code}</small></td>
          <td>{row.district_code}</td>
          <td>{row.form_id}<small style={{display:'block'}}>{row.period_code}</small></td>
          <td>{row.metrics?.length?row.metrics.map(metric=>
            <div key={metric.field}>{metric.field.replaceAll('_',' ')}: <strong>{metric.value} {metric.unit}</strong></div>
          ):'Nonadditive reviewed record'}</td>
        </tr>)}</tbody>
      </table></div>
      {!visibleRows.length&&<p>No eligible published records. Submitting a form alone must not increase this count.</p>}
      {nextOffset!==null&&<button type="button" className="ghost-btn" disabled={busy}
        onClick={()=>void load(nextOffset)}>Load more published records</button>}
    </>}
  </section>;
}
