import Link from "next/link";
import { Stethoscope } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <Stethoscope className="size-6 text-primary" aria-hidden="true" />
        <span>doctor.id.bd</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
