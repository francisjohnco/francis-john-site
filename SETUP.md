# Setting up live editing

One-time setup. After this, edits you make in the dashboard are live everywhere — laptop, phone, anyone visiting — with no deploy.

## 1. Pick an edit passcode

Choose something only you know. This is what unlocks the dashboard from now on. **Do not reuse the old `sajmedia` passcode.**

## 2. Put it in Netlify

Netlify → your site → **Site configuration** → **Environment variables** → **Add a variable**.

- Key: `EDIT_PASSCODE`
- Value: your passcode
- Scopes: leave as all

Save it. This value lives on Netlify's servers and never appears in the page source — which is what makes it real security rather than a curtain.

## 3. Install and deploy

In Terminal, from the site folder:

```
npm install
npx netlify-cli deploy --prod --dir .
```

`npm install` is new and only needed when the dependencies change. It downloads the storage library the function uses.

## 4. Check it worked

Go to `/admin` on the live site and enter your new passcode.

The pill at the top right should read **Live on all devices**.

- **"Browser only"** → the function did not deploy. Check Netlify → Functions for one named `content`.
- **Passcode rejected** → `EDIT_PASSCODE` is not set, or does not match. Re-check step 2, then redeploy.

---

# How it works now

**Editing.** Open `/admin` on any device, enter your passcode, edit, hit Save. It is live everywhere immediately. Your phone will show it. So will a recruiter.

**No more deploying for content.** Writing a post, fixing a bullet, changing a headline — all of it is just Save.

**Still deploy for:** design changes, new features, anything in the file itself.

## The one reason to still publish

Content saved to the server loads after the page does, which search engines read less well than content baked into the file.

For your résumé that does not matter. For journal posts you want ranking, it does.

So: **write and edit freely with Save. Every few weeks, or after publishing a post you care about, run Publish → Download index.html, replace the file, and deploy.** That bakes the current content back into the HTML and gives you the best of both.

The Publish tab still tells you what is waiting.

## Where content lives now

| Where | What it holds |
| --- | --- |
| Netlify Blobs | The live copy every device reads |
| Your browser | A cache, so pages appear instantly before the server answers |
| `index.html` | The baked copy — what search engines read, and your backup |

If two devices disagree, the most recently saved one wins.

## If you get locked out

Change `EDIT_PASSCODE` in Netlify to something new and redeploy. Content is untouched — it lives in Blobs, separate from the passcode.

## Backups

Publish → **Download file + backup** gives you `index.html` plus a dated `content.json`. Take one before big changes. Restore through Publish → *Restore from file*.
