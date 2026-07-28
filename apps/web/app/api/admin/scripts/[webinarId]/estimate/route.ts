import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Rough blended $/1M tokens [input, output] by model substring (OpenRouter ballparks). */
const PRICING: [string, number, number][] = [
  ["llama-3.3-70b", 0.12, 0.3],
  ["gpt-4o-mini", 0.15, 0.6],
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
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { webinarId } = await params;

  const rows = await sql<
    { duration_seconds: number; chat_audience_size: number | null }[]
  >`select duration_seconds, chat_audience_size from webinars where id = ${webinarId}::uuid limit 1`;
  const w = rows[0];
  if (!w) return Response.json({ error: "not_found" }, { status: 404 });

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
  const tokens = beats * 5200 + 25000;

  const [, inPrice, outPrice] =
    PRICING.find(([substr]) => model.toLowerCase().includes(substr)) ?? ["", 0.5, 1.5];
  const cost = configured ? (tokens * (0.6 * inPrice + 0.4 * outPrice)) / 1e6 : 0;

  return Response.json({
    beats,
    audienceSize: w.chat_audience_size ?? 240,
    tokens,
    model: configured ? model : "mock (local test generator)",
    costLow: cost * 0.6,
    costHigh: cost * 1.5,
  });
}
