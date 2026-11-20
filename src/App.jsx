import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RegistryPage from './Registry.jsx';
import DataManagement from './DataManagement.jsx';
import {enqueueSyncChange,synchronizeIfConfigured,readSyncQueue} from './dataSync.js';
import {
  LayoutDashboard, Map, Droplets, Wrench, Sprout, ClipboardList, Database, Upload,
  FileBarChart2, Search, Bell, ChevronDown, Menu, X, ArrowUpRight,
  ArrowDownRight, Activity, MapPin, CalendarDays, Filter, Download,
  CircleHelp, Settings, ShieldCheck, CircleDot, TrendingUp, Waves, Pencil, Trash2,
} from 'lucide-react';


const nav = [
  { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard, group: 'OVERVIEW' },
  { id: 'gis', label: 'GIS & Spatial Mapping', icon: Map, group: 'MONITORING' },
  { id: 'water', label: 'Water Resources & Hydrology', icon: Droplets, group: 'MONITORING' },
  { id: 'infrastructure', label: 'Infrastructure & O&M', icon: Wrench, group: 'MONITORING' },
  { id: 'agronomy', label: 'Agronomy & Production', icon: Sprout, group: 'MONITORING' },
  { id: 'projects', label: 'Project Implementation', icon: ClipboardList, group: 'MANAGEMENT' },
  { id: 'registry', label: 'Scheme Registry', icon: Database, group: 'MANAGEMENT' },
  { id: 'data', label: 'Data Management & Verification', icon: Upload, group: 'MANAGEMENT' },
  { id: 'reports', label: 'Reports & Analytics', icon: FileBarChart2, group: 'MANAGEMENT' },
];

const schemes = [
  { name: 'Chisumbanje', province: 'Manicaland', district: 'Chisumbanje', area: '2,780 ha', status: 'Operational', pct: 88, water: 'Stable', crop: 'Sugarcane', id: 'NIM-MAN-001' },
  { name: 'Tongogara', province: 'Manicaland', district: 'Chipinge', area: '1,640 ha', status: 'Operational', pct: 73, water: 'Watch', crop: 'Maize · Wheat', id: 'NIM-MAN-014' },
  { name: 'Insukamini', province: 'Midlands', district: 'Kwekwe', area: '820 ha', status: 'Under rehabilitation', pct: 51, water: 'Stable', crop: 'Maize', id: 'NIM-MID-008' },
  { name: 'Mushandike', province: 'Masvingo', district: 'Masvingo', area: '1,125 ha', status: 'Operational', pct: 94, water: 'Stable', crop: 'Maize · Horticulture', id: 'NIM-MAS-002' },
  { name: 'Nyanyadzi', province: 'Manicaland', district: 'Nyanyadzi', area: '560 ha', status: 'Operational', pct: 62, water: 'Watch', crop: 'Horticulture', id: 'NIM-MAN-022' },
];
const moduleDescriptions = {
  gis:{eyebrow:'MONITORING / GEOSPATIAL',title:'GIS & Spatial Mapping',description:'Explore verified scheme locations, geographic coverage and spatial context across Zimbabwe.',cards:[['Spatial records',''],['Coordinates complete',''],['Location reviews','']],tableTitle:'Scheme location overview'},
  water:{eyebrow:'MONITORING / WATER',title:'Water Resources & Hydrology',description:'Capture water sources, availability, abstraction context and seasonal observations.',cards:[['Water records',''],['Pending review',''],['Reporting periods','']],tableTitle:'Water source records'},
  infrastructure:{eyebrow:'MONITORING / ASSETS',title:'Infrastructure & O&M',description:'Register infrastructure assets, condition assessments, maintenance needs and operational readiness.',cards:[['Assets recorded',''],['Critical assets',''],['Pending inspections','']],tableTitle:'Infrastructure condition'},
  agronomy:{eyebrow:'MONITORING / PRODUCTION',title:'Agronomy & Production',description:'Capture cropping seasons, planted area, crop performance and verified production.',cards:[['Crop records',''],['Seasons recorded',''],['Pending verification','']],tableTitle:'Crop season overview'},
  projects:{eyebrow:'MANAGEMENT / DELIVERY',title:'Project Implementation Tracker',description:'Track irrigation development and rehabilitation projects, milestones, delivery progress and risks.',cards:[['Projects recorded',''],['In progress',''],['Delayed / attention','']],tableTitle:'Implementation portfolio'},
  registry:{eyebrow:'MANAGEMENT / MASTER DATA',title:'Scheme Registry',description:'The governed master register of irrigation schemes and their linked information.',cards:[['Registered schemes',''],['Incomplete profiles',''],['Verified profiles','']],tableTitle:'National scheme register'},
  reports:{eyebrow:'MANAGEMENT / INSIGHTS',title:'Reports & Analytics',description:'Explore governed indicators and prepare consistent management reporting views.',cards:[['Report definitions','5'],['Reporting cycle','Not configured'],['Data publication','Not connected']],tableTitle:'Available reporting views'}
};

