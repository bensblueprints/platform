import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DIR = process.env.VIDEO_STORAGE_DIR ?? "/data/videos";

export function videoPath(webinarId: string): string {
  return path.join(DIR, `${webinarId}.mp4`);
}

export function videoExists(webinarId: string): boolean {
  return existsSync(videoPath(webinarId));
}

export function videoSize(webinarId: string): number | null {
  const p = videoPath(webinarId);
  return existsSync(p) ? statSync(p).size : null;
}

export async function saveVideo(webinarId: string, body: ReadableStream): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const nodeStream = Readable.fromWeb(body as any);
  await pipeline(nodeStream, createWriteStream(videoPath(webinarId)));
}

/**
 * Duration from the MP4 mvhd box (scans head + tail 2 MB — moov can live at
 * either end). Returns seconds, or null when the box isn't found.
 */
export function mp4DurationSeconds(filePath: string): number | null {
  const size = statSync(filePath).size;
  const readWindow = (start: number, len: number) => {
    const buf = Buffer.alloc(len);
    const fd = openSync(filePath, "r");
    try {
      readSync(fd, buf, 0, len, start);
    } finally {
      closeSync(fd);
    }
    return buf;
  };
  const head = readWindow(0, Math.min(size, 2 * 1024 * 1024));
  const tail = size > 2 * 1024 * 1024 ? readWindow(size - 2 * 1024 * 1024, 2 * 1024 * 1024) : null;

  for (const buf of tail ? [head, tail] : [head]) {
    let idx = buf.indexOf("mvhd", 0, "ascii");
    while (idx !== -1) {
      const version = buf[idx + 4];
      if (version === 0) {
        const timescale = buf.readUInt32BE(idx + 16);
        const duration = buf.readUInt32BE(idx + 20);
        if (timescale > 0) return Math.round(duration / timescale);
      } else if (version === 1) {
        const timescale = buf.readUInt32BE(idx + 24);
        const duration = Number(buf.readBigUInt64BE(idx + 28));
        if (timescale > 0) return Math.round(duration / timescale);
      }
      idx = buf.indexOf("mvhd", idx + 4, "ascii");
    }
  }
  return null;
}

/** Open a range-limited read stream for the media route. */
export function videoStream(webinarId: string, start?: number, end?: number) {
  return createReadStream(videoPath(webinarId), { start, end });
}

const IMAGE_EXTS = ["jpg", "png", "webp", "gif"] as const;

export function waitingImagePath(webinarId: string, ext: string): string {
  return path.join(DIR, `${webinarId}-waiting.${ext}`);
}

export function findWaitingImage(webinarId: string): { path: string; ext: string } | null {
  for (const ext of IMAGE_EXTS) {
    const p = waitingImagePath(webinarId, ext);
    if (existsSync(p)) return { path: p, ext };
  }
  return null;
}

/** Save the waiting-room image, replacing any previous one (any extension). */
export async function saveWaitingImage(webinarId: string, ext: string, body: ReadableStream): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  deleteWaitingImage(webinarId);
  const nodeStream = Readable.fromWeb(body as any);
  await pipeline(nodeStream, createWriteStream(waitingImagePath(webinarId, ext)));
}

export function deleteWaitingImage(webinarId: string): void {
  for (const ext of IMAGE_EXTS) {
    const p = waitingImagePath(webinarId, ext);
    if (existsSync(p)) unlinkSync(p);
  }
}

const BADGE_EXTS = ["svg", "png", "jpg", "webp", "gif"] as const;

export function badgeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findBadgeImage(webinarId: string, name: string): { path: string; ext: string } | null {
  const slug = badgeSlug(name);
  for (const ext of BADGE_EXTS) {
    const p = path.join(DIR, `${webinarId}-badge-${slug}.${ext}`);
    if (existsSync(p)) return { path: p, ext };
  }
  return null;
}

/** Save a press-badge logo (replaces any existing file for that badge). */
export async function saveBadgeImage(webinarId: string, name: string, ext: string, body: ReadableStream): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const slug = badgeSlug(name);
  for (const e of BADGE_EXTS) {
    const p = path.join(DIR, `${webinarId}-badge-${slug}.${e}`);
    if (existsSync(p)) unlinkSync(p);
  }
  const nodeStream = Readable.fromWeb(body as any);
  await pipeline(nodeStream, createWriteStream(path.join(DIR, `${webinarId}-badge-${slug}.${ext}`)));
}
