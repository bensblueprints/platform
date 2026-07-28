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
| `/admin/settings` | Integration keys (AI, GHL, Stripe) | You |
| `/w/[slug]` | Public registration page | Your audience |
| `/room/[token]` | The watch room (unique per registrant) | Your audience |

Legacy fallback domain `https://webinar-platform.212.28.184.24.sslip.io` serves the same app.

---

## 2. First run: create the owner account

1. Open `/signup`. The first account created owns the platform. Email + password (8+ chars).
2. Signup then closes permanently — everyone after that must use `/login`. (There is no second-user invite flow yet.)

## 2b. Integrations (Settings page)

`/admin/settings` — all third-party keys live here, stored in the platform database, shown masked, never logged. Blank fields are left unchanged.

- **AI script generation:** `INFERENCE_BASE_URL` + `INFERENCE_API_KEY` — for OpenRouter use `https://openrouter.ai/api` and your `sk-or-v1-…` key (any OpenAI-compatible endpoint works: OpenAI, Groq, Together, a local rig). `INFERENCE_MODEL` picks the generation model (suggestions provided; any model slug the endpoint serves is accepted). Until these are set, the generator uses a deterministic mock (real structure, placeholder text).
- **BrandFetch (optional):** `BRANDFETCH_CLIENT_ID` — with it, "as seen on" badges in the waiting room render real brand logos via BrandFetch's Logo Link; without it they render as styled text badges.
- **GoHighLevel:** `GHL_API_KEY` + `GHL_LOCATION_ID` — registrants get upserted with webinar tags and GHL runs reminders.
- **Stripe:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — enable native Stripe Checkout; leave blank and use offer Button URLs.

## 3. Create a webinar

`/admin` → **New webinar**:

- **Title / subtitle** — shown on the registration page.
- **Schedule mode:**
  - **Just-in-time (JIT):** the registration page always offers the next slot (`ceil(now / interval) + lead`). Tune **interval** and **lead** any time on the manage page → Schedule — the longest a visitor ever waits is interval + lead (e.g. 5 + 1 = 6 minutes max).
  - **Recurring:** fixed weekdays + times in a named timezone (e.g. Mon/Wed/Fri 10:00 America/Chicago). A background worker materializes sessions 14 days ahead automatically.
  - **On-demand:** the session starts the moment the viewer joins.

## 3b. The waiting room (JIT)

Visitors who arrive before start see the waiting room: your content plus a live countdown, with chat held back until the script actually begins. Customize it on the manage page → **Waiting room**:

- **Headline** — defaults to "Please wait, the webinar will be starting shortly".
- **Description** — a line or two under the headline.
- **Image** — upload any png/jpg/webp/gif; it renders above the headline. Replace or remove any time.
- **As seen on** — comma-separated press names (e.g. `Product Hunt, Yahoo Finance, AppSumo`) rendered as a badge strip. With a BrandFetch client ID in Settings they render as real logos; otherwise styled text badges. Only list outlets that have actually featured you — invented press mentions are an FTC problem, not a growth hack.

## 4. Get the video in

Three options on the manage page:

