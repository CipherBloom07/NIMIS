import React, { useMemo, useState } from 'react';
import RegistryPage from './Registry.jsx';
import {
  LayoutDashboard, Map, Droplets, Wrench, Sprout, ClipboardList, Database,
  FileBarChart2, Search, Bell, ChevronDown, Menu, X, ArrowUpRight,
  ArrowDownRight, Activity, MapPin, CalendarDays, Filter, Download,
  CircleHelp, Settings, ShieldCheck, CircleDot, TrendingUp, Waves,
} from 'lucide-react';


const nav = [
  { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard, group: 'OVERVIEW' },
  { id: 'gis', label: 'GIS & Spatial Mapping', icon: Map, group: 'MONITORING' },
  { id: 'water', label: 'Water Resources & Hydrology', icon: Droplets, group: 'MONITORING' },
  { id: 'infrastructure', label: 'Infrastructure & O&M', icon: Wrench, group: 'MONITORING' },
  { id: 'agronomy', label: 'Agronomy & Production', icon: Sprout, group: 'MONITORING' },
  { id: 'projects', label: 'Project Implementation', icon: ClipboardList, group: 'MANAGEMENT' },
  { id: 'registry', label: 'Scheme Registry', icon: Database, group: 'MANAGEMENT' },
  { id: 'reports', label: 'Reports & Analytics', icon: FileBarChart2, group: 'MANAGEMENT' },
];

const schemes = [
  { name: 'Chisumbanje', province: 'Manicaland', district: 'Chisumbanje', area: '2,780 ha', status: 'Operational', pct: 88, water: 'Stable', crop: 'Sugarcane', id: 'NIM-MAN-001' },
  { name: 'Tongogara', province: 'Manicaland', district: 'Chipinge', area: '1,640 ha', status: 'Operational', pct: 73, water: 'Watch', crop: 'Maize · Wheat', id: 'NIM-MAN-014' },
  { name: 'Insukamini', province: 'Midlands', district: 'Kwekwe', area: '820 ha', status: 'Under rehabilitation', pct: 51, water: 'Stable', crop: 'Maize', id: 'NIM-MID-008' },
  { name: 'Mushandike', province: 'Masvingo', district: 'Masvingo', area: '1,125 ha', status: 'Operational', pct: 94, water: 'Stable', crop: 'Maize · Horticulture', id: 'NIM-MAS-002' },
  { name: 'Nyanyadzi', province: 'Manicaland', district: 'Nyanyadzi', area: '560 ha', status: 'Operational', pct: 62, water: 'Watch', crop: 'Horticulture', id: 'NIM-MAN-022' },
];
const kpis = [
  { title: 'Currently irrigated area', value: '305,121 ha', note: 'Reported irrigated area', trend: '+2.4%', up: true, icon: Sprout, tint: 'green' },
  { title: '2030 National Target', value: '496,000 ha', note: 'National irrigation target', trend: 'Target', up: true, icon: TrendingUp, tint: 'blue' },
  { title: 'Progress to target', value: '61.5%', note: 'Target achievement', trend: '+1.2%', up: true, icon: Activity, tint: 'cyan' },
  { title: 'Remaining to target', value: '190,879 ha', note: 'Area gap to target', trend: 'Gap', up: false, icon: MapPin, tint: 'gold' },
];
const provinceData = [ ['Mashonaland West',86], ['Manicaland',73], ['Mashonaland East',69], ['Masvingo',64], ['Midlands',58], ['Mashonaland Central',53], ['Matabeleland South',45], ['Matabeleland North',39], ['Harare',22], ['Bulawayo',17] ];
const moduleDescriptions = {
  gis: { eyebrow:'MONITORING / GEOSPATIAL', title:'GIS & Spatial Mapping', description:'Explore scheme locations, geographic coverage and spatial context across Zimbabwe.', cards:[['Mapped schemes','1,086'],['Provinces covered','10'],['Spatial data layers','06']], tableTitle:'Scheme location overview' },
  water: { eyebrow:'MONITORING / WATER', title:'Water Resources & Hydrology', description:'Monitor water sources, availability, abstraction context and seasonal conditions.', cards:[['Water sources recorded','946'],['Status requiring review','38'],['Updated this month','121']], tableTitle:'Water source records' },
  infrastructure: { eyebrow:'MONITORING / ASSETS', title:'Infrastructure & O&M', description:'Track infrastructure condition, maintenance needs and operational readiness.', cards:[['Assets registered','4,810'],['Maintenance backlog','126'],['Condition assessments','342']], tableTitle:'Infrastructure condition' },
  agronomy: { eyebrow:'MONITORING / PRODUCTION', title:'Agronomy & Production', description:'Capture cropping seasons, planted area, crop performance and verified production.', cards:[['Active seasons','743'],['Area planted','42,890 ha'],['Harvest records','318']], tableTitle:'Crop season overview' },
  projects: { eyebrow:'MANAGEMENT / DELIVERY', title:'Project Implementation Tracker', description:'Follow implementation milestones, delivery progress, issues and completion handover.', cards:[['Active projects','96'],['On schedule','61'],['Attention needed','19']], tableTitle:'Implementation portfolio' },
  registry: { eyebrow:'MANAGEMENT / MASTER DATA', title:'Scheme Registry', description:'A governed national register of irrigation schemes and their linked master information.', cards:[['Registered schemes','1,284'],['Pending verification','34'],['Profile completeness','81%']], tableTitle:'National scheme register' },
  reports: { eyebrow:'MANAGEMENT / INSIGHTS', title:'Reports & Analytics', description:'Explore governed indicators and prepare consistent management reporting views.', cards:[['Report templates','18'],['Reporting cycle','Monthly'],['Latest snapshot','Nov 2026']], tableTitle:'Available reporting views' },
};

