import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmailAction } from "@/server/actions/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const sp = await searchParams;
  let state: { ok: boolean; error?: string } = { ok: false, error: "Missing token." };
  if (sp.token && sp.email) {
    state = await verifyEmailAction({ token: sp.token, email: sp.email });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{state.ok ? "Email verified" : "Email verification"}</CardTitle>
        <CardDescription>
          {state.ok
            ? "Thanks — your email is confirmed. You can now sign in."
            : state.error ?? "Click the link in your email to verify your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href={state.ok ? "/auth/login" : "/auth/register"}
          className="text-sm font-medium text-primary hover:underline"
        >
          {state.ok ? "Go to sign in" : "Back to register"}
        </Link>
      </CardContent>
    </Card>
  );
}
