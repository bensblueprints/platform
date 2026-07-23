import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { cleanupDeadSessions, createDb, materializeRecurringSessions } from "@platform/core";
import { activeAdapters, resolvePostSessionKind, type NotificationPayload } from "@platform/notifications";

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

console.log("[workers] up — materialize every 15m, cleanup daily");
