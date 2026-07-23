"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function RegisterForm({
  slug,
  nextSessionAtMs,
}: {
  slug: string;
  nextSessionAtMs: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? timezone;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const utm: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = searchParams.get(key);
      if (v) utm[key] = v;
    }
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, email, firstName, phone, timezone, utm }),
    });
    if (res.ok) {
      const { confirmedUrl } = await res.json();
      router.push(confirmedUrl);
      return;
    }
    setError(res.status === 400 ? "Enter a valid email address." : "Registration failed — try again.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      {nextSessionAtMs != null && (
        <p className="text-sm text-zinc-300" data-testid="session-time">
          Next session:{" "}
          <strong className="text-white">
            {new Date(nextSessionAtMs).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            {tzAbbr}
          </strong>
        </p>
      )}
      {nextSessionAtMs == null && (
        <p className="text-sm text-zinc-300" data-testid="session-time">
          Starts <strong className="text-white">right after you register</strong>
        </p>
      )}
      <input
        required
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
      />
      <input
        type="text"
        placeholder="First name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
      />
      <input
        type="tel"
        placeholder="Phone (optional, for reminders)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-red-600 px-6 py-3 text-lg font-semibold transition-colors hover:bg-red-500 disabled:opacity-50"
      >
        {busy ? "Registering…" : "Register for the session"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
