import AuthForm from "../../components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <AuthForm mode="login" />
    </main>
  );
}
