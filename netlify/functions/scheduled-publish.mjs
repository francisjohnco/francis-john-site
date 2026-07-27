import { getStore } from '@netlify/blobs';

/*
  Scheduled auto-publisher.

  Runs on a timer (see the schedule in netlify.toml). Each run:
    1. reads the site content from Blobs
    2. finds any post that is a draft, has a publishAt date, and that date has arrived
    3. flips it to published, and marks it "baked: false" so the dashboard knows
       it is live from the server but not yet written into index.html
    4. writes the content back to Blobs

  Posts published this way are live immediately for visitors. They are served
  from Blobs, which search engines read slightly less well than content baked
  into the HTML — so the dashboard shows a reminder to bake them in periodically
  with Publish → Download → deploy. Nothing here forces that; it is a nudge.

  This function needs no passcode: it runs inside Netlify on a schedule, not
  from a browser, and it only ever flips dates that the site owner already set.
*/

const STORE = 'site-content';
const RECORD = 'content';

export default async () => {
  let store;
  try { store = getStore(STORE); }
  catch (e) { return resp(503, { error: 'storage unavailable' }); }

  let data;
  try { data = await store.get(RECORD, { type: 'json' }); }
  catch (e) { return resp(500, { error: 'read failed' }); }

  if (!data || !Array.isArray(data.posts)) {
    return resp(200, { ok: true, note: 'no content yet', published: 0 });
  }

  const now = Date.now();
  const flipped = [];

  for (const p of data.posts) {
    if (p.status === 'draft' && p.publishAt) {
      const when = Date.parse(p.publishAt);
      if (!isNaN(when) && when <= now) {
        p.status = 'published';
        p.baked = false;            // live from server, not yet in the HTML file
        if (!p.date) {
          // stamp the display date to the day it actually went live
          p.date = new Date(now).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
        }
        flipped.push(p.slug || p.title || 'untitled');
      }
    }
  }

  if (flipped.length === 0) {
    return resp(200, { ok: true, published: 0 });
  }

  data._savedAt = now;
  data._autoPublishedAt = now;
  try { await store.setJSON(RECORD, data); }
  catch (e) { return resp(500, { error: 'write failed', wouldHavePublished: flipped }); }

  return resp(200, { ok: true, published: flipped.length, slugs: flipped });
};

/* runs every day at 13:00 UTC (~7-8am US central). Netlify cron syntax. */
export const config = { schedule: '0 13 * * *' };

function resp(status, obj) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}
