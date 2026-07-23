import postgres from "postgres";
import { createMockClient } from "../src/inference.ts";
import { runGenerationPipeline } from "../src/pipeline.ts";

const sql = postgres(process.env.DATABASE_URL);
const inf = createMockClient();
for (let i = 0; i < 10; i++) {
  const id = "loop-webinar-" + i;
  const full = await runGenerationPipeline(sql, inf, {
    webinarId: id, videoUrl: "https://example.com/v" + i + ".mp4", durationSeconds: 180, useMockBeats: true,
  });
  const kept = full.lines.filter((l) => l.beat !== "offer").map((l) => ({ ...l, beat: undefined }));
  const regen = await runGenerationPipeline(sql, inf, {
    webinarId: id, videoUrl: "https://example.com/v" + i + ".mp4", durationSeconds: 180,
    useMockBeats: true, onlyBeatType: "offer", existingLines: kept, existingRoster: full.roster,
  });
  console.log(i,
    "full:", full.lines.length, full.failures.map(f=>f.rule).join(",") || "ok",
    "| regen:", regen.lines.length, regen.failures.map(f=>`${f.rule}:${f.detail}`).join("; ") || "ok");
}
await sql.end();
