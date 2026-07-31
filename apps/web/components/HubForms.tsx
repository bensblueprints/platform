"use client";

import { useState } from "react";

const input = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";
const btn = "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50";

export function VideoUpload({ webinarId, hasVideo, duration }: { webinarId: string; hasVideo: boolean; duration: number | null }) {
  const [state, setState] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [ytUrl, setYtUrl] = useState("");

  async function upload(file: File) {
    setState("uploading… (direct uploads cap at ~100MB through Cloudflare — for bigger files use Import from URL below)");
    const res = await fetch(`/api/admin/webinars/${webinarId}/video`, { method: "PUT", body: file });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? `uploaded (${Math.round((body.durationSeconds ?? 0) / 60)} min detected)` : `failed: ${body.error ?? res.status}`);
  }

  async function importYoutube() {
    if (!ytUrl.trim()) return;
    setState("queued — yt-dlp is downloading on the server (a minute for big files)…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/video-youtube`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: ytUrl.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? "queued — check back in a minute" : `failed: ${body.error ?? res.status}`);
  }

  async function importFromUrl() {
    if (!importUrl.trim()) return;
    setState("importing from URL — the server is downloading it, keep this tab open…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/video-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: importUrl.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setState(
      res.ok
        ? `imported (${Math.round((body.durationSeconds ?? 0) / 60)} min detected${body.bytes ? `, ${Math.round(body.bytes / 1e6)} MB` : ""})`
        : `import failed: ${body.error ?? res.status}`,
    );
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Video</h2>
      <p className="mb-3 text-sm text-zinc-400">
        {hasVideo ? `Uploaded (${duration ? Math.round(duration / 60) : "?"} min). Replace any time:` : "No video yet. Get it in one of two ways:"}
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">1. Import from URL (recommended — any size, the server downloads it)</p>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://…/your-webinar.mp4 (Drive, Dropbox, S3, Vimeo download…)"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
            <button onClick={importFromUrl} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500">
              Import
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">2. YouTube (public/unlisted — downloads as your own mp4, no YouTube branding; private needs cookies in Settings)</p>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://youtube.com/watch?v=… or https://youtu.be/…"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
            <button onClick={importYoutube} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600">
              YouTube
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">3. Direct upload (mp4 up to ~100MB — Cloudflare's proxied limit)</p>
          <input
            type="file"
            accept="video/mp4"
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            className="text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-white"
          />
        </div>
      </div>
      {state && <p className="mt-2 text-sm text-zinc-400">{state}</p>}
    </section>
  );
}

