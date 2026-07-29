import Link from "next/link";
import AuthForm from "../../components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="text-center text-sm text-zinc-400">
        Free plan: one webinar with your own OpenRouter key. Upgrade to lifetime or monthly any
        time for unlimited webinars.
      </p>
      <AuthForm mode="signup" />
      <p className="text-sm text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-red-300 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
