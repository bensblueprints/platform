"use client";

import { useEffect, useState } from "react";

interface SettingRow {
  key: string;
  set: boolean;
  masked: string | null;
  source: "settings" | "env" | null;
}

const SECTIONS: { title: string; note: string; keys: { key: string; label: string; placeholder: string }[] }[] = [
  {
    title: "AI script generation",
    note: "Any OpenAI-compatible endpoint (OpenAI, Groq, Together, or a local rig). Leave blank to keep the mock generator.",
    keys: [
      { key: "INFERENCE_BASE_URL", label: "Base URL", placeholder: "https://api.openai.com (or https://api.groq.com/openai)" },
      { key: "INFERENCE_API_KEY", label: "API key", placeholder: "sk-…" },
      { key: "INFERENCE_MODEL", label: "Chat model (optional)", placeholder: "gpt-4o-mini / llama-3.3-70b-versatile" },
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
    title: "Stripe (direct checkout — optional)",
    note: "Leave blank and use offer Button URLs for now. Fill these to enable native Stripe Checkout.",
    keys: [
      { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_test_… / sk_live_…" },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", placeholder: "whsec_…" },
    ],
  },
];

export default function SettingsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/settings");
    if (res.ok) setRows((await res.json()).settings);
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
    setValues({});
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
              {section.keys.map(({ key, label, placeholder }) => {
                const r = row(key);
                return (
                  <label key={key} className="flex flex-col gap-1 text-sm">
                    <span className="flex items-baseline justify-between">
                      <span>{label}</span>
                      {r?.set && (
                        <span className="text-xs text-zinc-500">
                          current: {r.masked}
                          {r.source === "env" ? " (env)" : ""}
                        </span>
                      )}
                    </span>
                    <input
                      type="password"
                      placeholder={placeholder}
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none"
                    />
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
        Values are stored in the platform database, shown masked, and never logged. Blank fields are left unchanged.
      </p>
    </main>
  );
}
