import Link from "next/link";
import { getSharedDb, getSetting } from "@platform/core";
import AuthForm from "../../components/AuthForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const sql = getSharedDb();
  const lifetimeUrl = await getSetting(sql, "WHOP_LIFETIME_URL");
  const monthlyUrl = await getSetting(sql, "WHOP_MONTHLY_URL");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Get One Time Webinars</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Check out on WHOP, then create your account with the same email — your plan activates
          automatically.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {lifetimeUrl && (
          <a
            href={lifetimeUrl}
            className="rounded-lg bg-amber-400 px-5 py-3.5 text-center font-bold text-zinc-950 hover:bg-amber-300"
          >
            Own it forever — $399
          </a>
        )}
        {monthlyUrl && (
          <a
            href={monthlyUrl}
            className="rounded-lg bg-red-600 px-5 py-3.5 text-center font-bold hover:bg-red-500"
          >
            Monthly — $39.99/mo
          </a>
        )}
        {!lifetimeUrl && !monthlyUrl && (
          <p className="rounded-lg bg-zinc-900 p-3 text-center text-xs text-zinc-500">
            Checkout links are being configured — you can still create a free account below.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />
        then create your account (or start free with 1 webinar)
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <AuthForm mode="signup" />
      <p className="text-center text-sm text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-red-300 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
