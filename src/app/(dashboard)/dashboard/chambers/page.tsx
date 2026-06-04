import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { ChambersEditor } from "./chambers-editor";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Chambers" };
export const dynamic = "force-dynamic";

export default async function ChambersPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  // Pass the chambers as plain serializable values — RHF owns the editor state.
  const initial = (doctor.chambers ?? []).map((c) => ({
    name: c.name,
    address: c.address,
    area: c.area,
    district: c.district,
    division: c.division,
    phone: c.phone ?? "",
    floor: c.floor ?? "",
    room: c.room ?? "",
    consultationFee: c.consultationFee ?? { amount: 0, currency: "BDT" as const },
    coordinates: c.coordinates ?? { lat: null, lng: null },
    schedule: c.schedule ?? [],
    isPrimary: Boolean(c.isPrimary),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Chambers</h1>
        <p className="text-sm text-muted-foreground">
          Locations where you see patients. Set a primary chamber so it appears first on your
          public profile.
        </p>
      </header>

      <ChambersEditor initialChambers={initial} />
    </div>
  );
}
