import { closeSync, openSync, readSync, statSync } from "node:fs";

/** Duration from the MP4 mvhd box (scans head + tail 2 MB). */
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
