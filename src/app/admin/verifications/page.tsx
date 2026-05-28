import type { Metadata } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { ClaimRequest } from "@/lib/db/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewRow } from "./review-row";

export const metadata: Metadata = { title: "Admin · Verifications" };
export const dynamic = "force-dynamic";

interface PopulatedClaim {
  _id: string;
  status: string;
  bmdcNumberProvided: string;
  documentsUploaded: string[];
  notesFromDoctor: string | null;
  createdAt: string;
  doctorId: {
    _id: string;
    slug: string;
    name: { displayName: string; prefix: string };
    bmdcNumber: string | null;
  };
}

export default async function AdminVerifications() {
  await dbConnect();
  const pending = await (ClaimRequest as unknown as { find: Function })
    .find({ status: "pending" })
    .sort({ createdAt: 1 })
    .populate("doctorId", "slug name bmdcNumber")
    .lean();

  const claims = (pending as unknown[]).map((c) => JSON.parse(JSON.stringify(c))) as PopulatedClaim[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Verification queue</h1>
        <p className="text-sm text-muted-foreground">{claims.length} pending requests</p>
      </header>

      {claims.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Inbox zero</CardTitle>
            <CardDescription>No pending verification requests.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {claims.map((c) => (
            <li key={c._id}>
              <ReviewRow claim={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