export function OfferForm({ webinarId, offers = [] }: { webinarId: string; offers?: { id: string; name: string }[] }) {
  const [form, setForm] = useState({
    name: "", headline: "", body: "", buttonText: "Get it now", buttonUrl: "",
    startOffsetSeconds: 1500, endOffsetSeconds: "", urgencyEnabled: true, urgencySeconds: 600,
    scarcityEnabled: false, inventoryTotal: 25, priceStartCents: "", priceIncrementCents: 0, priceCapCents: "",
  });
  const [state, setState] = useState<string | null>(null);
  const [vi, setVi] = useState({ offerId: "", viUrl: "https://viralinvoice.onetimesuite.com", apiKey: "", invoiceId: "" });
  const [viInvoices, setViInvoices] = useState<{ id: string; title: string; status: string; currency: string; priceCents: number | null }[] | null>(null);
  const [viState, setViState] = useState<string | null>(null);

  async function viCall(payload: Record<string, string>) {
    const offerId = vi.offerId || offers[0]?.id;
    const res = await fetch(`/api/admin/offers/${offerId}/vi-connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viUrl: vi.viUrl, apiKey: vi.apiKey, ...payload }),
    });
    return { res, body: await res.json().catch(() => ({})) };
  }

  async function viList() {
    setViState("listing invoices…");
    setViInvoices(null);
    const { res, body } = await viCall({ action: "list" });
    if (res.ok) {
      setViInvoices(body.invoices ?? []);
      setViState(body.invoices?.length ? "pick an invoice, then Connect" : "no invoices on that Viral Invoice account");
    } else {
      setViState(`failed: ${body.message ?? body.error ?? res.status}`);
    }
  }

  async function viConnect() {
    if (!vi.invoiceId) return;
    setViState("connecting…");
    const { res, body } = await viCall({ action: "connect", invoiceId: vi.invoiceId });
    if (res.ok) {
      setForm({ ...form, buttonUrl: body.checkoutUrl });
      setViState(`connected — button URL set to ${body.checkoutUrl} and the purchase webhook is registered in Viral Invoice`);
    } else {
      setViState(`failed: ${body.message ?? body.error ?? res.status}`);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusyState("creating…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/offers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        startOffsetSeconds: Number(form.startOffsetSeconds),
        endOffsetSeconds: form.endOffsetSeconds === "" ? null : Number(form.endOffsetSeconds),
        urgencySeconds: Number(form.urgencySeconds),
        inventoryTotal: Number(form.inventoryTotal),
        priceStartCents: form.priceStartCents === "" ? null : Number(form.priceStartCents),
        priceIncrementCents: Number(form.priceIncrementCents),
        priceCapCents: form.priceCapCents === "" ? null : Number(form.priceCapCents),
      }),
    });
    setBusyState(res.ok ? "created — it appears in the room at the start offset" : "failed");
  }
  const setBusyState = setState;

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">New offer</h2>
      <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input required placeholder="Name (internal)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input required placeholder="Headline (shown big)" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className={input} />
        <input placeholder="Body text" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={input} />
        <input placeholder="Button URL (your checkout link)" value={form.buttonUrl} onChange={(e) => setForm({ ...form, buttonUrl: e.target.value })} className={input} />
        <input placeholder="Button text" value={form.buttonText} onChange={(e) => setForm({ ...form, buttonText: e.target.value })} className={input} />
        <label className="text-sm text-zinc-400">Starts at (seconds)
          <input type="number" value={form.startOffsetSeconds} onChange={(e) => setForm({ ...form, startOffsetSeconds: e.target.value as any })} className={input} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.urgencyEnabled} onChange={(e) => setForm({ ...form, urgencyEnabled: e.target.checked })} />
          Urgency countdown (per viewer, {form.urgencySeconds}s)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.scarcityEnabled} onChange={(e) => setForm({ ...form, scarcityEnabled: e.target.checked })} />
          Scarcity ({form.inventoryTotal} total)
        </label>
        <label className="text-sm text-zinc-400">Price (cents, optional)
          <input type="number" placeholder="10000 = $100" value={form.priceStartCents} onChange={(e) => setForm({ ...form, priceStartCents: e.target.value })} className={input} />
        </label>
        <label className="text-sm text-zinc-400">+ per sale (cents)
          <input type="number" value={form.priceIncrementCents} onChange={(e) => setForm({ ...form, priceIncrementCents: e.target.value as any })} className={input} />
        </label>
        <label className="text-sm text-zinc-400">Cap (cents)
          <input type="number" placeholder="99700 = $997" value={form.priceCapCents} onChange={(e) => setForm({ ...form, priceCapCents: e.target.value })} className={input} />
        </label>
        <button className={btn}>Create offer</button>
      </form>
      {state && <p className="mt-2 text-sm text-zinc-400">{state}</p>}
      {offers.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <h3 className="mb-2 text-sm font-medium">Viral Invoice</h3>
          <p className="mb-3 text-xs text-zinc-500">
            Create an API key in Viral Invoice → Settings → API Keys. The key is used once and never stored.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-400">Offer to connect
              <select value={vi.offerId || offers[0].id} onChange={(e) => setVi({ ...vi, offerId: e.target.value })} className={input}>
                {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-400">Instance URL
              <input value={vi.viUrl} onChange={(e) => setVi({ ...vi, viUrl: e.target.value })} className={input} />
            </label>
            <label className="text-sm text-zinc-400">API key
              <input type="password" value={vi.apiKey} onChange={(e) => setVi({ ...vi, apiKey: e.target.value })} placeholder="vi_…" className={input} />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" onClick={viList} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600">List invoices</button>
              {viInvoices && viInvoices.length > 0 && (
                <>
                  <select value={vi.invoiceId} onChange={(e) => setVi({ ...vi, invoiceId: e.target.value })} className={input}>
                    <option value="">pick an invoice…</option>
                    {viInvoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title} — {i.status}{i.priceCents != null ? ` — ${(i.priceCents / 100).toFixed(2)} ${i.currency}` : ""}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={viConnect} disabled={!vi.invoiceId} className={btn}>Connect</button>
                </>
              )}
            </div>
          </div>
          {viState && <p className="mt-2 text-sm text-zinc-400">{viState}</p>}
        </div>
      )}
    </section>
  );
}

export function CurveForm({ webinarId, initial }: { webinarId: string; initial: any }) {
  const [form, setForm] = useState(initial);
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState("saving…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/curve`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setState(res.ok ? "saved" : "failed");
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Attendance curve (simulated count)</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(["peakCount", "rampMinutes", "plateauPct", "endPct", "jitterPct"] as const).map((k) => (
          <label key={k} className="text-xs text-zinc-400">
            {k}
            <input
              type="number"
              step={k.endsWith("Pct") ? 0.05 : 1}
              value={form[k] ?? ""}
              onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
              className={input}
            />
          </label>
        ))}
      </div>
      <button onClick={save} className={`${btn} mt-3`}>Save curve</button>
      {state && <span className="ml-3 text-sm text-zinc-400">{state}</span>}
    </section>
  );
}

