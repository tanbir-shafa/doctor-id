import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "Editorial & medical-review policy",
  description:
    "How Daktar.Link's health guides are written, medically reviewed, sourced and kept up to date — and how to report an error. Patient-first, evidence-based.",
  alternates: { canonical: "/editorial-policy" },
};

export default function EditorialPolicyPage() {
  return (
    <ContentPage
      title="Editorial & medical-review policy"
      intro="Our health guides are written to help patients in Bangladesh understand a condition before and after they see a doctor. They are general education, never a substitute for personal medical advice. This page explains who writes and reviews the guides, what sources we rely on, and how we keep them accurate."
      updated="22 June 2026"
      sections={[
        {
          heading: "Who writes and who reviews",
          paragraphs: [
            "Each guide is drafted by the Daktar.Link editorial team in plain language and then reviewed for medical accuracy by a qualified, BMDC-registered doctor before it is published. The reviewing clinician's name and credentials are shown on the guide, together with the date the review was completed, so you can see who stands behind the content and how recent that check is.",
            "A guide that has not yet completed medical review is not published — it stays an internal draft. Only reviewed, published guides appear in the public health-guides section.",
          ],
        },
        {
          heading: "What our guidance is based on",
          paragraphs: [
            "We base our guides on authoritative, publicly recognised sources — the World Health Organization, Bangladesh's Directorate General of Health Services and national clinical guidelines, professional bodies, and peer-reviewed medical literature. Where a guide states a specific fact, threshold or recommendation, we list the references at the bottom of the page so you can read the original source yourself.",
            "When sources disagree or evidence is still emerging, we say so rather than presenting a single answer as settled. We avoid promoting specific brands, products or unproven treatments.",
          ],
        },
        {
          heading: "How we keep guides current and correct",
          paragraphs: [
            "Medical understanding changes, so guides carry a clear 'last reviewed' date and are re-checked periodically and whenever guidance materially changes. The reviewing doctor signs off again on each substantive update.",
            "If you spot something that looks out of date, incomplete or wrong, please tell us. We would always rather correct a guide than leave inaccurate health information online. Corrections are reviewed by the editorial team and, where the change is clinical, by a doctor before they go live.",
          ],
        },
        {
          heading: "Independence and our relationship to the directory",
          paragraphs: [
            "The guides are editorial content. They are not advertisements, and a doctor cannot pay to be named in or linked from a guide. Where a guide links to 'find a doctor' in a relevant specialty, that link points to a neutral category page in our directory, not to any individual paid placement.",
            "Daktar.Link is operated by Shafa Care Ltd. The directory and the guides are free to use. This editorial policy sits alongside our broader data and verification practices, which are described on our data-sources and verification pages.",
          ],
        },
      ]}
    />
  );
}
