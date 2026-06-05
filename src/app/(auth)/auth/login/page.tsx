import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DoctorLoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; phone?: string }>;
}) {
  const sp = await searchParams;

  // Already signed in? Skip the form and send them straight to their portal.
  // Admins live in /admin (they don't have a doctor profile so /dashboard
  // would fail to load context for them); everyone else goes to /dashboard.
  const session = await auth();
  if (session?.user?.id) {
    const requestedNext = sp.next ?? "";
    const defaultNext = session.user.role === "admin" ? "/admin" : "/dashboard";
    redirect(requestedNext.startsWith("/") ? requestedNext : defaultNext);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Enter your phone number to receive a 6-digit code by SMS. No password needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DoctorLoginForm defaultPhone={sp.phone ?? ""} next={sp.next} />
        <div className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/auth/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          Already added an email?{" "}
          <Link href="/auth/admin/login" className="hover:underline">
            Sign in with email
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
