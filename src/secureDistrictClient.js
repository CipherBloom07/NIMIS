/**
 * NIMIS Main — secure review contract adapter, not activated in the demo UI.
 *
 * No fictional login/token fallback. The approved identity provider must supply
 * an in-memory access token before this API can be called. No token is stored in
 * localStorage. Official district approval actions are not implemented yet.
 */
export async function loadAuthorizedDistrictSubmissions(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken.trim() || accessToken.length > 8192) {
    throw new Error('Signed-in district officer token required');
  }
  const response = await fetch('/api/v1/secure/district/inbox', {
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error('District inbox unavailable (HTTP ' + response.status + ')');
  const data = await response.json();
  if (!data || data.source !== 'NIMIS_STAGING_SYNC' || !Array.isArray(data.items)) {
    throw new Error('Unrecognized district inbox response; refusing to show unverified data');
  }
  for (const item of data.items) {
    if (!item.event_id || !item.record_id || !item.scheme_id ||
        !item.form_id || !item.received_at) {
      throw new Error('Incomplete district submission from server');
    }
  }
  return data.items;
}


/**
 * Staging-only: send an official-account district officer's decision to the
 * server. Never use fictional demo tokens and never mutate browser registry.
 * The caller must obtain the access token from approved institutional login.
 */
export async function submitAuthorizedDistrictDecision({
  eventId, decisionId, action, reason = '', accessToken,
}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(eventId) || !uuid.test(decisionId)) {
    throw new Error('Server event ID and retry-stable decision UUID required');
  }
  if (!['VERIFY', 'RETURN'].includes(action)) {
    throw new Error('Unsupported district decision');
  }
  if (action === 'RETURN' && !reason.trim()) {
    throw new Error('Return reason required');
  }
  if (!accessToken || accessToken.length > 8192) {
    throw new Error('Signed-in district officer token required');
  }
  const response = await fetch(
    '/api/v1/secure/district/submissions/' + encodeURIComponent(eventId) + '/decisions',
    {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision_id: decisionId, action, reason: reason.trim() }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('District decision not confirmed (HTTP ' + response.status + ')');
  }
  if (result.event_id !== eventId || result.decision_id !== decisionId ||
      !['accepted', 'duplicate'].includes(result.outcome) ||
      !['VERIFIED', 'RETURNED'].includes(result.status)) {
    throw new Error('Invalid district decision receipt; retain the original retry UUID');
  }
  return result;
}
