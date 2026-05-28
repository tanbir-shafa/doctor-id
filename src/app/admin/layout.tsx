import Link from "next/link";
import { redirect } from "next/navigation";
import { Stethoscope, LogOut, Shield } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { logoutAction } from "@/server/actions/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/admin");
  if (session.user.role !== "admin") redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <Stethoscope className="size-5 text-primary" aria-hidden="true" />
            <span>doctor.id.bd</span>
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              <Shield className="size-3" aria-hidden="true" /> Admin
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="hover:underline">Overview</Link>
            <Link href="/admin/verifications" className="hover:underline">Verifications</Link>
            <Link href="/admin/doctors" className="hover:underline">Doctors</Link>
            <Link href="/admin/specialties" className="hover:underline">Specialties</Link>
            <form action={logoutAction}>
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
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</section>
    </main>
  );
}
