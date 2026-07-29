import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync } from "node:fs";
import { mp4DurationSeconds } from "./video-storage.js";
import { cleanupDeadSessions, createDb, getSetting, materializeRecurringSessions } from "@platform/core";
import { activeAdapters, resolvePostSessionKind, type NotificationPayload } from "@platform/notifications";
import { createInferenceFromSettings, runGenerationPipeline, sha256 } from "@platform/chat";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is not set");

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const sql = createDb();

const queue = new Queue("scheduling", { connection });

// Repeatable jobs (spec §10 recurring, §16.7 cleanup)
await queue.upsertJobScheduler(
  "materialize-recurring",
  { every: 15 * 60_000 },
  { name: "materialize-recurring" },
);
await queue.upsertJobScheduler(
  "cleanup-sessions",
  { every: 24 * 3600_000 },
  { name: "cleanup-sessions" },
);

const worker = new Worker(
  "scheduling",
  async (job) => {
    if (job.name === "materialize-recurring") {
      const res = await materializeRecurringSessions(sql);
      console.log(`[materialize] created=${res.created}`);
    } else if (job.name === "cleanup-sessions") {
      const res = await cleanupDeadSessions(sql);
      console.log(`[cleanup] deleted=${res.deleted}`);
    } else if (job.name === "youtube-import") {
      const { webinarId, url } = job.data as { webinarId: string; url: string };
      await importYoutube(sql, webinarId, url);
      console.log(`[youtube] imported ${webinarId}`);
    }
  },
  { connection },
);

const execFileP = promisify(execFile);

