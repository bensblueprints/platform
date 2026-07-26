# Webinar Platform — Usage Guide

**App:** <https://webinar-clone.onetimesuite.com>
**What it is:** an evergreen webinar platform. It plays your pre-recorded video as a scheduled "live" session — with a live-looking seeded chat, a simulated attendee count, timed offers with a checkout button under the video, real attendee chat with a moderator console, reminder notifications, and analytics. This is the software that replaces an EverWebinar/WebinarJam subscription.

Everything below is how to run it end to end.

---

## 1. The URLs at a glance

| URL | What it is | Who uses it |
|---|---|---|
| `/signup` | Create the owner account (first visit only) | You, once |
| `/login` | Sign in | You |
| `/admin` | Dashboard — all your webinars | You |
| `/admin/webinars/new` | Create a webinar | You |
| `/admin/webinars/[id]` | Manage one webinar (video, offer, chat, curve, roster) | You |
| `/admin/scripts/[slug]` | Script generator + editor | You |
| `/admin/analytics/[slug]` | Funnel + retention analytics | You |
| `/admin/live` | Moderator console | You / your moderator |
| `/w/[slug]` | Public registration page | Your audience |
| `/room/[token]` | The watch room (unique per registrant) | Your audience |

Legacy fallback domain `https://webinar-platform.212.28.184.24.sslip.io` serves the same app.

---

## 2. First run: create the owner account

1. Open `/signup`. The first account created owns the platform. Email + password (8+ chars).
2. Signup then closes permanently — everyone after that must use `/login`. (There is no second-user invite flow yet.)

## 3. Create a webinar

`/admin` → **New webinar**:

- **Title / subtitle** — shown on the registration page.
- **Schedule mode:**
  - **Just-in-time (JIT):** the registration page always offers the next slot (`ceil(now / interval) + lead`). Use 15 min interval / 5 min lead for the classic "starting in a few minutes" feel.
  - **Recurring:** fixed weekdays + times in a named timezone (e.g. Mon/Wed/Fri 10:00 America/Chicago). A background worker materializes sessions 14 days ahead automatically.
  - **On-demand:** the session starts the moment the viewer joins.

## 4. Upload the video

On the webinar's manage page (`/admin/webinars/[id]`):

- Upload your **mp4** recording. It lands on a persistent volume on the server; the duration is detected automatically from the file.
- The video is served with HTTP range requests, so late joiners start mid-stream correctly. (This is the job R2 takes over later — zero-egress — once Cloudflare credentials are plugged in; nothing you need to do then.)

## 5. Get a chat script

Two ways, both on the manage page or the script editor:

**A. Generate it (recommended).** `/admin/scripts/[slug]` → **Generate script**. The pipeline transcribes your video, splits it into beats (intro/teaching/story/pitch/offer…), invents 20–40 audience personas with names and typing styles, and writes chat that references what the presenter actually says — every audience question gets an admin answer within 90 seconds. It lands as a **draft**, never live until you publish.
- Edit any line inline, retime it (`mm:ss`), or reassign its persona.
- **Regenerate beat** rewrites one beat (e.g. a weak "story" beat) and leaves everything else — including your hand edits — alone.
- **Diff vs live** shows what changed.
- **Publish draft** swaps it into the room.
- **Download CSV** exports the EverWebinar 7-column format.

**B. Import an existing script.** Paste an EverWebinar/WebinarJam CSV export into the import box (on the manage page). The format is `Hour,Minute,Second,Name,Role,Message,Mode` with an optional header. Malformed rows are rejected with the row number and EverWebinar's own error vocabulary. Lines that look like earnings claims in attendee mouths get flagged as FTC warnings (they import, but you should delete them — see §11).

## 6. Create an offer

Manage page → **New offer**:

