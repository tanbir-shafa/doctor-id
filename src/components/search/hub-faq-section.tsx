/**
 * Shared visible FAQ + verification trust-note block for the SEO hub pages
 * (specialty, specialty×district, district). The Q&A here must mirror the
 * `FAQPage` JSON-LD the page emits — Google requires the structured data to
 * match on-page content.
 */
export function HubFaqSection({
  faq,
  whyNote,
}: {
  faq?: { question: string; answer: string }[];
  whyNote?: string;
}) {
  return (
    <>
      {faq && faq.length > 0 ? (
        <section className="mt-12 border-t border-border pt-8" aria-labelledby="hub-faq-heading">
          <h2 id="hub-faq-heading" className="text-xl font-semibold text-foreground">
            Frequently asked questions
          </h2>
          <dl className="mt-4 space-y-4">
            {faq.map((item, i) => (
              <div key={i}>
                <dt className="font-medium text-foreground">{item.question}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {whyNote ? <p className="mt-8 text-xs text-muted-foreground">{whyNote}</p> : null}
    </>
  );
}
