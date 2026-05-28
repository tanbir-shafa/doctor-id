/**
 * Edge-runtime-safe NextAuth config.
 *
 * Why split: the full `config.ts` imports Mongoose + bcrypt + AWS SDK, none of
 * which can run on the Vercel/Next edge runtime (used by `proxy.ts` / formerly
 * middleware). This file declares only the JWT/session callbacks needed to
 * verify the cookie and read `userId` + `role` from the token — no DB calls.
 */

import type { NextAuthConfig } from "next-auth";

const edgeConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  // No providers here — the node config (config.ts) provides them. Edge code
  // only needs to read the JWT, never to issue one.
  providers: [],
  callbacks: {
    session({ session, token }) {
      const t = token as typeof token & { userId?: string; role?: "doctor" | "admin" | "patient" };
      if (t.userId) session.user.id = t.userId;
      if (t.role) session.user.role = t.role;
      return session;
    },
  },
};

export default edgeConfig;
