import React from 'react';

/** Render a useful diagnostic rather than a blank page if a NIMIS route crashes.
 * Never resets browser storage or posts private data to a remote service.
 */
export default class NimisErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('NIMIS UI render failure:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main role="alert" style={{
        minHeight: '100vh', background: '#edf4ef',
        padding: 'clamp(20px, 5vw, 64px)', fontFamily: 'Arial, sans-serif',
        color: '#123b2b',
      }}>
        <section style={{
          maxWidth: 760, margin: '8vh auto', background: '#fff',
          border: '1px solid #bdd3c5', borderTop: '7px solid #00633f',
          borderRadius: 9, padding: 28, boxShadow: '0 6px 30px #183e2910',
        }}>
          <h1 style={{ fontSize: 24, margin: '0 0 10px' }}>NIMIS could not display this screen</h1>
          <p>The application encountered a rendering error. Your locally saved scheme records have not been deleted.</p>
          <p><strong>Version:</strong> NIMIS reference-v3 (development)</p>
          <pre style={{ padding: 12, background: '#f5f7f5', whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere', fontSize: 13, borderRadius: 6 }}>
            {String(this.state.error?.message || 'Unknown rendering failure')}
          </pre>
          <button onClick={() => window.location.reload()} style={{
            border: 0, borderRadius: 6, padding: '11px 18px',
            background: '#00633f', color: '#fff', fontWeight: 800, cursor: 'pointer',
          }}>Retry loading NIMIS</button>
          <p style={{ fontSize: 12, color: '#6a7d70', marginTop: 18 }}>
            If this persists, copy the error message above together with any red browser Console error.
          </p>
        </section>
      </main>;
    }
    return this.props.children;
  }
}
