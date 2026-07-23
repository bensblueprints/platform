import { Queue } from "bullmq";
import IORedis from "ioredis";

export const dynamic = "force-dynamic";

/** Dev-only: inspect the notification queue (e2e). */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!process.env.REDIS_URL) return Response.json({ jobs: [], note: "no redis" });

  const queue = new Queue("notifications", {
    connection: new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null }),
  });
  const [delayed, waiting, completed] = await Promise.all([
    queue.getDelayed(0, 100),
    queue.getWaiting(0, 100),
    queue.getCompleted(0, 100),
  ]);
  const summarize = (jobs: any[], state: string) =>
    jobs.map((j) => ({
      state,
      kind: j.name,
      registrantId: j.data?.registrantId,
      delayMs: j.opts?.delay ?? 0,
    }));
  const jobs = [
    ...summarize(delayed, "delayed"),
    ...summarize(waiting, "waiting"),
    ...summarize(completed, "completed"),
  ];
  await queue.close();
  return Response.json({ count: jobs.length, jobs });
}
