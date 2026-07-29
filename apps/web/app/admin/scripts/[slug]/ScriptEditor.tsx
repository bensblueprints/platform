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
    if (!res.ok) {
      setNotice(res.status === 404 ? "not authorized — sign out and back in" : `load failed (${res.status})`);
      return;
    }
    const j = await res.json();
    setDraft(j.draft ?? []);
    setLive(j.live ?? []);
    setRoster(j.roster ?? []);
    setJob(j.lastJob ?? null);
  }, [webinarId, adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const [estimate, setEstimate] = useState<{
    beats: number;
    lines?: number;
    tokens: number;
    transcriptCached?: boolean;
    transcriptSegments?: number;
    model: string;
    costLow: number;
    costHigh: number;
    audienceSize: number;
  } | null>(null);
  const [audience, setAudience] = useState<number | null>(null);

  const loadEstimate = useCallback(async () => {
    const res = await fetch(`/api/admin/scripts/${webinarId}/estimate`, {
      headers: { "x-admin-key": adminKey },
    });
    if (!res.ok) return;
    const j = await res.json();
    setEstimate(j);
    setAudience(j.audienceSize);
  }, [webinarId, adminKey]);

  useEffect(() => {
    void loadEstimate();
  }, [loadEstimate]);

  async function transcribe() {
    setNotice("transcribing…");
    const res = await fetch("/api/admin/transcribe", {
      method: "POST",
      headers,
      body: JSON.stringify({ webinarId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(j.error ?? "failed");
      return;
    }
    const poll = setInterval(async () => {
      const s = await fetch(`/api/admin/generate/${j.jobId}`, { headers: { "x-admin-key": adminKey } }).then(
        (r) => r.json(),
      );
      if (!s.status) {
        clearInterval(poll);
        setNotice("status check failed — reload the page");
        return;
      }
      setNotice(`transcribe: ${s.status}`);
      if (s.status === "done" || s.status === "failed") {
        clearInterval(poll);
        setNotice(
          s.status === "done"
            ? "transcript ready — now generate the script"
            : `transcribe failed: ${String(s.error).slice(0, 200)}`,
        );
        void loadEstimate();
      }
    }, 3000);
  }

  async function saveAudience() {
    if (audience == null) return;
    await fetch(`/api/admin/webinars/${webinarId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ chatAudienceSize: audience }),
    });
    void loadEstimate();
  }

  // live view while a generation is running: refresh the draft every 5s
  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [job?.status, load]);

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<{ start: number; end: number; text: string }[] | null>(
    null,
  );
  const [promptCopied, setPromptCopied] = useState(false);

  async function toggleTranscript() {
    if (!showTranscript && !transcript) {
      const res = await fetch(`/api/admin/scripts/${webinarId}/transcript`, {
        headers: { "x-admin-key": adminKey },
      });
      if (res.ok) setTranscript((await res.json()).segments);
    }
    setShowTranscript((s) => !s);
  }

  const LLM_PROMPT = `You are writing the seeded live-chat script for a recorded webinar that plays as a "live" session. I will paste the transcript with [mm:ss] timestamps.

Write a realistic audience chat log keyed to what the presenter actually says at each moment.

Rules:
- Output CSV only, one line per chat message, columns: Hour,Minute,Second,Name,Role,Message,Mode
- Hour 0-7, Minute 0-59, Second 0-59 — the moment each message appears (the transcript moment it reacts to, plus 3-10 seconds)
- Role is "Attendee" or "Admin". The admin's name is "Sarah (Support)".
- Attendee modes: "chat" or "question". Admin modes: "answer", "highlighted", "tip".
- Every attendee question gets an Admin "answer" about 10 seconds later with a specific, correct answer from the transcript.
- Cluster lines in bursts of 2-4 right after moments that land — never evenly spaced. Busy at the start (greetings, cities), peak during the offer/pricing section.
- 20+ different attendee names with mixed typing styles (lowercase, typos, occasional emoji).
- No one posts more than ~8% of the lines, and the same person never posts twice within 45 seconds.
- NEVER write earnings, income, or results claims in attendee messages. Attendees react, ask logistics questions, and talk pricing only.
- Never reference anything that is not in the transcript — no invented features, numbers, or names.
- When the presenter asks the audience to type something in the chat, many attendees actually type it.
- Quote any message containing commas in double quotes.

The webinar is ${Math.round(durationSeconds / 60)} minutes long and the room should feel like about ${audience ?? 5000} people are watching. Here is the transcript:

[paste transcript here]
`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(LLM_PROMPT).catch(() => {});
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

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
      if (!s.status) {
        clearInterval(poll);
        setNotice("status check failed — reload the page");
        return;
      }
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
      if (!s.status) {
        clearInterval(poll);
        setNotice("status check failed — reload the page");
        return;
      }
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
          Generate chat script
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          step 1: transcribe the video → step 2: generate the chat script → review and publish
        </span>
        <span className="flex items-center gap-2">
          {estimate?.transcriptCached ? (
            <span className="text-emerald-300">
              transcript ready ({estimate.transcriptSegments} segments)
            </span>
          ) : (
            <span className="text-amber-300">no transcript yet</span>
          )}
          <button onClick={transcribe} className="rounded border border-zinc-600 px-2 py-0.5" data-testid="transcribe-btn">
            {estimate?.transcriptCached ? "Re-transcribe" : "Transcribe video"}
          </button>
        </span>
        {estimate && (
          <span data-testid="gen-estimate">
            Estimated run: ~{estimate.beats} beats · ~{estimate.lines ?? "—"} lines · ~
            {Math.round(estimate.tokens / 1000)}k tokens
            {estimate.costHigh > 0
              ? ` · ≈ $${estimate.costLow.toFixed(2)}–$${estimate.costHigh.toFixed(2)}`
              : ""}{" "}
            on {estimate.model}
          </span>
        )}
        {audience != null && (
          <label className="flex items-center gap-1">
            chat participants
            <input
              type="number"
              min={10}
              max={5000}
              value={audience}
              onChange={(e) => setAudience(Number(e.target.value))}
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-white"
            />
            <button onClick={saveAudience} className="rounded border border-zinc-600 px-2 py-0.5">
              save
            </button>
          </label>
        )}
        {job?.status === "failed" && job.error != null && (
          <span className="text-red-300" data-testid="last-failure">
            last run failed: {String(job.error).slice(0, 300)}
          </span>
        )}
        {job?.status === "done" &&
          Array.isArray((job.usage as any)?.warnings) &&
          (job.usage as any).warnings.length > 0 && (
            <span className="text-amber-300" data-testid="last-warnings">
              last run finished with {(job.usage as any).warnings.length} warnings — review flagged
              lines before publishing
            </span>
          )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <button onClick={toggleTranscript} className="rounded border border-zinc-600 px-2 py-0.5">
          {showTranscript ? "Hide transcript" : "View transcript"}
        </button>
        <a
          href={`/api/admin/scripts/${webinarId}/transcript?download=1&key=${adminKey}`}
          className="rounded border border-zinc-600 px-2 py-0.5"
        >
          Download transcript (.txt)
        </a>
        <button onClick={copyPrompt} className="rounded border border-zinc-600 px-2 py-0.5">
          {promptCopied ? "Copied!" : "Copy LLM prompt"}
        </button>
        <span>
          paste transcript + prompt into any LLM, then import the CSV it gives you (manage page →
          Import chat)
        </span>
        {job?.status === "running" && (
          <span className="text-emerald-300" data-testid="live-writing">
            writing lines live below…
          </span>
        )}
      </div>
      {showTranscript && transcript && (
        <section
          className="max-h-64 overflow-y-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-300"
          data-testid="transcript-panel"
        >
          {transcript.map((s, i) => (
            <p key={i}>
              [{fmt(s.start)}] {s.text}
            </p>
          ))}
        </section>
      )}

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