function Status({ label }) { const cls = label.toLowerCase().includes('rehab') ? 'status amber' : label.toLowerCase().includes('watch') || label.toLowerCase().includes('attention') ? 'status amber' : 'status green'; return <span className={cls}><i />{label}</span>; }
function KPI({ item }) { const Icon=item.icon; return <div className="kpi-card"><div className="kpi-top"><span className={`kpi-icon ${item.tint}`}><Icon size={18}/></span><span className={`trend ${item.up?'positive':'negative'}`}>{item.up?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {item.trend}</span></div><div className="kpi-label">{item.title}</div><div className="kpi-value">{item.value}</div><div className="kpi-note">{item.note}</div></div>; }
function MapVisual() { return <div className="map-visual"><div className="map-grid"/><svg className="map-outline" viewBox="0 0 400 300" aria-label="Stylised Zimbabwe map illustration"><path d="M121 27 L173 35 L209 23 L254 43 L279 80 L302 91 L298 127 L319 151 L300 181 L284 213 L260 237 L236 257 L202 269 L176 250 L151 237 L131 215 L114 187 L92 165 L82 130 L95 103 L87 72 L106 49 Z" fill="#d8e7db" stroke="#9ab5a4" strokeWidth="2"/><path d="M130 67 L166 88 L192 72 L217 95 L250 86 L265 120 L243 146 L250 177 L224 202 L193 219 L168 201 L145 175 L121 153 L115 122 Z" fill="#bed5c4" stroke="#a3bcae" strokeWidth="1.5"/><path d="M146 95 L174 115 L204 102 L229 122 L220 152 L193 165 L169 150 L146 133 Z" fill="#a5c8b1" stroke="#8eae9b"/><path d="M170 141 L193 158 L213 151 L228 173 L215 194 L188 200 L169 183 L158 163 Z" fill="#88b99b" stroke="#82a991"/><path d="M103 113 L126 129 L120 155 L104 150 Z" fill="#c1d9c7"/><path d="M219 82 L248 103 L252 122 L238 127 L223 112 Z" fill="#b0cfba"/><path d="M142 183 L159 194 L169 214 L151 219 L136 204 Z" fill="#b5d1bd"/></svg><div className="map-caption"><span className="map-dot"/><span>Zimbabwe · Province overview</span></div><div className="map-pins"><span className="pin p1"><b>12</b></span><span className="pin p2"><b>8</b></span><span className="pin p3"><b>24</b></span><span className="pin p4"><b>16</b></span><span className="pin p5"><b>6</b></span><span className="pin p6"><b>11</b></span></div><div className="map-legend"><span><i className="legend-dot green-dot"/> Operational</span><span><i className="legend-dot yellow-dot"/> Under review</span></div></div>; }
function Dashboard({ onSelect }) { return <>
  <div className="welcome-row"><div><div className="eyebrow">NATIONAL OVERVIEW</div><h1>Executive Dashboard</h1><p className="subtitle">A consolidated view of irrigation scheme development and performance.</p></div><div className="period-select"><CalendarDays size={15}/> Reporting period <strong>November 2026</strong><ChevronDown size={14}/></div></div>
  <div className="data-note"><CircleHelp size={15}/><span><strong>Prototype data</strong> — figures shown are illustrative and not official national statistics.</span></div>
  <div className="kpi-grid">{kpis.map(k=><KPI key={k.title} item={k}/>)}</div>
  <div className="status-kpi-grid">{[['Operational','1,327','green'],['Functional','822','blue'],['Partially functional','266','amber'],['Under rehabilitation','178','cyan'],['Non-functional','61','red']].map(([label,value,tint])=><div className="status-kpi" key={label}><span className={'status-kpi-icon '+tint}><CircleDot size={15}/></span><div><small>{label}</small><strong>{value}</strong></div></div>)}</div>

  <div className="dash-grid"><section className="panel map-panel"><div className="panel-head"><div><h2>Scheme distribution</h2><p>Geographic overview by province</p></div><button className="ghost-btn" onClick={()=>onSelect('gis')}>Explore map <ArrowUpRight size={15}/></button></div><MapVisual/></section>
  <section className="panel province-panel"><div className="panel-head"><div><h2>Province coverage</h2><p>Registered scheme distribution index</p></div><button className="icon-btn"><Filter size={16}/></button></div><div className="province-list">{provinceData.map(([name,val])=><div className="province-row" key={name}><div className="province-label"><span>{name}</span><strong>{val}%</strong></div><div className="bar-track"><div className="bar-fill" style={{width:`${val}%`}}/></div></div>)}</div><div className="panel-foot">Illustrative provincial coverage index <span>View breakdown <ArrowUpRight size={13}/></span></div></section></div>
  <section className="panel schemes-panel"><div className="panel-head"><div><h2>Scheme activity</h2><p>Selected schemes with recent reporting records</p></div><button className="ghost-btn" onClick={()=>onSelect('registry')}>View registry <ArrowUpRight size={15}/></button></div><SchemesTable rows={schemes.slice(0,4)}/></section>
  <div className="bottom-grid"><section className="panel activity-panel"><div className="panel-head"><div><h2>Reporting activity</h2><p>Illustrative submissions summary</p></div><span className="live-label"><i/> Sample activity</span></div><div className="activity-items"><div className="activity-item"><span className="activity-icon green"><ShieldCheck size={16}/></span><div><strong>Scheme profile verified</strong><p>Demo record · Provincial review</p></div><time>Today</time></div><div className="activity-item"><span className="activity-icon blue"><Droplets size={16}/></span><div><strong>Water status updated</strong><p>Demo record · District reporting</p></div><time>Yesterday</time></div><div className="activity-item"><span className="activity-icon amber"><ClipboardList size={16}/></span><div><strong>Project milestone submitted</strong><p>Demo record · Implementation tracker</p></div><time>2 days</time></div></div></section><section className="panel quick-panel"><div className="panel-head"><div><h2>Quick access</h2><p>Common system workspaces</p></div></div><div className="quick-links"><button onClick={()=>onSelect('registry')}><Database size={17}/><span>Scheme registry</span><ArrowUpRight size={14}/></button><button onClick={()=>onSelect('projects')}><ClipboardList size={17}/><span>Project tracker</span><ArrowUpRight size={14}/></button><button onClick={()=>onSelect('reports')}><FileBarChart2 size={17}/><span>Reports & analytics</span><ArrowUpRight size={14}/></button></div></section></div>
  </>; }
function SchemesTable({rows}) { return <div className="table-wrap"><table><thead><tr><th>Scheme / ID</th><th>Province</th><th>Developed area</th><th>Operational status</th><th>Water status</th><th>Readiness</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td><div className="scheme-name">{s.name}<small>{s.id}</small></div></td><td>{s.province}</td><td>{s.area}</td><td><Status label={s.status}/></td><td><Status label={s.water}/></td><td><div className="readiness"><span className="readiness-track"><i style={{width:`${s.pct}%`}}/></span><b>{s.pct}%</b></div></td></tr>)}</tbody></table></div>; }
function ModulePage({id}) {
  const m=moduleDescriptions[id];
  const storageKey=`nimis-module-${id}-v1`;
  const initial=schemes.map((s,i)=>({
    ref:s.id,name:s.name,province:s.province,district:s.district,
    category:id==='water'?'Dam / river source':id==='infrastructure'?'Conveyance system':id==='agronomy'?'Maize':id==='projects'?'Rehabilitation':id==='gis'?'Scheme location':'Scheme profile',
    status:i===2?'Under review':i===4?'Attention required':'Verified',
    detail:id==='water'?'Source observation pending verification':id==='infrastructure'?'Condition assessment recorded':id==='agronomy'?'2026/27 season sample record':id==='projects'?'Milestone progress requires update':id==='gis'?'Coordinates require field confirmation':'Master profile sample record',
    updated:'Nov 2026'
  }));
  const [records,setRecords]=useState(()=>{
    try{const saved=JSON.parse(localStorage.getItem(storageKey));return Array.isArray(saved)?saved:initial}
    catch{return initial}
  });
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('All statuses');
  const [showForm,setShowForm]=useState(false);
  const [draft,setDraft]=useState({ref:'',name:'',province:'Manicaland',district:'',category:'',status:'Draft',detail:''});
  const [editing,setEditing]=useState('');
  const [notice,setNotice]=useState('');
  const persist=next=>{setRecords(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{setNotice('Browser storage is unavailable. Changes remain only for this session.')}};
  const filtered=records.filter(r=>(status==='All statuses'||r.status===status)&&Object.values(r).some(v=>String(v??'').toLowerCase().includes(query.toLowerCase())));
  const openNew=()=>{setDraft({ref:'',name:'',province:'Manicaland',district:'',category:'',status:'Draft',detail:''});setEditing('');setShowForm(true)};
  const openEdit=r=>{setDraft({...r});setEditing(r.ref);setShowForm(true)};
  const submit=e=>{
    e.preventDefault();
    if(!draft.name.trim()||!draft.district.trim()||!draft.category.trim()){setNotice('Complete the scheme name, district and record category.');return}
    const row={...draft,ref:editing||draft.ref.trim()||`NIM-${id.toUpperCase()}-${String(Date.now()).slice(-6)}`,updated:'Nov 2026'};
    persist(editing?records.map(r=>r.ref===editing?row:r):[row,...records]);
    setShowForm(false);setNotice('Record saved in this browser prototype.');
  };
  const remove=ref=>{if(window.confirm('Delete this local prototype record?'))persist(records.filter(r=>r.ref!==ref))};
  const exportCsv=()=>{
    const cols=['ref','name','province','district','category','status','detail','updated'];
    const csv=[cols.join(','),...filtered.map(r=>cols.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`nimis-${id}-records.csv`;a.click();URL.revokeObjectURL(url);
  };
  const recordTitle=id==='water'?'Water source register':id==='infrastructure'?'Asset and condition register':id==='agronomy'?'Seasonal crop records':id==='projects'?'Project implementation register':id==='gis'?'Spatial scheme register':'Scheme master records';
  const formTitle=id==='water'?'Water source observation':id==='infrastructure'?'Infrastructure asset':id==='agronomy'?'Crop season record':id==='projects'?'Project milestone':id==='gis'?'Spatial location record':'Scheme information';
  return <div className="module-page">
    <div className="welcome-row"><div><div className="eyebrow">{m.eyebrow}</div><h1>{m.title}</h1><p className="subtitle">{m.description}</p></div><div className="period-select"><CalendarDays size={15}/> Reporting cycle <strong>Nov 2026</strong></div></div>
    <div className="data-note"><CircleHelp size={15}/><span><strong>Prototype records</strong> — sample information is illustrative, stored locally in this browser and is not connected to a national database.</span></div>
    <div className="kpi-grid module-kpis">{m.cards.map(([title,value],i)=><div className="kpi-card" key={title}><div className="kpi-top"><span className={`kpi-icon ${['green','gold','blue'][i]}`}><Activity size={18}/></span></div><div className="kpi-label">{title}</div><div className="kpi-value">{value}</div><div className="kpi-note">Illustrative summary · not verified</div></div>)}</div>
    <section className="panel schemes-panel">
      <div className="panel-head"><div><h2>{recordTitle}</h2><p>{filtered.length} records displayed · linked to scheme references</p></div><div className="panel-actions"><button className="ghost-btn" onClick={exportCsv}><Download size={14}/> Export CSV</button><button className="reg-primary" onClick={openNew}>+ Add record</button></div></div>
      <div className="reg-toolbar"><div className="reg-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, scheme ID, district..."/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['Draft','Submitted','Under review','Verified','Approved','Attention required'].map(s=><option key={s}>{s}</option>)}</select></div>
      {filtered.length?<div className="table-wrap"><table><thead><tr><th>Scheme / record ID</th><th>Scheme / record</th><th>Province / district</th><th>Category</th><th>Status</th><th>Record detail</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{filtered.map(r=><tr key={r.ref}><td>{r.ref}</td><td><div className="scheme-name">{r.name}</div></td><td>{r.province}<small style={{display:'block',color:'#98a49c'}}>{r.district}</small></td><td>{r.category}</td><td><Status label={r.status}/></td><td>{r.detail}</td><td>{r.updated}</td><td><div className="reg-actions"><button aria-label="Edit record" title="Edit record" onClick={()=>openEdit(r)}><Pencil size={13}/></button><button aria-label="Delete record" title="Delete local record" onClick={()=>remove(r.ref)}><Trash2 size={13}/></button></div></td></tr>)}</tbody></table></div>:<div className="reg-empty">No matching records. Change the search or add a record.</div>}
      <div className="reg-foot">Workflow readiness: Capture → Verify → Review → Technical approval → Publish. Approval permissions and shared database integration are not yet connected.</div>
    </section>
    {notice&&<div className="data-note" role="status">{notice}<button style={{marginLeft:'auto',border:0,background:'transparent',color:'inherit'}} onClick={()=>setNotice('')}>Dismiss</button></div>}
    {showForm&&<div className="reg-modal-back" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><section className="reg-modal" role="dialog" aria-modal="true" aria-labelledby="module-form-title"><div className="reg-modal-head"><div><h2 id="module-form-title">{editing?'Edit record':`Add ${formTitle.toLowerCase()}`}</h2><p>Enter a prototype record. It will be saved only in this browser.</p></div><button className="reg-close" onClick={()=>setShowForm(false)} aria-label="Close"><X size={17}/></button></div><form onSubmit={submit}><div className="reg-form-grid">
      <label className="reg-field"><span>Scheme / record name *</span><input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <label className="reg-field"><span>District *</span><input required value={draft.district} onChange={e=>setDraft({...draft,district:e.target.value})}/></label>
      <label className="reg-field"><span>Province</span><select value={draft.province} onChange={e=>setDraft({...draft,province:e.target.value})}>{['Bulawayo','Harare','Manicaland','Mashonaland Central','Mashonaland East','Mashonaland West','Masvingo','Matabeleland North','Matabeleland South','Midlands'].map(p=><option key={p}>{p}</option>)}</select></label>
      <label className="reg-field"><span>Record category *</span><input required value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})} placeholder={formTitle}/></label>
      <label className="reg-field"><span>Workflow status</span><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{['Draft','Submitted','Under review','Verified','Approved','Attention required'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="reg-field"><span>Reference ID (optional)</span><input value={draft.ref} disabled={!!editing} onChange={e=>setDraft({...draft,ref:e.target.value})} placeholder="Generated if left blank"/></label>
      <label className="reg-field" style={{gridColumn:'1 / -1'}}><span>Record detail / observation</span><input value={draft.detail} onChange={e=>setDraft({...draft,detail:e.target.value})} placeholder="Describe the observation, condition or milestone"/></label>
      </div><div className="reg-modal-actions"><button type="button" className="ghost-btn" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="reg-primary">Save record</button></div></form></section></div>}
  </div>;
}
export default function App() {
  const [active,setActive]=useState('dashboard'); const [sidebarOpen,setSidebarOpen]=useState(false); const [search,setSearch]=useState('');
  const activeItem=nav.find(n=>n.id===active); const grouped=useMemo(()=>['OVERVIEW','MONITORING','MANAGEMENT'].map(group=>({group,items:nav.filter(n=>n.group===group)})),[]);
  const change=(id)=>{setActive(id);setSidebarOpen(false);};
  return <div className="app-shell"><aside className={`sidebar ${sidebarOpen?'open':''}`}><div className="brand"><div className="brand-mark"><Waves size={23}/></div><div className="brand-text"><strong>NIMIS</strong><span>National Irrigation Management Information System</span></div><button className="close-sidebar" onClick={()=>setSidebarOpen(false)}><X size={18}/></button></div><div className="sidebar-divider"/><div className="nav-scroll">{grouped.map(g=><div className="nav-group" key={g.group}><div className="nav-heading">{g.group}</div>{g.items.map(n=>{const Icon=n.icon;return <button className={`nav-item ${active===n.id?'active':''}`} key={n.id} onClick={()=>change(n.id)}><Icon size={17}/><span>{n.label}</span>{active===n.id&&<span className="nav-active-dot"/>}</button>})}</div>)}</div><div className="sidebar-bottom"><div className="user-card"><div className="user-avatar">NI</div><div className="user-info"><strong>NIMIS Preview</strong><span>Prototype workspace</span></div><ChevronDown size={15}/></div><div className="sidebar-footer">Department of Irrigation Development<br/>Government of Zimbabwe</div></div></aside>{sidebarOpen&&<div className="mobile-overlay" onClick={()=>setSidebarOpen(false)}/>}
  <main className="main-area"><header className="topbar"><div className="ministry-brand"><strong>Ministry of Agriculture, Mechanisation and Water Resources Development</strong><span>Department of Irrigation Development</span></div><button className="mobile-menu icon-btn" onClick={()=>setSidebarOpen(true)}><Menu size={19}/></button><div className="breadcrumb"><span>NIMIS</span><b>/</b><strong>{activeItem?.label}</strong></div><div className="top-actions"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search schemes, districts..." aria-label="Search"/>{search&&<button onClick={()=>setSearch('')}><X size={13}/></button>}</div><button className="icon-btn notification-btn" aria-label="Notifications"><Bell size={17}/><i/></button><div className="top-user"><div className="user-avatar small">NI</div><span>Preview</span><ChevronDown size={14}/></div></div></header><div className="content-wrap"><div className="content-inner">{active==='dashboard'?<Dashboard onSelect={change}/>:active==='registry'?<RegistryPage/>:<ModulePage id={active}/>}<footer className="page-footer"><span>© 2026 NIMIS · National Irrigation Management Information System</span><span><span className="footer-status"/> Prototype environment</span></footer></div></div></main></div>;
}
