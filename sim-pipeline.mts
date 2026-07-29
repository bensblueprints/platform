// Local diagnostic: run the pipeline with the mock against the real cached
// transcript/beats and print per-stage line counts.
import { createDb } from "@platform/core";
import { createMockClient, runGenerationPipeline } from "@platform/chat";

const WID = "fc024793-2dd9-4d05-9d70-8079e57123c8";
const sql = createDb();

const result = await runGenerationPipeline(sql as any, createMockClient(), {
  webinarId: WID,
  videoUrl: `/api/media/${WID}`,
  durationSeconds: 1146,
  useMockBeats: false,
  audienceSize: 5000,
  transcribeFn: async () => [],
  onStage: (stage, info) => console.log("STAGE", stage, JSON.stringify(info ?? {})),
});
console.log("FINAL lines:", result.lines.length, "failures:", JSON.stringify(result.failures).slice(0, 300));
await (sql as any).end();
