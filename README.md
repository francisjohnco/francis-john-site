# Francis John — profile site

A single-page site with a built-in dashboard, server-side content storage, and a résumé that prints properly.

**New here? Read `SETUP.md` first** — one-time setup for live editing.

## Deploy

```
cd /Users/amphibia/Desktop/francis-john-site
npx netlify-cli deploy --prod --dir .
```

Run `npm install` once first, and again any time the dependencies change.

`./deploy.sh --draft` publishes to a temporary URL without touching the live site. `npm run dev` runs it locally with the function working.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The whole site: pages, dashboard, and the baked copy of your content |
| `netlify/functions/content.mjs` | Stores your content server-side so edits are live everywhere |
| `netlify.toml` | Routes `/api/*` to the function, everything else to the page |
| `_redirects` | The same routing, as a fallback |
| `package.json` | The storage library and the shortcut commands |
| `robots.txt` / `sitemap.xml` | Crawling and indexing |
| `deploy.sh` | Shorthand for the deploy command |

## The dashboard

`/admin` on the live site. The passcode is whatever you set as `EDIT_PASSCODE` in Netlify.

**Tabs:** Overview, Profile, Résumé, Systems, Journal, Page copy, SEO defaults, Publish.

- **Page copy** holds every heading, intro, button, the at-a-glance figures and the service-area towns. Header and footer links stay in the file.
- **Reordering** — up and down buttons on clusters, skills, roles, bullets, education, systems, figures and results. Posts sort by date.
- **Colour** — four accents, one per engine: sea, brass, clay, sage. Set per cluster and per system.
- **SEO** — each post gets a live search preview and a readiness score checking keyword placement, lengths, word count, subheadings, and whether it links to a system and out to a source.

## Set the domain

**Important:** SEO defaults → **Domain** must match where the site actually lives. It drives the canonical tag, share URLs, the sitemap and the structured data. If it points somewhere else, you are telling Google not to index this site.

## The contact form

Netlify Forms. After the first deploy: Netlify → **Forms** → `contact` → *Settings and usage* → *Form notifications* → send to `sajmediaco@gmail.com`.

The hidden `<form name="contact">` near the top of `index.html` is what Netlify's deploy bot detects. Do not delete it, and mirror any new field into it.

## Printing

**Save as PDF** on the profile page builds a two-column résumé laid out for paper — navy header, skills and education left, profile and experience right. It reads current content, so it is never stale.

In the print dialog, untick *Headers and footers*. If the navy header prints white, tick *Background graphics*.
