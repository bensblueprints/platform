import postgres from "postgres";
import { createMockClient } from "../src/inference.ts";
import { runGenerationPipeline } from "../src/pipeline.ts";

const sql = postgres(process.env.DATABASE_URL);
const r = await runGenerationPipeline(sql, createMockClient(), {
  webinarId: "loop-webinar-7", videoUrl: "https://example.com/v7.mp4", durationSeconds: 180, useMockBeats: true,
});
const organic = r.lines.filter(l => !(l.role==='admin' && l.mode==='answer'));
console.log("total:", r.lines.length, "organic:", organic.length, "failures:", JSON.stringify(r.failures));
for (const l of r.lines) console.log(`${l.offsetSeconds}s [${l.beat}] ${l.persona} (${l.role}/${l.mode})`);
await sql.end();
