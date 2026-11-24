import React, { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';

const API = 'http://127.0.0.1:8765/api/v1';

const stages = {
  provincial: {
    username: 'provincial.demo', endpoint: 'provincial-inbox',
    title: 'Provincial Officer — Reviewed District Reports',
    eligible: 'VERIFIED', approve: 'REVIEW', approveLabel: 'Review test',
    allowReturn: true,
    description: 'Only district-verified fictional records in DEMO-PROVINCE can be reviewed.',
  },
  admin: {
    username: 'admin.demo', endpoint: 'admin-inbox',
    title: 'Admin — Fictional Publication',
    eligible: 'REVIEWED', approve: 'TECH_APPROVE', approveLabel: 'Technical approve test',
    allowReturn: false,
    description: 'National technical approval is required after provincial review and before fictional publication. No real dashboards are affected.',
  },
};

export default function ReviewStageInbox({ stage }) {
  const config = stages[stage];
  const [rows, setRows] = useState([]);
  const [token, setToken] = useState('');
  const [notes, setNotes] = useState({});
  const [message, setMessage] = useState('Use Connect to view the local PostgreSQL demonstration.');
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      const login = await fetch(API + '/dev/token', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: config.username }),
      });
      if (!login.ok) throw new Error('Local fictional PostgreSQL backend is unavailable.');
      const { access_token } = await login.json();
      const response = await fetch(API + '/dev/integration/' + config.endpoint, {
        headers: { Authorization: 'Bearer ' + access_token },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Review inbox is unavailable (HTTP ' + response.status + ').');
      const payload = await response.json();
      if (payload.source !== 'FICTIONAL_LOCAL_DEMO' || !Array.isArray(payload.items))
        throw new Error('The server did not return a fictional review inbox.');
      setToken(access_token);
      setRows(payload.items);
      setMessage('Connected to the fictional review workflow. No official NIMIS data is being published.');
    } catch (error) {
      setToken('');
      setMessage(String(error));
    } finally { setBusy(false); }
  }

  async function decide(eventId, action) {
    setBusy(true);
    try {
      if (!token) throw new Error('Reconnect to the local review API.');
      const response = await fetch(API + '/dev/integration/' + config.endpoint +
        '/' + encodeURIComponent(eventId) + '/decision', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action, reason: notes[eventId] || '' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Review was rejected (HTTP ' + response.status + ')');
      setRows(current => current.map(item => item.event_id === eventId
        ? { ...item, status: result.status, review_note: notes[eventId] || null } : item));
      setMessage('Fictional event status: ' + result.status + '. This is not an official Ministry approval.');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  return <div className="module-page data-management-page">
    <div className="welcome-row"><div><div className="eyebrow">LOCAL INTEGRATION LAB · FICTIONAL DATA</div>
      <h1>{config.title}</h1><p className="subtitle">{config.description}</p></div>
      <span className="map-layer-label">Test workflow</span></div>
    <div className="data-note"><ShieldCheck size={17}/><span>
      <strong>Test environment only.</strong> This is not an authenticated government review system.
      Actions change only the isolated fictional PostgreSQL records.</span></div>
    <section className="panel" style={{ padding: 20 }}>
      <button className="reg-primary" disabled={busy} onClick={() => void connect()}>
        <RefreshCw size={17}/>{busy ? 'Working…' : token ? 'Refresh test inbox' : 'Connect fictional review inbox'}
      </button>
      <p role="status" style={{ marginTop: 14 }}>{message}</p>
      <p>Fictional submissions visible: <strong>{rows.length}</strong></p>
    </section>
    <section className="panel schemes-panel"><div className="panel-head">
      <div><h2>Survey review queue</h2><p>{config.description}</p></div></div>
      {!rows.length ? <div className="reg-empty">No eligible fictional records yet. Complete the previous workflow stage first.</div>
        : <div className="table-wrap"><table><thead><tr>
          <th>Scheme</th><th>Observation</th><th>District</th><th>State</th><th>Action</th></tr></thead>
          <tbody>{rows.map(item => <tr key={item.event_id}>
            <td><strong>{item.scheme_name}</strong><br/><small>{item.scheme_id}</small></td>
            <td>{item.note}</td><td>{item.district_code}</td>
            <td><strong>{item.status}</strong>{item.review_note && <p>{item.review_note}</p>}</td>
            <td>{(item.status === config.eligible || (stage === 'admin' && item.status === 'TECH_APPROVED')) ? <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {config.allowReturn && <input maxLength={200}
                aria-label={'Return reason for ' + item.scheme_id}
                value={notes[item.event_id] || ''}
                placeholder="Reason if returning for correction"
                onChange={event => setNotes(before => ({...before, [item.event_id]: event.target.value}))}/>}
              <button className="reg-primary" disabled={busy}
                onClick={() => void decide(item.event_id, stage === 'admin' && item.status === 'TECH_APPROVED' ? 'PUBLISH' : config.approve)}>{stage === 'admin' && item.status === 'TECH_APPROVED' ? 'Publish test' : config.approveLabel}</button>
              {config.allowReturn && <button className="ghost-btn"
                disabled={busy || !(notes[item.event_id] || '').trim()}
                onClick={() => void decide(item.event_id, 'RETURN')}>Return test</button>}
            </div> : 'Decision recorded'}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </div>;
}
