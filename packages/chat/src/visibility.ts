export interface OffsetLine {
  offset_seconds: number;
}

/**
 * Lines visible at a given room offset: everything scheduled at or before
 * it (the backlog), capped to the most recent `cap` lines for rendering
 * (design: slice 2 — data stays complete in memory).
 */
export function visibleLines<T extends OffsetLine>(lines: T[], offsetSeconds: number, cap = 200): T[] {
  const vis = lines.filter((l) => l.offset_seconds <= offsetSeconds);
  return vis.length > cap ? vis.slice(vis.length - cap) : vis;
}