- **Import from URL (recommended):** paste any direct mp4 link (Drive, Dropbox, S3, Vimeo download). The server downloads it — no size limit.
- **YouTube:** paste a public or unlisted YouTube URL — it's downloaded as your own mp4 and plays in our player with no YouTube branding. PRIVATE videos need your YouTube cookies in `/admin/settings` → YouTube.
- **Direct upload:** mp4 up to ~100MB (Cloudflare caps proxied uploads there — that's why a 1GB file fails; use Import from URL instead).

Duration is detected automatically; the file persists on the server across redeploys (persistent volume), and it's served with HTTP range requests so late joiners start mid-stream correctly. (This is the job R2 takes over later — zero-egress — once Cloudflare credentials are plugged in; nothing you need to do then.)

## 5. Get a chat script

Two ways, both on the manage page or the script editor:

**A. Generate it (recommended).** `/admin/scripts/[slug]` → **Generate script**. The pipeline transcribes your video, splits it into beats (intro/teaching/story/pitch/offer…), invents 20–40 audience personas with names and typing styles, and writes chat that references what the presenter actually says — every audience question gets an admin answer within 90 seconds. It lands as a **draft**, never live until you publish.

The flow for a new webinar, end to end:

1. Put your OpenRouter key in `/admin/settings` and pick a generation model (suggestions in the field).
2. On the script editor, check the **estimated run** line before generating — beats, rough token count, and a cost range on your model.
3. Set **chat participants** (right there on the script editor, or on the manage page) — it scales how busy the room feels and how large the persona roster is.
4. **Generate script**, then review: edit any line inline, retime it (`mm:ss`), or reassign its persona.
5. **Regenerate beat** rewrites one beat (e.g. a weak "story" beat) and leaves everything else — including your hand edits — alone. **Diff vs live** shows what changed.
6. **Publish draft** swaps it into the room. **Download CSV** exports the EverWebinar 7-column format.

**B. Import an existing script.** Paste an EverWebinar/WebinarJam CSV export into the import box (on the manage page). The format is `Hour,Minute,Second,Name,Role,Message,Mode` with an optional header. Malformed rows are rejected with the row number and EverWebinar's own error vocabulary. Lines that look like earnings claims in attendee mouths get flagged as FTC warnings (they import, but you should delete them — see §11).

## 6. Create an offer

Manage page → **New offer**:

- **Start offset (seconds):** when the panel appears under the video. End offset optional (blank = stays).
- **Button URL:** your checkout link — a GoHighLevel order form, a Stripe Payment Link, anything. The click is tracked and the viewer is sent there. (Direct Stripe Checkout integration is intentionally off for now.)
- **Price ladder (optional):** start price, +increment per sale, cap. The room shows the current price and the honest "goes to $X after this sale".
- **Urgency:** per-viewer countdown that starts when *they* first see the offer (survives refresh).
- **Scarcity:** "N left" from inventory minus sales.

## 6b. Reminder emails (Resend)

`/admin/settings` → Resend: add your `RESEND_API_KEY` and `RESEND_FROM` (e.g. `Webinars <live@yourdomain.com>`). Confirm, 24h/1h/10m reminders, and attended/no-show follow-ups then send automatically via resend.com — no SMTP needed.

## 6c. Counting sales from Viral Invoice (or any external checkout)

The price ladder only rises on real sales. Point the offer's Button URL at your Viral Invoice checkout, then bridge the payment back:

1. `/admin/settings` → Purchase bridge: set a shared secret.
2. In Viral Invoice (or a GHL flow/Zapier), on payment success call:
   `POST /api/offers/<offerId>/purchase` with `{ "secret": "…", "amountCents": 10000, "externalRef": "<invoice id>" }`.
3. The ladder increments exactly once per `externalRef` (idempotent), and the new price pushes live into every open room.

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
- **Playback starts by itself** the moment the session goes live (or immediately for late joiners) — there is no join button. Browsers only block *sound* on autoplay, so if sound is blocked the video plays muted with a **Tap to unmute** button.
- The room is a fixed shell: the video and chat never move and the page never grows — the chat scrolls inside its own rail like a normal chat app.
- Scripted chat lands ~3s after its raw transcript second so each line matches the on-screen moment, and late joiners periodically ask what's happening — the regulars in the script answer them.
- The attendee count is simulated on a curve you control (manage page → curve settings). It never hits zero and never drops during the ramp.
- Seeded chat varies per session (drop + jitter on a per-session seed) and `{{name}}` tokens resolve against your roster — repeat viewers never see an identical room.
- Chat input is on by default (`allow_real_chat`); turn it off in settings if you want a fully scripted room.

## 11. Compliance guardrails (built in, don't bypass)

- **No simulated purchase toasts.** Sale notifications only ever come from real payment webhooks (when Stripe is wired). There is no fake-sale mode, deliberately.
- **The generator refuses to write earnings/results claims into attendee lines** (FTC 16 CFR Part 465 — fake testimonials carry civil penalties). Atmospheric chat, questions, and logistics only. Import lint warns on the same patterns.
- Player hardening is friction, not DRM — the schedule being server-driven is the real protection.

## 11b. Housekeeping

- **Delete a webinar** from its manage page (bottom) or the dashboard row — removes registrants, sessions, chat, offers, and the video file. Irreversible.
- **Chat audience size** (manage page) scales how busy the seeded chat feels and how big the persona roster is.
- **Owner vault:** `onetimesuite.com/documentation` — all links and credentials behind your vault password.

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
