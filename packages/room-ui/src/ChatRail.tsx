"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatLine } from "@platform/core";
import { visibleLines } from "@platform/chat";

export interface RealMessage {
  id: string;
  author_type: "attendee" | "moderator";
  body: string;
  broadcast: boolean;
  created_at: string;
  first_name: string | null;
}

interface MergedLine {
  key: string;
  offset_seconds: number;
  displayName: string;
  role: "admin" | "attendee" | "you";
  mode: ChatLine["mode"] | "real";
  message: string;
}

/**
 * Seeded + real chat rail (spec §6.1: two paths, never merged server-side;
 * they compose here by visible-time). Seeded lines render by script offset;
 * real messages arrive over SSE and merge at their arrival offset.
 * Autoscrolls only while the viewer is at the bottom (§16.8).
 */
export default function ChatRail({
  lines,
  offsetSeconds,
  startsAtMs,
  realChat,
}: {
  lines: ChatLine[];
  offsetSeconds: number;
  startsAtMs: number;
  realChat?: { token: string; allowRealChat: boolean };
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [lastSeenCount, setLastSeenCount] = useState(0);
  const [realMessages, setRealMessages] = useState<RealMessage[]>([]);
  const seenIds = useRef(new Set<string>());
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState(false);

  // real chat stream
  useEffect(() => {
    if (!realChat?.allowRealChat) return;
    const es = new EventSource(`/api/chat/${realChat.token}/stream`);
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RealMessage;
        if (seenIds.current.has(msg.id)) return;
        seenIds.current.add(msg.id);
        setRealMessages((prev) => [...prev.slice(-199), msg]);
      } catch {
        // malformed frame
      }
    };
    return () => es.close();
  }, [realChat?.allowRealChat, realChat?.token]);

  const merged: MergedLine[] = [
    ...lines.map((l, i) => ({
      key: `s-${l.offsetSeconds}-${l.sortOrder ?? i}`,
      offset_seconds: l.offsetSeconds,
      displayName: l.displayName,
      role: l.role,
      mode: l.mode,
      message: l.message,
    })),
    ...realMessages.map((m) => ({
      key: `r-${m.id}`,
      offset_seconds: Math.max(0, Math.floor((new Date(m.created_at).getTime() - startsAtMs) / 1000)),
      displayName:
        m.author_type === "moderator" ? m.first_name ?? "Moderator" : m.first_name ?? "You",
      role: (m.author_type === "moderator" ? "admin" : "you") as "admin" | "you",
      mode: "real" as const,
      message: m.body,
    })),
  ].sort((a, b) => a.offset_seconds - b.offset_seconds);

  const vis = visibleLines(merged, offsetSeconds);

  useEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [vis.length]);

  useEffect(() => {
    if (atBottom) setLastSeenCount(vis.length);
  }, [atBottom, vis.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) setLastSeenCount(vis.length);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
    setLastSeenCount(vis.length);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !realChat) return;
    setDraft("");
    setSendError(false);
    const res = await fetch(`/api/chat/${realChat.token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) setSendError(true);
  }

  const newCount = vis.length - lastSeenCount;

  return (
    <section aria-label="Live chat" className="relative flex h-[420px] flex-col rounded-lg bg-zinc-900 md:h-full">
      <header className="border-b border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300">
        Live chat
      </header>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-2"
        data-testid="chat-scroll"
        aria-live="polite"
      >
        {vis.length === 0 && <p className="text-sm text-zinc-500">The conversation appears here.</p>}
        {vis.map((l) => (
          <ChatRow key={l.key} line={l} />
        ))}
      </div>
      {!atBottom && newCount > 0 && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-xs font-medium shadow-lg"
        >
          {newCount} new message{newCount === 1 ? "" : "s"}
        </button>
      )}
      {realChat?.allowRealChat && (
        <form
          className="flex gap-2 border-t border-zinc-800 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something…"
            maxLength={500}
            aria-label="Send a chat message"
            className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded bg-red-600 px-3 py-2 text-sm font-medium disabled:opacity-40"
          >
            Send
          </button>
          {sendError && <span className="self-center text-xs text-red-300">failed</span>}
        </form>
      )}
    </section>
  );
}

function ChatRow({ line }: { line: MergedLine }) {
  const highlighted = line.mode === "highlighted" || line.mode === "tip";
  if (line.role === "admin") {
    return (
      <div
        data-role="admin"
        data-mode={line.mode}
        className={
          highlighted
            ? "border-l-2 border-amber-400 bg-amber-400/10 px-2 py-1.5"
            : "rounded bg-sky-950/60 px-2 py-1.5"
        }
      >
        <span className="mr-2 text-xs font-semibold text-sky-300">{line.displayName}</span>
        {highlighted && (
          <span className="mr-2 rounded bg-amber-400/20 px-1 text-[10px] uppercase text-amber-300">Pinned</span>
        )}
        <span className="text-sm text-zinc-100">{line.message}</span>
      </div>
    );
  }
  if (line.role === "you") {
    return (
      <div data-role="you" data-mode="real" className="rounded bg-red-950/50 px-2 py-1">
        <span className="mr-2 text-xs font-semibold text-red-300">{line.displayName}</span>
        <span className="text-sm text-zinc-100">{line.message}</span>
      </div>
    );
  }
  return (
    <div data-role="attendee" data-mode={line.mode} className="px-2 py-0.5">
      <span className="mr-2 text-xs font-medium text-zinc-400">{line.displayName}</span>
      {line.mode === "question" && (
        <span className="mr-1 rounded bg-zinc-700 px-1 text-[10px] uppercase text-zinc-300">Q</span>
      )}
      <span className="text-sm text-zinc-200">{line.message}</span>
    </div>
  );
}