export function RosterForm({ webinarId, initial }: { webinarId: string; initial: string[] }) {
  const [text, setText] = useState(initial.join("\n"));
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState("saving…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/roster`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ names: text.split("\n") }),
    });
    const body = await res.json();
    setState(res.ok ? `saved ${body.saved} names` : "failed");
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Name roster (one per line, for {"{{name}}"} substitution)</h2>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={input} />
      <button onClick={save} className={`${btn} mt-3`}>Save roster</button>
      {state && <span className="ml-3 text-sm text-zinc-400">{state}</span>}
    </section>
  );
}

export function ImportChatForm({ webinarId }: { webinarId: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function import_(replace: boolean) {
    setResult("importing…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/import-chat${replace ? "?replace=1" : ""}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: text,
    });
    const body = await res.json();
    if (res.ok) {
      setResult(`imported ${body.imported} lines${body.warnings.length ? ` (${body.warnings.length} FTC warnings)` : ""}`);
    } else {
      setResult(`rejected: ${body.errors?.map((e: any) => `row ${e.row}: ${e.reason}`).join("; ")}`);
    }
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Import chat CSV (EverWebinar format)</h2>
      <p className="mb-2 text-xs text-zinc-500">Hour,Minute,Second,Name,Role,Message,Mode — header optional.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"0,0,05,Marcus T.,Attendee,Joining from Denver,chat"} className={input} />
      <div className="mt-3 flex gap-3">
        <button onClick={() => import_(false)} className={btn}>Append</button>
        <button onClick={() => import_(true)} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800">
          Replace existing
        </button>
      </div>
      {result && <p className="mt-2 text-sm text-zinc-400">{result}</p>}
    </section>
  );
}

export function AudienceSizeForm({ webinarId, initial }: { webinarId: string; initial: number }) {
  const [size, setSize] = useState(initial);
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState("saving…");
    const res = await fetch(`/api/admin/webinars/${webinarId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatAudienceSize: size }),
    });
    setState(res.ok ? "saved — the generator sizes chat volume and the roster to this" : "failed");
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Chat audience size</h2>
      <p className="mb-2 text-xs text-zinc-500">
        How many people the room feels like. The generator scales line density and the persona roster to this number.
      </p>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={10}
          max={5000}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <button onClick={save} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500">
          Save
        </button>
        {state && <span className="text-sm text-zinc-400">{state}</span>}
      </div>
    </section>
  );
}

export function TrackingForm({ webinarId, initial }: { webinarId: string; initial: string | null }) {
  const [pixelId, setPixelId] = useState(initial ?? "");
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState("saving…");
    const res = await fetch(`/api/admin/webinars/${webinarId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fbPixelId: pixelId.trim() }),
    });
    setState(res.ok ? "saved" : "failed — pixel IDs are 5-20 digits (or empty to disable)");
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Facebook Pixel</h2>
      <p className="mb-2 text-xs text-zinc-500">
        Fires PageView on the registration page, CompleteRegistration on the confirmation page, and
        ViewContent / Purchase in the room. Find this in Meta Events Manager → Data Sources → your
        pixel → Settings. Empty disables tracking.
      </p>
      <div className="flex items-center gap-3">
        <input
          value={pixelId}
          onChange={(e) => setPixelId(e.target.value)}
          placeholder="Facebook Pixel ID (digits only)"
          className={input}
        />
        <button onClick={save} className={btn}>
          Save
        </button>
        {state && <span className="text-sm text-zinc-400">{state}</span>}
      </div>
    </section>
  );
}

