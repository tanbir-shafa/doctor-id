/**
 * Auth proxy (formerly middleware in Next 15 and earlier).
 *
 * Runs on the edge for `/dashboard/*` and `/admin/*`. Uses the edge-safe
 * NextAuth config (no Mongoose / bcrypt in the bundle) — it only needs to
 * read the JWT, not issue one or hit the database.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import edgeConfig from "@/lib/auth/edge-config";

const { auth } = NextAuth(edgeConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const session = req.auth;
  const isAuthed = Boolean(session?.user?.id);

  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  if (!isProtected) return NextResponse.next();

  if (!isAuthed) {
    const url = req.nextUrl.clone();
    // Admin URLs get the email/password admin login. Everything else
    // (the doctor dashboard) goes to the phone-OTP doctor login.
    url.pathname = pathname.startsWith("/admin") ? "/auth/email/login" : "/auth/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Admin portal is admin-only. Non-admins (doctor/patient) get bounced to
  // their doctor dashboard.
  if (pathname.startsWith("/admin") && session?.user?.role !== "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Doctor dashboard is doctor-only. Admins use /admin — they don't have a
  // doctor profile, so /dashboard would fail to load any context for them
  // anyway. Bounce to /admin instead.
  if (pathname.startsWith("/dashboard") && session?.user?.role === "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
