import postgres from "postgres";
import { createMockClient } from "../src/inference.ts";
import { runGenerationPipeline } from "../src/pipeline.ts";

const sql = postgres(process.env.DATABASE_URL);
const inf = createMockClient();
const full = await runGenerationPipeline(sql, inf, {
  webinarId: "debug-webinar-2", videoUrl: "https://example.com/debug2.mp4", durationSeconds: 180, useMockBeats: true,
});
console.log("full:", full.lines.length, "lines, failures:", full.failures.length);
const kept = full.lines.filter((l) => l.beat !== "offer").map((l) => ({ ...l, beat: undefined }));
const regen = await runGenerationPipeline(sql, inf, {
  webinarId: "debug-webinar-2", videoUrl: "https://example.com/debug2.mp4", durationSeconds: 180,
  useMockBeats: true, onlyBeatType: "offer", existingLines: kept, existingRoster: full.roster,
});
console.log("regen:", regen.lines.length, "lines");
console.log("regen failures:", JSON.stringify(regen.failures, null, 1));
await sql.end();
