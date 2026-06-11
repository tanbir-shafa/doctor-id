import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { EmailLoginForm } from "./email-login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in with Email" };

export const dynamic = "force-dynamic";

export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;

  // Skip the form when already signed in — admins land on /admin, everyone
  // else on their dashboard, so they don't see the wrong login page.
  const session = await auth();
  if (session?.user?.id) {
    const requestedNext = sp.next ?? "";
    const defaultNext = session.user.role === "admin" ? "/admin" : "/dashboard";
    redirect(requestedNext.startsWith("/") ? requestedNext : defaultNext);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in with Email</CardTitle>
        <CardDescription>Sign in with your email and password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <EmailLoginForm next={sp.next} initialError={sp.error} />
        <div className="text-center text-sm">
          <Link href="/auth/forgot-password" className="text-muted-foreground hover:underline">
            Forgot your password?
          </Link>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Doctor?{" "}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Sign in by phone
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
