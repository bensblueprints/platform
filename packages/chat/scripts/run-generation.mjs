import postgres from "postgres";
import { createInferenceFromSettings, runGenerationPipeline } from "../src/index.ts";

const sql = postgres(process.env.DATABASE_URL);
const webinarId = "fc024793-2dd9-4d05-9d70-8079e57123c8";

const getSetting = async (k) => {
  const r = await sql`select value from app_settings where key = ${k} limit 1`;
  return r[0]?.value ?? null;
};

const inference = await createInferenceFromSettings(getSetting);
const w = (await sql`select id, video_url, duration_seconds, chat_audience_size from webinars where id = ${webinarId}`)[0];
console.log("webinar:", w.video_url, w.duration_seconds + "s, audience", w.chat_audience_size);

// local transcription path: chunked from the uploaded file (same as worker)
const origin = (await getSetting("PUBLIC_ORIGIN")) ?? "https://webinar-clone.onetimesuite.com";

const result = await runGenerationPipeline(sql, inference, {
  webinarId,
  videoUrl: w.video_url, // same key the worker cached under
  durationSeconds: w.duration_seconds,
  audienceSize: w.chat_audience_size ?? 240,
});

console.log("lines:", result.lines.length, "beats:", result.beats.map(b=>`${b.type}@${b.start}-${b.end}`).join(" "));
console.log("roster:", result.roster.length, "personas");
console.log("failures:", JSON.stringify(result.failures));

if (result.failures.length === 0) {
  await sql`delete from name_roster where webinar_id = ${webinarId}`;
  for (const p of result.roster) {
    await sql`insert into name_roster (webinar_id, display_name, persona) values (${webinarId}, ${p.name}, ${JSON.stringify(p)}::jsonb)`;
  }
  await sql`delete from chat_scripts where webinar_id = ${webinarId} and status = 'draft'`;
  let sort = 0;
  for (const l of result.lines) {
    await sql`insert into chat_scripts (webinar_id, offset_seconds, display_name, role, message, mode, sort_order, source, status)
      values (${webinarId}, ${l.offsetSeconds}, ${l.persona}, ${l.role}, ${l.text}, ${l.mode}, ${sort++}, 'generated', 'draft')`;
  }
  console.log("draft written:", result.lines.length, "lines,", result.roster.length, "roster names");
}
await sql.end();
