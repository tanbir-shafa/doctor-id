/**
 * NextAuth.js v5 (Auth.js) configuration.
 *
 * Strategy notes:
 *   - JWT sessions, not database sessions, because Credentials provider
 *     doesn't support DB sessions.
 *   - We don't use @auth/mongodb-adapter for users; instead the Credentials
 *     `authorize` and Google `signIn` callbacks talk to our own User model
 *     (which carries `role` + bcrypt `passwordHash`).
 *   - `session.user.role` and `session.user.id` are populated from the JWT
 *     so Server Actions can do role checks without an extra DB roundtrip.
 *   - bcrypt.compare runs on every credentials sign-in; rate limited at the
 *     server-action layer (see signInWithCredentials in server/actions/auth).
 */

import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { LoginSchema } from "@/lib/validators/auth";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models";
import { env } from "@/lib/env";

// Type augmentation so `session.user.id` and `.role` are typed.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "doctor" | "admin" | "patient";
    } & DefaultSession["user"];
  }
}

const e = env();

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      const parsed = LoginSchema.safeParse(raw);
      if (!parsed.success) return null;
      await dbConnect();
      const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
        .select("+passwordHash")
        .lean();
      if (!user || !user.passwordHash || user.deletedAt) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;
      // Fire-and-forget lastLoginAt; don't block the login if it errors.
      User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});
      return {
        id: String(user._id),
        email: user.email,
        name: user.email.split("@")[0],
        role: user.role,
      };
    },
  }),
];

// Google OAuth is optional in dev; only register the provider when configured.
if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: e.AUTH_GOOGLE_ID,
      clientSecret: e.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: e.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30-day session
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      // For Google OAuth: ensure a corresponding User document exists so role
      // checks work. Credentials sign-in already came from our own DB.
      if (account?.provider === "google" && user.email) {
        await dbConnect();
        const existing = await User.findOne({ email: user.email.toLowerCase() }).lean();
        if (!existing) {
          await User.create({
            email: user.email.toLowerCase(),
            googleId: account.providerAccountId,
            emailVerified: new Date(),
            role: "doctor",
          });
        } else if (!existing.googleId) {
          await User.updateOne(
            { _id: existing._id },
            { $set: { googleId: account.providerAccountId, emailVerified: existing.emailVerified ?? new Date() } },
          );
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      const t = token as typeof token & {
        userId?: string;
        role?: "doctor" | "admin" | "patient";
      };
      // Populated on initial sign-in. Subsequent calls hydrate from the JWT only.
      if (user) {
        t.userId = (user as { id?: string }).id ?? t.userId;
        t.role = (user as { role?: "doctor" | "admin" | "patient" }).role ?? t.role;
      }
      type Role = "doctor" | "admin" | "patient";
      // For Google sign-in we need to fetch the role from our DB the first time.
      if (t.userId && !t.role) {
        await dbConnect();
        const dbUser = await User.findById(t.userId).select("role").lean();
        if (dbUser?.role) t.role = dbUser.role as Role;
      }
      if (!t.userId && t.email) {
        await dbConnect();
        const dbUser = await User.findOne({ email: String(t.email).toLowerCase() })
          .select("_id role")
          .lean();
        if (dbUser) {
          t.userId = String(dbUser._id);
          t.role = dbUser.role as Role;
        }
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & {
        userId?: string;
        role?: "doctor" | "admin" | "patient";
      };
      if (t.userId) session.user.id = t.userId;
      if (t.role) session.user.role = t.role;
      return session;
    },
  },
});
