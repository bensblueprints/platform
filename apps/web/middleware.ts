import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * /admin gate: allow with a session cookie (validated per-request in the
 * route/page) or the interim ?key= bypass. Without either, bounce to login.
 */
export function middleware(req: NextRequest) {
  const hasCookie = req.cookies.has("platform_session");
  const hasKey = req.nextUrl.searchParams.has("key");
  if (!hasCookie && !hasKey) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
