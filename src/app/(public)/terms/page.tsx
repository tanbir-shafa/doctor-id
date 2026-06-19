import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The Terms of Service for Daktar.Link, the free doctor directory operated by Shafa Care Ltd in Bangladesh. Draft pending legal review.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of Service"
      draftNotice="Draft — pending legal review. This document is a working draft and is not yet legally binding; it must be reviewed and approved by qualified legal counsel before publication."
      intro="These Terms of Service govern your use of Daktar.Link, a free, public directory of Bangladeshi doctors operated by Shafa Care Ltd. They apply to everyone who uses the site — members of the public searching for a doctor, and doctors who claim and manage their own profile. Please read them carefully, because by using Daktar.Link you agree to be bound by them."
      updated="[effective date]"
      sections={[
        {
          heading: "1. Acceptance of these Terms",
          paragraphs: [
            `By accessing or using Daktar.Link (the "Service"), whether as a member of the public or as a doctor claiming or managing a profile, you agree to be bound by these Terms of Service and by our Privacy Policy, which is incorporated by reference. If you do not agree with any part of these Terms, you should not use the Service.`,
            `The Service is operated by [Shafa Care Ltd registered legal name] ("Shafa Care", "we", "us" or "our"), a company established under the laws of Bangladesh, with its registered office at [Shafa Care Ltd registered address]. These Terms take effect on [effective date] and form a legally binding agreement between you and us.`,
            `If you use the Service on behalf of another person or an organisation, you confirm that you are authorised to accept these Terms on their behalf.`,
          ],
        },
        {
          heading: "2. What Daktar.Link is — and what it is not",
          paragraphs: [
            `Daktar.Link is an information directory. It lists publicly available professional details about doctors in Bangladesh — such as name, specialty, qualifications, chambers, and consultation schedules — so that members of the public can find a doctor and so that doctors can maintain an accurate public profile. The Service is provided free of charge.`,
            `The Service does not provide medical advice, diagnosis, or treatment, and nothing on Daktar.Link should be relied upon as a substitute for consultation with a qualified healthcare professional. We do not recommend or endorse any particular doctor, and a listing on Daktar.Link is not a guarantee of any doctor's competence, availability, or fitness for your needs. In a medical emergency you should seek immediate professional care and not rely on the Service.`,
            `Where the Service allows you to send an appointment request to a doctor, that request is exactly that — a request, and not a confirmed or guaranteed booking. A doctor is under no obligation to accept, respond to, or honour any request, and any appointment, fee, treatment, or arrangement is solely a matter between you and the doctor or their chamber. Daktar.Link is not a party to that relationship.`,
            `Many profiles were compiled from publicly available Bangladeshi sources and are shown as "unclaimed" until the doctor concerned claims them. Unclaimed information is provided for general reference, may be incomplete or out of date, and has not been confirmed by the doctor.`,
          ],
        },
        {
          heading: "3. Doctor and claimant responsibilities; accounts and verification",
          paragraphs: [
            `To register, claim a profile, or hold a doctor account, you confirm that you are a medical professional registered with the Bangladesh Medical and Dental Council (BMDC), that you are claiming only your own professional identity, and that you are legally entitled to do so. Registration requires your phone number (with sign-in by one-time SMS code rather than a password), your BMDC registration number, your name, and a mandatory live-camera selfie used solely to deter fraudulent claims. You are responsible for keeping access to your registered phone number secure and for all activity under your account.`,
            `Daktar.Link offers two independent, free verifications, each reviewed by a real person and ordinarily completed within around 24 hours: BMDC professional registration, and identity (a government-issued photo ID together with your legal name). A profile that passes both checks displays a blue "Verified" tick. Verification confirms only the matters checked; it is not a warranty of clinical quality, and we may withhold, revoke, or re-review a verification at any time, including where information later appears inaccurate. Identity documents and selfies are held in private storage and are accessible only to authorised reviewers through short-lived secure links.`,
            `If you claim or manage a profile, you are responsible for ensuring that the information you publish is accurate, lawful, not misleading, and kept current — in particular your registration status, qualifications, chambers, and schedule. You must promptly correct or remove information that becomes inaccurate. A doctor may claim a profile, correct its details, or request its removal; a person who believes a profile is inaccurate, misattributed, or should be removed may contact us at [contact email — to be confirmed] or use the in-page reporting tool, and we will review such requests.`,
          ],
        },
        {
          heading: "4. Acceptable use",
          paragraphs: [
            `You agree to use the Service only for lawful purposes and in a manner consistent with these Terms. You must not scrape, crawl, harvest, bulk-download, or systematically extract data or content from the Service by automated means; circumvent, probe, or test the security, rate-limiting, or bot-protection measures that protect it; or place an unreasonable load on our infrastructure.`,
            `You must not impersonate any doctor or other person, claim a profile that is not your own, submit false, forged, or misleading information or documents, or use another person's identity or credentials. You must not use the Service to harass, defame, threaten, or abuse any person; to send spam or unsolicited communications; to upload unlawful, infringing, or harmful content; or to collect contact details for marketing or any purpose the relevant person has not consented to.`,
            `Contact details such as a doctor's phone number and email are private by default and are shown only where the doctor has chosen to display them; you must respect those privacy settings and must not attempt to obtain or use private contact information by other means. We may investigate suspected breaches and take any action we consider appropriate.`,
          ],
        },
        {
          heading: "5. Intellectual property and content",
          paragraphs: [
            `The Service, including its software, design, layout, text, graphics, and trade marks (including the names "Daktar.Link" and "Shafa Care"), is owned by or licensed to Shafa Care and is protected by applicable intellectual property laws. Except as expressly permitted by these Terms or by law, you may not copy, reproduce, modify, distribute, or create derivative works from the Service without our prior written consent.`,
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
            `A doctor may stop using the Service, unpublish or request removal of their profile, or close their account at any time by contacting us at [contact email — to be confirmed]. Termination does not affect any rights or obligations that arose before it, and the provisions of these Terms that by their nature should survive — including intellectual property, disclaimers, and limitation of liability — will continue to apply after termination.`,
          ],
        },
        {
          heading: "8. Governing law, changes, and contact",
          paragraphs: [
            `These Terms, and any dispute or claim arising out of or in connection with them or the Service, are governed by the laws of Bangladesh, and you agree to submit to the jurisdiction of the competent courts of Bangladesh [governing-law and jurisdiction specifics].`,
            `We may update these Terms from time to time, for example to reflect changes to the Service or to legal requirements. When we do, we will revise the effective date shown above and, where the changes are material, take reasonable steps to bring them to your attention. Your continued use of the Service after a change takes effect means you accept the updated Terms.`,
            `If you have any questions about these Terms, or wish to make a claim, correction, or removal request, please contact [Shafa Care Ltd registered legal name] at [contact email — to be confirmed] or at [Shafa Care Ltd registered address].`,
          ],
        },
      ]}
    />
  );
}
