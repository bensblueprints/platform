import Link from "next/link";
import { headers } from "next/headers";
import { getSharedDb, getSetting } from "@platform/core";
import { getSessionUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/** Plan + billing: WHOP checkout for lifetime and monthly. */
export default async function UpgradePage() {
  const user = await getSessionUser(new Request("https://x/", { headers: await headers() }));
  const sql = getSharedDb();
  const lifetimeUrl = await getSetting(sql, "WHOP_LIFETIME_URL");
  const monthlyUrl = await getSetting(sql, "WHOP_MONTHLY_URL");

  const planLabel =
    user?.plan === "lifetime" ? "Lifetime (own it)" : user?.plan === "monthly" ? "Monthly" : "Free";
  const statusNote =
    user?.tenantStatus === "past_due"
      ? " — payment past due, update it on WHOP"
      : user?.tenantStatus === "cancelled"
        ? " — cancelled"
        : "";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your plan</h1>
        <Link href="/admin" className="text-sm text-sky-300 hover:underline">
          ← dashboard
        </Link>
      </header>

      <section className="rounded-lg bg-zinc-900 p-5">
        <p className="text-lg font-medium">
          {planLabel}
          <span className="text-sm text-zinc-400">{statusNote}</span>
        </p>
        {user?.plan === "free" && (
          <p className="mt-1 text-sm text-zinc-400">
            Free includes one webinar with your own OpenRouter key. Upgrade for unlimited webinars.
          </p>
        )}
        {user?.plan !== "free" && user?.tenantStatus === "active" && (
          <p className="mt-1 text-sm text-emerald-300">Unlimited webinars — thanks for being in.</p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border border-amber-400/40 bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Own it forever</h2>
          <p className="text-3xl font-bold text-amber-300">$399</p>
          <p className="text-sm text-zinc-400">
            One payment, lifetime access. Unlimited webinars, your own API keys, every feature.
          </p>
          {lifetimeUrl ? (
            <a
              href={lifetimeUrl}
              target="_blank"
              className="mt-auto rounded-lg bg-amber-400 px-5 py-3 text-center font-bold text-zinc-950 hover:bg-amber-300"
            >
              Buy lifetime on WHOP
            </a>
          ) : (
            <p className="mt-auto text-xs text-zinc-500">Checkout link not configured yet.</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Monthly</h2>
          <p className="text-3xl font-bold">
            $39.99<span className="text-sm font-normal text-zinc-400">/mo</span>
          </p>
          <p className="text-sm text-zinc-400">
            Everything unlimited while you're subscribed. Cancel any time on WHOP.
          </p>
          {monthlyUrl ? (
            <a
              href={monthlyUrl}
              target="_blank"
              className="mt-auto rounded-lg bg-red-600 px-5 py-3 text-center font-bold hover:bg-red-500"
            >
              Subscribe on WHOP
            </a>
          ) : (
            <p className="mt-auto text-xs text-zinc-500">Checkout link not configured yet.</p>
          )}
        </section>
      </div>

      <p className="text-xs text-zinc-500">
        Pay with the same email as your account{user ? ` (${user.email})` : ""} — your plan
        activates automatically when WHOP confirms the payment.
      </p>
    </main>
  );
}
