import { getStore } from '@netlify/blobs';

/*
  Content store for the site.

    GET  /api/content            → the saved content, or 204 if nothing saved yet
    GET  /api/content?verify=1   → checks the edit key in the x-edit-key header
    PUT  /api/content            → saves content (requires the edit key)

  The key lives in the EDIT_PASSCODE environment variable on Netlify, never in
  the page source. Without it the endpoint is read-only.
*/

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

const STORE_NAME = 'site-content';
const RECORD_KEY = 'content';

export default async (req) => {
  const url = new URL(req.url);
  const secret = process.env.EDIT_PASSCODE || '';
  const given = req.headers.get('x-edit-key') || '';
  const authorised = secret.length > 0 && given === secret;

  let store;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return json({ error: 'Storage unavailable' }, 503);
  }

  // --- key check -----------------------------------------------------------
  if (req.method === 'GET' && url.searchParams.get('verify') === '1') {
    if (!secret) {
      return json({ ok: false, reason: 'unconfigured' }, 401);
    }
    return authorised ? json({ ok: true }) : json({ ok: false }, 401);
  }

  // --- read ----------------------------------------------------------------
  if (req.method === 'GET') {
    try {
      const data = await store.get(RECORD_KEY, { type: 'json' });
      if (!data) return new Response(null, { status: 204, headers: JSON_HEADERS });
      return json(data);
    } catch (err) {
      return json({ error: 'Could not read content' }, 500);
    }
  }

  // --- write ---------------------------------------------------------------
  if (req.method === 'PUT' || req.method === 'POST') {
    if (!secret) {
      return json({ error: 'EDIT_PASSCODE is not set on this site' }, 401);
    }
    if (!authorised) {
      return json({ error: 'Wrong or missing edit key' }, 401);
    }
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return json({ error: 'Body was not valid JSON' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'Expected a content object' }, 400);
    }
    // A missing profile means something went wrong upstream; refuse rather
    // than overwrite good content with an empty object.
    if (!body.profile || !body.meta) {
      return json({ error: 'Content is missing required sections' }, 400);
    }
    try {
      body._savedAt = Date.now();
      await store.setJSON(RECORD_KEY, body);
      return json({ ok: true, savedAt: body._savedAt });
    } catch (err) {
      return json({ error: 'Could not save content' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
