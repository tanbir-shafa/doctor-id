import Link from "next/link";
import { Stethoscope, LogOut } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { logoutAction } from "@/server/actions/auth";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, AppointmentRequest } from "@/lib/db/models";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: the edge proxy already redirects unauthed users; the
  // server-side check here protects against header forgery and gives us the
  // session for the chrome.
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/dashboard");
  // Admins live in /admin — they don't have a doctor profile, so this layout
  // would fail to load any context for them. The proxy already redirects
  // them; this is a defense-in-depth check.
  if (session.user.role === "admin") redirect("/admin");

  // Sidebar pending-request badge. Cheap count keyed off the doctor's _id.
  // If the doctor doc isn't ready yet (just-registered, admin hasn't approved),
  // we skip the lookup — the badge silently shows 0.
  await dbConnect();
  const doctorMini = await Doctor.findOne({ ownerId: session.user.id })
    .select("_id")
    .lean<{ _id: unknown } | null>();
  const pendingRequestCount = doctorMini
    ? await (
        AppointmentRequest as unknown as { countDocuments: Function }
      ).countDocuments({ doctorId: doctorMini._id, status: "pending" })
    : 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <DashboardMobileNav
              userEmail={session.user.email ?? ""}
              pendingRequestCount={pendingRequestCount}
            />
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Stethoscope className="size-5 text-primary" aria-hidden="true" />
              <span>doctor.id.bd</span>
              <span className="ml-2 hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary sm:inline">
                Dashboard
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{session.user.email}</span>
            <form action={logoutAction} className="hidden lg:block">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-accent"
              >
                <LogOut className="size-4" aria-hidden="true" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-8 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <DashboardNav pendingRequestCount={pendingRequestCount} />
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
