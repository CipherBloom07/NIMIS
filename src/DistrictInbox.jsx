import React, { useState } from 'react';
import { ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react';

const API = 'http://127.0.0.1:8765/api/v1';

export default function DistrictInbox() {
  const [items, setItems] = useState([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Connect to the local fictional NIMIS Collect backend to inspect test submissions.');
  const [notes, setNotes] = useState({});

  async function connect() {
    setBusy(true);
    try {
      // This identity exists ONLY in the loopback development backend.
      const login = await fetch(API + '/dev/token', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'district.demo' }),
      });
      if (!login.ok) throw new Error('Start the isolated NIMIS Collect PostgreSQL API on port 8765.');
      const { access_token } = await login.json();
      const inbox = await fetch(API + '/dev/integration/district-inbox', {
        headers: { Authorization: 'Bearer ' + access_token },
        cache: 'no-store',
      });
      if (!inbox.ok) throw new Error('Local demo district access failed (HTTP ' + inbox.status + ').');
      const result = await inbox.json();
      if (result.source !== 'FICTIONAL_LOCAL_DEMO' || !Array.isArray(result.items))
        throw new Error('Invalid fictional district inbox response');
      setToken(access_token);
      setItems(result.items);
      setMessage('Connected to fictional DEMO-DISTRICT. No national or live Ministry records are displayed.');
    } catch (error) {
      setMessage(String(error));
      setToken('');
    } finally { setBusy(false); }
  }

  async function review(eventId, action) {
    if (!token) return;
    setBusy(true);
    try {
      const result = await fetch(API + '/dev/integration/district-inbox/' +
        encodeURIComponent(eventId) + '/decision', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action, reason: notes[eventId] || '' }),
      });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(payload.detail || 'Review failed: HTTP ' + result.status);
      setItems(rows => rows.map(row => row.event_id === eventId
        ? { ...row, status: payload.status, review_note: notes[eventId] || null } : row));
      setMessage('Fictional submission ' + payload.status.toLowerCase() + '. This is not an official NIMIS decision.');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }

  return <div className="module-page data-management-page">
    <div className="welcome-row">
      <div><div className="eyebrow">LOCAL INTEGRATION LAB / FICTIONAL DATA ONLY</div>
        <h1>District Officer — Collector Inbox</h1>
        <p className="subtitle">Review fictional data-collector submissions received from the NIMIS Collect development app.</p></div>
      <span className="map-layer-label">Local prototype</span>
    </div>
    <div className="data-note"><ShieldCheck size={17}/><span>
      <strong>Not production verification.</strong> This page uses a fictional District Officer identity and local PostgreSQL.
      It never updates the official scheme registry, dashboards or approvals.</span></div>
    <section className="panel" style={{ padding: 20 }}>
      <button className="reg-primary" disabled={busy} onClick={() => void connect()}>
        <RefreshCw size={17}/> {busy ? 'Working…' : token ? 'Refresh district inbox' : 'Connect fictional district inbox'}
      </button>
      <p role="status" style={{ marginTop: 14 }}>{message}</p>
      <p><ClipboardCheck size={16}/> Received test submissions: <strong>{items.length}</strong></p>
    </section>
    <section className="panel schemes-panel">
      <div className="panel-head"><div><h2>Submitted irrigation scheme surveys</h2>
        <p>Only the synthetic DEMO-DISTRICT dataset; most recent first</p></div></div>
      {!items.length ? <div className="reg-empty">No fictional submissions. Open NIMIS Collect's Collector–District test page and send a sample.</div>
        : <div className="table-wrap"><table>
          <thead><tr><th>Scheme</th><th>Observation</th><th>Submitted</th><th>Status</th><th>District decision</th></tr></thead>
          <tbody>{items.map(item => <tr key={item.event_id}>
            <td><strong>{item.scheme_name}</strong><br/><small>{item.scheme_id}</small></td>
            <td>{item.note}</td>
            <td>{new Date(item.submitted_at).toLocaleString()}</td>
            <td><strong>{item.status}</strong>{item.review_note && <p>{item.review_note}</p>}</td>
            <td>{item.status === 'SUBMITTED' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input aria-label={'Return reason for ' + item.scheme_id} maxLength={200}
                placeholder="Reason if returning for correction"
                value={notes[item.event_id] || ''}
                onChange={event => setNotes(old => ({ ...old, [item.event_id]: event.target.value }))}/>
              <button className="reg-primary" disabled={busy} onClick={() => void review(item.event_id, 'VERIFY')}>Verify test</button>
              <button className="ghost-btn" disabled={busy || !(notes[item.event_id] || '').trim()}
                onClick={() => void review(item.event_id, 'RETURN')}>Return test</button>
            </div> : 'Decision recorded'}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
}
