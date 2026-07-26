"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DocUnlockForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/documentation/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3">
      <input
        type="password"
        placeholder="Vault password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
      />
      <button className="rounded-lg bg-red-600 px-6 py-3 font-semibold hover:bg-red-500">Unlock</button>
      {error && <p className="text-sm text-red-300">Wrong password.</p>}
    </form>
  );
}
