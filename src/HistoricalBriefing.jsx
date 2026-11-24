import React from 'react';
import {CalendarDays, Download, ShieldCheck, TrendingUp} from 'lucide-react';

/** Historical ministerial briefing, not current or validated system data.
 * Source: Senior Management Briefing, week ending 13 November 2026,
 * "National irrigating area summary" table, figures as at 30 October 2026.
 */
export const AREA_2026_OCTOBER = [
  {province:'Manicaland',irrigated:41668,summerTarget:16652},
  {province:'Mashonaland Central',irrigated:39601,summerTarget:17965},
  {province:'Mashonaland East',irrigated:47203,summerTarget:15472},
  {province:'Mashonaland West',irrigated:50129,summerTarget:42631},
  {province:'Masvingo',irrigated:89586,summerTarget:5120},
  {province:'Matabeleland North',irrigated:6091,summerTarget:2156},
  {province:'Matabeleland South',irrigated:13557,summerTarget:5810},
  {province:'Midlands',irrigated:21134,summerTarget:13262},
];
const number=value=>value.toLocaleString('en-ZW');
const totalArea=AREA_2026_OCTOBER.reduce((sum,row)=>sum+row.irrigated,0);
const targetArea=AREA_2026_OCTOBER.reduce((sum,row)=>sum+row.summerTarget,0);

function exportHistorical(){
  const lines=['province,irrigated_area_ha,summer_target_ha,reference_date,source',
    ...AREA_2026_OCTOBER.map(row=>[
      row.province,row.irrigated,row.summerTarget,'2026-10-30',
      'Senior Management Briefing, Week Ending 13 November 2026'
    ].map(value=>'"'+String(value).replaceAll('"','""')+'"').join(','))];
  const url=URL.createObjectURL(new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='NIMIS-HISTORICAL-2026-10-30.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function HistoricalBriefing(){
  const max=Math.max(...AREA_2026_OCTOBER.map(row=>row.irrigated));
  return <div className="module-page briefing-page">
    <div className="welcome-row"><div><div className="eyebrow">MANAGEMENT / PROVENANCE REFERENCE</div>
      <h1>National Irrigation Briefing — Historical Snapshot</h1>
      <p className="subtitle">Source: Ministry senior management briefing, week ending 13 November 2026.</p></div>
      <span className="map-layer-label">As at 30 October 2026</span></div>
    <div className="data-note"><ShieldCheck size={17}/><span><strong>Historical source document, not live NIMIS reporting:</strong> the following figures reproduce the provided briefing's provincial table. They are not derived from the current browser scheme registry and must not be added to its KPIs without data reconciliation.</span></div>
    <div className="kpi-grid">
      <div className="kpi-card"><div className="kpi-top"><span className="kpi-icon green"><TrendingUp size={18}/></span></div>
        <div className="kpi-label">Reported irrigated area</div><div className="kpi-value">{number(totalArea)} ha</div>
        <div className="kpi-note">Historical · 30 October 2026</div></div>
      <div className="kpi-card"><div className="kpi-top"><span className="kpi-icon blue"><CalendarDays size={18}/></span></div>
        <div className="kpi-label">Summer cropping target</div><div className="kpi-value">{number(targetArea)} ha</div>
        <div className="kpi-note">Target quoted in 13 November 2026 briefing</div></div>
      <div className="kpi-card"><div className="kpi-top"><span className="kpi-icon gold"><ShieldCheck size={18}/></span></div>
        <div className="kpi-label">Reporting provinces</div><div className="kpi-value">{AREA_2026_OCTOBER.length}</div>
        <div className="kpi-note">As listed in the supplied provincial table</div></div>
    </div>
    <div className="module-insights">
      <section className="panel insight-panel"><div className="panel-head"><div><h2>Reported irrigated area by province (ha)</h2>
        <p>Historical comparison; not a current interactive national indicator</p></div></div>
        <div className="insight-list">{AREA_2026_OCTOBER.slice().sort((a,b)=>b.irrigated-a.irrigated).map(row=><div className="insight-row" key={row.province}>
          <div><span>{row.province}</span><strong>{number(row.irrigated)}</strong></div>
          <div className="insight-track"><i style={{width:(row.irrigated/max*100)+'%'}}/></div>
        </div>)}</div></section>
      <section className="panel insight-panel"><div className="panel-head"><div><h2>Data provenance & quality</h2>
        <p>Why this source is separate from the operational scheme register</p></div></div>
        <div className="insight-list">
          <p><strong>Reporting period:</strong> 30 October 2026.</p>
          <p><strong>Document:</strong> Senior Management Briefing, week ending 13 November 2026, slide 4.</p>
          <p><strong>Geographic aggregation:</strong> province totals only. No verified scheme IDs or survey-level records accompany this table.</p>
          <p><strong>Integration status:</strong> historical reference. Record-level reconciliation and Ministry approval are required before use as authoritative NIMIS fact tables.</p>
        </div></section>
    </div>
    <section className="panel schemes-panel"><div className="panel-head"><div><h2>Province breakdown</h2>
      <p>Hectares as stated in the briefing's provincial area summary</p></div>
      <button className="ghost-btn" onClick={exportHistorical}><Download size={15}/> Export source table</button></div>
      <div className="table-wrap"><table><thead><tr><th>Province</th><th>October irrigated area (ha)</th><th>Summer cropping target (ha)</th><th>Source date</th></tr></thead>
        <tbody>{AREA_2026_OCTOBER.map(row=><tr key={row.province}><td>{row.province}</td><td>{number(row.irrigated)}</td>
          <td>{number(row.summerTarget)}</td><td>30 October 2026</td></tr>)}
          <tr><td><strong>TOTAL</strong></td><td><strong>{number(totalArea)}</strong></td><td><strong>{number(targetArea)}</strong></td><td>Source document total</td></tr>
        </tbody></table></div>
    </section>
  </div>;
}
