import { redirect } from "next/navigation";

export default function Home() {
  // Product home is the backend: /signup renders the owner-account form on
  // first run and the login form once an account exists.
  redirect("/signup");
}
