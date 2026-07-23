"use client";

import { useCallback, useEffect, useState } from "react";

interface ScriptLine {
  id: string;
  offset_seconds: number;
  display_name: string;
  role: "admin" | "attendee";
  message: string;
  mode: string;
  source: string;
  status: string;
}
interface RosterEntry {
  id: string;
  display_name: string;
  persona: { archetype?: string } | null;
}
interface Job {
  id: string;
  status: string;
  error: string | null;
  usage: { beats?: { type: string; start: number; end: number }[] } | null;
}

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export default function ScriptEditor({
  webinarId,
  title,
  durationSeconds,
  adminKey,
}: {
  webinarId: string;
  title: string;
  durationSeconds: number;
  adminKey: string;
}) {
  const [draft, setDraft] = useState<ScriptLine[]>([]);
  const [live, setLive] = useState<ScriptLine[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const headers = { "x-admin-key": adminKey, "content-type": "application/json" };

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/scripts/${webinarId}`, { headers: { "x-admin-key": adminKey } });
    const j = await res.json();
    setDraft(j.draft);
    setLive(j.live);
    setRoster(j.roster);
    setJob(j.lastJob);
  }, [webinarId, adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setNotice("queued…");
    const res = await fetch("/api/admin/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ webinarId }),
    });
    const j = await res.json();
    if (!res.ok) {
      setNotice(j.error ?? "failed");
      return;
    }
    const jobId = j.jobId;
    const poll = setInterval(async () => {
      const s = await fetch(`/api/admin/generate/${jobId}`, { headers: { "x-admin-key": adminKey } }).then((r) =>
        r.json(),
      );
      setNotice(`job ${s.status}${s.stage ? ` (${s.stage})` : ""}`);
      if (s.status === "done" || s.status === "failed") {
        clearInterval(poll);
        setNotice(s.status === "done" ? "generation complete" : `failed: ${String(s.error).slice(0, 200)}`);
        void load();
      }
    }, 3000);
  }

  async function saveLine(id: string, patch: Partial<{ offsetSeconds: number; displayName: string; message: string }>) {
    await fetch(`/api/admin/scripts/${webinarId}/line`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ id, ...patch }),
    });
    void load();
  }

  async function regenBeat(beatType: string) {
    setNotice(`regenerating ${beatType}…`);
    const res = await fetch("/api/admin/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ webinarId, mode: "regen-beat", beatType }),
    });
    const j = await res.json();
    if (!res.ok) {
      setNotice(j.error ?? "failed");
      return;
    }
    const poll = setInterval(async () => {
      const s = await fetch(`/api/admin/generate/${j.jobId}`, { headers: { "x-admin-key": adminKey } }).then((r) =>
        r.json(),
      );
      if (s.status === "done" || s.status === "failed") {
        clearInterval(poll);
        setNotice(s.status === "done" ? `${beatType} regenerated` : `failed: ${String(s.error).slice(0, 200)}`);
        void load();
      }
    }, 2500);
  }

  async function publish() {
    const res = await fetch(`/api/admin/scripts/${webinarId}/publish`, { method: "POST", headers });
    const j = await res.json();
    setNotice(`published ${j.published} lines`);
    void load();
  }

  // density heatmap: lines per minute across the duration
  const minutes = Math.ceil(durationSeconds / 60);
  const perMinute = Array.from({ length: minutes }, (_, i) =>
    draft.filter((l) => l.offset_seconds >= i * 60 && l.offset_seconds < (i + 1) * 60).length,
  );
  const maxPerMin = Math.max(...perMinute, 1);
  const beats = job?.usage?.beats ?? [];

  const liveTexts = new Set(live.map((l) => l.message));
  const newLines = draft.filter((l) => !liveTexts.has(l.message));
  const removedLines = live.filter((l) => !draft.some((d) => d.message === l.message));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{title} — script editor</h1>
        <button onClick={generate} className="rounded bg-red-600 px-4 py-2 text-sm font-medium" data-testid="generate-btn">
          Generate script
        </button>
        <button
          onClick={publish}
          disabled={draft.length === 0}
          className="rounded border border-amber-400 px-4 py-2 text-sm text-amber-300 disabled:opacity-40"
          data-testid="publish-btn"
        >
          Publish draft ({draft.length})
        </button>
        <a
          href={`/api/admin/scripts/${webinarId}/csv?key=${adminKey}`}
          className="rounded border border-zinc-600 px-4 py-2 text-sm"
        >
          Download CSV
        </a>
        <button onClick={() => setShowDiff((s) => !s)} className="rounded border border-zinc-600 px-4 py-2 text-sm">
          {showDiff ? "Hide diff" : `Diff vs live (+${newLines.length} / -${removedLines.length})`}
        </button>
        {notice && <span className="text-sm text-zinc-400" data-testid="job-notice">{notice}</span>}
      </header>

      {/* density heatmap */}
      <div className="flex h-6 w-full gap-px overflow-hidden rounded" data-testid="density-strip" title="Lines per minute">
        {perMinute.map((n, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ background: `rgba(248,113,113,${0.08 + (n / maxPerMin) * 0.7})` }}
            title={`${i}min: ${n} lines`}
          />
        ))}
      </div>

      {showDiff && (
        <section className="grid gap-3 rounded-lg bg-zinc-900 p-3 text-sm md:grid-cols-2" data-testid="diff-view">
          <div>
            <p className="mb-1 font-medium text-emerald-300">New in draft ({newLines.length})</p>
            {newLines.slice(0, 30).map((l) => (
              <p key={l.id} className="truncate text-zinc-300">+ {l.message}</p>
            ))}
          </div>
          <div>
            <p className="mb-1 font-medium text-red-300">Removed from live ({removedLines.length})</p>
            {removedLines.slice(0, 30).map((l) => (
              <p key={l.id} className="truncate text-zinc-400">- {l.message}</p>
            ))}
          </div>
        </section>
      )}

      {draft.length === 0 && (
        <p className="rounded bg-zinc-900 p-6 text-center text-sm text-zinc-500">
          No draft yet — generate a script to start editing. Nothing goes live until you publish.
        </p>
      )}

      {beats.length === 0 && draft.length > 0 && (
        <section className="rounded-lg bg-zinc-900 p-3" data-beat="all">
          <header className="mb-2 text-xs text-zinc-500">{draft.length} draft lines</header>
        </section>
      )}
      {beats.map((b) => {
        const beatLines = draft.filter((l) => l.offset_seconds >= b.start && l.offset_seconds <= b.end);
        if (beatLines.length === 0) return null;
        return (
          <section key={b.type} className="rounded-lg bg-zinc-900 p-3" data-beat={b.type}>
            <header className="mb-2 flex items-center gap-3">
              <span className="rounded bg-sky-900/60 px-2 py-0.5 text-xs font-medium text-sky-300">{b.type}</span>
              <span className="text-xs text-zinc-500">
                {fmt(b.start)}–{fmt(b.end)} · {beatLines.length} lines
              </span>
              <button onClick={() => regenBeat(b.type)} className="ml-auto text-xs text-sky-300 hover:underline" data-testid={`regen-${b.type}`}>
                regenerate beat
              </button>
            </header>
            <div className="space-y-1">
              {beatLines.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm" data-line-id={l.id} data-source={l.source}>
                  <input
                    defaultValue={fmt(l.offset_seconds)}
                    onBlur={(e) => {
                      const [mm, ss] = e.target.value.split(":").map(Number);
                      if (!isNaN(mm) && !isNaN(ss)) void saveLine(l.id, { offsetSeconds: mm * 60 + ss });
                    }}
                    className="w-12 rounded bg-zinc-800 px-1 text-center font-mono text-xs"
                    aria-label="time"
                  />
                  <select
                    defaultValue={l.display_name}
                    onChange={(e) => void saveLine(l.id, { displayName: e.target.value })}
                    className="w-32 rounded bg-zinc-800 px-1 py-0.5 text-xs"
                    aria-label="persona"
                  >
                    <option value={l.display_name}>{l.display_name}</option>
                    {roster.map((r) => (
                      <option key={r.id} value={r.display_name}>
                        {r.display_name}
                      </option>
                    ))}
                  </select>
                  <span className="w-14 text-[10px] uppercase text-zinc-500">{l.mode}</span>
                  <input
                    defaultValue={l.message}
                    onBlur={(e) => {
                      if (e.target.value !== l.message) void saveLine(l.id, { message: e.target.value });
                    }}
                    className="flex-1 rounded bg-zinc-800 px-2 py-0.5"
                    aria-label="message"
                  />
                  {l.source === "hand" && <span className="text-[10px] text-amber-300">edited</span>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
