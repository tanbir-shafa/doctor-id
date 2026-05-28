import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back. Sign in to manage your profile.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm next={sp.next} initialError={sp.error} />
        <div className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/auth/register" className="font-medium text-primary hover:underline">
            Claim your profile
          </Link>
        </div>
        <div className="text-center text-sm">
          <Link href="/auth/forgot-password" className="text-muted-foreground hover:underline">
            Forgot your password?
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
