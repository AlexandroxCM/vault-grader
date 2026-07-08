# Vault Grader

Sign in with Bungie → your entire Destiny 2 vault graded S-to-D against
180,000+ community god rolls (the same wishlist DIM uses). No typing, ever.

**Stack:** React + Vite frontend, Vercel serverless functions for OAuth and
vault fetching, server-side grading. Same architecture as Campus Board.

---

## Your to-do list (in order)

### 1. Update your Bungie app (5 min)

Go to **bungie.net/en/Application**, open your "Weapon Grader" app, and change:

- **OAuth Client Type**: `Not Applicable` → **`Confidential`**
- **Redirect URL**: `https://YOUR-APP-NAME.vercel.app/api/callback`
  (you'll know the exact name after step 3 — you can come back and fix this,
  Vercel URLs are predictable: the project name you pick)
- **Scope**: check **"Read your Destiny 2 information (Vault, Inventory, Vendors)"**
- Save. The page now shows an **OAuth client_id** and **client_secret**. Copy both.

### 2. Build the weapon database (2 min)

In this folder:

```bash
npm install
BUNGIE_API_KEY="your-api-key" npm run manifest
```

This creates `public/db.json` (weapon names, icons, types). Re-run after big
game patches to pick up new weapons.

### 3. Deploy to Vercel (5 min)

Push this folder to a new GitHub repo, then in Vercel: **Add New Project** →
import the repo. Before deploying, add three environment variables
(Settings → Environment Variables):

| Name | Value |
|---|---|
| `BUNGIE_API_KEY` | your API key |
| `BUNGIE_CLIENT_ID` | from step 1 |
| `BUNGIE_CLIENT_SECRET` | from step 1 |

Deploy. Note your live URL (e.g. `https://vault-grader.vercel.app`).

### 4. Finish the redirect URL

Back on bungie.net, set the Redirect URL to exactly:

```
https://YOUR-ACTUAL-URL.vercel.app/api/callback
```

It must match character-for-character or sign-in fails.

### 5. Test it

Open your live URL → **Sign in with Bungie** → approve → watch your whole
vault get graded. Done.

---

## How it works

```
Browser ── /api/login ──> bungie.net OAuth (user signs in w/ PSN/Xbox/Steam there)
        <─ /api/callback ─ tokens stored as httpOnly cookies
Browser ── /api/vault ──> GetProfile (vault + characters + item sockets)
                          └─> every item graded against api/_lib/wishlist.json
Browser <── graded list ── frontend maps hashes to names/icons via public/db.json
```

- Tokens live in httpOnly cookies — JavaScript can't read them, and your
  client secret never leaves the serverless functions.
- Access tokens expire hourly; `/api/vault` refreshes them silently using the
  refresh token (lasts ~90 days).
- Grading: S = exact god-roll match, A ≥ 75%, B ≥ 50%, C ≥ 25%, D = no match,
  ? = weapon not in the community wishlist.

## Updating the wishlist

The community updates their god rolls constantly. To refresh:

```bash
curl -sL "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt" -o voltron.txt
python3 - << 'EOF'
import json, re
from collections import defaultdict
pat = re.compile(r'^dimwishlist:item=(-?\d+)&perks=([\d,]+)')
rolls = defaultdict(set)
for line in open('voltron.txt', errors='replace'):
    m = pat.match(line)
    if not m or int(m.group(1)) < 0: continue
    rolls[int(m.group(1))].add(tuple(sorted(int(p) for p in m.group(2).split(',') if p)))
json.dump({str(k): [list(r) for r in v] for k, v in rolls.items()},
          open('api/_lib/wishlist.json','w'), separators=(',',':'))
print('updated')
EOF
```

Commit and push — Vercel redeploys automatically.

## Local development

```bash
npm i -g vercel
vercel dev
```

(Plain `npm run dev` runs the frontend only — the /api routes need `vercel dev`.
OAuth redirects won't work on localhost unless you temporarily point the
Bungie redirect URL at `https://localhost:3000/api/callback`; easier to just
test on the deployed URL.)

## Never commit secrets

`.env` is gitignored. Your API key, client ID, and client secret belong in
Vercel's environment variables only.
