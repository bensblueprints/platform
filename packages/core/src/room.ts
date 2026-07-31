import type { Sql } from "./db";
import { applySessionVariance, resolveNameTokens } from "@platform/chat";
import { currentPriceCents, nextPriceCents } from "@platform/offers";
import { nextJitSlotMs } from "@platform/timeline";
import { materializeRecurringSessions } from "./schedule";
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
  w: Pick<
    WebinarRow,
    | "id"
    | "title"
    | "duration_seconds"
    | "video_url"
    | "show_attendee_count"
    | "allow_real_chat"
    | "waiting_headline"
    | "waiting_body"
    | "waiting_image_url"
    | "waiting_badges"
    | "fb_pixel_id"
  >,
  s: Pick<SessionRow, "id" | "starts_at" | "seed">,
  r: Pick<RegistrantRow, "first_name">,
  nowMs: number,
  chat: ChatLine[] = [],
  curve: CurveConfig = DEFAULT_CURVE_CONFIG,
  offers: OfferPayload[] = [],
  brandfetchId: string | null = null,
): RoomPayload {
  const startsAtMs = s.starts_at.getTime();
  const badges = (w.waiting_badges ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  const waitingRoom =
    w.waiting_headline || w.waiting_body || w.waiting_image_url || badges.length > 0
      ? {
          headline: w.waiting_headline,
          body: w.waiting_body,
          imageUrl: w.waiting_image_url,
          badges,
          brandfetchId,
        }
      : null;
  return {
    webinar: {
      id: w.id,
      title: w.title,
      durationSeconds: w.duration_seconds,
      videoUrl: w.video_url,
      showAttendeeCount: w.show_attendee_count ?? true,
      allowRealChat: w.allow_real_chat ?? true,
      fbPixelId: w.fb_pixel_id ?? null,
      curve,
      waitingRoom,
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
 * Finds or creates the registrant's watchable session (spec §10). JIT slots
 * are shared per (webinar_id, starts_at); on-demand sessions are per
 * registrant. A session that already ended is recycled into the next one, so
 * an old join link always lands in a live or upcoming room instead of a
 * redirect out of it.
 */
async function ensureSession(
  sql: Sql,
  reg: RegistrantRow,
  webinar: WebinarRow,
): Promise<SessionRow | null> {
  if (reg.session_id) {
    const rows = await sql<SessionRow[]>`
      select * from sessions where id = ${reg.session_id} limit 1
    `;
    const existing = rows[0];
    if (existing && Date.now() - existing.starts_at.getTime() < webinar.duration_seconds * 1000) {
      return existing;
    }
  }

  if (webinar.schedule_mode === "recurring") {
    let next = await sql<SessionRow[]>`
      select * from sessions where webinar_id = ${webinar.id} and starts_at >= now()
      order by starts_at asc limit 1
    `;
    if (!next[0]) {
      await materializeRecurringSessions(sql);
      next = await sql<SessionRow[]>`
        select * from sessions where webinar_id = ${webinar.id} and starts_at >= now()
        order by starts_at asc limit 1
      `;
    }
    if (!next[0]) return null;
    await sql`update registrants set session_id = ${next[0].id} where id = ${reg.id}`;
    return next[0];
  }

  const startsAtIso =
    webinar.schedule_mode === "jit"
      ? new Date(
          nextJitSlotMs(
            Date.now(),
            webinar.jit_interval_minutes ?? 15,
            webinar.jit_lead_minutes ?? 5,
          ),
        ).toISOString()
      : new Date().toISOString();

  // jit shares one row per slot; ondemand gets a fresh row per registrant.
  // The unique index on (webinar_id, starts_at) makes both race-safe.
  const created = await sql<SessionRow[]>`
    insert into sessions (webinar_id, starts_at, seed)
    values (${webinar.id}, ${startsAtIso}, floor(random() * 2147483647))
    on conflict (webinar_id, starts_at) do nothing
    returning *
  `;
  const session =
    created[0] ??
    (
      await sql<SessionRow[]>`
        select * from sessions where webinar_id = ${webinar.id} and starts_at = ${startsAtIso} limit 1
      `
    )[0];
  if (!session) return null;
  await sql`update registrants set session_id = ${session.id} where id = ${reg.id}`;
  return session;
}

/**
 * Resolves the registrant by access token and their session via
 * ensureSession. Returns null for unknown tokens.
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

  const session = await ensureSession(sql, reg, webinar);
  if (!session) return null;

  const chatRows = await sql<ChatScriptRow[]>`
    select offset_seconds, display_name, role, message, mode, sort_order
    from chat_scripts
    where webinar_id = ${webinar.id} and status = 'live'
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

  let brandfetchId: string | null = null;
  try {
    const bf = await sql<{ value: string }[]>`
      select value from app_settings where key = 'BRANDFETCH_CLIENT_ID' limit 1
    `;
    brandfetchId = bf[0]?.value ?? null;
  } catch {
    // app_settings is optional; badges fall back to text pills
  }

  return toRoomPayload(
    webinar,
    session,
    reg,
    Date.now(),
    chat,
    curve,
    offerRows.map(toOfferPayload),
    brandfetchId,
  );
}
