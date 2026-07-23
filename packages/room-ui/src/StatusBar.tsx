"use client";

import type { AttendanceCurve } from "@platform/timeline";
import { AttendeeCount } from "./AttendeeCount";

/**
 * Compact room status bar (spec §13): live indicator, session title, and
 * the animated attendee count as one unit.
 */
export function StatusBar({
  title,
  showCount,
  offsetSeconds,
  durationSeconds,
  curve,
  seed,
}: {
  title: string;
  showCount: boolean;
  offsetSeconds: number;
  durationSeconds: number;
  curve: AttendanceCurve;
  seed: number;
}) {
  return (
    <header className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-label="Live" />
      <h1 className="truncate text-lg font-medium">{title}</h1>
      <span className="ml-auto">
        {showCount && (
          <AttendeeCount
            offsetSeconds={offsetSeconds}
            durationSeconds={durationSeconds}
            curve={curve}
            seed={seed}
          />
        )}
      </span>
    </header>
  );
}
