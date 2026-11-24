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
