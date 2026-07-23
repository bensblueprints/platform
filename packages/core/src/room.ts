import type { Sql } from "./db";
import type {
  ChatLine,
  ChatScriptRow,
  RegistrantRow,
  RoomPayload,
  SessionRow,
  WebinarRow,
} from "./types";

export function toChatLine(row: ChatScriptRow): ChatLine {
  return {
    offsetSeconds: row.offset_seconds,
    displayName: row.display_name,
    role: row.role,
    message: row.message,
    mode: row.mode,
    sortOrder: row.sort_order,
  };
}

export function toRoomPayload(
  w: Pick<WebinarRow, "title" | "duration_seconds" | "video_url" | "show_attendee_count" | "allow_real_chat">,
  s: Pick<SessionRow, "id" | "starts_at" | "seed">,
  r: Pick<RegistrantRow, "first_name">,
  nowMs: number,
  chat: ChatScriptRow[] = [],
): RoomPayload {
  const startsAtMs = s.starts_at.getTime();
  return {
    webinar: {
      title: w.title,
      durationSeconds: w.duration_seconds,
      videoUrl: w.video_url,
      showAttendeeCount: w.show_attendee_count ?? true,
      allowRealChat: w.allow_real_chat ?? true,
    },
    session: { id: s.id, startsAtMs, seed: s.seed },
    serverNowMs: nowMs,
    registrant: { firstName: r.first_name },
    over: nowMs - startsAtMs >= w.duration_seconds * 1000,
    chat: chat.map(toChatLine),
  };
}

/**
 * Resolves the registrant by access token and their session. On-demand
 * webinars create the session lazily on first room hit (spec §10); the
 * conditional update makes that creation race-safe.
 * Returns null for unknown tokens.
 */
export async function getRoomPayload(sql: Sql, token: string): Promise<RoomPayload | null> {
  const regs = await sql<RegistrantRow[]>`
    select * from registrants where access_token = ${token} limit 1
  `;
  const reg = regs[0];
  if (!reg) return null;

  const ws = await sql<WebinarRow[]>`
    select * from webinars where id = ${reg.webinar_id} limit 1
  `;
  const webinar = ws[0];
  if (!webinar) return null;

  let sessionId = reg.session_id;
  if (!sessionId) {
    const created = await sql<{ id: string }[]>`
      insert into sessions (webinar_id, starts_at, seed)
      values (${reg.webinar_id}, now(), floor(random() * 2147483647))
      returning id
    `;
    const updated = await sql`
      update registrants set session_id = ${created[0].id}
      where id = ${reg.id} and session_id is null
    `;
    if (updated.count === 0) {
      const again = await sql<RegistrantRow[]>`
        select * from registrants where id = ${reg.id} limit 1
      `;
      sessionId = again[0]?.session_id ?? null;
    } else {
      sessionId = created[0].id;
    }
  }
  if (!sessionId) return null;

  const sessions = await sql<SessionRow[]>`
    select * from sessions where id = ${sessionId} limit 1
  `;
  const session = sessions[0];
  if (!session) return null;

  const chatRows = await sql<ChatScriptRow[]>`
    select offset_seconds, display_name, role, message, mode, sort_order
    from chat_scripts
    where webinar_id = ${webinar.id}
    order by offset_seconds asc, sort_order asc
  `;

  return toRoomPayload(webinar, session, reg, Date.now(), chatRows);
}
