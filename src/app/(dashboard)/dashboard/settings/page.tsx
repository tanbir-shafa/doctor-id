import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";
import { EmailVerificationForm } from "./email-verification-form";

export const metadata: Metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();

  let email: string | null = session?.user?.email ?? null;
  let emailVerified = false;
  if (session?.user?.id) {
    await dbConnect();
    const user = await User.findById(session.user.id)
      .select("email emailVerified")
      .lean<{ email: string; emailVerified: Date | null } | null>();
    if (user) {
      email = user.email ?? email;
      emailVerified = Boolean(user.emailVerified);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Account settings</h1>
        <p className="text-sm text-muted-foreground">Manage your sign-in credentials and account state.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Set and verify the email where we send account notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailVerificationForm email={email} verified={emailVerified} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Soft-deletes your account: your profile is unpublished and you can no longer sign in. Hard
            deletion runs after a 30-day grace period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
