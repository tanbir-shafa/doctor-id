import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Chambers" };
export const dynamic = "force-dynamic";

export default async function ChambersPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Chambers</h1>
        <p className="text-sm text-muted-foreground">Locations where you see patients.</p>
      </header>

      {doctor.chambers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No chambers yet</CardTitle>
            <CardDescription>Add at least one chamber so patients can find you.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {doctor.chambers.map((c, i) => (
            <li key={i}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="size-4 text-primary" aria-hidden="true" />
                    {c.name}
                    {c.isPrimary ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Primary</span> : null}
                  </CardTitle>
                  <CardDescription>{c.address}, {c.area}, {c.city}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {c.phone ? <p>{c.phone}</p> : null}
                  {c.consultationFee?.amount ? <p>Fee: {c.consultationFee.amount} {c.consultationFee.currency}</p> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add / edit chambers</CardTitle>
          <CardDescription>
            Full chamber editor (with map picker via Leaflet + day/time schedule grid) is part of the next
            release sprint. Until then, contact support@doctor.id.bd to make changes to your chambers.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
