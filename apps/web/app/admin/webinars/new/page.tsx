"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function NewWebinarPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [mode, setMode] = useState<"jit" | "recurring" | "ondemand">("jit");
  const [interval, setInterval_] = useState(15);
  const [lead, setLead] = useState(5);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [times, setTimes] = useState("10:00");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/webinars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        subtitle: subtitle || undefined,
        scheduleMode: mode,
        jitIntervalMinutes: interval,
        jitLeadMinutes: lead,
        recurringDays: mode === "recurring" ? days : undefined,
        recurringTimes: mode === "recurring" ? times.split(",").map((t) => t.trim()) : undefined,
        timezone,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push(`/admin/webinars/${body.id}`);
      return;
    }
    setError(body.error === "slug_taken" ? "That slug is taken — tweak the title." : "Check the form and try again.");
    setBusy(false);
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">New webinar</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Subtitle (shown under the title on the registration page)
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Schedule
          <select value={mode} onChange={(e) => setMode(e.target.value as any)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white">
            <option value="jit">Just-in-time (next slot every N minutes)</option>
            <option value="recurring">Recurring (fixed days/times)</option>
            <option value="ondemand">On-demand (starts when they join)</option>
          </select>
        </label>
        {mode === "jit" && (
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Every (minutes)
              <input type="number" min={5} value={interval} onChange={(e) => setInterval_(Number(e.target.value))}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Lead (minutes)
              <input type="number" min={0} value={lead} onChange={(e) => setLead(Number(e.target.value))}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" />
            </label>
          </div>
        )}
        {mode === "recurring" && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={days.includes(i)}
                    onChange={(e) =>
                      setDays((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Times (comma-separated, 24h)
              <input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="10:00, 14:00"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Timezone (IANA)
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Chicago"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" />
            </label>
          </>
        )}
        <button disabled={busy} className="rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-500 disabled:opacity-50">
          {busy ? "Creating…" : "Create webinar"}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
      <p className="text-sm text-zinc-500">You upload the video on the next screen.</p>
    </main>
  );
}
