import React,{useEffect,useMemo,useState} from 'react';
import {Activity,ArrowUpRight,BarChart3,CalendarDays,ClipboardCheck,Database,Droplets,MapPin,RefreshCw,ShieldCheck,TrendingUp,Users,Wrench} from 'lucide-react';

const STORE='nimis-registry-v1';
const read=()=>{try{const x=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
const num=(value,dec=0)=>value.toLocaleString('en-ZW',{maximumFractionDigits:dec});
const val=v=>v===''||v===undefined||v===null?null:Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const classFor=(s)=>/operational|functional/i.test(s)&&!/non|partial/i.test(s)?'green':/rehabilitation|partial|construction/i.test(s)?'amber':/non.functional|critical/i.test(s)?'red':'neutral';
const palette=['#07874c','#2f88b7','#e4a63e','#7b6ab1','#dd6155','#57ab85','#729bca','#b6a6e4'];

/* Display-only fictional examples. Never saved, uploaded or merged with real records. */
const PREVIEW_SCHEMES=[
  {id:'DEMO-001',name:'Example North Scheme',province:'Mashonaland Central',district:'Demo District',developed:1000,equipped:920,irrigated:840,status:'Fully functional'},
  {id:'DEMO-002',name:'Example Eastern Scheme',province:'Mashonaland East',district:'Demo District',developed:700,equipped:630,irrigated:580,status:'Fully functional'},
  {id:'DEMO-003',name:'Example Manicaland Scheme',province:'Manicaland',district:'Demo District',developed:520,equipped:480,irrigated:300,status:'Partially functional'},
  {id:'DEMO-004',name:'Example Southern Scheme',province:'Masvingo',district:'Demo District',developed:830,equipped:740,irrigated:580,status:'Fully functional'},
  {id:'DEMO-005',name:'Example Midlands Scheme',province:'Midlands',district:'Demo District',developed:460,equipped:400,irrigated:210,status:'Under rehabilitation'},
  {id:'DEMO-006',name:'Example Western Scheme',province:'Mashonaland West',district:'Demo District',developed:660,equipped:590,irrigated:510,status:'Fully functional'},
  {id:'DEMO-007',name:'Example Matabeleland Scheme',province:'Matabeleland South',district:'Demo District',developed:240,equipped:185,irrigated:90,status:'Non-functional'},
  {id:'DEMO-008',name:'Example Northern Scheme',province:'Matabeleland North',district:'Demo District',developed:150,equipped:125,irrigated:70,status:'Partially functional'},
];

function Metric({icon:Icon,name,value,note,tone='green'}){
  return <article className={'overview-metric tone-'+tone}>
    <div className="metric-icon"><Icon size={20} strokeWidth={2.3}/></div>
    <div className="metric-body"><span>{name}</span><strong>{value}</strong><small>{note}</small></div>
  </article>;
}
function BarGraph({data=[],unit='ha'}){
  const max=Math.max(1,...data.map(x=>x.value));
  return <div className="overview-bars">{data.length?data.map((x,i)=><div className="overview-bar" key={x.name}>
    <div className="overview-bar-head"><span>{x.name}</span><strong>{num(x.value,1)} {unit}</strong></div>
    <div className="overview-bar-track"><i style={{width:(x.value/max*100)+'%',background:palette[i%palette.length]}}/></div>
  </div>):<div className="overview-empty">No provincial data recorded yet.</div>}</div>;
}
function CircleStatus({data}){
 const total=data.reduce((s,x)=>s+x.count,0);
 let start=0;
 const gradients=data.filter(x=>x.count>0).map((x,i)=>{const a=start;start+=x.count/Math.max(1,total)*100;return `${palette[i]} ${a}% ${start}%`});
 return <div className="overview-status-layout">
  <div className="overview-circle" style={{background:total?'conic-gradient('+gradients.join(',')+')':'#e7f2ec'}}>
    <div><strong>{num(total)}</strong><span>schemes</span></div>
  </div>
  <div className="overview-legend">{data.map((x,i)=><div key={x.name}>
    <i style={{background:palette[i]}}/><span>{x.name}</span><strong>{x.count}</strong>
  </div>)}</div>
 </div>;
}
export default function ExecutiveOverview({onSelect}){
 const [records,setRecords]=useState(read);
 const [preview,setPreview]=useState(false);
 const displayedRecords=preview?PREVIEW_SCHEMES:records;
 const [province,setProvince]=useState('All provinces');
 const [query,setQuery]=useState('');
 useEffect(()=>{
   const update=()=>setRecords(read());
   window.addEventListener('nimis-registry-updated',update);
   window.addEventListener('storage',update);
   return()=>{window.removeEventListener('nimis-registry-updated',update);window.removeEventListener('storage',update)};
 },[]);
 const provinces=useMemo(()=>[...new Set(displayedRecords.map(x=>x.province).filter(Boolean))].sort(),[displayedRecords]);
 const filtered=useMemo(()=>displayedRecords.filter(x=>(province==='All provinces'||x.province===province)&&
  [x.name,x.id,x.district].some(t=>String(t||'').toLowerCase().includes(query.toLowerCase()))),[displayedRecords,province,query]);
 const summary=useMemo(()=>{
  const total=(key)=>filtered.reduce((sum,r)=>sum+(val(r[key])??0),0);
  const statuses=new Map();
  filtered.forEach(x=>statuses.set(x.status||'Not assessed',(statuses.get(x.status||'Not assessed')||0)+1));
  const provinceData=new Map();
  filtered.forEach(x=>{const p=x.province||'Not recorded';provinceData.set(p,(provinceData.get(p)||0)+(val(x.irrigated)??0));});
  return {developed:total('developed'),equipped:total('equipped'),irrigated:total('irrigated'),
    statuses:[...statuses].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
    provinces:[...provinceData].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)};
 },[filtered]);
 const unverified=filtered.filter(x=>x.dataStatus!=='Verified').length;
 const missing=filtered.filter(x=>!x.name||!x.province||!x.district||val(x.equipped)===null).length;
 return <div className="module-page executive-overview">
  <div className="welcome-row overview-heading">
   <div><div className="eyebrow">NATIONAL PERFORMANCE / EXECUTIVE OVERVIEW</div>
    <h1>Executive Dashboard — National Irrigation Performance</h1>
    <p className="subtitle">Scheme coverage, irrigation area, operational status and provincial performance</p></div>
   <div className="overview-filters">
    <select aria-label="Filter dashboard by province" value={province} onChange={e=>setProvince(e.target.value)}>
     <option>All provinces</option>{provinces.map(x=><option key={x}>{x}</option>)}
    </select>
    <button className={'overview-preview-toggle '+(preview?'active':'')} type="button" aria-pressed={preview}
      onClick={()=>{setPreview(x=>!x);setProvince('All provinces');setQuery('')}}>
      {preview?'Exit fictional preview':'Preview sample layout'}</button>
    <span className="overview-period"><CalendarDays size={15}/> {preview?'Fictional display only':'Current browser records'}</span>
   </div>
  </div>
  <div className="overview-source"><ShieldCheck size={16}/>
   <span><strong>{preview?'FICTIONAL LAYOUT PREVIEW':'Data status'}:</strong> {preview?'The example schemes shown here exist only in this screen for visual review. They are NOT saved, real, verified, submitted or connected to the Ministry database.':'Figures are calculated from this browser\'s prototype registry, not a verified national database. Never interpret sample scheme entries as official Ministry statistics.'}</span>
   <button onClick={()=>onSelect('briefing')}>2026 source briefing <ArrowUpRight size={14}/></button>
  </div>
  <div className="overview-kpis">
   <Metric icon={Database} name="Registered irrigation schemes" value={num(filtered.length)} note="In this browser register"/>
   <Metric icon={Droplets} name="Currently irrigated area" value={num(summary.irrigated,1)+' ha'} note="Entered scheme values" tone="blue"/>
   <Metric icon={TrendingUp} name="Equipped irrigation area" value={num(summary.equipped,1)+' ha'} note="Not necessarily functional" tone="green"/>
   <Metric icon={Wrench} name="Developed irrigation area" value={num(summary.developed,1)+' ha'} note="Scheme registry total" tone="amber"/>
  </div>
  <div className="overview-kpis overview-kpis-secondary">
   <Metric icon={ClipboardCheck} name="Scheme records requiring verification" value={num(unverified)} note="Not explicitly verified" tone="amber"/>
   <Metric icon={Activity} name="Complete basic scheme profiles" value={num(filtered.length-missing)} note="Name, location and equipped area" tone="green"/>
   <Metric icon={Users} name="Registered provinces" value={num(new Set(filtered.map(x=>x.province).filter(Boolean)).size)} note="With at least one local record" tone="blue"/>
   <Metric icon={ShieldCheck} name="Missing core profile fields" value={num(missing)} note="Require collector follow-up" tone="red"/>
  </div>
  <div className="overview-main-grid">
   <section className="panel overview-chart">
    <div className="panel-head"><div><h2>Irrigated Area by Province (ha)</h2>
      <p>Distribution of available entered records</p></div><BarChart3 size={19}/></div>
    <BarGraph data={summary.provinces}/>
   </section>
   <section className="panel overview-chart">
    <div className="panel-head"><div><h2>Scheme Functional Status</h2>
      <p>Classification in the local scheme register</p></div><Activity size={19}/></div>
    <CircleStatus data={summary.statuses}/>
   </section>
  </div>
  <div className="overview-lower-grid">
   <section className="panel overview-table">
    <div className="panel-head"><div><h2>Irrigation Scheme Performance Register</h2>
      <p>Browse schemes and inspect status, province and recorded hectares</p></div>
      <button className="ghost-btn" onClick={()=>onSelect('registry')}>View Registry <ArrowUpRight size={15}/></button></div>
    <div className="overview-table-controls"><input aria-label="Search irrigation scheme register" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search scheme, ID or district…"/>
     <span>{filtered.length} schemes</span></div>
    <div className="table-wrap"><table><thead><tr><th>Scheme</th><th>Province / District</th><th>Equipped (ha)</th><th>Irrigated (ha)</th><th>Status</th></tr></thead>
     <tbody>{filtered.slice(0,12).map(x=><tr key={x.id}>
      <td><strong>{x.name||'Unnamed scheme'}</strong><small className="overview-block">{x.id||'No ID'}</small></td>
      <td>{x.province||'—'}<small className="overview-block">{x.district||'District missing'}</small></td>
      <td>{val(x.equipped)===null?'—':num(val(x.equipped),1)}</td>
      <td>{val(x.irrigated)===null?'—':num(val(x.irrigated),1)}</td>
      <td><span className={'overview-status status-'+classFor(x.status||'Not assessed')}>{x.status||'Not assessed'}</span></td>
     </tr>)}</tbody></table>
     {!filtered.length&&<div className="overview-empty">No matching scheme records. Use Scheme Registry to register or import a scheme.</div>}
    </div>
   </section>
   <section className="panel overview-quick">
    <div className="panel-head"><div><h2>Operational Workspaces</h2><p>Scheme records, evidence and reporting</p></div></div>
    {[
      ['gis','GIS & Spatial Mapping',MapPin],
      ['water','Water Resources',Droplets],
      ['infrastructure','Infrastructure & O&M',Wrench],
      ['agronomy','Agronomy & Production',TrendingUp],
      ['assessment','Scheme Baseline Assessment',ClipboardCheck],
    ].map(([id,label,Icon])=><button key={id} onClick={()=>onSelect(id)}><Icon size={18}/><span>{label}</span><ArrowUpRight size={15}/></button>)}
    <div className="overview-quick-foot"><RefreshCw size={15}/> Changes in the local registry update dashboard figures automatically.</div>
   </section>
  </div>
 </div>;
}
