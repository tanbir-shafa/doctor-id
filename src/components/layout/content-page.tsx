import type { ReactNode } from "react";

export interface ContentSection {
  heading: string;
  /** Plain-text paragraphs (no markdown). */
  paragraphs: string[];
}

/**
 * Shared layout for static prose pages (about, how-verification-works,
 * data-sources, privacy, terms). Server component — pure presentation. Renders
 * inside the (public) layout, so it inherits the site header + footer.
 */
export function ContentPage({
  title,
  intro,
  sections,
  draftNotice,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  sections: ContentSection[];
  /** Non-empty → renders a prominent "draft / pending review" banner (legal pages). */
  draftNotice?: string;
  /** Optional "Last updated" line. */
  updated?: string;
  children?: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>

      {draftNotice ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {draftNotice}
        </p>
      ) : null}

      {intro ? (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{intro}</p>
      ) : null}

      <div className="mt-8 space-y-8">
        {sections.map((section, i) => (
          <section key={i}>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{section.heading}</h2>
            <div className="mt-2 space-y-3 leading-relaxed text-muted-foreground">
              {section.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {children}

      {updated ? <p className="mt-10 text-xs text-muted-foreground">Last updated: {updated}</p> : null}
    </article>
  );
}