- **Start offset (seconds):** when the panel appears under the video. End offset optional (blank = stays).
- **Button URL:** your checkout link — a GoHighLevel order form, a Stripe Payment Link, anything. The click is tracked and the viewer is sent there. (Direct Stripe Checkout integration is intentionally off for now.)
- **Price ladder (optional):** start price, +increment per sale, cap. The room shows the current price and the honest "goes to $X after this sale".
- **Urgency:** per-viewer countdown that starts when *they* first see the offer (survives refresh).
- **Scarcity:** "N left" from inventory minus sales.

## 7. Publish and promote

- Your registration page is `/w/[slug]` — that's the link for ads, emails, and social.
- Registrants get a confirmation page with their local time + a calendar (.ics) download, and a unique room link.
- Reminder notifications (confirm, 24h, 1h, 10m before, and attended/no-show follow-ups) queue automatically. Right now they're recorded in the `notifications_log` table; the **GoHighLevel adapter** (contact upsert + tags, the recommended path) activates the moment `GHL_API_KEY` and `GHL_LOCATION_ID` are set on the server.

## 8. Moderate the room

`/admin/live` (pick the webinar):

- You see every real attendee message with the attendee's name and where they are in the video.
- **Reply privately** — only that attendee sees it.
- **Broadcast** — reaches every active session of that webinar, styled as a host message.
- Attendees never see each other's messages. Ever.

## 9. Analytics

`/admin/analytics/[slug]`:

- Visitors → registrants → attendees → show rate.
- **Retention curve with the offer timestamp marked** — the most useful chart in the product: you see exactly where people leave relative to your pitch.
- Offer funnel: impressions → clicks → purchases, revenue, and revenue per registrant/attendee.

## 10. Room behavior worth knowing

- Everything timed (chat, offer, count) follows the **server clock**, not the video player. Refreshing or joining late always lands at the correct point. Scrubbing the video does nothing.
- The attendee count is simulated on a curve you control (manage page → curve settings). It never hits zero and never drops during the ramp.
- Seeded chat varies per session (drop + jitter on a per-session seed) and `{{name}}` tokens resolve against your roster — repeat viewers never see an identical room.
- Chat input is on by default (`allow_real_chat`); turn it off in settings if you want a fully scripted room.

## 11. Compliance guardrails (built in, don't bypass)

- **No simulated purchase toasts.** Sale notifications only ever come from real payment webhooks (when Stripe is wired). There is no fake-sale mode, deliberately.
- **The generator refuses to write earnings/results claims into attendee lines** (FTC 16 CFR Part 465 — fake testimonials carry civil penalties). Atmospheric chat, questions, and logistics only. Import lint warns on the same patterns.
- Player hardening is friction, not DRM — the schedule being server-driven is the real protection.

## 12. Testing endpoints (dev only)

`/api/dev/*` endpoints seed demo data and are gated by a seed token on the server (not in this doc). They exist for the test suite; ignore them in daily use.

## 13. Current limitations

- **Stripe Checkout off** — use `button_url` to any external checkout for now.
- **Video storage** is a server volume (survives redeploys); it moves to Cloudflare R2 (zero egress cost) when credentials are available.
- **Supabase Realtime unused** — this server's Supabase Kong gateway is misconfigured (all API routes redirect to /login), so live updates use server-sent events from the app instead. No functional difference in the room.
- One Docker build at a time on this server (parallel builds have run out of memory once).

## 14. Troubleshooting

- **Video won't play / black box:** no video uploaded yet on that webinar (manage page → Video), or the upload is still processing. Re-upload the mp4.
- **Chat empty:** no live script — publish the generated draft or import a CSV. Drafts never show until published.
- **Offer button says unavailable:** the offer's window hasn't started (start offset), or it has no `button_url` and Stripe is off. Set a Button URL.
- **"/admin" loops to login:** cookies blocked — the session cookie is required (or use the `?key=` bypass issued to you separately).
- **Registration page 404:** wrong slug — it's `/w/[slug]`, exact, lowercase.
