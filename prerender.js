import { getStore } from '@netlify/blobs';

/*
  Prerender / meta-injection for crawlers.

  A single-page app serves the same index.html for every URL, then fills in each
  page's <title> and meta description with JavaScript. Google renders JS and sees
  them, but many crawlers and social/AI scrapers read only the raw HTML. This
  function detects those requests and rewrites the <head> with the correct
  per-page title, description, canonical and Open Graph / Twitter tags — so every
  page has perfect metadata in the raw HTML, no rendering required.

  Human visitors are passed straight through to the normal SPA (fast, unchanged).
*/

const SITE = 'https://francisjohn.co';
const STORE_NAME = 'site-content';
const RECORD_KEY = 'content';

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Build the metadata for a given path from the content record.
function metaForPath(path, data) {
  const m = (data && data.meta) || {};
  const p = (data && data.profile) || {};
  const suffix = m.titleSuffix || 'Francis John';
  const domain = (m.domain && m.domain.replace(/\/$/, '')) || SITE;
  const defaultDesc = m.description || (p.summary || '').slice(0, 155);
  const defaultImg = m.ogImage || '';

  const clean = path.replace(/\/+$/, '') || '/';
  const seg = clean.split('/').filter(Boolean);

  // homepage
  if (seg.length === 0) {
    return {
      title: 'Local SEO & Google Business Profile Help — Sioux Falls | Francis John',
      description: 'Done-for-you local marketing for home service businesses and specialty practices. RevenueIQ runs four engines — visibility, authority, reputation, retention — that turn searches into revenue.',
      canonical: domain + '/',
      image: defaultImg,
      type: 'website',
    };
  }

  // journal article
  if (seg[0] === 'journal' && seg[1]) {
    const po = ((data && data.posts) || []).find((x) => x.slug === seg[1]);
    if (po) {
      const s = po.seo || {};
      return {
        title: s.title || (po.title + ' — ' + suffix),
        description: s.description || po.excerpt || defaultDesc,
        canonical: domain + '/journal/' + po.slug,
        image: po.cover || defaultImg,
        type: 'article',
        noindex: s.noindex || po.status !== 'published',
      };
    }
  }

  // simple known routes
  const routeMeta = {
    journal:  { title: 'Journal — ' + suffix, description: 'Notes on local search, Google Business Profile, and getting found.' },
    marketplace: { title: 'Marketplace — The Visibility Engines | ' + suffix, description: 'The niche marketplaces I have built — ranked, trafficked, and cited by AI. Clients plug into visibility and authority that already exists.' },
    services: { title: 'The $500 Local Visibility Diagnostic — ' + suffix, description: 'A paid diagnostic that finds exactly where your local business is losing customers, with the fixes in priority order.' },
    systems:  { title: 'Systems — ' + suffix, description: 'The systems I build and run: visibility, reputation, and local discovery.' },
    contact:  { title: 'Contact — ' + suffix, description: 'Tell me your market and town. I will show you where you are losing customers.' },
    resume:   { title: 'Résumé — ' + suffix, description: 'Capabilities, roles and education.' },
  };
  if (routeMeta[seg[0]]) {
    return { ...routeMeta[seg[0]], canonical: domain + '/' + seg[0], image: defaultImg, type: 'website' };
  }

  // fallback
  return { title: suffix, description: defaultDesc, canonical: domain + clean, image: defaultImg, type: 'website' };
}

function injectHead(html, meta) {
  const tags = [];
  tags.push(`<title>${esc(meta.title)}</title>`);
  tags.push(`<meta name="description" content="${esc(meta.description)}">`);
  tags.push(`<link rel="canonical" href="${esc(meta.canonical)}">`);
  if (meta.noindex) tags.push('<meta name="robots" content="noindex">');
  // Open Graph
  tags.push(`<meta property="og:title" content="${esc(meta.title)}">`);
  tags.push(`<meta property="og:description" content="${esc(meta.description)}">`);
  tags.push(`<meta property="og:url" content="${esc(meta.canonical)}">`);
  tags.push(`<meta property="og:type" content="${esc(meta.type || 'website')}">`);
  tags.push('<meta property="og:site_name" content="Francis John">');
  if (meta.image) tags.push(`<meta property="og:image" content="${esc(meta.image)}">`);
  // Twitter
  tags.push(`<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`);
  tags.push(`<meta name="twitter:title" content="${esc(meta.title)}">`);
  tags.push(`<meta name="twitter:description" content="${esc(meta.description)}">`);
  if (meta.image) tags.push(`<meta name="twitter:image" content="${esc(meta.image)}">`);

  const block = '\n' + tags.map((t) => '  ' + t).join('\n') + '\n';

  // Remove the existing static title / description / canonical, then inject ours.
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/i, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, '');
  out = out.replace(/<head([^>]*)>/i, (mm, attrs) => `<head${attrs}>${block}`);
  return out;
}

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|googlebot|bingbot|duckduckbot|baiduspider|yandex|facebookexternalhit|facebot|twitterbot|linkedinbot|embedly|quora|pinterest|slackbot|whatsapp|telegrambot|discordbot|applebot|petalbot|gptbot|oai-searchbot|chatgpt|claudebot|anthropic|perplexity|ccbot|google-extended|amazonbot|bytespider/i;

export default async (req, context) => {
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);

  // Never intercept the function's own fetch, API calls, real files, or the
  // Netlify functions path — only page routes.
  if (req.headers.get('x-prerender') === '1') return;
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/.netlify/')) return;
  if (/\.(html|js|mjs|css|json|xml|txt|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|pdf)$/i.test(path)) return;

  // Only intervene for crawlers; humans get the normal SPA untouched.
  if (!BOT_RE.test(ua)) {
    return; // fall through to the static index.html
  }

  // Fetch the deployed index.html (same origin).
  let html;
  try {
    const res = await fetch(SITE + '/index.html', { headers: { 'x-prerender': '1' } });
    html = await res.text();
  } catch (e) {
    return; // if anything fails, fall through — never block the page
  }

  // Load the saved content (falls back to the seed baked into the HTML).
  let data = null;
  try {
    const store = getStore(STORE_NAME);
    const saved = await store.get(RECORD_KEY, { type: 'json' });
    if (saved) data = saved;
  } catch (e) { /* ignore */ }
  if (!data) {
    const mm = html.match(/<script[^>]*id=["']seed["'][^>]*>([\s\S]*?)<\/script>/i);
    if (mm) { try { data = JSON.parse(mm[1]); } catch (e) {} }
  }

  const meta = metaForPath(url.pathname, data || {});
  const out = injectHead(html, meta);

  return new Response(out, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};

export const config = { path: '/*' };
