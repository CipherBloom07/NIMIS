import React,{useState,useMemo,useEffect} from 'react';
import {enqueueSyncChange} from './dataSync.js';
import {Search,Plus,Download,Pencil,Trash2,X} from 'lucide-react';
const seed=[
{id:'NIM-MAN-001',name:'Chisumbanje',province:'Manicaland',district:'Chisumbanje',water:'River / canal',status:'Operational',developed:2780,equipped:2500,irrigated:2200},
{id:'NIM-MAN-014',name:'Tongogara',province:'Manicaland',district:'Chipinge',water:'Dam',status:'Operational',developed:1640,equipped:1200,irrigated:880},
{id:'NIM-MID-008',name:'Insukamini',province:'Midlands',district:'Kwekwe',water:'Dam',status:'Under rehabilitation',developed:820,equipped:600,irrigated:350},
{id:'NIM-MAS-002',name:'Mushandike',province:'Masvingo',district:'Masvingo',water:'Dam',status:'Operational',developed:1125,equipped:980,irrigated:920},
{id:'NIM-MAN-022',name:'Nyanyadzi',province:'Manicaland',district:'Nyanyadzi',water:'River',status:'Operational',developed:560,equipped:480,irrigated:320}];
const key='nimis-registry-v1',provinces=['Bulawayo','Harare','Manicaland','Mashonaland Central','Mashonaland East','Mashonaland West','Masvingo','Matabeleland North','Matabeleland South','Midlands'];
const empty={name:'',province:'Manicaland',district:'',water:'',status:'Operational',developed:'',equipped:'',irrigated:''};
export default function RegistryPage(){
useEffect(()=>{try{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(seed));window.dispatchEvent(new Event('nimis-registry-updated'))}}catch{}},[]);
const[records,setRecords]=useState(()=>{try{if(typeof window==='undefined')return seed;const data=JSON.parse(window.localStorage.getItem(key));return Array.isArray(data)?data:seed}catch{return seed}});
const[q,setQ]=useState(''),[province,setProvince]=useState('All provinces'),[status,setStatus]=useState('All statuses'),[form,setForm]=useState(empty),[editing,setEditing]=useState(''),[show,setShow]=useState(false);
const save=data=>{setRecords(data);try{if(typeof window!=='undefined'){window.localStorage.setItem(key,JSON.stringify(data));window.dispatchEvent(new Event('nimis-registry-updated'));const before=new Map(records.map(r=>[r.id,r]));const after=new Map(data.map(r=>[r.id,r]));data.forEach(r=>{if(JSON.stringify(before.get(r.id))!==JSON.stringify(r))enqueueSyncChange('scheme','upsert',r)});records.forEach(r=>{if(!after.has(r.id))enqueueSyncChange('scheme','delete',{id:r.id})})}}catch{}};
const rows=useMemo(()=>records.filter(r=>(province==='All provinces'||r.province===province)&&(status==='All statuses'||r.status===status)&&Object.values(r).some(v=>String(v??'').toLowerCase().includes(q.toLowerCase()))),[records,q,province,status]);
const totals = records.reduce(
  (total, record) => ({
    d: total.d + (Number(record.developed) || 0),
    e: total.e + (Number(record.equipped) || 0),
    i: total.i + (Number(record.irrigated) || 0),
  }),
  { d: 0, e: 0, i: 0 },
);
const startNew=()=>{setForm(empty);setEditing('');setShow(true)},startEdit=r=>{setForm({...r});setEditing(r.id);setShow(true)};
const submit=e=>{
 e.preventDefault();
 const d=Number(form.developed),eq=Number(form.equipped),ir=Number(form.irrigated);
 if(!form.name.trim()||!form.district.trim()||!form.water||[d,eq,ir].some(v=>!Number.isFinite(v)||v<0)||eq>d||ir>eq){
  alert('Complete the required fields and check the areas: currently irrigated ≤ equipped ≤ developed. Values cannot be negative.');
  return;
 }
 const item={...form,name:form.name.trim(),district:form.district.trim(),developed:d,equipped:eq,irrigated:ir};
 if(editing){save(records.map(r=>r.id===editing?{...item,id:editing}:r))}
 else{
  const prefix='NIM-'+form.province.slice(0,3).toUpperCase()+'-';
  let requestedId='';
  do{const token=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().slice(0,8).toUpperCase():`${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;requestedId=prefix+token}while(records.some(r=>String(r.id).toLowerCase()===requestedId.toLowerCase()))
  item.id=requestedId;save([...records,item]);
 }
 setShow(false);
};
const csv=()=>{
 const cols=['id','name','province','district','water','status','developed','equipped','irrigated'];
 const cell=value=>{
  let text=String(value??'');
  // Treat user-entered values as text when opened in spreadsheet software.
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
 };
 let url;
 try{
  const out=[cols.map(cell).join(','),...rows.map(r=>cols.map(key=>cell(r[key])).join(','))].join('\r\n');
  url=URL.createObjectURL(new Blob(['\uFEFF',out],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download='NIMIS-scheme-registry.csv';link.style.display='none';
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
 }catch(error){
  if(url)URL.revokeObjectURL(url);
  window.alert('The CSV could not be generated in this browser. Please try again.');
 }
};
const field=(label,name,type='text')=><label className="reg-field"><span>{label}</span><input type={type} min={type==='number'?0:undefined} step={type==='number'?'any':undefined} value={form[name]??''} required={['name','district','developed','equipped','irrigated'].includes(name)} onChange={e=>setForm({...form,[name]:e.target.value})}/></label>;
return <div className="registry-page"><div className="welcome-row"><div><div className="eyebrow">MANAGEMENT / MASTER DATA</div><h1>Scheme Registry — Scheme Profile</h1><p className="subtitle">National irrigation scheme master records</p></div><button className="reg-primary" onClick={startNew}><Plus size={15}/> Register scheme</button></div><div className="data-note"><strong>Prototype records.</strong> These sample rows are illustrative; this browser prototype is not the official national database.</div><div className="reg-summary">{[['Schemes',records.length],['Developed area',totals.d.toLocaleString()+' ha'],['Equipped area',totals.e.toLocaleString()+' ha'],['Currently irrigated',totals.i.toLocaleString()+' ha']].map(([label,val])=><div key={label}><small>{label}</small><strong>{val}</strong></div>)}</div><section className="panel"><div className="reg-toolbar"><div className="reg-search"><Search size={15}/><input placeholder="Search scheme, ID, district..." value={q} onChange={e=>setQ(e.target.value)}/></div><select value={province} onChange={e=>setProvince(e.target.value)}><option>All provinces</option>{provinces.map(p=><option key={p}>{p}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['Operational','Under rehabilitation','Non-operational','Planned'].map(s=><option key={s}>{s}</option>)}</select><button className="ghost-btn" onClick={csv}><Download size={14}/> Export CSV</button></div><div className="table-wrap"><table><thead><tr>{['Scheme / ID','Province','District','Water source','Status','Developed ha','Equipped ha','Irrigated ha','Verification','Actions'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><div className="scheme-name">{r.name}<small>{r.id}</small></div></td><td>{r.province}</td><td>{r.district}</td><td>{r.water||'—'}</td><td><span className={'status '+(r.status==='Operational'?'green':r.status==='Non-operational'?'red':r.status==='Planned'?'neutral':'amber')}><i/>{r.status}</span></td><td>{Number(r.developed).toLocaleString()}</td><td>{Number(r.equipped).toLocaleString()}</td><td>{Number(r.irrigated).toLocaleString()}</td><td><span className={`status ${r.dataStatus==='Verified'?'green':'amber'}`}><i/>{r.dataStatus||'Draft / unreviewed'}</span></td><td><div className="reg-actions"><button type="button" onClick={()=>startEdit(r)} title="Edit scheme" aria-label={`Edit ${r.name}`}><Pencil size={14}/></button><button type="button" onClick={()=>{const next=records.map(x=>x.id===r.id?{...x,dataStatus:x.dataStatus==='Verified'?'Draft':'Verified',verificationUpdatedAt:new Date().toISOString()}:x);save(next)}} title={r.dataStatus==='Verified'?'Return to draft':'Mark as verified'} aria-label={r.dataStatus==='Verified'?`Return ${r.name} to draft`:`Verify ${r.name}`}><ShieldCheck size={14}/></button><button type="button" onClick={()=>window.confirm('Delete scheme '+r.name+'?')&&save(records.filter(x=>x.id!==r.id))} title="Delete scheme" aria-label={`Delete ${r.name}`}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table>{!rows.length&&<div className="reg-empty">No matching scheme records.</div>}</div><div className="reg-foot">Showing {rows.length} of {records.length} records · local prototype</div></section>{show&&<div className="reg-modal-back" onClick={()=>setShow(false)}><div className="reg-modal" onClick={e=>e.stopPropagation()}><div className="reg-modal-head"><div><h2>{editing?'Edit scheme profile':'Register scheme'}</h2><p>Area figures in hectares. Required fields marked by browser validation.</p></div><button className="reg-close" onClick={()=>setShow(false)}><X size={17}/></button></div><form onSubmit={submit}><div className="reg-form-grid">{field('Scheme name','name')}<label className="reg-field"><span>Province</span><select value={form.province} onChange={e=>setForm({...form,province:e.target.value})}>{provinces.map(p=><option key={p}>{p}</option>)}</select></label>{field('District','district')}<label className="reg-field"><span>Water source</span><select value={form.water} onChange={e=>setForm({...form,water:e.target.value})}><option value="">Choose</option>{['River','Dam','Reservoir','Groundwater','River / canal','Other'].map(w=><option key={w}>{w}</option>)}</select></label><label className="reg-field"><span>Scheme status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['Operational','Under rehabilitation','Non-operational','Planned'].map(s=><option key={s}>{s}</option>)}</select></label>{field('Developed area (ha)','developed','number')}{field('Equipped area (ha)','equipped','number')}{field('Currently irrigated area (ha)','irrigated','number')}</div><div className="reg-modal-actions"><button type="button" className="ghost-btn" onClick={()=>setShow(false)}>Cancel</button><button className="reg-primary" type="submit">{editing?'Save changes':'Create scheme'}</button></div></form></div></div>}</div>}
