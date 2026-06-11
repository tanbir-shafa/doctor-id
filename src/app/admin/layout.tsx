import type { Loose } from "@/lib/db/models/loose";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { ClaimRequest, IdentityVerificationRequest, User } from "@/lib/db/models";
import { AdminShell } from "@/components/admin/shell";

/**
 * Admin portal layout.
 *
 * Defense-in-depth auth: the proxy already gates `/admin/*` for admin role,
 * but we re-check here so any direct render (cache invalidation race, test
 * harness, future route handler reuse) is still safe.
 *
 * Fetches the live pending-claim count so the sidebar can show a badge —
 * the AdminLTE pattern operators expect.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/email/login?next=/admin");
  if (session.user.role !== "admin") redirect("/dashboard");

  await dbConnect();
  const [pendingClaimCount, pendingIdentityCount, pendingEmrCount] = await Promise.all([
    (ClaimRequest as unknown as Loose).countDocuments({
      status: "pending",
    }),
    (IdentityVerificationRequest as unknown as Loose).countDocuments({
      status: "pending",
    }),
    (User as unknown as Loose).countDocuments({
      "emr.requested": true,
      "emr.seatStatus": "pending",
    }),
  ]);

  return (
    <AdminShell
      userEmail={session.user.email ?? ""}
      pendingClaimCount={pendingClaimCount}
      pendingIdentityCount={pendingIdentityCount}
      pendingEmrCount={pendingEmrCount}
    >
      {children}
    </AdminShell>
  );
}
