import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Register on doctor.id.bd to publish your professional profile. Free for doctors. Phone + SMS OTP. No password.",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ slug?: string; step?: string; phone?: string }>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const slug = params.slug?.toLowerCase().trim() || undefined;
  const initialStep = params.step === "verify" ? "verify" : "details";
  const initialPhone = params.phone?.trim() || "";

  // If a slug is present, look up the profile so we can confirm it exists and
  // show its display name in the header. Bad slugs short-circuit early with a
  // friendly message instead of a confusing "claim what?" form.
  let claiming:
    | { slug: string; displayName: string; alreadyClaimed: boolean }
    | null = null;
  if (slug) {
    await dbConnect();
    const doc = await Doctor.findOne({ slug })
      .select("slug name.displayName name.prefix isClaimed")
      .lean<{
        slug: string;
        name: { displayName: string; prefix: string };
        isClaimed: boolean;
      } | null>();
    if (doc) {
      claiming = {
        slug: doc.slug,
        displayName: doc.name.displayName,
        alreadyClaimed: Boolean(doc.isClaimed),
      };
    }
  }

  if (claiming?.alreadyClaimed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This profile is already claimed</CardTitle>
          <CardDescription>
            {claiming.displayName} has already been claimed. If this is yours, sign in instead — or
            contact{" "}
            <a href="mailto:support@doctor.id.bd" className="underline">
              support@doctor.id.bd
            </a>{" "}
            for help.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/auth/login?next=/dashboard`}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {claiming ? `Claim ${claiming.displayName}` : "Create your account"}
        </CardTitle>
        <CardDescription>
          {claiming
            ? "After verification we'll bind this profile to your account. We review every claim within 24 hours when ID documents are attached."
            : "Doctors only. Free forever. Phone + SMS verification — no password needed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm
          claimSlug={claiming?.slug ?? null}
          initialStep={initialStep}
          initialPhone={initialPhone}
        />
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
