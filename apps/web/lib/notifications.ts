import { Queue } from "bullmq";
import IORedis from "ioredis";
import { planReminderJobs } from "@platform/notifications";

let queue: Queue | null = null;

function getQueue(): Queue | null {
  if (!process.env.REDIS_URL) return null;
  if (!queue) {
    queue = new Queue("notifications", {
      connection: new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null }),
    });
  }
  return queue;
}

/**
 * Enqueue the reminder sequence for a registration (spec §11): confirm now,
 * reminders at 24h/1h/10m before start when still in the future, and the
 * post-session attended/no-show branch.
 */
export async function scheduleRegistrationNotifications(opts: {
  registrantId: string;
  email: string;
  firstName: string | null;
  webinarTitle: string;
  startsAtMs: number | null;
  durationSeconds: number;
  joinUrl: string;
}): Promise<{ scheduled: number }> {
  const q = getQueue();
  if (!q) return { scheduled: 0 };

  const jobs = planReminderJobs({
    startsAtMs: opts.startsAtMs,
    durationSeconds: opts.durationSeconds,
    nowMs: Date.now(),
  });

  let scheduled = 0;
  for (const j of jobs) {
    try {
      await q.add(
        j.kind,
        {
          registrantId: opts.registrantId,
          email: opts.email,
          firstName: opts.firstName,
          webinarTitle: opts.webinarTitle,
          startsAtMs: opts.startsAtMs,
          joinUrl: opts.joinUrl,
        },
        {
          delay: Math.max(0, j.runAtMs - Date.now()),
          jobId: `${opts.registrantId}|${j.kind}`, // BullMQ forbids ':' in job ids
        },
      );
      scheduled++;
    } catch (err) {
      console.error(`[notify] failed to enqueue ${j.kind}:`, (err as Error).message);
    }
  }
  return { scheduled };
}