function Status({ label }) { const value=String(label).toLowerCase(); const cls=value.includes('non-functional')||value.includes('critical')?'status red':value.includes('rehab')||value.includes('watch')||value.includes('attention')||value.includes('review')?'status amber':value.includes('draft')||value.includes('submitted')?'status neutral':'status green'; return <span className={cls}><i />{label}</span>; }
function KPI({ item }) { const Icon=item.icon; return <div className="kpi-card"><div className="kpi-top"><span className={`kpi-icon ${item.tint}`}><Icon size={18}/></span><span className={`trend ${item.up?'positive':'negative'}`}>{item.up?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {item.trend}</span></div><div className="kpi-label">{item.title}</div><div className="kpi-value">{item.value}</div><div className="kpi-note">{item.note}</div></div>; }
const mapSchemes = [
  { name:'Chisumbanje', province:'Manicaland', district:'Chisumbanje', id:'NIM-MAN-001', coords:[-20.88,32.22], status:'Operational', colour:'#34965c' },
  { name:'Tongogara', province:'Manicaland', district:'Chipinge', id:'NIM-MAN-014', coords:[-20.63,32.45], status:'Operational', colour:'#34965c' },
  { name:'Insukamini', province:'Midlands', district:'Kwekwe', id:'NIM-MID-008', coords:[-18.85,29.75], status:'Under review', colour:'#d99a36' },
  { name:'Mushandike', province:'Masvingo', district:'Masvingo', id:'NIM-MAS-002', coords:[-20.15,30.83], status:'Operational', colour:'#34965c' },
  { name:'Nyanyadzi', province:'Manicaland', district:'Nyanyadzi', id:'NIM-MAN-022', coords:[-20.85,32.75], status:'Operational', colour:'#34965c' },
];
function ZimbabweMap({ compact=false }) {
  const mapElement=useRef(null);
  const mapInstance=useRef(null);
  useEffect(()=>{
    if(!mapElement.current || mapInstance.current) return;
    const map=L.map(mapElement.current,{scrollWheelZoom:!compact,zoomControl:true}).setView([-19.05,29.85],6.25);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    mapSchemes.forEach(s=>{
      const marker=L.circleMarker(s.coords,{radius:compact?6:8,color:'#ffffff',weight:2,fillColor:s.colour,fillOpacity:1}).addTo(map);
      marker.bindPopup('<div class="map-popup"><strong>'+s.name+'</strong><span>'+s.province+' · '+s.district+'</span><span>'+s.id+'</span><em>'+s.status+'</em></div>');
      if(!compact) marker.bindTooltip(s.name,{direction:'top',offset:[0,-7]});
    });
    mapInstance.current=map;
    const resize=()=>map.invalidateSize();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
    if(observer&&mapElement.current)observer.observe(mapElement.current);
    const resizeTimer=window.setTimeout(resize,100);
    return ()=>{window.clearTimeout(resizeTimer);observer?.disconnect();map.remove();mapInstance.current=null};
  },[compact]);
  return <div className={compact?'map-visual nimis-map-wrap':'nimis-map-wrap nimis-map-large'}>
    <div ref={mapElement} className="nimis-map" role="application" aria-label="Interactive map of Zimbabwe showing illustrative irrigation scheme locations"/>
    <div className="map-caption"><span className="map-dot"/><span>Zimbabwe · Scheme locations</span></div>
    <div className="map-legend"><span><i className="legend-dot green-dot"/> Operational</span><span><i className="legend-dot yellow-dot"/> Under review</span></div>
    {!compact&&<div className="map-source-note">Illustrative scheme points · verify coordinates through official GIS survey. Base map © OpenStreetMap contributors.</div>}
  </div>;
}

function Dashboard({ onSelect }) {
 const [registry,setRegistry]=useState(()=>{try{const value=JSON.parse(window.localStorage.getItem('nimis-registry-v1')||'null');return Array.isArray(value)?value:[]}catch{return[]}});
 useEffect(()=>{const refresh=()=>{try{const value=JSON.parse(window.localStorage.getItem('nimis-registry-v1')||'[]');setRegistry(Array.isArray(value)?value:[])}catch{setRegistry([])}};window.addEventListener('storage',refresh);window.addEventListener('nimis-registry-updated',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('nimis-registry-updated',refresh)}},[]);
 const totals=registry.reduce((a,r)=>({developed:a.developed+(Number(r.developed)||0),equipped:a.equipped+(Number(r.equipped)||0),irrigated:a.irrigated+(Number(r.irrigated)||0)}),{developed:0,equipped:0,irrigated:0});
 const countStatus=label=>registry.filter(r=>String(r.status||'').trim().toLowerCase()===label).length;
 const number=n=>n.toLocaleString('en-ZW',{maximumFractionDigits:1});
 const dynamicKpis=[
  {title:'Registered schemes',value:number(registry.length),note:'Records in the local master register',trend:'Registry',up:true,icon:Database,tint:'green'},
  {title:'Developed area',value:number(totals.developed)+' ha',note:'Sum of entered scheme records',trend:'Entered',up:true,icon:Sprout,tint:'blue'},
  {title:'Equipped area',value:number(totals.equipped)+' ha',note:'Sum of entered scheme records',trend:'Entered',up:true,icon:Wrench,tint:'cyan'},
  {title:'Currently irrigated area',value:number(totals.irrigated)+' ha',note:'Sum of entered scheme records',trend:'Entered',up:true,icon:Activity,tint:'gold'}
 ];
 const summaryStatus=[['Operational',countStatus('operational'),'green'],['Partially operational',countStatus('partial'),'blue'],['Under rehabilitation',countStatus('rehab'),'amber'],['Non-operational',countStatus('non-operational'),'red'],['Planned / under development',registry.filter(r=>/planned|development/i.test(r.status||'')).length,'cyan']];
 return <>
  <div className="welcome-row"><div><div className="eyebrow">NATIONAL OVERVIEW</div><h1>Executive Dashboard</h1><p className="subtitle">National oversight of irrigation delivery, water security, infrastructure condition and scheme performance.</p></div><div className="period-select"><CalendarDays size={15}/> Reporting period <strong>Not configured</strong><ChevronDown size={14}/></div></div>
  <div className="data-note"><CircleHelp size={15}/><span><strong>Data status</strong> — dashboard indicators are calculated from records currently stored in this browser. This is not a connected national dataset; figures may be incomplete and sample records must be verified.</span></div>
  <section className="dashboard-summary panel"><div><div className="eyebrow">SCHEME MASTER REGISTER · LOCAL RECORDS</div><strong style={{fontSize:20}}>{number(registry.length)} registered schemes</strong><p className="subtitle" style={{margin:"4px 0 0"}}>Totals update when scheme records are added, edited or imported.</p></div><button className="ghost-btn" onClick={()=>onSelect("registry")}>Open Scheme Registry <ArrowUpRight size={15}/></button></section>
  <div className="kpi-grid">{dynamicKpis.map(k=><KPI key={k.title} item={k}/>)}</div>
  <div className="status-kpi-grid">{summaryStatus.map(([label,value,tint])=><div className="status-kpi" key={label}><span className={'status-kpi-icon '+tint}><CircleDot size={15}/></span><div><small>{label}</small><strong>{number(value)}</strong></div></div>)}</div>
  <DashboardVisuals records={registry} totals={totals} format={number}/>
  <section className="panel schemes-panel"><div className="panel-head"><div><h2>Registered scheme records</h2><p>Master records currently available in this browser</p></div><button className="ghost-btn" onClick={()=>onSelect('registry')}>View registry <ArrowUpRight size={15}/></button></div>{registry.length?<SchemesTable rows={registry.slice(0,8).map(s=>({id:s.id,name:s.name,province:s.province,area:(Number(s.developed)||0).toLocaleString()+' ha',status:s.status||'Not recorded',water:s.water||'Not recorded',pct:Number(s.developed)>0?Math.round((Number(s.irrigated)||0)/Number(s.developed)*100):0}))}/>:<div className="reg-empty">No scheme records are stored in this browser yet. Register or import schemes to populate the dashboard.</div>}</section>
  <div className="bottom-grid"><section className="panel activity-panel"><div className="panel-head"><div><h2>Data coverage</h2><p>Completeness of the local master register</p></div></div><div className="activity-items"><div className="activity-item"><span className="activity-icon green"><ShieldCheck size={16}/></span><div><strong>{registry.filter(r=>r.dataStatus==='Verified').length} verified scheme records</strong><p>Records explicitly marked verified</p></div></div><div className="activity-item"><span className="activity-icon blue"><Database size={16}/></span><div><strong>{registry.filter(r=>!r.water||r.developed===''||r.equipped===''||r.irrigated==='').length} incomplete profiles</strong><p>Missing water or area information</p></div></div></div></section><section className="panel quick-panel"><div className="panel-head"><div><h2>Quick access</h2><p>Common system workspaces</p></div></div><div className="quick-links"><button onClick={()=>onSelect('registry')}><Database size={17}/><span>Scheme registry</span><ArrowUpRight size={14}/></button><button onClick={()=>onSelect('data')}><Upload size={17}/><span>Data management</span><ArrowUpRight size={14}/></button><button onClick={()=>onSelect('reports')}><FileBarChart2 size={17}/><span>Reports & analytics</span><ArrowUpRight size={14}/></button></div></section></div>
 </>;
}
function SchemesTable({rows}) { return <div className="table-wrap"><table><thead><tr><th>Scheme / ID</th><th>Province</th><th>Developed area</th><th>Operational status</th><th>Water status</th><th>Readiness</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td><div className="scheme-name">{s.name}<small>{s.id}</small></div></td><td>{s.province}</td><td>{s.area}</td><td><Status label={s.status}/></td><td><Status label={s.water}/></td><td><div className="readiness"><span className="readiness-track"><i style={{width:`${s.pct}%`}}/></span><b>{s.pct}%</b></div></td></tr>)}</tbody></table></div>; }
function ModuleInsights({id,records}) {
  const headings={
    gis:['Spatial coverage by province','Location review status'],
    water:['Water records by source','Water observation status'],
    infrastructure:['Assets by category','Condition review status'],
    agronomy:['Crop records by category','Verification status'],
    projects:['Project portfolio by type','Delivery workflow status'],
  }[id]||['Records by category','Workflow status'];
  const categories=Object.entries(records.reduce((counts,record)=>{
    const category=String(record.category||'Unclassified');
    counts[category]=(counts[category]||0)+1;
    return counts;
  },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const statuses=Object.entries(records.reduce((counts,record)=>{
    const status=String(record.status||'Not recorded');
    counts[status]=(counts[status]||0)+1;
    return counts;
  },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCategory=Math.max(1,...categories.map(([,count])=>count));
  const total=records.length||1;
  return <div className="module-insights">
    <section className="panel insight-panel">
      <div className="panel-head"><div><h2>{headings[0]}</h2><p>Counts calculated from records in this browser</p></div><Activity size={17}/></div>
      {categories.length?<div className="insight-list">{categories.map(([label,count])=><div className="insight-row" key={label}><div><span>{label}</span><strong>{count}</strong></div><div className="insight-track"><i style={{width:`${count/maxCategory*100}%`}}/></div></div>)}</div>:<div className="reg-empty">No categorized records yet.</div>}
    </section>
    <section className="panel insight-panel">
      <div className="panel-head"><div><h2>{headings[1]}</h2><p>Current local workflow distribution</p></div><CircleDot size={17}/></div>
      {statuses.length?<><div className="workflow-total"><strong>{records.length}</strong><span>local records</span></div><div className="workflow-stack" aria-label="Workflow status distribution">{statuses.map(([label,count],index)=><i key={label} className={`workflow-segment segment-${index}`} style={{width:`${count/total*100}%`}} title={`${label}: ${count}`}/>)}</div><div className="workflow-legend">{statuses.map(([label,count],index)=><div key={label}><i className={`segment-${index}`}/><span>{label}</span><strong>{count}</strong></div>)}</div></>:<div className="reg-empty">No workflow information is available.</div>}
    </section>
  </div>;
}
function DashboardVisuals({records,totals,format}) {
  const stages=[
    ['Developed area',totals.developed,'#08783e'],
    ['Equipped area',totals.equipped,'#368ab3'],
    ['Currently irrigated',totals.irrigated,'#d8a91c'],
  ];
  const maxArea=Math.max(1,...stages.map(([,value])=>value));
  const provinceEntries=Object.entries(records.reduce((result,record)=>{
    const province=String(record.province||'Not recorded');
    result[province]=(result[province]||0)+(Number(record.irrigated)||0);
    return result;
  },{})).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
  const provinceTotals=provinceEntries.length>5
    ?[...provinceEntries.slice(0,4),['Other provinces',provinceEntries.slice(4).reduce((sum,[,value])=>sum+value,0)]]
    :provinceEntries;
  const totalIrrigated=provinceTotals.reduce((sum,[,value])=>sum+value,0);
  const palette=['#08783e','#368ab3','#d8a91c','#8c79c8','#c9544d'];
  let cursor=0;
  const gradient=provinceTotals.map(([,value],index)=>{
    const start=cursor;
    cursor+=value/totalIrrigated*100;
    return `${palette[index]} ${start}% ${cursor}%`;
  }).join(',');
  return <div className="dash-grid dashboard-visuals">
    <section className="panel">
      <div className="panel-head"><div><h2>Area progression (ha)</h2><p>Developed, equipped and irrigated totals from local scheme records</p></div><Activity size={17}/></div>
      {records.length?<div className="area-chart">{stages.map(([label,value,color])=><div className="area-chart-row" key={label}><div><span>{label}</span><strong>{format(value)}</strong></div><div className="insight-track"><i style={{width:`${value/maxArea*100}%`,background:color}}/></div></div>)}</div>:<div className="chart-empty-state"><Activity size={24}/><strong>No scheme area records</strong><span>Area comparisons will appear when scheme figures are entered.</span></div>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><h2>Irrigated area by province</h2><p>Distribution calculated from local scheme records</p></div><MapPin size={17}/></div>
      {totalIrrigated>0?<div className="province-chart"><div className="province-donut" style={{background:`conic-gradient(${gradient})`}}><div><strong>{format(totalIrrigated)}</strong><small>ha recorded</small></div></div><div className="province-chart-legend">{provinceTotals.map(([province,value],index)=><div key={province}><i style={{background:palette[index]}}/><span>{province}</span><strong>{format(value)}</strong></div>)}</div></div>:<div className="chart-empty-state"><MapPin size={24}/><strong>No provincial breakdown</strong><span>Enter irrigated area and province for a scheme to show the distribution.</span></div>}
    </section>
  </div>;
}
function ModulePage({id}) {
  const m=moduleDescriptions[id] || moduleDescriptions.reports;
  const storageKey=`nimis-module-${id}-v1`;
  const initial=schemes.map((s,i)=>({
    ref:s.id,schemeId:s.id,name:s.name,province:s.province,district:s.district,
    category:id==='water'?'Dam / river source':id==='infrastructure'?'Conveyance system':id==='agronomy'?'Maize':id==='projects'?'Rehabilitation':id==='gis'?'Scheme location':'Scheme profile',
    status:i===2?'Under review':i===4?'Attention required':'Verified',
    detail:id==='water'?'Source observation pending verification':id==='infrastructure'?'Condition assessment recorded':id==='agronomy'?'2026/27 season sample record':id==='projects'?'Milestone progress requires update':id==='gis'?'Coordinates require field confirmation':'Master profile sample record',
    updated:'—'
  }));
  const masterSchemes=useMemo(()=>{const base=schemes.map(s=>({id:s.id,name:s.name,province:s.province,district:s.district}));try{const saved=typeof window!=='undefined'?JSON.parse(window.localStorage.getItem('nimis-registry-v1')):null;return Array.isArray(saved)&&saved.length?saved.map(s=>({id:s.id,name:s.name,province:s.province,district:s.district})):base}catch{return base}} ,[]);
  const [records,setRecords]=useState(()=>{
    try{const saved=typeof window!=='undefined'?JSON.parse(window.localStorage.getItem(storageKey)):null;return Array.isArray(saved)?saved:initial}
    catch{return initial}
  });
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('All statuses');
  const [showForm,setShowForm]=useState(false);
  const [draft,setDraft]=useState({ref:'',schemeId:'',name:'',province:'Manicaland',district:'',category:'',status:'Draft',detail:''});
  const [editing,setEditing]=useState('');
  const [notice,setNotice]=useState('');
  const moduleStats=[records.length,records.filter(r=>/review|attention|draft|submitted/i.test(r.status||'')).length,records.filter(r=>r.schemeId).length];
  const persist=next=>{setRecords(next);try{if(typeof window!=='undefined'){window.localStorage.setItem(storageKey,JSON.stringify(next));const before=new Map(records.map(r=>[r.ref,r]));const after=new Map(next.map(r=>[r.ref,r]));next.forEach(r=>{if(JSON.stringify(before.get(r.ref))!==JSON.stringify(r))enqueueSyncChange(id,'upsert',r)});records.forEach(r=>{if(!after.has(r.ref))enqueueSyncChange(id,'delete',{ref:r.ref,schemeId:r.schemeId})})}}catch{setNotice('Browser storage is unavailable. Changes remain only for this session.')}};
  const filtered=records.filter(r=>(status==='All statuses'||r.status===status)&&Object.values(r).some(v=>String(v??'').toLowerCase().includes(query.toLowerCase())));
  const openNew=()=>{setDraft({ref:'',schemeId:'',name:'',province:'Manicaland',district:'',category:'',status:'Draft',detail:''});setEditing('');setShowForm(true)};
  const openEdit=r=>{setDraft({...r,schemeId:r.schemeId||masterSchemes.find(s=>s.name===r.name)?.id||''});setEditing(r.ref);setShowForm(true)};
  const submit=e=>{
    e.preventDefault();
    if(!draft.name.trim()||!draft.district.trim()||!draft.category.trim()){setNotice('Complete the scheme name, district and record category.');return}
    const requestedRef=draft.ref.trim();
    if(!editing&&requestedRef&&records.some(r=>String(r.ref).trim().toLowerCase()===requestedRef.toLowerCase())){setNotice('That reference ID already exists. Enter a unique ID or leave it blank for an automatic ID.');return}
    let generatedRef=requestedRef;
    if(!editing&&!generatedRef){
      const prefix=`NIM-${id.toUpperCase()}-`;
      do{
        const token=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().slice(0,8).toUpperCase():`${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
        generatedRef=prefix+token;
      }while(records.some(r=>String(r.ref).trim().toLowerCase()===generatedRef.toLowerCase()));
    }
    const row={...draft,ref:editing||generatedRef,updated:new Date().toLocaleDateString('en-GB',{month:'short',year:'numeric'})};
    persist(editing?records.map(r=>r.ref===editing?row:r):[row,...records]);
    setShowForm(false);setNotice('Record saved in this browser prototype.');
  };
  const remove=ref=>{if(window.confirm('Delete this local prototype record?'))persist(records.filter(r=>r.ref!==ref))};
  const exportCsv=()=>{
    const columns=['ref','schemeId','name','province','district','category','status','detail','updated'];
    const escapeCell=value=>{
      let text=String(value??'');
      // Prevent spreadsheet formula execution when exported user-entered values are opened.
      if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
      return `"${text.replaceAll('"','""')}"`;
    };
    const csv=[columns.map(escapeCell).join(','),...filtered.map(record=>columns.map(key=>escapeCell(record[key])).join(','))].join('\r\n');
    let objectUrl;
    try{
      objectUrl=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');
      link.href=objectUrl;
      link.download=`nimis-${id}-records.csv`;
      link.style.display='none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the object URL alive long enough for the browser to start the download.
      window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
    }catch(error){
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      setNotice('The CSV could not be generated in this browser. Please try again.');
    }
  };
  const recordTitle=id==='water'?'Water source register':id==='infrastructure'?'Asset and condition register':id==='agronomy'?'Seasonal crop records':id==='projects'?'Project implementation register':id==='gis'?'Spatial scheme register':'Scheme master records';
  const formTitle=id==='water'?'Water source observation':id==='infrastructure'?'Infrastructure asset':id==='agronomy'?'Crop season record':id==='projects'?'Project milestone':id==='gis'?'Spatial location record':'Scheme information';
  return <div className="module-page">
    <div className="welcome-row"><div><div className="eyebrow">{m.eyebrow}</div><h1>{m.title}</h1><p className="subtitle">{m.description}</p></div><div className="period-select"><CalendarDays size={15}/> Reporting cycle <strong>Not configured</strong></div></div>
    <div className="data-note"><CircleHelp size={15}/><span><strong>Prototype records</strong> — sample information is illustrative, stored locally in this browser and is not connected to a national database.</span></div>
    <div className="kpi-grid module-kpis">{m.cards.map(([title],i)=><div className="kpi-card" key={title}><div className="kpi-top"><span className={`kpi-icon ${['green','gold','blue'][i]}`}><Activity size={18}/></span></div><div className="kpi-label">{title}</div><div className="kpi-value">{moduleStats[i].toLocaleString()}</div><div className="kpi-note">Calculated from local workspace records</div></div>)}</div>
    {id==='gis'&&<section className="panel gis-map-panel"><div className="panel-head"><div><h2>National scheme map</h2><p>Pan, zoom and select a point to inspect the illustrative scheme record.</p></div><span className="map-layer-label">OpenStreetMap · Street layer</span></div><ZimbabweMap/></section>}
    <ModuleInsights id={id} records={records}/>
    <section className="panel schemes-panel">
      <div className="panel-head"><div><h2>{recordTitle}</h2><p>{filtered.length} records displayed · linked to scheme references</p></div><div className="panel-actions"><button className="ghost-btn" onClick={exportCsv}><Download size={14}/> Export CSV</button><button className="reg-primary" onClick={openNew}>+ Add record</button></div></div>
      <div className="reg-toolbar"><div className="reg-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, scheme ID, district..."/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['Draft','Submitted','Under review','Verified','Approved','Attention required'].map(s=><option key={s}>{s}</option>)}</select></div>
      {filtered.length?<div className="table-wrap"><table><thead><tr><th>Record ID</th><th>Scheme ID</th><th>Scheme / record</th><th>Province / district</th><th>Category</th><th>Status</th><th>Record detail</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{filtered.map(r=><tr key={r.ref}><td>{r.ref}</td><td>{r.schemeId||'—'}</td><td><div className="scheme-name">{r.name}</div></td><td>{r.province}<small style={{display:'block',color:'#98a49c'}}>{r.district}</small></td><td>{r.category}</td><td><Status label={r.status}/></td><td>{r.detail}</td><td>{r.updated}</td><td><div className="reg-actions"><button aria-label="Edit record" title="Edit record" onClick={()=>openEdit(r)}><Pencil size={13}/></button><button aria-label="Delete record" title="Delete local record" onClick={()=>remove(r.ref)}><Trash2 size={13}/></button></div></td></tr>)}</tbody></table></div>:<div className="reg-empty">No matching records. Change the search or add a record.</div>}
      <div className="reg-foot">Workflow readiness: Capture → Verify → Review → Technical approval → Publish. Approval permissions and shared database integration are not yet connected.</div>
    </section>
    {notice&&<div className="data-note" role="status">{notice}<button style={{marginLeft:'auto',border:0,background:'transparent',color:'inherit'}} onClick={()=>setNotice('')}>Dismiss</button></div>}
    {showForm&&<div className="reg-modal-back" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><section className="reg-modal" role="dialog" aria-modal="true" aria-labelledby="module-form-title"><div className="reg-modal-head"><div><h2 id="module-form-title">{editing?'Edit record':`Add ${formTitle.toLowerCase()}`}</h2><p>Enter a prototype record. It will be saved only in this browser.</p></div><button className="reg-close" onClick={()=>setShowForm(false)} aria-label="Close"><X size={17}/></button></div><form onSubmit={submit}><div className="reg-form-grid">
      <label className="reg-field"><span>Link to registered scheme</span><select value={draft.schemeId||''} onChange={e=>{const selected=masterSchemes.find(s=>s.id===e.target.value);setDraft({...draft,schemeId:e.target.value,name:selected?.name||draft.name,province:selected?.province||draft.province,district:selected?.district||draft.district})}}><option value="">Unlinked / manual entry</option>{masterSchemes.map(s=><option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}</select></label>
      <label className="reg-field"><span>Scheme / record name *</span><input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value,schemeId:''})}/></label>
      <label className="reg-field"><span>District *</span><input required value={draft.district} onChange={e=>setDraft({...draft,district:e.target.value})}/></label>
      <label className="reg-field"><span>Province</span><select value={draft.province} onChange={e=>setDraft({...draft,province:e.target.value})}>{['Bulawayo','Harare','Manicaland','Mashonaland Central','Mashonaland East','Mashonaland West','Masvingo','Matabeleland North','Matabeleland South','Midlands'].map(p=><option key={p}>{p}</option>)}</select></label>
      <label className="reg-field"><span>Record category *</span><input required value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})} placeholder={formTitle}/></label>
      <label className="reg-field"><span>Workflow status</span><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{['Draft','Submitted','Under review','Verified','Approved','Attention required'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="reg-field"><span>Reference ID (optional)</span><input value={draft.ref} disabled={!!editing} onChange={e=>setDraft({...draft,ref:e.target.value})} placeholder="Generated if left blank"/></label>
      <label className="reg-field" style={{gridColumn:'1 / -1'}}><span>Record detail / observation</span><input value={draft.detail} onChange={e=>setDraft({...draft,detail:e.target.value})} placeholder="Describe the observation, condition or milestone"/></label>
      </div><div className="reg-modal-actions"><button type="button" className="ghost-btn" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="reg-primary">Save record</button></div></form></section></div>}
  </div>;
}
const reportTemplates=[
  {id:'scheme-profile',name:'National Scheme Profile',group:'Master data',frequency:'Monthly',purpose:'Summarises registered schemes, locations, water sources and verified scheme profile completeness.',fields:'Scheme ID · Province · District · Developed area · Equipped area · Currently irrigated area'},
  {id:'area-development',name:'Irrigation Area Development',group:'Performance',frequency:'Quarterly',purpose:'Compares developed, equipped and currently irrigated area, with clear separation between the three measures.',fields:'Scheme ID · Reporting period · Developed area · Equipped area · Irrigated area · Source'},
  {id:'water-resources',name:'Water Resources & Hydrology',group:'Water',frequency:'Monthly',purpose:'Consolidates reported water-source conditions and hydrological observations for review.',fields:'Scheme ID · Water source · Observation date · Water status · Source · Verification status'},
  {id:'infrastructure-om',name:'Infrastructure Condition & O&M',group:'Assets',frequency:'Quarterly',purpose:'Summarises asset condition assessments, maintenance requirements and reported actions.',fields:'Scheme ID · Asset ID · Asset type · Condition · Maintenance priority · Assessment date'},
  {id:'project-delivery',name:'Project Implementation',group:'Projects',frequency:'Monthly',purpose:'Tracks project milestones, reported progress, issues and handover readiness.',fields:'Project ID · Scheme ID · Milestone · Planned date · Reported status · Verification status'},
];
function ReportsPage(){
  const [selected,setSelected]=useState(reportTemplates[0]);
  const exportCatalogue=()=>{
    const columns=['id','name','group','frequency','purpose','fields'];
    const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
    const csv=[columns.map(cell).join(','),...reportTemplates.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n');
    let url;
    try{
      url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='NIMIS-report-catalogue.csv';
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(error){if(url)URL.revokeObjectURL(url);window.alert('The report catalogue could not be exported. Please try again.')}
  };
  return <div className="module-page">
    <div className="welcome-row"><div><div className="eyebrow">MANAGEMENT / REPORTING</div><h1>Reports & Analytics</h1><p className="subtitle">A catalogue of reporting views planned for governed NIMIS information.</p></div><button className="ghost-btn" onClick={exportCatalogue}><Download size={14}/> Export catalogue</button></div>
    <div className="data-note"><CircleHelp size={15}/><span><strong>Prototype report catalogue</strong> — these are report definitions only. No live national data, report-generation service or Power BI connection is configured.</span></div>
    <div className="kpi-grid module-kpis">
      <div className="kpi-card"><div className="kpi-label">Report definitions</div><div className="kpi-value">{reportTemplates.length}</div><div className="kpi-note">Prototype catalogue</div></div>
      <div className="kpi-card"><div className="kpi-label">Reporting cycles</div><div className="kpi-value">Monthly / quarterly</div><div className="kpi-note">Suggested frequencies</div></div>
      <div className="kpi-card"><div className="kpi-label">Data publication</div><div className="kpi-value">Not connected</div><div className="kpi-note">Requires verified source records</div></div>
    </div>
    <section className="panel schemes-panel">
      <div className="panel-head"><div><h2>Available report definitions</h2><p>Select a definition to inspect its purpose and expected fields.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Report</th><th>Category</th><th>Frequency</th><th>Definition</th></tr></thead><tbody>
        {reportTemplates.map(report=><tr key={report.id}><td><button className="report-select" aria-pressed={selected.id===report.id} onClick={()=>setSelected(report)}>{report.name}</button></td><td>{report.group}</td><td>{report.frequency}</td><td><button className="ghost-btn" onClick={()=>setSelected(report)}>View definition</button></td></tr>)}
      </tbody></table></div>
    </section>
    <section className="panel" style={{marginTop:16,padding:20}}>
      <div className="eyebrow">REPORT DEFINITION</div><h2 style={{margin:'8px 0'}}>{selected.name}</h2><p>{selected.purpose}</p><div className="data-note"><strong>Expected fields:</strong> {selected.fields}</div><div className="reg-foot">Frequency: {selected.frequency} · Category: {selected.group} · This definition does not generate or publish a report.</div>
    </section>
  </div>;
}

export default function App() {
  const [active,setActive]=useState('dashboard'); const [sidebarOpen,setSidebarOpen]=useState(false); const [search,setSearch]=useState('');
  const [isOnline,setIsOnline]=useState(()=>typeof navigator==='undefined'?true:navigator.onLine);
  const [pendingSync,setPendingSync]=useState(()=>readSyncQueue().filter(item=>item.status!=='synced').length);
  useEffect(()=>{
    let retrying=false;
    const refresh=()=>{setIsOnline(navigator.onLine);setPendingSync(readSyncQueue().filter(item=>item.status!=='synced').length)};
    const retry=async()=>{refresh();if(!navigator.onLine||retrying)return;retrying=true;try{await synchronizeIfConfigured()}catch(error){console.info('NIMIS changes remain queued:',error.message)}finally{retrying=false;refresh()}};
    window.addEventListener('online',retry);window.addEventListener('offline',refresh);window.addEventListener('nimis-sync-queue-updated',retry);window.addEventListener('storage',refresh);
    const onVisible=()=>{if(document.visibilityState==='visible')retry()};
    document.addEventListener('visibilitychange',onVisible);retry();
    return()=>{window.removeEventListener('online',retry);window.removeEventListener('offline',refresh);window.removeEventListener('nimis-sync-queue-updated',retry);window.removeEventListener('storage',refresh);document.removeEventListener('visibilitychange',onVisible)};
  },[]);
  const activeItem=nav.find(n=>n.id===active); const grouped=useMemo(()=>['OVERVIEW','MONITORING','MANAGEMENT'].map(group=>({group,items:nav.filter(n=>n.group===group)})),[]);
  const change=(id)=>{setActive(id);setSidebarOpen(false);};
  return <div className="app-shell"><aside className={`sidebar ${sidebarOpen?'open':''}`}><div className="brand"><div className="brand-mark"><img src={`${import.meta.env.BASE_URL}nimis-coat-of-arms.png`} alt="Zimbabwe Coat of Arms" /></div><div className="brand-text"><strong>NIMIS</strong><span>National Irrigation Management Information System</span></div><button className="close-sidebar" onClick={()=>setSidebarOpen(false)}><X size={18}/></button></div><div className="sidebar-divider"/><div className="nav-scroll">{grouped.map(g=><div className="nav-group" key={g.group}><div className="nav-heading">{g.group}</div>{g.items.map(n=>{const Icon=n.icon;return <button className={`nav-item ${active===n.id?'active':''}`} key={n.id} onClick={()=>change(n.id)}><Icon size={17}/><span>{n.label}</span>{active===n.id&&<span className="nav-active-dot"/>}</button>})}</div>)}</div><div className="sidebar-bottom"><div className="user-card"><div className="user-avatar">NI</div><div className="user-info"><strong>NIMIS Preview</strong><span>Prototype workspace</span></div><ChevronDown size={15}/></div><div className="sidebar-footer">Department of Irrigation Development<br/>Government of Zimbabwe</div></div></aside>{sidebarOpen&&<div className="mobile-overlay" onClick={()=>setSidebarOpen(false)}/>}
  <main className="main-area"><header className="topbar"><div className="ministry-brand"><strong>Ministry of Agriculture, Mechanisation and Water Resources Development</strong><span>Department of Irrigation Development</span></div><button className="mobile-menu icon-btn" onClick={()=>setSidebarOpen(true)}><Menu size={19}/></button><div className="breadcrumb"><span>NIMIS</span><b>/</b><strong>{activeItem?.label}</strong></div><div className="top-actions"><span className={`connection-status ${isOnline?'online':'offline'}`} title={isOnline?'Network connection detected':'Offline mode — changes are saved on this device'}><i/>{isOnline?'Online':'Offline'}{pendingSync>0&&<b>{pendingSync} pending</b>}</span><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search schemes, districts..." aria-label="Search"/>{search&&<button onClick={()=>setSearch('')}><X size={13}/></button>}</div><button className="icon-btn notification-btn" aria-label="Notifications"><Bell size={17}/><i/></button><div className="top-user"><div className="user-avatar small">NI</div><span>Preview</span><ChevronDown size={14}/></div></div></header><div className="content-wrap"><div className="content-inner">{active==='dashboard'?<Dashboard onSelect={change}/>:active==='registry'?<RegistryPage/>:active==='reports'?<ReportsPage/>:active==='data'?<DataManagement/>:<ModulePage id={active}/>}<footer className="page-footer"><span>© 2026 NIMIS · National Irrigation Management Information System</span><span><span className="footer-status"/> Prototype environment</span></footer></div></div></main></div>;
}
