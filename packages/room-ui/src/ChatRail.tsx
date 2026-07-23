"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatLine } from "@platform/core";
import { visibleLines } from "@platform/chat";

/**
 * Seeded chat rail (spec §6.1, §13). Backlog renders immediately; forward
 * lines appear as the wall-clock offset passes them — a filter on a 1s
 * tick, which is immune to background-tab timer throttling (§16.2).
 * Autoscrolls only while the viewer is at the bottom (§16.8).
 */
export default function ChatRail({ lines, offsetSeconds }: { lines: ChatLine[]; offsetSeconds: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [lastSeenCount, setLastSeenCount] = useState(0);

  const vis = visibleLines(
    lines.map((l) => ({ ...l, offset_seconds: l.offsetSeconds })),
    offsetSeconds,
  );

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
        {vis.map((l, i) => (
          <ChatRow key={`${l.offset_seconds}-${l.sort_order ?? i}`} line={l} />
        ))}
      </div>
      {!atBottom && newCount > 0 && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-xs font-medium shadow-lg"
        >
          {newCount} new message{newCount === 1 ? "" : "s"}
        </button>
      )}
    </section>
  );
}

function ChatRow({ line }: { line: ChatLine & { offset_seconds: number } }) {
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
        {highlighted && <span className="mr-2 rounded bg-amber-400/20 px-1 text-[10px] uppercase text-amber-300">Pinned</span>}
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
