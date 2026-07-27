import type { Sql } from "@platform/core";
import type { NotificationAdapter, NotificationPayload } from "./adapters";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Email links must be absolute — app join URLs are relative (/room/<token>). */
function absoluteUrl(joinUrl: string, origin: string): string {
  if (joinUrl.startsWith("http")) return joinUrl;
  return `${origin.replace(/\/$/, "")}${joinUrl}`;
}

function fmtWhen(startsAtMs: number | null): string {
  if (!startsAtMs) return "as soon as you join";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(startsAtMs));
}

const SUBJECTS: Record<string, (p: NotificationPayload) => string> = {
  confirm: (p) => `You're registered: ${p.webinarTitle}`,
  "reminder-24h": (p) => `Tomorrow: ${p.webinarTitle}`,
  "reminder-1h": (p) => `Starting in 1 hour: ${p.webinarTitle}`,
  "reminder-10m": (p) => `Starting in 10 minutes: ${p.webinarTitle}`,
  attended: (p) => `Thanks for joining: ${p.webinarTitle}`,
  "no-show": (p) => `You missed it: ${p.webinarTitle}`,
};

function html(p: NotificationPayload, kind: string, origin: string): string {
  const headline =
    kind === "confirm"
      ? "You're in."
      : kind === "reminder-24h"
        ? "It's tomorrow."
        : kind === "reminder-1h"
          ? "It starts in an hour."
          : kind === "reminder-10m"
            ? "It starts in 10 minutes."
            : kind === "attended"
              ? "Thanks for being there."
              : "We saved you the replay.";
  const joinUrl = absoluteUrl(p.joinUrl, origin);
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px">${esc(headline)}</h2>
  <p style="margin:0 0 8px;color:#444">${p.firstName ? `Hi ${esc(p.firstName)},` : "Hi,"}</p>
  <p style="margin:0 0 8px"><strong>${esc(p.webinarTitle)}</strong></p>
  <p style="margin:0 0 16px;color:#444">When: ${esc(fmtWhen(p.startsAtMs))}</p>
  <p style="margin:0 0 20px">
    <a href="${joinUrl}" style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Join the session</a>
  </p>
  <p style="font-size:12px;color:#888">If the button doesn't work, paste this link: <a href="${joinUrl}">${joinUrl}</a></p>
</div>`;
}

/** Resend adapter (resend.com HTTP API — no SMTP needed). Self-activates with keys. */
export const resendAdapter: NotificationAdapter = {
  name: "resend",
  async send(sql: Sql, payload: NotificationPayload) {
    const rows = await sql<{ key: string; value: string }[]>`
      select key, value from app_settings where key in ('RESEND_API_KEY', 'RESEND_FROM', 'PUBLIC_ORIGIN')
    `;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const apiKey = map.get("RESEND_API_KEY") ?? process.env.RESEND_API_KEY;
    const from = map.get("RESEND_FROM") ?? process.env.RESEND_FROM ?? "Webinars <live@onetimesuite.com>";
    const origin = map.get("PUBLIC_ORIGIN") ?? process.env.PUBLIC_ORIGIN ?? "https://webinar-clone.onetimesuite.com";
    if (!apiKey) return;

    const subject = (SUBJECTS[payload.kind] ?? SUBJECTS.confirm)(payload);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: payload.email,
        subject,
        html: html(payload, payload.kind, origin),
      }),
    });
    if (!res.ok) throw new Error(`resend failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  },
};