/** yt-dlp a YouTube video into the shared video volume, then wire the webinar. */
async function importYoutube(sql: ReturnType<typeof createDb>, webinarId: string, url: string) {
  const out = `/data/videos/${webinarId}.mp4`;
  const rows = await sql<{ value: string }[]>`
    select value from app_settings where key = 'YOUTUBE_COOKIES' limit 1
  `;
  const cookies = rows[0]?.value;
  const args = [
    "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
    "--no-playlist",
    // datacenter IPs trip YouTube's bot check; alternate player clients bypass it cookie-free
    "--extractor-args", "youtube:player_client=android,web_embedded,ios",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-o", out,
  ];
  let cookiePath: string | null = null;
  if (cookies) {
    cookiePath = `/tmp/yt-cookies-${webinarId}.txt`;
    writeFileSync(cookiePath, cookies);
    args.push("--cookies", cookiePath);
  }
  args.push(url);
  try {
    await execFileP("yt-dlp", args, { timeout: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  } finally {
    if (cookiePath) unlinkSync(cookiePath);
  }
  const duration = mp4DurationSeconds(out);
  await sql`
    update webinars set video_url = ${"/api/media/" + webinarId}
    ${duration ? sql`, duration_seconds = ${duration}` : sql``}
    where id = ${webinarId}
  `;
}

worker.on("failed", (job, err) => console.error(`[worker] job ${job?.name} failed:`, err.message));

/**
 * Lazy transcription (§7.8 cache-first), shared by the standalone transcribe
 * job and the generation pipeline's stage 1. Transcription APIs cap ~25MB —
 * big videos get voice-compressed to 16kHz mono mp3 chunks (150s ≈ 1MB)
 * stitched with time offsets.
 */
function makeTranscribeFn(
  inference: Awaited<ReturnType<typeof createInferenceFromSettings>>,
  genSql: ReturnType<typeof createDb>,
  webinarId: string,
  videoUrl: string,
) {
  return async () => {
    if (!videoUrl.startsWith("/api/media/")) {
      return inference.transcribe(videoUrl);
    }
    const origin = (await getSetting(genSql, "PUBLIC_ORIGIN")) ?? "https://webinar-clone.onetimesuite.com";
    const abs = origin.replace(/\/$/, "") + videoUrl;
    const head = await fetch(abs, { method: "HEAD" });
    const size = Number(head.headers.get("content-length") ?? 0);
    console.log(`[generate] media pre-check: ${abs} size=${size}`);
    if (size <= 18 * 1024 * 1024) {
      return inference.transcribe(abs);
    }
    console.log(`[generate] compressing ${size} bytes to voice mp3 chunks`);
    const raw = await (await fetch(abs)).blob();
    writeFileSync(`/tmp/${webinarId}.mp4`, Buffer.from(await raw.arrayBuffer()));
    await execFileP("ffmpeg", [
      "-y", "-i", `/tmp/${webinarId}.mp4`,
      "-vn", "-ac", "1", "-ar", "16000", "-b:a", "24k",
      "-f", "segment", "-segment_time", "150", "-reset_timestamps", "1",
      `/tmp/${webinarId}-%03d.mp3`,
    ], { timeout: 5 * 60_000 });
    const { readdirSync, readFileSync } = await import("node:fs");
    const chunks = readdirSync("/tmp")
      .filter((f) => f.startsWith(`${webinarId}-`) && f.endsWith(".mp3"))
      .sort();
    console.log(`[generate] transcribing ${chunks.length} chunks`);
    const all: { start: number; end: number; text: string }[] = [];
    for (const [i, c] of chunks.entries()) {
      const blob = new Blob([readFileSync(`/tmp/${c}`)], { type: "audio/mpeg" });
      const segs = await inference.transcribeBlob(blob, c);
      for (const seg of segs) all.push({ start: seg.start + i * 150, end: seg.end + i * 150, text: seg.text });
    }
    return all;
  };
}

// Notification reminders (spec §11): confirm, 24h/1h/10m, attended/no-show
const notifWorker = new Worker(
  "notifications",
  async (job) => {
    const payload = job.data as NotificationPayload & { kind?: string };
    let kind = payload.kind ?? job.name;
    if (job.name === "post-session") {
      const rows = await sql<{ c: number }[]>`
        select count(*)::int as c from attendances where registrant_id = ${payload.registrantId}
      `;
      kind = resolvePostSessionKind(rows[0].c);
    }
    for (const adapter of activeAdapters()) {
      await adapter.send(sql, { ...payload, kind });
    }
    console.log(`[notify] ${kind} -> ${payload.email}`);
  },
  { connection },
);

notifWorker.on("failed", (job, err) => console.error(`[notify] job ${job?.name} failed:`, err.message));

// Script generation pipeline (spec §7.2): 7-stage BullMQ job
const genWorker = new Worker(
  "generation",
  async (job) => {
    const { jobId, webinarId, mode, beatType } = job.data as {
      jobId: string;
      webinarId: string;
      mode?: "full" | "regen-beat";
      beatType?: string | null;
    };

    // Standalone transcribe job (step 1 of the two-step generation flow):
    // fills transcript_cache, nothing else.
    if (job.name === "transcribe") {
      const genSql = createDb();
      await genSql`update generation_jobs set status = 'running', stage = 'transcribe', updated_at = now() where id = ${jobId}`;
      try {
        const ws = await genSql<any[]>`
          select id, video_url from webinars where id = ${webinarId}::uuid limit 1
        `;
        const w = ws[0];
        if (!w?.video_url) throw new Error("webinar has no video_url");
        const inference = await createInferenceFromSettings((k) => getSetting(genSql, k));
        const videoHash = sha256(w.video_url);
        const cached = await genSql<any[]>`
          select transcript from transcript_cache where video_hash = ${videoHash} limit 1
        `;
        let count: number;
        if (cached[0]) {
          const t = cached[0].transcript;
          count = (Array.isArray(t) ? t : JSON.parse(t)).length;
          console.log(`[transcribe] ${jobId} cache hit: ${count} segments`);
        } else {
          const segments = await makeTranscribeFn(inference, genSql, webinarId, w.video_url)();
          count = segments.length;
          await genSql`
            insert into transcript_cache (video_hash, transcript) values (${videoHash}, ${genSql.json(segments)})
            on conflict (video_hash) do nothing
          `;
          console.log(`[transcribe] ${jobId} transcribed: ${count} segments`);
        }
        await genSql`
          update generation_jobs set status = 'done', stage = 'emit',
            usage = ${genSql.json({ kind: "transcribe", segments: count })}, updated_at = now()
          where id = ${jobId}
        `;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await genSql`update generation_jobs set status = 'failed', error = ${msg}, updated_at = now() where id = ${jobId}`;
        throw err;
      }
      return;
    }

    const genSql = createDb();
    await genSql`update generation_jobs set status = 'running', stage = 'transcribe', updated_at = now() where id = ${jobId}`;
    try {
      const ws = await genSql<any[]>`
        select id, video_url, duration_seconds, chat_audience_size from webinars where id = ${webinarId}::uuid limit 1
      `;
      const w = ws[0];
      if (!w?.video_url) throw new Error("webinar has no video_url");

      const inference = await createInferenceFromSettings((k) => getSetting(genSql, k));
      const mockBeats = ((await getSetting(genSql, "INFERENCE_BASE_URL")) ?? "mock") === "mock";

      const transcribeFn = makeTranscribeFn(inference, genSql, webinarId, w.video_url);

      const onStage = (stage: string) => {
        void genSql`update generation_jobs set stage = ${stage}, updated_at = now() where id = ${jobId}`.catch(
          () => {},
        );
      };

      let result;
      if (mode === "regen-beat" && beatType) {
        // §7.7: regenerate one beat; other beats' lines (incl. hand edits) untouched
        const draftRows = await genSql<any[]>`
          select offset_seconds, display_name, role, message, mode, source
          from chat_scripts where webinar_id = ${webinarId} and status = 'draft'
          order by offset_seconds asc
        `;
        const rosterRows = await genSql<{ persona: any }[]>`
          select persona from name_roster where webinar_id = ${webinarId}
        `;
        const draftLines = draftRows.map((r) => ({
          offsetSeconds: r.offset_seconds,
          persona: r.display_name,
          role: r.role,
          mode: r.mode,
          text: r.message,
          beat: undefined as any, // beat tag recovered by offset range in the pipeline
          hand: r.source === 'hand',
        }));
        // pipeline only regenerates `onlyBeatType`; kept lines are the others.
        // Beat membership for existing rows is recovered by offset range after beats load.
        result = await runGenerationPipeline(genSql as any, inference, {
          webinarId,
          videoUrl: w.video_url,
          durationSeconds: w.duration_seconds,
          useMockBeats: mockBeats,
          onlyBeatType: beatType as any,
          existingLines: draftLines.filter((l) => l.beat !== beatType),
          existingRoster: rosterRows.length ? rosterRows.map((r) => r.persona) : undefined,
          onStage,
        });

        if (result.failures.length > 0) {
          // Warnings, not death — the draft still lands and the reviewer sees
          // the flags (FTC claims are stripped inside the pipeline).
          console.warn(`[generate] regen ${jobId} warnings:`, JSON.stringify(result.failures).slice(0, 400));
        }

        const beatRanges = result.beats
          .filter((b) => b.type === beatType)
          .map((b) => [b.start, b.end] as const);
        await genSql`
          delete from chat_scripts
          where webinar_id = ${webinarId} and status = 'draft'
            and offset_seconds >= ${beatRanges[0]?.[0] ?? 0}
            and offset_seconds <= ${beatRanges[0]?.[1] ?? 2147483647}
        `;
        const newLines = result.lines.filter(
          (l) => l.offsetSeconds >= (beatRanges[0]?.[0] ?? 0) && l.offsetSeconds <= (beatRanges[0]?.[1] ?? 2147483647),
        );
        for (const l of newLines) {
          await genSql`
            insert into chat_scripts (webinar_id, offset_seconds, display_name, role, message, mode, sort_order, source, status)
            values (${webinarId}, ${l.offsetSeconds}, ${l.persona}, ${l.role}, ${l.text}, ${l.mode}, ${l.offsetSeconds}, 'generated', 'draft')
          `;
        }
        await genSql`
          update generation_jobs set status = 'done',
            usage = ${genSql.json({ ...result.usage, regenBeat: beatType, warnings: result.failures })}, updated_at = now()
          where id = ${jobId}
        `;
        console.log(`[generate] ${jobId} regen-beat ${beatType}: ${newLines.length} lines`);
        return;
      }

      result = await runGenerationPipeline(genSql as any, inference, {
        webinarId,
        videoUrl: w.video_url,
        durationSeconds: w.duration_seconds,
        useMockBeats: mockBeats,
        audienceSize: w.chat_audience_size ?? 240,
        transcribeFn,
        onStage,
        onBeatLines: (_bt, ls) => {
          // stream raw lines into the draft so the editor shows them as
          // they're written; the emit step replaces them with the final
          // validated set
          void (async () => {
            for (const l of ls) {
              await genSql`
                insert into chat_scripts (webinar_id, offset_seconds, display_name, role, message, mode, sort_order, source, status)
                values (${webinarId}, ${l.offsetSeconds}, ${l.persona}, ${l.role}, ${l.text}, ${l.mode}, ${l.offsetSeconds}, 'generated', 'draft')
              `;
            }
          })().catch(() => {});
        },
      });

      if (result.lines.length === 0) {
        await genSql`
          update generation_jobs set status = 'failed', error = 'no lines generated',
            usage = ${genSql.json(result.usage)}, updated_at = now() where id = ${jobId}
        `;
        return;
      }
      if (result.failures.length > 0) {
        // Draft anyway — §7.7 makes the editor the review step, and FTC
        // claims are already stripped inside the pipeline. Remaining gates
        // (density, grounding, pairing) become reviewer warnings.
        console.warn(`[generate] ${jobId} warnings:`, JSON.stringify(result.failures).slice(0, 300));
      }

      await genSql`delete from name_roster where webinar_id = ${webinarId}`;
      for (const p of result.roster) {
        await genSql`
          insert into name_roster (webinar_id, display_name, persona)
          values (${webinarId}, ${p.name}, ${genSql.json(p)})
        `;
      }
      await genSql`delete from chat_scripts where webinar_id = ${webinarId} and status = 'draft'`;
      let sort = 0;
      for (const l of result.lines) {
        await genSql`
          insert into chat_scripts (webinar_id, offset_seconds, display_name, role, message, mode, sort_order, source, status)
          values (${webinarId}, ${l.offsetSeconds}, ${l.persona}, ${l.role}, ${l.text}, ${l.mode}, ${sort++}, 'generated', 'draft')
        `;
      }
      await genSql`
        update generation_jobs set status = 'done',
          usage = ${genSql.json({ ...result.usage, beats: result.beats, warnings: result.failures })}, updated_at = now()
        where id = ${jobId}
      `;
      console.log(`[generate] ${jobId} done: ${result.lines.length} lines, ${result.beats.length} beats`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await genSql`update generation_jobs set status = 'failed', error = ${msg}, updated_at = now() where id = ${jobId}`;
      throw err;
    }
  },
  { connection },
);

genWorker.on("failed", (job, err) => console.error(`[generate] job ${job?.id} failed:`, err.message));

console.log("[workers] up — materialize every 15m, cleanup daily");
