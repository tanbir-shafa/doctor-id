import type { ReactNode } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Eye,
  Inbox,
  ArrowRight,
  FileText,
  QrCode,
  Share2,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HomeScoreboard } from "@/types/home";

/**
 * The logged-in-doctor face of the home page — a weekly scoreboard. Swapped in
 * by <HomeTop> after it confirms the visitor is a doctor. Every number here is
 * the retention hook: views going up, pending requests waiting, completeness to
 * climb. Pulls the appointment inbox (recurring economic value) to the front
 * door instead of burying it in /dashboard.
 */
const nf = new Intl.NumberFormat("en-IN");

export function DoctorScoreboard({ board }: { board: HomeScoreboard }) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {board.firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {board.published ? (
                <>
                  Your profile is live at{" "}
                  <Link
                    href={`/${board.slug}`}
                    target="_blank"
                    className="font-medium text-primary hover:underline"
                  >
                    /{board.slug} <ExternalLink className="inline size-3.5" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <span className="font-medium text-amber-700">
                  Your profile is a draft — publish it from your dashboard to go live.
                </span>
              )}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Go to dashboard <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Eye className="size-4" aria-hidden="true" /> Profile views (30d)
              </CardDescription>
              <CardTitle className="text-3xl">{nf.format(board.views30d)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                All-time: {nf.format(board.viewsAllTime)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Inbox className="size-4" aria-hidden="true" /> Appointment requests
              </CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl">
                {nf.format(board.pendingRequests)}
                {board.pendingRequests > 0 ? (
                  <span
                    className="inline-flex size-2.5 rounded-full bg-red-500"
                    aria-label="new requests"
                  />
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/dashboard/requests"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {board.pendingRequests > 0 ? "Review pending requests" : "Open inbox"}{" "}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Profile completeness</CardDescription>
              <CardTitle className="text-3xl">{board.completeness}%</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${board.completeness}%` }}
                  aria-label={`Profile ${board.completeness}% complete`}
                />
              </div>
              {board.nextAction ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Add{" "}
                  <span className="font-medium text-foreground">
                    {board.nextAction.label.toLowerCase()}
                  </span>{" "}
                  to gain {board.nextAction.weight}%.{" "}
                  <Link href="/dashboard/profile" className="font-medium text-primary hover:underline">
                    Polish →
                  </Link>
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  You&apos;re at 100% — nicely done.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Action href="/dashboard/profile" icon={<Pencil className="size-4" aria-hidden="true" />}>
            Edit profile
          </Action>
          {board.published ? (
            <>
              <Action
                href="/dashboard/prescription-pad/download"
                icon={<FileText className="size-4" aria-hidden="true" />}
                download
              >
                Rx pad PDF
              </Action>
              <Action
                href={`/api/qr-card/${board.slug}`}
                icon={<QrCode className="size-4" aria-hidden="true" />}
                download
              >
                QR card
              </Action>
              <Action
                href={`/api/og/${board.slug}/square`}
                icon={<Share2 className="size-4" aria-hidden="true" />}
                download
              >
                WhatsApp card
              </Action>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Action({
  href,
  icon,
  children,
  download,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  download?: boolean;
}) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent";
  if (download) {
    return (
      <a href={href} download className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {icon}
      {children}
    </Link>
  );
}
