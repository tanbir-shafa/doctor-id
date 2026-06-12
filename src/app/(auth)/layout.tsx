import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { BrandWordmark } from "@/components/layout/brand-wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <BrandMark className="size-9" />
        <BrandWordmark />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
