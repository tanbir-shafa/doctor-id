import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Daktar.Link, operated by Shafa Care Ltd, collects, uses, stores and protects your data — and how to exercise your privacy rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy Policy"
      intro="This Privacy Policy explains how Daktar.Link, a public directory of Bangladeshi doctors operated by Shafa Care Ltd, collects, uses, stores and protects personal information when you browse profiles, register and manage a profile as a doctor, or send an appointment request. It applies to the Daktar.Link website and is governed by the laws of Bangladesh, including the Personal Data Protection Ordinance, 2025 and the constitutional right to privacy."
      updated="19 June 2026"
      sections={[
        {
          heading: "Who we are and what this policy covers",
          paragraphs: [
            `Daktar.Link is a public, search-engine-friendly directory of doctors practising in Bangladesh. It is operated by Shafa Care Ltd ("we", "us", "our") and is currently provided free of charge. Each doctor on Daktar.Link has their own public profile page at a daktar.link web address. The directory also serves as the channel through which doctors discover Shafa Care Ltd's wider clinical software, but using Daktar.Link does not enrol you in any other product.`,
            `This policy covers everyone who interacts with the site: members of the public who search for and view doctor profiles, doctors who register for, claim or manage a profile, and patients who send an appointment request to a doctor. It explains what data we collect, why, how long we keep it, who processes it on our behalf, and the rights available to you.`,
            `The controller responsible for your personal data — the "data fiduciary" under the Personal Data Protection Ordinance, 2025 — is Shafa Care Ltd, based in Bangladesh. Questions about this policy or your data can be sent to us by email at support@daktar.link or by phone on 01531390647.`,
          ],
        },
        {
          heading: "What we collect and why",
          paragraphs: [
            `For doctors who register or claim a profile, we collect a mobile phone number (used as your sign-in identity and to send one-time SMS codes — Daktar.Link does not use passwords for doctor accounts), your name, your BMDC registration number, and an optional email address. To protect against impersonation, registration also requires a mandatory live-camera selfie. If you request identity verification, we additionally collect a government-issued photo ID and your legal name. Your published profile content — name, specialties, qualifications, chambers, consultation schedule and similar professional details — is collected so it can be displayed publicly on your profile.`,
            `We use this information to operate your account and profile, to run our two independent, free verification checks — (1) BMDC professional registration and (2) identity (government photo ID plus legal name), each reviewed by a member of our team and typically completed within 24 hours — and to award the blue "Verified" tick when both checks pass. The selfie and any government ID are used solely for anti-fraud and verification review and are never shown publicly. Because a live-camera selfie is biometric information and a government photo ID is sensitive personal data under the Personal Data Protection Ordinance, 2025, we collect and process them only with your explicit consent — given when you choose to register or to request identity verification — and we apply heightened protection to them.`,
            `From patients who send an appointment request to a claimed doctor we collect the patient's name and phone number, the chosen chamber, a preferred date and time window, and the reason for the request, so the request can be passed to the doctor. An appointment request is a request only — it is not a confirmed booking, and Daktar.Link provides no medical advice and is not a substitute for professional medical care. For everyone, we automatically record limited technical data such as your IP address (used in pseudonymised form for rate-limiting and abuse prevention) and, subject to your consent, usage analytics via Google Analytics 4.`,
          ],
        },
        {
          heading: "How your data is stored and who processes it",
          paragraphs: [
            `Profile and cover photos are stored in a public cloud storage bucket on Amazon Web Services (AWS S3) so they can be served on your public profile. Sensitive identity material — your registration selfie and any government photo ID — is stored separately in a private AWS S3 bucket that is not publicly accessible; it can only be retrieved by our reviewers through short-lived, expiring presigned links during verification. Your account and profile records are held in our database on MongoDB Atlas.`,
            `We rely on a small number of trusted third-party processors (subprocessors) to run the service: AWS (cloud storage via S3, transactional email via SES, and DynamoDB), SSL Wireless for sending SMS one-time codes and notifications (with MDL retained only as a legacy fallback), Upstash for rate-limiting, MongoDB Atlas for our database, Google Analytics 4 for usage analytics, Cloudflare Turnstile for bot and abuse protection, and OpenStreetMap/Leaflet for displaying chamber maps. The site is hosted on AWS infrastructure (EC2 with nginx).`,
            `We apply data-protection best practice, including encryption at rest for uploaded files, transport encryption, pseudonymisation of IP addresses used for abuse prevention, and access controls that limit sensitive identity documents to authorised reviewers. If a personal-data breach occurs that is likely to cause you significant harm, we will notify you and the relevant authority within the time the law requires.`,
            `Some of these subprocessors may process data outside Bangladesh. Where personal data is transferred outside Bangladesh, we rely on your consent and/or the necessity of providing the service, transfer only to recipients that offer an adequate level of protection, and apply contractual and technical safeguards, consistent with the Personal Data Protection Ordinance, 2025. Certain categories of data may be required by law to be stored within Bangladesh, and we keep our infrastructure under review to meet those requirements.`,
          ],
        },
        {
          heading: "Privacy by default, cookies and analytics",
          paragraphs: [
            `Your contact details are private by default. A doctor's phone number and email address are not shown on the public profile unless the doctor explicitly opts in to display them, and the WhatsApp contact button is also opt-in. Published professional information — your name, specialty, qualifications, chambers and schedule — is public, because the purpose of the directory is to help patients find doctors.`,
            `We use cookies and similar technologies that are strictly necessary to run the site securely — including those set by Cloudflare Turnstile to tell humans from automated abuse, and a small cookie that remembers your cookie-consent choice. Where we use Google Analytics 4 to understand how the site is used, it runs only with your consent: its cookies and scripts load only after you accept them in our cookie banner, and not at all if you decline. You can change your choice at any time using the "Cookie preferences" link in our footer.`,
          ],
        },
        {
          heading: "Data retention",
          paragraphs: [
            `We keep doctor account and published profile data for as long as the profile is active. If you ask us to delete your profile, we apply a soft delete: the profile is unpublished and removed from public view, and the account is disabled. We may then permanently delete the underlying records after a reasonable grace period, which lets us reverse accidental deletions and meet any legal record-keeping obligations.`,
            `Verification material is kept only as long as necessary for the purpose for which it was collected. We hold your registration selfie and any government photo ID to support verification and to prevent fraud, and we delete or anonymise them when they are no longer required for that purpose — unless we must keep them longer to investigate suspected fraud, resolve a dispute, or comply with a legal obligation. Appointment-request details are retained so doctors can manage and follow up on requests, and removed when no longer needed. Pseudonymised technical data used for rate-limiting and abuse prevention is short-lived. Where any law requires us to keep records, we retain them only for the period that law requires.`,
          ],
        },
        {
          heading: "Your rights and how to make a request",
          paragraphs: [
            `In line with the Personal Data Protection Ordinance, 2025, you have the right to access the personal information we hold about you, to receive it in an intelligible format (data portability), to correct inaccurate or incomplete information, to withdraw any consent you have given, and to request deletion of your profile and account, subject to applicable Bangladeshi law. Doctors can update most profile information directly from the dashboard and can soft-delete their own account from account settings; note that changing your verified legal name will revoke the identity verification badge until the name is re-verified.`,
            `Many profiles in the directory were compiled from information that was already publicly available on the internet and are shown as "Unclaimed" until the listed doctor claims them. If a profile is about you, you can claim it to take control, correct it, or request its removal. If you do not wish to manage it yourself, you can ask us to correct or remove it, and you can withdraw any consent you have given at any time.`,
            `To exercise any of these rights, or to ask a question about your data, contact us by email at support@daktar.link or by phone on 01531390647. We may need to verify your identity before acting on a request, particularly where sensitive verification material is involved, and we will respond within a reasonable time.`,
          ],
        },
        {
          heading: "Children, changes and contact",
          paragraphs: [
            `Daktar.Link is intended for doctors and for adults seeking to find a doctor. It is not directed at children, and we do not knowingly collect personal information from children, nor do we track, profile, or direct advertising at children. If you believe a child has provided us with personal information, please contact us so we can remove it.`,
            `We may update this Privacy Policy from time to time to reflect changes in our practices, our service, or the law. When we make material changes, we will update the effective date below and, where appropriate, provide additional notice on the site. Your continued use of Daktar.Link after an update takes effect means you accept the revised policy.`,
            `This policy is governed by the laws of Bangladesh, including the Personal Data Protection Ordinance, 2025. For any privacy-related query, contact Shafa Care Ltd at support@daktar.link or on 01531390647.`,
          ],
        },
      ]}
    />
  );
}
