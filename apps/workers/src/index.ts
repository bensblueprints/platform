import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { cleanupDeadSessions, createDb, materializeRecurringSessions } from "@platform/core";
import { activeAdapters, resolvePostSessionKind, type NotificationPayload } from "@platform/notifications";
import { createInferenceFromEnv, runGenerationPipeline } from "@platform/chat";

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
    }
  },
  { connection },
);

worker.on("failed", (job, err) => console.error(`[worker] job ${job?.name} failed:`, err.message));

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
    const genSql = createDb();
    await genSql`update generation_jobs set status = 'running', stage = 'transcribe', updated_at = now() where id = ${jobId}`;
    try {
      const ws = await genSql<any[]>`
        select id, video_url, duration_seconds from webinars where id = ${webinarId}::uuid limit 1
      `;
      const w = ws[0];
      if (!w?.video_url) throw new Error("webinar has no video_url");

      const inference = createInferenceFromEnv();
      const mockBeats = (process.env.INFERENCE_BASE_URL ?? "mock") === "mock";

      let result;
      if (mode === "regen-beat" && beatType) {
        // §7.7: regenerate one beat; other beats' lines (incl. hand edits) untouched
        const draftRows = await genSql<any[]>`
          select offset_seconds, display_name, role, message, mode
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
          beat: undefined as any, // beat tag unknown for existing rows; filter below uses offsets
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
        });

        if (result.failures.length > 0) {
          await genSql`
            update generation_jobs set status = 'failed', error = ${JSON.stringify(result.failures)},
              usage = ${JSON.stringify(result.usage)}::jsonb, updated_at = now() where id = ${jobId}
          `;
          return;
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
            usage = ${JSON.stringify({ ...result.usage, regenBeat: beatType })}::jsonb, updated_at = now()
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
      });

      if (result.failures.length > 0) {
        await genSql`
          update generation_jobs set status = 'failed', error = ${JSON.stringify(result.failures)},
            usage = ${JSON.stringify(result.usage)}::jsonb, updated_at = now() where id = ${jobId}
        `;
        console.warn(`[generate] ${jobId} failed validation:`, JSON.stringify(result.failures).slice(0, 300));
        return;
      }

      await genSql`delete from name_roster where webinar_id = ${webinarId}`;
      for (const p of result.roster) {
        await genSql`
          insert into name_roster (webinar_id, display_name, persona)
          values (${webinarId}, ${p.name}, ${JSON.stringify(p)}::jsonb)
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
          usage = ${JSON.stringify({ ...result.usage, beats: result.beats })}::jsonb, updated_at = now()
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
