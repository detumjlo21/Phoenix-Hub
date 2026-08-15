# PHOENIX Hub

Static HTML/CSS/JS for GitHub Pages + Supabase.

## 1. Supabase project already configured in frontend

Project URL:
`https://uwtnvfwjjofvshlzfzt0.supabase.co`

Publishable key is stored in:
`js/config.js`

A Supabase publishable key is intended for frontend use. Never put service_role, DB password, or LiveKit secret in this repository.

## 2. Enable Anonymous Sign-ins

In Supabase Dashboard:

Authentication → Providers / Sign In Methods → Anonymous → Enable

This does NOT ask members to create a username/password. It gives each browser/device a secure Supabase Auth identity behind the scenes.

## 3. Run the SQL

Open Supabase SQL Editor and run:

`supabase/setup.sql`

This adds:
- preview_invite()
- claim_invite()
- RLS policies for member identity / heartbeat

## 4. Upload repository to GitHub

Upload all files/folders in this ZIP to the root of `Phoenix-Hub`.

Then:

Settings → Pages → Deploy from a branch → `main` / `(root)` → Save

Your site will normally be:
`https://detumjlo21.github.io/Phoenix-Hub/`

## 5. Test your invite

Create a NEW invite token because the first one was shown publicly in a screenshot.

Then open:

`https://detumjlo21.github.io/Phoenix-Hub/join.html?token=YOUR_NEW_TOKEN`

Enter your ingame name → Join.

After that, opening the home page on the same browser should remember you automatically.

## Current scope

Working in this version:
- one-time invite claim
- no password/account form
- browser remembers member
- online heartbeat every 45 sec
- 3 branch member/online counts

Next:
- room creation
- room password
- auto hide/delete
- LiveKit voice
- watch party
