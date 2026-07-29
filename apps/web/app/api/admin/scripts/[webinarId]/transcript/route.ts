import { getSharedDb } from "@platform/core";
import { sha256 } from "@platform/chat";
import { isAdminAuthorized } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

function fmtTs(sec: number): string {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** The webinar's cached transcript: JSON segments, or a timestamped .txt
 * download for feeding into any external LLM (§7.2 stage 1 as a product). */
export async function GET(req: Request, { params }: { params: Promise<{ webinarId: string }> }) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { webinarId } = await params;

  const rows = await sql<{ video_url: string | null }[]>`
    select video_url from webinars where id = ${webinarId}::uuid limit 1
  `;
  const w = rows[0];
  if (!w?.video_url) return Response.json({ error: "no_video" }, { status: 404 });

  const t = await sql<{ transcript: { start: number; end: number; text: string }[] | string }[]>`
    select transcript from transcript_cache where video_hash = ${sha256(w.video_url)} limit 1
  `;
  let segments = t[0]?.transcript;
  if (typeof segments === "string") segments = JSON.parse(segments);
  if (!segments) return Response.json({ error: "not_transcribed" }, { status: 404 });

  if (new URL(req.url).searchParams.get("download")) {
    const body = (segments as { start: number; text: string }[])
      .map((s) => `[${fmtTs(s.start)}] ${s.text}`)
      .join("\n");
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": 'attachment; filename="transcript.txt"',
      },
    });
  }
  return Response.json({ segments });
}
