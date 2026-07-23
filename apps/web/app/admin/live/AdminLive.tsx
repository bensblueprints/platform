"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

interface InboxMessage {
  id: string;
  session_id: string;
  registrant_id: string | null;
  author_type: "attendee" | "moderator";
  body: string;
  broadcast: boolean;
  created_at: string;
  first_name: string | null;
  email: string | null;
  attendeeOffsetSeconds: number | null;
}

function fmtOffset(sec: number | null): string {
  if (sec == null) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export default function AdminLive() {
  const key = useSearchParams().get("key") ?? "";
  const [webinars, setWebinars] = useState<{ id: string; slug: string; title: string }[]>([]);
  const [webinarId, setWebinarId] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const seen = useRef(new Set<string>());
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    void fetch("/api/admin/webinars", { headers: { "x-admin-key": key } })
      .then((r) => r.json())
      .then((j) => {
        setWebinars(j.webinars ?? []);
        if (j.webinars?.[0]) setWebinarId(j.webinars[0].id);
      })
      .catch(() => setError("load failed"));
  }, [key]);

  useEffect(() => {
    if (!key || !webinarId) return;
    const es = new EventSource(`/api/admin/chat/stream?key=${encodeURIComponent(key)}&webinar_id=${webinarId}`);
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as InboxMessage;
        if (seen.current.has(msg.id)) return;
        seen.current.add(msg.id);
        setInbox((prev) => [...prev.slice(-299), msg]);
      } catch {}
    };
    return () => es.close();
  }, [key, webinarId]);

  async function send(broadcast: boolean) {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const res = await fetch("/api/admin/chat/reply", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": key },
      body: JSON.stringify({
        webinarId,
        registrantId: broadcast ? undefined : replyTo?.registrant_id,
        sessionId: broadcast ? undefined : replyTo?.session_id,
        body,
        broadcast,
      }),
    });
    if (!res.ok) setError(await res.text());
    if (res.ok) setReplyTo(null);
  }

  if (!key) return <main className="p-8 text-sm text-zinc-400">Append ?key=… to use the console.</main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Live console</h1>
        <select
          value={webinarId ?? ""}
          onChange={(e) => setWebinarId(e.target.value)}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm"
          data-testid="webinar-picker"
        >
          {webinars.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title}
            </option>
          ))}
        </select>
      </header>

      <section className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-zinc-900 p-3" data-testid="mod-inbox">
        {inbox.length === 0 && <p className="text-sm text-zinc-500">No messages yet.</p>}
        {inbox.map((m) => (
          <div key={m.id} data-author={m.author_type} data-broadcast={String(m.broadcast)} className="rounded bg-zinc-800/70 px-3 py-2">
            <div className="flex items-baseline gap-3 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">
                {m.author_type === "moderator" ? "You (mod)" : m.first_name ?? m.email ?? "attendee"}
              </span>
              <span>joined {fmtOffset(m.attendeeOffsetSeconds)}</span>
              {m.broadcast && <span className="rounded bg-amber-400/20 px-1 text-amber-300">broadcast</span>}
              {m.author_type === "attendee" && (
                <button onClick={() => setReplyTo(m)} className="ml-auto text-sky-300 hover:underline" data-testid={`reply-${m.id}`}>
                  reply privately
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-100">{m.body}</p>
          </div>
        ))}
      </section>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(!!replyTo ? false : true);
        }}
      >
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-zinc-400" data-testid="replying-to">
            Replying privately to {replyTo.first_name ?? replyTo.email}
            <button type="button" onClick={() => setReplyTo(null)} className="text-red-300">
              cancel
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={replyTo ? "Private reply…" : "Broadcast to all sessions…"}
            maxLength={500}
            className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-white"
          />
          <button type="submit" className="rounded bg-red-600 px-4 py-2 text-sm font-medium">
            {replyTo ? "Send privately" : "Broadcast"}
          </button>
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </form>
    </main>
  );
}
