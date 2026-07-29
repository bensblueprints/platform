import { getSharedDb } from "@platform/core";
import { sha256 } from "@platform/chat";
import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Rough blended $/1M tokens [input, output] by model substring (OpenRouter ballparks). */
const PRICING: [string, number, number][] = [
  ["llama-3.3-70b", 0.12, 0.3],
  ["gpt-4o-mini", 0.15, 0.6],
  ["gemini-2.5-flash", 0.3, 2.5],
  ["gemini-2.0-flash", 0.1, 0.4],
  ["claude-3.5-haiku", 0.8, 4.0],
  ["mistral-small", 0.1, 0.3],
  ["qwen-2.5-72b", 0.12, 0.39],
];

/**
 * Pre-generation cost estimate (spec §7.8): beats from duration, ~5.2k
 * tokens per beat call (prompt + completion + retry overhead), plus roster
 * and beat classification. Rough on purpose — actuals land in
 * generation_jobs.usage.
 */
export async function GET(req: Request, { params }: { params: Promise<{ webinarId: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { webinarId } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, webinarId))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await sql<
    { duration_seconds: number; chat_audience_size: number | null; video_url: string | null }[]
  >`select duration_seconds, chat_audience_size, video_url from webinars where id = ${webinarId}::uuid limit 1`;
  const w = rows[0];
  if (!w) return Response.json({ error: "not_found" }, { status: 404 });

  let transcriptSegments = 0;
  if (w.video_url) {
    const t = await sql<{ transcript: unknown }[]>`
      select transcript from transcript_cache where video_hash = ${sha256(w.video_url)} limit 1
    `;
    const tr = t[0]?.transcript;
    transcriptSegments = Array.isArray(tr) ? tr.length : 0;
  }

  const settings = await sql<{ key: string; value: string }[]>`
    select key, value from app_settings where key in ('INFERENCE_MODEL', 'INFERENCE_API_KEY', 'INFERENCE_BASE_URL')
  `;
  const map = new Map(settings.map((s) => [s.key, s.value]));
  const model =
    map.get("INFERENCE_MODEL") ?? process.env.INFERENCE_MODEL ?? "mock (local test generator)";
  const configured =
    !!(map.get("INFERENCE_API_KEY") ?? process.env.INFERENCE_API_KEY) &&
    !!(map.get("INFERENCE_BASE_URL") ?? process.env.INFERENCE_BASE_URL);

  const beats = Math.max(6, Math.ceil(w.duration_seconds / 120));
  // same audience scaling the pipeline applies (§7.3/§7.4)
  const audience = w.chat_audience_size ?? 240;
  const scale = Math.min(6, Math.max(0.25, audience / 240));
  // ~2.7 lines/min averaged across beat types, scaled to the crowd
  const lines = Math.round((w.duration_seconds / 60) * 2.7 * scale);
  // beats classification + per-beat calls (~2.6k each with retries) + ~45
  // tokens per written line + roster/merge overhead
  const tokens = Math.round(beats * 2600 + lines * 45 + 20000);

  const [, inPrice, outPrice] =
    PRICING.find(([substr]) => model.toLowerCase().includes(substr)) ?? ["", 0.5, 1.5];
  const cost = configured ? (tokens * (0.6 * inPrice + 0.4 * outPrice)) / 1e6 : 0;

  return Response.json({
    beats,
    audienceSize: w.chat_audience_size ?? 240,
    lines,
    tokens,
    transcriptCached: transcriptSegments > 0,
    transcriptSegments,
    model: configured ? model : "mock (local test generator)",
    costLow: cost * 0.6,
    costHigh: cost * 1.5,
  });
}