export function ScheduleForm({
  webinarId,
  mode,
  interval,
  lead,
}: {
  webinarId: string;
  mode: string;
  interval: number | null;
  lead: number | null;
}) {
  const [i, setI] = useState(interval ?? 15);
  const [l, setL] = useState(lead ?? 5);
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState("saving…");
    const res = await fetch(`/api/admin/webinars/${webinarId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jitIntervalMinutes: Number(i), jitLeadMinutes: Number(l) }),
    });
    setState(res.ok ? "saved" : "failed");
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Schedule</h2>
      <p className="mb-2 text-xs text-zinc-500">
        Mode: {mode}. A new session starts every N minutes plus the lead time — the wait a
        visitor sees is at most N + lead.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
        <label>
          every{" "}
          <input
            type="number"
            min={1}
            value={i}
            onChange={(e) => setI(Number(e.target.value))}
            className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
          />{" "}
          min
        </label>
        <label>
          lead{" "}
          <input
            type="number"
            min={0}
            value={l}
            onChange={(e) => setL(Number(e.target.value))}
            className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
          />{" "}
          min
        </label>
        <button onClick={save} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500">
          Save
        </button>
        {state && <span className="text-sm text-zinc-400">{state}</span>}
      </div>
    </section>
  );
}

export function WaitingRoomForm({
  webinarId,
  initial,
}: {
  webinarId: string;
  initial: { headline: string | null; body: string | null; imageUrl: string | null; badges: string | null };
}) {
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [badges, setBadges] = useState(initial.badges ?? "");
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState("saving…");
    const res = await fetch(`/api/admin/webinars/${webinarId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ waitingHeadline: headline, waitingBody: body, waitingBadges: badges }),
    });
    setState(res.ok ? "saved" : "failed");
  }

  async function uploadImage(file: File) {
    setState("uploading image…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/waiting-image`, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setImageUrl(j.url ?? null);
    setState(res.ok ? "image uploaded" : `image failed: ${j.error ?? res.status}`);
  }

  async function removeImage() {
    const res = await fetch(`/api/admin/webinars/${webinarId}/waiting-image`, { method: "DELETE" });
    if (res.ok) setImageUrl(null);
    setState(res.ok ? "image removed" : "remove failed");
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Waiting room</h2>
      <p className="mb-2 text-xs text-zinc-500">
        Shown while visitors wait for the session to start. The countdown always renders beneath
        your content.
      </p>
      <div className="flex flex-col gap-2">
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder='Headline (default: "Please wait, the webinar will be starting shortly")'
          className={input}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (optional — a line or two under the headline)"
          rows={2}
          className={input}
        />
        <input
          value={badges}
          onChange={(e) => setBadges(e.target.value)}
          placeholder="As seen on, comma-separated (e.g. Product Hunt, Yahoo Finance, AppSumo). Add a BrandFetch client ID in Settings for real logos."
          className={input}
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => e.target.files?.[0] && void uploadImage(e.target.files[0])}
            className="text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-white"
          />
          {imageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="waiting room" className="h-12 rounded" />
              <button onClick={removeImage} className="text-xs text-red-300 hover:underline">
                remove
              </button>
            </>
          )}
        </div>
        <div>
          <button onClick={save} className={btn}>
            Save waiting room
          </button>
          {state && <span className="ml-3 text-sm text-zinc-400">{state}</span>}
        </div>
      </div>
    </section>
  );
}

export function DeleteWebinarButton({ webinarId, title }: { webinarId: string; title: string }) {
  const [state, setState] = useState<string | null>(null);

  async function del() {
    if (!window.confirm(`Delete "${title}" and everything attached to it (registrants, sessions, chat, offers, analytics)? This cannot be undone.`)) return;
    setState("deleting…");
    const res = await fetch(`/api/admin/webinars/${webinarId}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/admin";
    } else {
      setState("delete failed");
    }
  }

  return (
    <section className="rounded-lg border border-red-900/50 bg-red-950/20 p-4">
      <button onClick={del} className="text-sm font-medium text-red-300 hover:text-red-200">
        Delete this webinar
      </button>
      {state && <span className="ml-3 text-sm text-red-300">{state}</span>}
    </section>
  );
}
