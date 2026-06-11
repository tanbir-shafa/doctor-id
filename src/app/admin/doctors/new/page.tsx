import type { Metadata } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateDoctorForm } from "./create-doctor-form";

export const metadata: Metadata = { title: "Admin · New doctor" };
export const dynamic = "force-dynamic";

export default async function AdminNewDoctorPage() {
  await dbConnect();
  const specialtyRows = await Specialty.find({ active: true })
    .sort({ sortOrder: 1, name: 1 })
    .select("name")
    .lean();
  const specialties = (specialtyRows as { name: string }[]).map((s) => s.name);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New doctor"
        description="Create an unclaimed draft profile. The doctor can claim it later via the public flow."
        breadcrumb={[{ label: "Doctors", href: "/admin/doctors" }, { label: "New" }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile basics</CardTitle>
          <CardDescription>
            Name is required. Primary specialty and BMDC number are optional and can be edited later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateDoctorForm specialties={specialties} />
        </CardContent>
      </Card>
    </div>
  );
}
