import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Claim your profile",
  description:
    "Register on doctor.id.bd to claim and publish your professional profile. Free, verified, BMDC-aligned.",
};

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim your profile</CardTitle>
        <CardDescription>
          Free for doctors. We verify each profile against the BMDC registry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
