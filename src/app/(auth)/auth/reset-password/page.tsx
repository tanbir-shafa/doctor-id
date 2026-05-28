import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.token || !sp.email) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>This reset link is missing required information.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>At least 10 characters, with letters and numbers.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={sp.token} email={sp.email} />
      </CardContent>
    </Card>
  );
}
