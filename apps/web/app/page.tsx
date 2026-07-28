import Link from "next/link";
import { headers } from "next/headers";
import { getSessionUser } from "../lib/auth";
import AuthForm from "../components/AuthForm";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "A script that quotes you back",
    body: "The generator transcribes your video, finds its beats, and writes chat that references what you actually say — every audience question gets a support answer within seconds. Review, edit, and publish from the script editor.",
  },
  {
    title: "Starts itself, every time",
    body: "Sessions run on your schedule — every few minutes, recurring slots, or on-demand. Playback starts on its own the moment the session goes live. No join button, no dead air.",
  },
  {
    title: "Waiting rooms you brand",
    body: "Your headline, your image, your press badges, and a live countdown while the room fills. Chat stays quiet until the show actually begins.",
  },
  {
    title: "A crowd you control",
    body: "Seeded chat varies every session so repeat viewers never see an identical room, late joiners get answered by the regulars, and the attendee count follows a curve you tune.",
  },
  {
    title: "The offer, timed to the pitch",
    body: "The buy panel appears under the video at the exact second you choose, with a price ladder that rises on every real sale and an honest countdown per viewer.",
  },
  {
    title: "You can still be there",
    body: "Real attendees can message you from the room. Answer privately or broadcast to every session from the moderator console — attendees never see each other.",
  },
  {
    title: "Reminders that send themselves",
    body: "Confirmation, 24h, 1h, and 10-minute reminders plus attended/no-show follow-ups go out automatically by email.",
  },
  {
    title: "Numbers that matter",
    body: "Registration funnel, show rate, and the retention curve plotted against your offer moment — you see exactly where people leave relative to the pitch.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Drop in your recording",
    body: "Upload the mp4, import from a link, or pull it off YouTube. Duration and seeking are handled for you.",
  },
  {
    n: "2",
    title: "Generate the room",
    body: "One click writes the chat against your transcript, sizes the crowd, and drafts your offer timing. Edit anything before it goes live.",
  },
  {
    n: "3",
    title: "Share one link",
    body: "Your registration page runs itself: sign-ups, reminders, waiting room, the session, the offer, and the analytics.",
  },
];

export default async function Home() {
  const user = await getSessionUser(new Request("https://x/", { headers: await headers() }));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-20 px-6 pb-20">
      <nav className="flex items-center justify-between py-6">
        <span className="text-lg font-bold tracking-tight">
          One Time <span className="text-red-500">Webinars</span>
        </span>
        <Link
          href={user ? "/admin" : "/login"}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-red-500"
        >
          {user ? "Open dashboard" : "Sign in"}
        </Link>
      </nav>

      <section className="flex flex-col items-start gap-6 pt-8">
        <p className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium uppercase tracking-widest text-zinc-400">
          Evergreen webinar platform
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Your best webinar, live every few minutes —{" "}
          <span className="text-red-500">without you in the room.</span>
        </h1>
        <p className="max-w-2xl text-lg text-zinc-300">
          One Time Webinars plays your recording as a scheduled live session: the chat reacts to what
          you actually say, the crowd grows on cue, the offer lands at the perfect second, and every
          viewer lands at the right moment — even if they show up late.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={user ? "/admin" : "/login"}
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold transition-colors hover:bg-red-500"
          >
            {user ? "Open dashboard" : "Sign in to run yours"}
          </Link>
          <Link
            href="/w/how-to-stop-paying-expensive-monthly-software-su"
            className="rounded-lg border border-zinc-600 px-6 py-3 font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            See a live room
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-xl bg-zinc-900 p-5">
            <p className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold">
              {s.n}
            </p>
            <h3 className="mb-1 font-semibold">{s.title}</h3>
            <p className="text-sm text-zinc-400">{s.body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">Everything a $99/month webinar tool does — owned, not rented.</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-zinc-900 p-5">
              <h3 className="mb-1 font-semibold text-red-300">{f.title}</h3>
              <p className="text-sm text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="admin-login" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">You're signed in</h2>
              <p className="text-sm text-zinc-400">{user.email}</p>
            </div>
            <Link
              href="/admin"
              className="rounded-lg bg-red-600 px-6 py-3 font-semibold transition-colors hover:bg-red-500"
            >
              Open dashboard
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <div>
              <h2 className="text-xl font-semibold">Admin login</h2>
              <p className="text-sm text-zinc-400">
                Sign in to create webinars, generate chat, moderate rooms, and see analytics.
              </p>
            </div>
            <AuthForm mode="login" />
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-6 text-sm text-zinc-500">
        <span>Part of the One Time Suite · onetimesuite.com</span>
        <span className="flex gap-4">
          <Link href="/login" className="hover:text-zinc-300">
            Sign in
          </Link>
          <Link href="/w/how-to-stop-paying-expensive-monthly-software-su" className="hover:text-zinc-300">
            Live demo
          </Link>
        </span>
      </footer>
    </main>
  );
}
