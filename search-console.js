import { getStore } from '@netlify/blobs';

/*
  Google Search Console integration for francisjohn.co.

  Endpoints (all under /api/gsc):
    GET  /api/gsc/connect            → begins Google OAuth (redirects to Google)
    GET  /api/gsc/callback?code=...  → Google redirects back here; stores tokens
    GET  /api/gsc/status             → { connected: bool, property }  (needs edit key)
    GET  /api/gsc/data?range=28      → clicks/impressions/queries/pages + change (needs edit key)
    POST /api/gsc/disconnect         → clears stored tokens (needs edit key)

  Setup (one time, by the site owner):
    1. Create a Google Cloud project → enable "Google Search Console API".
    2. Create an OAuth 2.0 Client ID (type: Web application).
       Authorised redirect URI:  https://francisjohn.co/api/gsc/callback
    3. On Netlify, set environment variables:
         GSC_CLIENT_ID       = <the client id>
         GSC_CLIENT_SECRET   = <the client secret>
         GSC_PROPERTY        = https://francisjohn.co/    (or sc-domain:francisjohn.co)
         EDIT_PASSCODE       = <already set — reused to protect these endpoints>
    The client secret and tokens never appear in the page source.
*/

const STORE_NAME = 'gsc-store';
const TOKEN_KEY = 'tokens';
const SITE = 'https://francisjohn.co';
const REDIRECT_URI = SITE + '/api/gsc/callback';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const J = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function ok(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: J });
}
function authed(req) {
  const secret = process.env.EDIT_PASSCODE || '';
  const given = req.headers.get('x-edit-key') || new URL(req.url).searchParams.get('key') || '';
  return secret.length > 0 && given === secret;
}

async function saveTokens(store, tok) {
  await store.setJSON(TOKEN_KEY, tok);
}
async function loadTokens(store) {
  try { return await store.get(TOKEN_KEY, { type: 'json' }); } catch { return null; }
}

// Exchange an auth code (or refresh token) for an access token.
async function exchange(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return res.json();
}

// Get a valid access token, refreshing if needed.
async function getAccessToken(store) {
  const tok = await loadTokens(store);
  if (!tok) return null;
  const now = Date.now();
  if (tok.access_token && tok.expiry && now < tok.expiry - 60000) return tok.access_token;
  if (!tok.refresh_token) return null;
  const refreshed = await exchange({
    client_id: process.env.GSC_CLIENT_ID,
    client_secret: process.env.GSC_CLIENT_SECRET,
    refresh_token: tok.refresh_token,
    grant_type: 'refresh_token',
  });
  if (refreshed.access_token) {
    const merged = {
      ...tok,
      access_token: refreshed.access_token,
      expiry: Date.now() + (refreshed.expires_in || 3600) * 1000,
    };
    await saveTokens(store, merged);
    return merged.access_token;
  }
  return null;
}

function ymd(d) { return d.toISOString().slice(0, 10); }

// Query the Search Console API for a date range.
async function queryGSC(token, property, startDate, endDate, dimensions, rowLimit) {
  const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites/'
    + encodeURIComponent(property) + '/searchAnalytics/query';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions: dimensions || [], rowLimit: rowLimit || 25 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('GSC ' + res.status + ': ' + text.slice(0, 300));
  }
  return res.json();
}

function sumRows(rows) {
  let clicks = 0, impressions = 0, ctrNum = 0, posNum = 0, n = 0;
  for (const r of rows || []) {
    clicks += r.clicks || 0;
    impressions += r.impressions || 0;
    ctrNum += (r.ctr || 0) * (r.impressions || 0);
    posNum += (r.position || 0) * (r.impressions || 0);
    n += r.impressions || 0;
  }
  return {
    clicks, impressions,
    ctr: n ? ctrNum / n : 0,
    position: n ? posNum / n : 0,
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/gsc\/?/, '').replace(/\/+$/, '');
  const store = getStore(STORE_NAME);
  const clientId = process.env.GSC_CLIENT_ID;
  const property = process.env.GSC_PROPERTY || (SITE + '/');

  // --- 1. Begin OAuth: redirect owner to Google's consent screen ---
  if (path === 'connect') {
    if (!authed(req)) return ok({ error: 'unauthorised' }, 401);
    if (!clientId) return ok({ error: 'GSC_CLIENT_ID not set' }, 500);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state: url.searchParams.get('key') || '',
    });
    return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(), 302);
  }

  // --- 2. OAuth callback: exchange code for tokens, store them ---
  if (path === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) return ok({ error: 'no code' }, 400);
    const tok = await exchange({
      client_id: clientId,
      client_secret: process.env.GSC_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });
    if (!tok.access_token) return ok({ error: 'token exchange failed', detail: tok }, 400);
    await saveTokens(store, {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expiry: Date.now() + (tok.expires_in || 3600) * 1000,
    });
    // bounce back into the dashboard
    return Response.redirect(SITE + '/admin#seo', 302);
  }

  // --- 3. Connection status ---
  if (path === 'status') {
    if (!authed(req)) return ok({ error: 'unauthorised' }, 401);
    const tok = await loadTokens(store);
    return ok({ connected: !!(tok && tok.refresh_token), property, configured: !!clientId });
  }

  // --- 4. Disconnect ---
  if (path === 'disconnect') {
    if (!authed(req)) return ok({ error: 'unauthorised' }, 401);
    try { await store.delete(TOKEN_KEY); } catch {}
    return ok({ connected: false });
  }

  // --- 5. Data: clicks/impressions/queries/pages + period-over-period change ---
  if (path === 'data') {
    if (!authed(req)) return ok({ error: 'unauthorised' }, 401);
    const token = await getAccessToken(store);
    if (!token) return ok({ error: 'not_connected' }, 400);

    const range = Math.min(parseInt(url.searchParams.get('range') || '28', 10) || 28, 90);
    const today = new Date();
    // GSC data lags ~2-3 days; end the window 3 days back.
    const end = new Date(today); end.setDate(end.getDate() - 3);
    const start = new Date(end); start.setDate(start.getDate() - (range - 1));
    // previous period of the same length, for change %
    const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (range - 1));

    try {
      const [totals, prevTotals, byDate, queries, pages] = await Promise.all([
        queryGSC(token, property, ymd(start), ymd(end), [], 1),
        queryGSC(token, property, ymd(prevStart), ymd(prevEnd), [], 1),
        queryGSC(token, property, ymd(start), ymd(end), ['date'], 90),
        queryGSC(token, property, ymd(start), ymd(end), ['query'], 25),
        queryGSC(token, property, ymd(start), ymd(end), ['page'], 15),
      ]);
      const cur = sumRows(totals.rows);
      const prev = sumRows(prevTotals.rows);
      const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : (a > 0 ? 100 : 0));
      return ok({
        range, start: ymd(start), end: ymd(end),
        totals: {
          clicks: cur.clicks, impressions: cur.impressions, ctr: cur.ctr, position: cur.position,
          change: {
            clicks: pct(cur.clicks, prev.clicks),
            impressions: pct(cur.impressions, prev.impressions),
            ctr: pct(cur.ctr, prev.ctr),
            position: prev.position ? (prev.position - cur.position) : 0, // lower is better
          },
        },
        series: (byDate.rows || []).map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
        queries: (queries.rows || []).map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
        pages: (pages.rows || []).map(r => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
      });
    } catch (e) {
      return ok({ error: 'query_failed', detail: String(e.message || e) }, 502);
    }
  }

  return ok({ error: 'unknown endpoint' }, 404);
};

export const config = { path: '/api/gsc/*' };
