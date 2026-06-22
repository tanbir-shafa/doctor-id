import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The Terms of Service for Daktar.Link, the doctor directory operated by Shafa Care Ltd in Bangladesh — covering acceptable use, verification, no-scraping/AI restrictions, and your rights.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of Service"
      intro="These Terms of Service govern your use of Daktar.Link, a free, public directory of Bangladeshi doctors operated by Shafa Care Ltd. They apply to everyone who uses the site — members of the public searching for a doctor, and doctors who claim and manage their own profile. Please read them carefully, because by using Daktar.Link you agree to be bound by them."
      updated="22 June 2026"
      sections={[
        {
          heading: "1. Acceptance of these Terms",
          paragraphs: [
            `By accessing or using Daktar.Link (the "Service"), whether as a member of the public or as a doctor claiming or managing a profile, you agree to be bound by these Terms of Service and by our Privacy Policy, which is incorporated by reference. If you do not agree with any part of these Terms, you should not use the Service.`,
            `The Service is operated by Shafa Care Ltd ("Shafa Care", "we", "us" or "our"), a company established under the laws of Bangladesh. These Terms take effect on 19 June 2026 and form a legally binding agreement between you and us.`,
            `If you use the Service on behalf of another person or an organisation, you confirm that you are authorised to accept these Terms on their behalf.`,
          ],
        },
        {
          heading: "2. What Daktar.Link is — and what it is not",
          paragraphs: [
            `Daktar.Link is an information directory. It lists publicly available professional details about doctors in Bangladesh — such as name, specialty, qualifications, chambers, and consultation schedules — so that members of the public can find a doctor and so that doctors can maintain an accurate public profile. The Service is currently provided free of charge; the basis on which it is offered is described in section 8.`,
            `The Service does not provide medical advice, diagnosis, or treatment, and nothing on Daktar.Link should be relied upon as a substitute for consultation with a qualified healthcare professional. We do not recommend or endorse any particular doctor, and a listing on Daktar.Link is not a guarantee of any doctor's competence, availability, or fitness for your needs. In a medical emergency you should seek immediate professional care and not rely on the Service.`,
            `Where the Service allows you to send an appointment request to a doctor, that request is exactly that — a request, and not a confirmed or guaranteed booking. A doctor is under no obligation to accept, respond to, or honour any request, and any appointment, fee, treatment, or arrangement is solely a matter between you and the doctor or their chamber. Daktar.Link is not a party to that relationship.`,
            `Many profiles were compiled from information that was already publicly available on the internet and are shown as "unclaimed" until the doctor concerned claims them. Unclaimed information is provided for general reference, may be incomplete or out of date, and has not been confirmed by the doctor.`,
          ],
        },
        {
          heading: "3. Doctor and claimant responsibilities; accounts and verification",
          paragraphs: [
            `To register, claim a profile, or hold a doctor account, you confirm that you are a medical professional registered with the Bangladesh Medical and Dental Council (BMDC), that you are claiming only your own professional identity, and that you are legally entitled to do so. Registration requires your phone number (with sign-in by one-time SMS code rather than a password), your BMDC registration number, your name, and a mandatory live-camera selfie used solely to deter fraudulent claims. You are responsible for keeping access to your registered phone number secure and for all activity under your account.`,
            `Daktar.Link currently offers two independent, free verifications, each reviewed by a real person and ordinarily completed within around 24 hours: BMDC professional registration, and identity (a government-issued photo ID together with your legal name). A profile that passes both checks displays a blue "Verified" tick. Verification confirms only the matters checked; it is not a warranty of clinical quality, and we may withhold, revoke, or re-review a verification at any time, including where information later appears inaccurate. Identity documents and selfies are held in private storage and are accessible only to authorised reviewers through short-lived secure links.`,
            `If you claim or manage a profile, you are responsible for ensuring that the information you publish is accurate, lawful, not misleading, and kept current — in particular your registration status, qualifications, chambers, and schedule. You must promptly correct or remove information that becomes inaccurate. A doctor may claim a profile, correct its details, or request its removal; a person who believes a profile is inaccurate, misattributed, or should be removed may contact us at support@daktar.link or on 01531390647, or use the in-page reporting tool, and we will review such requests.`,
          ],
        },
        {
          heading: "4. Acceptable use",
          paragraphs: [
            `You agree to use the Service only for lawful purposes and in a manner consistent with these Terms. The Service is made available solely so that individual members of the public can find a doctor and doctors can manage their own profile. It is not made available for collection, copying, aggregation, or reuse at scale by any person or system.`,
            `You must not, and must not authorise, enable, or assist any other person, bot, agent, or automated system to: scrape, crawl, spider, harvest, index, cache, copy, mirror, bulk-download, or otherwise systematically extract or collect any data or content from the Service; access the Service through any robot, scraper, headless browser, or other automated means; or circumvent, probe, disable, or test its security, rate-limiting, access-control, or bot-protection measures, or place an unreasonable load on its infrastructure. The only exceptions are a general-purpose search engine, or an AI-powered search or answer engine, that indexes the Service in order to surface and cite individual results to a user with a link back to the relevant page, where it does so in accordance with our robots.txt and does not bulk-extract, retain, or redistribute the directory.`,
            `You must not use the Service, or any data or content obtained from it, to train, fine-tune, develop, benchmark, or build a dataset for any artificial-intelligence or machine-learning system, large language model, or generative-AI tool, and you must not carry out text or data mining on the Service. No licence for text or data mining, or for using the Service or its content to train or develop artificial-intelligence systems, is granted by these Terms or by access to the Service; we expressly reserve all such rights, and this clause is an express reservation of rights for the purposes of any applicable text-and-data-mining or copyright law. This reservation does not prohibit an AI-powered search or answer engine from indexing the Service to surface and cite individual results to a user with a link back to the relevant page, where it acts in accordance with our robots.txt — that limited, attributed search use is permitted on the same basis as a general-purpose search engine. We deploy technical measures to enforce these restrictions — including robots.txt directives, machine-readable rights-reservation signals, rate-limiting, and bot protection — and a breach of this clause is a serious violation of these Terms that may result in immediate termination and legal action.`,
            `You must not impersonate any doctor or other person, claim a profile that is not your own, submit false, forged, or misleading information or documents, or use another person's identity or credentials. You must not use the Service to harass, defame, threaten, or abuse any person; to send spam or unsolicited communications; to upload unlawful, infringing, or harmful content; or to collect contact details for marketing or any purpose the relevant person has not consented to.`,
            `Contact details such as a doctor's phone number and email are private by default and are shown only where the doctor has chosen to display them; you must respect those privacy settings and must not attempt to obtain or use private contact information by other means. We may investigate suspected breaches and take any action we consider appropriate.`,
          ],
        },
        {
          heading: "5. Intellectual property and content",
          paragraphs: [
            `The Service, including its software, design, layout, text, graphics, and trade marks (including the names "Daktar.Link" and "Shafa Care"), is owned by or licensed to Shafa Care and is protected by applicable intellectual property laws. Except as expressly permitted by these Terms or by law, you may not copy, reproduce, modify, distribute, or create derivative works from the Service without our prior written consent. We reserve all rights not expressly granted, including all rights in the compiled directory and its contents against text and data mining and artificial-intelligence training.`,
            `Where you submit content to a profile — such as your professional details, qualifications, chamber information, or photographs — you confirm that you have the right to do so and that the content does not infringe the rights of any third party. You grant Shafa Care a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, display, and distribute that content for the purpose of operating, promoting, and improving the Service, including its public profile pages and search functionality.`,
            `Profile information drawn from publicly available sources remains subject to any rights held by the original sources or the doctors concerned, and our compilation and presentation of that information is provided for directory purposes only.`,
          ],
        },
        {
          heading: "6. Disclaimers and limitation of liability",
          paragraphs: [
            `The Service is provided "as is" and "as available", without warranties of any kind, whether express or implied, to the fullest extent permitted by law. We do not warrant that the Service will be uninterrupted, secure, or error-free, or that any information in the directory — particularly unclaimed or third-party-sourced information — is accurate, complete, current, or reliable. You use the Service, and rely on any information obtained through it, at your own risk.`,
            `Daktar.Link is an information directory and is not a healthcare provider. We are not responsible for, and accept no liability for, any clinical advice, diagnosis, treatment, outcome, conduct, fee, or other dealing between you and any doctor, chamber, or third party, nor for any decision you make on the basis of information in the directory. Any relationship between a patient and a doctor is solely between those parties.`,
            `To the fullest extent permitted by law, Shafa Care and its directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data, goodwill, or other intangible losses, arising out of or in connection with your use of, or inability to use, the Service. Nothing in these Terms limits or excludes any liability that cannot lawfully be limited or excluded under the laws of Bangladesh.`,
          ],
        },
        {
          heading: "7. Suspension and termination",
          paragraphs: [
            `We may suspend, restrict, or terminate your access to the Service, or remove, unpublish, or amend any profile or content, at any time and without prior notice, where we reasonably believe you have breached these Terms, where required by law, where information appears inaccurate or fraudulent, or to protect the Service, its users, or any third party.`,
            `A doctor may stop using the Service, unpublish or request removal of their profile, or close their account at any time by contacting us at support@daktar.link or on 01531390647. Termination does not affect any rights or obligations that arose before it, and the provisions of these Terms that by their nature should survive — including intellectual property, disclaimers, and limitation of liability — will continue to apply after termination.`,
          ],
        },
        {
          heading: "8. Fees, free services, and promotional offers",
          paragraphs: [
            `Daktar.Link is currently provided free of charge. Listing, claiming a profile, both verification checks, and any related benefit — including any complimentary access we may offer to Shafa Care's other products, such as a free clinic-software or EMR account — are offered at our discretion as a promotional or goodwill benefit. They are not a permanent entitlement, and no statement on the Service that something is "free" is a promise that it will remain free.`,
            `We reserve the right, at our sole discretion and at any time, and in the interests of the business, to introduce, change, suspend, limit, withdraw, or discontinue any feature, service, verification, benefit, or free or promotional offer, in whole or in part, and to begin charging fees for any feature that is currently provided free of charge. We will give reasonable notice of a material change where it is practicable to do so, but we are not obliged to, and we are not liable to you or to any third party for introducing, changing, withdrawing, or discontinuing any free or promotional offer.`,
            `Where we introduce a fee, it will not apply retroactively, and we will tell you the applicable charges before you incur them, so that you may choose whether or not to use the paid feature. Your continued use of a feature after a fee or change to these Terms takes effect means you accept it. Nothing in this section requires us to provide any service, benefit, or offer free of charge, and the discontinuation of a free or promotional offer is not a breach of these Terms.`,
          ],
        },
        {
          heading: "9. Governing law, changes, and contact",
          paragraphs: [
            `These Terms, and any dispute or claim arising out of or in connection with them or the Service, are governed by the laws of Bangladesh — including, where applicable, the Personal Data Protection Ordinance, 2025 — and you agree to submit to the exclusive jurisdiction of the competent courts of Dhaka, Bangladesh.`,
            `We may update these Terms from time to time, for example to reflect changes to the Service or to legal requirements. When we do, we will revise the effective date shown above and, where the changes are material, take reasonable steps to bring them to your attention. Your continued use of the Service after a change takes effect means you accept the updated Terms.`,
            `If you have any questions about these Terms, or wish to make a claim, correction, or removal request, please contact Shafa Care Ltd at support@daktar.link or on 01531390647.`,
          ],
        },
      ]}
    />
  );
}
