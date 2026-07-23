export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ nowMs: Date.now() }, { headers: { "cache-control": "no-store" } });
}
