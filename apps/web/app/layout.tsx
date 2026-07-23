import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Webinar Platform" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
