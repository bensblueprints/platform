import { getSharedDb } from "@platform/core";
import AuthForm from "../../components/AuthForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const sql = getSharedDb();
  const existing = await sql<{ c: number }[]>`select count(*)::int as c from users`;
  const closed = existing[0].c > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">{closed ? "Sign in" : "Create your account"}</h1>
      {closed ? (
        <AuthForm mode="login" />
      ) : (
        <>
          <p className="text-sm text-zinc-400">The first account owns this platform.</p>
          <AuthForm mode="signup" />
        </>
      )}
    </main>
  );
}
