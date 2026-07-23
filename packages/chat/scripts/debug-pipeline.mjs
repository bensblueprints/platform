import postgres from "postgres";
import { createMockClient } from "../src/inference.ts";
import { runGenerationPipeline } from "../src/pipeline.ts";

const sql = postgres(process.env.DATABASE_URL);
const r = await runGenerationPipeline(sql, createMockClient(), {
  webinarId: "debug-webinar", videoUrl: "https://example.com/debug.mp4", durationSeconds: 180, useMockBeats: true,
});
console.log("lines:", r.lines.length, "| failures:", JSON.stringify(r.failures));
for (const l of r.lines) console.log(`${l.offsetSeconds}s [${l.beat}] ${l.persona} (${l.role}/${l.mode}): ${l.text}`);
await sql.end();
