"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/admin");
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(
      body.error === "signup_closed" || body.error === "email_taken"
        ? "That email already has an account — sign in instead."
        : body.error === "invalid_credentials"
          ? "Wrong email or password."
          : "Check your email and a password of 8+ characters.",
    );
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      <input
        required
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
      />
      <input
        required
        type="password"
        placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-red-600 px-6 py-3 font-semibold transition-colors hover:bg-red-500 disabled:opacity-50"
      >
        {mode === "signup" ? "Create the owner account" : "Sign in"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
