"use client";

import { useEffect, useState } from "react";

interface SettingRow {
  key: string;
  set: boolean;
  value: string | null;
  source: "settings" | "env" | null;
}

const SECTIONS: { title: string; note: string; keys: { key: string; label: string; placeholder: string; suggestions?: string[] }[] }[] = [
  {
    title: "AI script generation",
    note: "Any OpenAI-compatible endpoint — for OpenRouter use https://openrouter.ai/api as the base URL and paste your sk-or-v1-… key. Leave blank to keep the mock generator.",
    keys: [
      { key: "INFERENCE_BASE_URL", label: "Base URL", placeholder: "https://openrouter.ai/api" },
      { key: "INFERENCE_API_KEY", label: "API key", placeholder: "sk-or-v1-… (OpenRouter) or any OpenAI-compatible key" },
      {
        key: "INFERENCE_MODEL",
        label: "Generation model",
        placeholder: "meta-llama/llama-3.3-70b-instruct",
        suggestions: [
          "meta-llama/llama-3.3-70b-instruct",
          "openai/gpt-4o-mini",
          "google/gemini-2.0-flash-001",
          "anthropic/claude-3.5-haiku",
          "mistralai/mistral-small-3.1-24b-instruct",
          "qwen/qwen-2.5-72b-instruct",
        ],
      },
      { key: "TRANSCRIBE_MODEL", label: "Transcription model (optional)", placeholder: "whisper-1" },
    ],
  },
  {
    title: "GoHighLevel (reminder notifications)",
    note: "Registrants are upserted as contacts with webinar tags so GHL runs the reminder sequence.",
    keys: [
      { key: "GHL_API_KEY", label: "API key", placeholder: "GHL private integration key" },
      { key: "GHL_LOCATION_ID", label: "Location ID", placeholder: "sub-account location id" },
    ],
  },
  {
    title: "Resend (reminder emails)",
    note: "Emails from resend.com. Confirm + reminders (24h/1h/10m) and attended/no-show follow-ups are sent automatically.",
    keys: [
      { key: "RESEND_API_KEY", label: "API key", placeholder: "re_…" },
      { key: "RESEND_FROM", label: "From address", placeholder: "Webinars <live@yourdomain.com>" },
      { key: "PUBLIC_ORIGIN", label: "Site origin (for email links)", placeholder: "https://webinar-clone.onetimesuite.com" },
    ],
  },
  {
    title: "Stripe (direct checkout — optional)",
    note: "Leave blank and use offer Button URLs for now. Fill these to enable native Stripe Checkout.",
    keys: [
      { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_test_… / sk_live_…" },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", placeholder: "whsec_…" },
    ],
  },
  {
    title: "Purchase bridge (Viral Invoice / external checkouts)",
    note: "Set a secret, then point Viral Invoice (or a GHL flow/Zapier) at /api/offers/<offerId>/purchase with { secret, amountCents, externalRef } — each payment increments the price ladder, idempotent by externalRef.",
    keys: [
      { key: "PURCHASE_WEBHOOK_SECRET", label: "Shared secret", placeholder: "any long random string" },
    ],
  },
  {
    title: "YouTube (private videos)",
    note: "Only needed for PRIVATE YouTube videos: paste your browser's YouTube cookies (Netscape cookie file from an exporter). Unlisted videos need nothing.",
    keys: [
      { key: "YOUTUBE_COOKIES", label: "YouTube cookies (Netscape format)", placeholder: "# Netscape HTTP Cookie File…" },
    ],
  },
  {
    title: "BrandFetch (waiting-room logos)",
    note: "Optional. With a client ID, 'as seen on' badges in the waiting room render real brand logos via BrandFetch's Logo Link; without one they render as styled text badges. Free ID at brandfetch.com.",
    keys: [
      { key: "BRANDFETCH_CLIENT_ID", label: "Client ID", placeholder: "your BrandFetch client id" },
    ],
  },
];

export default function SettingsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) return;
    const rows = (await res.json()).settings as SettingRow[];
    setRows(rows);
    // pre-fill the fields with what's actually stored so keys are visible
    // and editable in place
    setValues((prev) => {
      const next = { ...prev };
      for (const r of rows) if (r.value != null && next[r.key] === undefined) next[r.key] = r.value;
      return next;
    });
  }
  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setNotice("saving…");
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    setNotice(res.ok ? "saved" : "save failed");
    void load();
  }

  const row = (key: string) => rows.find((r) => r.key === key);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <form onSubmit={save} className="flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-lg bg-zinc-900 p-4">
            <h2 className="font-medium">{section.title}</h2>
            <p className="mb-3 text-xs text-zinc-500">{section.note}</p>
            <div className="flex flex-col gap-3">
              {section.keys.map(({ key, label, placeholder, suggestions }) => {
                const r = row(key);
                return (
                  <label key={key} className="flex flex-col gap-1 text-sm">
                    <span className="flex items-baseline justify-between">
                      <span>{label}</span>
                      {r?.set && (
                        <span className="text-xs text-zinc-500">
                          {r.source === "env" ? "from server env" : "saved"}
                        </span>
                      )}
                    </span>
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      list={suggestions ? `${key}-suggestions` : undefined}
                      placeholder={placeholder}
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none"
                    />
                    {suggestions && (
                      <datalist id={`${key}-suggestions`}>
                        {suggestions.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
        <div className="flex items-center gap-3">
          <button className="rounded-lg bg-red-600 px-5 py-2.5 font-medium hover:bg-red-500">Save settings</button>
          {notice && <span className="text-sm text-zinc-400">{notice}</span>}
        </div>
      </form>
      <p className="text-xs text-zinc-600">
        Values are stored in the platform database and shown in full here — this page is
        owner-only. Blank fields are left unchanged; type __DELETE__ to remove one.
      </p>
    </main>
  );
}
