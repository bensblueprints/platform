import type { Sql } from "./db";
import { applySessionVariance, resolveNameTokens } from "@platform/chat";
import { currentPriceCents, nextPriceCents } from "@platform/offers";
import {
  DEFAULT_CURVE_CONFIG,
  type ChatLine,
  type ChatScriptRow,
  type CurveConfig,
  type OfferPayload,
  type OfferRow,
  type RegistrantRow,
  type RoomPayload,
  type SessionRow,
  type WebinarRow,
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

export function toOfferPayload(row: OfferRow): OfferPayload {
  const ladder = {
    priceStartCents: row.price_start_cents,
    priceIncrementCents: row.price_increment_cents,
    priceCapCents: row.price_cap_cents,
  };
  const unitsSold = row.units_sold ?? 0;
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    body: row.body,
    imageUrl: row.image_url,
    buttonText: row.button_text,
    buttonUrl: row.button_url,
    startOffsetSeconds: row.start_offset_seconds,
    endOffsetSeconds: row.end_offset_seconds,
    urgencyEnabled: row.urgency_enabled ?? false,
    urgencySeconds: row.urgency_seconds,
    scarcityEnabled: row.scarcity_enabled ?? false,
    inventoryTotal: row.inventory_total,
    unitsSold,
    currentPriceCents: row.price_start_cents == null ? null : currentPriceCents(ladder, unitsSold),
    nextPriceCents: row.price_start_cents == null ? null : nextPriceCents(ladder, unitsSold),
    priceStartCents: row.price_start_cents,
    priceIncrementCents: row.price_increment_cents,
    priceCapCents: row.price_cap_cents,
  };
}

export function toRoomPayload(
  w: Pick<WebinarRow, "title" | "duration_seconds" | "video_url" | "show_attendee_count" | "allow_real_chat">,
  s: Pick<SessionRow, "id" | "starts_at" | "seed">,
  r: Pick<RegistrantRow, "first_name">,
  nowMs: number,
  chat: ChatLine[] = [],
  curve: CurveConfig = DEFAULT_CURVE_CONFIG,
  offers: OfferPayload[] = [],
): RoomPayload {
  const startsAtMs = s.starts_at.getTime();
  return {
    webinar: {
      title: w.title,
      durationSeconds: w.duration_seconds,
      videoUrl: w.video_url,
      showAttendeeCount: w.show_attendee_count ?? true,
      allowRealChat: w.allow_real_chat ?? true,
      curve,
    },
    session: { id: s.id, startsAtMs, seed: s.seed },
    serverNowMs: nowMs,
    registrant: { firstName: r.first_name },
    over: nowMs - startsAtMs >= w.duration_seconds * 1000,
    chat,
    offers,
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

  const rosterRows = await sql<{ display_name: string }[]>`
    select display_name from name_roster where webinar_id = ${webinar.id}
  `;

  // Phase 3: deterministic per-session transform (spec §6.2, §6.3) —
  // drop + jitter, then {{name}} substitution over the surviving lines.
  const varied = applySessionVariance(chatRows.map(toChatLine), {
    seed: session.seed,
    variancePct: webinar.chat_variance_pct == null ? null : Number(webinar.chat_variance_pct),
    jitterSeconds: webinar.chat_jitter_seconds,
  });
  const chat = resolveNameTokens(
    varied,
    rosterRows.map((r) => r.display_name),
    session.seed,
  );

  const curveRows = await sql<
    {
      peak_count: number;
      ramp_minutes: number;
      plateau_pct: string;
      end_pct: string;
      jitter_pct: string;
    }[]
  >`
    select peak_count, ramp_minutes, plateau_pct, end_pct, jitter_pct
    from attendance_curves where webinar_id = ${webinar.id} limit 1
  `;
  const curve: CurveConfig = curveRows[0]
    ? {
        peakCount: curveRows[0].peak_count,
        rampMinutes: curveRows[0].ramp_minutes,
        plateauPct: Number(curveRows[0].plateau_pct),
        endPct: Number(curveRows[0].end_pct),
        jitterPct: Number(curveRows[0].jitter_pct),
      }
    : DEFAULT_CURVE_CONFIG;

  const offerRows = await sql<OfferRow[]>`
    select * from offers where webinar_id = ${webinar.id} order by created_at asc
  `;

  return toRoomPayload(webinar, session, reg, Date.now(), chat, curve, offerRows.map(toOfferPayload));
}
