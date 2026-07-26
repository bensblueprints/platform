"use client";

import { useState } from "react";

const input = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";
const btn = "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50";

export function VideoUpload({ webinarId, hasVideo, duration }: { webinarId: string; hasVideo: boolean; duration: number | null }) {
  const [state, setState] = useState<string | null>(null);

  async function upload(file: File) {
    setState("uploading…");
    const res = await fetch(`/api/admin/webinars/${webinarId}/video`, { method: "PUT", body: file });
    const body = await res.json().catch(() => ({}));
    setState(res.ok ? `uploaded (${Math.round((body.durationSeconds ?? 0) / 60)} min detected)` : `failed: ${body.error ?? res.status}`);
  }

  return (
    <section className="rounded-lg bg-zinc-900 p-4">
      <h2 className="mb-2 font-medium">Video</h2>
      <p className="mb-3 text-sm text-zinc-400">
        {hasVideo ? `Uploaded (${duration ? Math.round(duration / 60) : "?"} min). Replace any time:` : "No video yet. Upload your webinar recording (mp4):"}
      </p>
      <input
        type="file"
        accept="video/mp4"
        onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
        className="text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-red-600 file:px-3 file:py-1.5 file:text-white"
      />
      {state && <p className="mt-2 text-sm text-zinc-400">{state}</p>}
    </section>
  );
}

export function OfferForm({ webinarId }: { webinarId: string }) {
  const [form, setForm] = useState({
    name: "", headline: "", body: "", buttonText: "Get it now", buttonUrl: "",
    startOffsetSeconds: 1500, endOffsetSeconds: "", urgencyEnabled: true, urgencySeconds: 600,
    scarcityEnabled: false, inventoryTotal: 25, priceStartCents: "", priceIncrementCents: 0, priceCapCents: "",
  });
  const [state, setState] = useState<string | null>(null);

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
