import type { Metadata } from "next";
import Link from "next/link";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ClaimRequest, User } from "@/lib/db/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin · Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  await dbConnect();
  const [doctors, published, pendingClaims, users] = await Promise.all([
    (Doctor as unknown as { countDocuments: Function }).countDocuments({}),
    (Doctor as unknown as { countDocuments: Function }).countDocuments({ status: "published" }),
    (ClaimRequest as unknown as { countDocuments: Function }).countDocuments({ status: "pending" }),
    (User as unknown as { countDocuments: Function }).countDocuments({ role: "doctor" }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted-foreground">Operational health at a glance.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total profiles</CardDescription><CardTitle className="text-3xl">{doctors}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Published</CardDescription><CardTitle className="text-3xl">{published}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending verifications</CardDescription><CardTitle className="text-3xl">{pendingClaims}</CardTitle></CardHeader>
          <CardContent>
            <Link href="/admin/verifications" className="text-sm font-medium text-primary hover:underline">Open queue →</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Doctor users</CardDescription><CardTitle className="text-3xl">{users}</CardTitle></CardHeader>
        </Card>
      </div>
    </div>
  );
}
