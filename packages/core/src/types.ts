export interface WebinarRow {
  id: string;
  tenant_id: string | null;
  slug: string;
  title: string;
  subtitle: string | null;
  broadcast_mode: "evergreen" | "live" | "hybrid";
  video_url: string | null;
  video_r2_key: string | null;
  duration_seconds: number;
  thumbnail_url: string | null;
  schedule_mode: "jit" | "recurring" | "ondemand";
  jit_interval_minutes: number | null;
  jit_lead_minutes: number | null;
  recurring_days: number[] | null;
  recurring_times: string[] | null;
  timezone: string | null;
  show_attendee_count: boolean | null;
  allow_real_chat: boolean | null;
  chat_variance_pct: number | null;
  chat_jitter_seconds: number | null;
  replay_enabled: boolean | null;
  replay_window_hours: number | null;
  source_session_id: string | null;
  created_at: Date;
}

export interface SessionRow {
  id: string;
  webinar_id: string;
  starts_at: Date;
  seed: number;
  status: string | null;
  created_at: Date;
}

export interface RegistrantRow {
  id: string;
  webinar_id: string;
  session_id: string | null;
  email: string;
  first_name: string | null;
  phone: string | null;
  timezone: string | null;
  utm: unknown;
  access_token: string;
  registered_at: Date;
}

export type ChatRole = "admin" | "attendee";
export type ChatMode = "chat" | "question" | "answer" | "highlighted" | "tip";

export interface ChatScriptRow {
  offset_seconds: number;
  display_name: string;
  role: ChatRole;
  message: string;
  mode: ChatMode;
  sort_order: number | null;
}

/** camelCase chat line in the room payload contract. */
export interface ChatLine {
  offsetSeconds: number;
  displayName: string;
  role: ChatRole;
  message: string;
  mode: ChatMode;
  sortOrder: number | null;
}

export interface CurveConfig {
  peakCount: number;
  rampMinutes: number;
  plateauPct: number;
  endPct: number;
  jitterPct: number;
}

export const DEFAULT_CURVE_CONFIG: CurveConfig = {
  peakCount: 240,
  rampMinutes: 8,
  plateauPct: 0.55,
  endPct: 0.35,
  jitterPct: 0.03,
}

export interface OfferRow {
  id: string;
  webinar_id: string;
  name: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  button_text: string;
  button_url: string | null;
  stripe_price_id: string | null;
  start_offset_seconds: number;
  end_offset_seconds: number | null;
  urgency_enabled: boolean | null;
  urgency_seconds: number | null;
  scarcity_enabled: boolean | null;
  inventory_total: number | null;
  price_start_cents: number | null;
  price_increment_cents: number | null;
  price_cap_cents: number | null;
  units_sold: number | null;
  broadcast_sales: boolean | null;
}

export interface OfferPayload {
  id: string;
  name: string;
  headline: string;
  body: string | null;
  imageUrl: string | null;
  buttonText: string;
  buttonUrl: string | null;
  startOffsetSeconds: number;
  endOffsetSeconds: number | null;
  urgencyEnabled: boolean;
  urgencySeconds: number | null;
  scarcityEnabled: boolean;
  inventoryTotal: number | null;
  unitsSold: number;
  currentPriceCents: number | null;
  nextPriceCents: number | null;
  priceStartCents: number | null;
  priceIncrementCents: number | null;
  priceCapCents: number | null;
}

export interface RoomPayload {
  webinar: {
    title: string;
    durationSeconds: number;
    videoUrl: string | null;
    showAttendeeCount: boolean;
    allowRealChat: boolean;
    curve: CurveConfig;
  };
  session: { id: string; startsAtMs: number; seed: number };
  serverNowMs: number;
  registrant: { firstName: string | null };
  over: boolean;
  redirectUrl?: string;
  chat: ChatLine[];
  offers: OfferPayload[];
}
