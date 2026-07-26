import { headers } from "next/headers";
import { getSetting, getSharedDb } from "@platform/core";
import { isDocUnlocked } from "../../lib/doc-vault";
import DocUnlockForm from "./DocUnlockForm";

export const dynamic = "force-dynamic";

interface VaultEntry {
  label: string;
  url?: string;
  user?: string;
  secret?: string;
  note?: string;
}
interface VaultSection {
  title: string;
  entries: VaultEntry[];
}

export default async function DocumentationPage() {
  const unlocked = await isDocUnlocked((await headers()).get("cookie"));
  if (!unlocked) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-xl font-semibold">Owner vault</h1>
        <DocUnlockForm />
      </main>
    );
  }

  const raw = await getSetting(getSharedDb(), "DOC_VAULT");
  const sections: VaultSection[] = raw ? JSON.parse(raw) : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Owner vault</h1>
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        Everything here is a secret. The page locks again in 12 hours. Rotate the page password if you ever share it by mistake.
      </p>
      {sections.map((s) => (
        <section key={s.title} className="rounded-lg bg-zinc-900 p-4">
          <h2 className="mb-3 font-medium text-zinc-200">{s.title}</h2>
          <div className="space-y-3">
            {s.entries.map((e) => (
              <div key={e.label} className="text-sm">
                <p className="text-zinc-400">{e.label}</p>
                {e.url && (
                  <a href={e.url} className="block break-all text-sky-300 hover:underline" target="_blank">
                    {e.url}
                  </a>
                )}
                {e.user && <p className="font-mono text-zinc-100">user: {e.user}</p>}
                {e.secret && <p className="font-mono text-zinc-100">pass: {e.secret}</p>}
                {e.note && <p className="text-xs text-zinc-500">{e.note}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
