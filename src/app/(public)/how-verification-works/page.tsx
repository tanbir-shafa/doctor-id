import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "How verification works on Daktar.Link",
  description:
    "How Daktar.Link verifies doctors: BMDC registration plus government-ID identity, each reviewed by a real person within about 24 hours, free.",
  alternates: { canonical: "/how-verification-works" },
};

export default function HowVerificationWorksPage() {
  return (
    <ContentPage
      title="How verification works"
      intro="Daktar.Link is a free, public directory of doctors in Bangladesh, built and operated by Shafa Care Ltd. Trust is the whole point of the directory, so we verify doctors along two separate lines: their professional registration with the Bangladesh Medical and Dental Council (BMDC), and their personal identity using a government-issued photo ID. This page explains exactly what each check means, how a profile earns the blue Verified tick, and how a doctor gets verified."
      sections={[
        {
          heading: "Two checks, reviewed separately",
          paragraphs: [
            `Every doctor profile on Daktar.Link can be verified along two independent axes. The first is professional registration: we confirm the doctor's BMDC registration number, the credential that licenses a person to practise medicine or dentistry in Bangladesh. The second is identity: we confirm the person behind the profile by checking a government-issued photo ID against the legal name on the profile.`,
            `The two checks are deliberately kept apart because they answer different questions. BMDC registration tells you the person is a registered medical or dental practitioner. Identity verification tells you the profile genuinely belongs to that named individual. A profile can pass one, both, or neither, and we show that state honestly rather than rounding it up.`,
            `Each axis is reviewed by a real member of our team, not an automated decision, and verification is currently free for doctors. We aim to complete each review within about 24 hours of a complete submission.`,
          ],
        },
        {
          heading: "What the blue Verified tick means",
          paragraphs: [
            `The blue Verified tick is reserved for profiles that have passed both checks: BMDC professional registration and government-ID identity. It is the highest level of trust on Daktar.Link, and it means we have confirmed both that the person is a registered practitioner and that the profile genuinely belongs to them.`,
            `Partial states are shown as their own labels rather than the blue tick. A profile may be marked BMDC verified, meaning the professional registration has been confirmed but identity has not yet been, or identity verified, meaning the government ID has been confirmed but BMDC registration has not. These partial labels are not the full Verified status, and we never present a single check as if it were both.`,
            `On a public profile, you can tap the badge to see a plain-language breakdown of exactly what has and has not been confirmed for that doctor, so the meaning is never hidden behind a symbol.`,
          ],
        },
        {
          heading: "Anti-fraud: the live selfie at sign-up",
          paragraphs: [
            `When a doctor registers, they must complete a live, on-the-spot selfie taken through their device camera. This is mandatory and cannot be replaced by uploading an existing photo. It exists to make impersonation harder: it ties the new account to a real person present at the moment of registration.`,
            `The selfie, along with any government photo ID submitted for identity verification, is stored in a private storage area that is not publicly accessible. These sensitive images are never shown on the public profile. They can only be opened by our review team through short-lived, secure links generated solely for the purpose of carrying out a verification review.`,
          ],
        },
        {
          heading: "Unverified and unclaimed listings",
          paragraphs: [
            `Many profiles on Daktar.Link were created from information that was already publicly available on the internet. Until the doctor takes ownership of their page, it is shown as an unclaimed profile and carries no Verified badge.`,
            `An unclaimed or unverified listing simply means we have not yet confirmed the credentials and identity behind it through our own checks. The information may still be accurate, but it has not passed Daktar.Link verification. We label these clearly so you can weigh the listing accordingly.`,
            `Any doctor can claim their own profile to correct the information, request its removal, or take it through verification. Patients should also remember that Daktar.Link is a directory: it provides no medical advice, an appointment sent through the site is a request rather than a confirmed booking, and nothing here is a substitute for professional medical care.`,
          ],
        },
        {
          heading: "How a doctor gets verified",
          paragraphs: [
            `Getting verified starts with owning your profile. Register with your phone number and confirm a one-time code sent by SMS; there is no password to remember. You will provide your BMDC registration number and your name, complete the mandatory live selfie, and optionally add an email address. If a profile for you already exists from a public source, you can claim that page instead of creating a new one.`,
            `For BMDC verification, submit your registration number and any supporting documents from your dashboard. For identity verification, submit a government-issued photo ID (such as your National ID, passport, or driving licence) together with your legal first and last name. The two requests are handled separately, so you can pursue one or both.`,
            `A reviewer checks each submission by hand, normally within about 24 hours, and the relevant badge appears on your profile once a check passes. To protect the identity binding, granting identity verification locks your public display name to your verified legal name; if you later change your first or last name, identity verification is withdrawn until it is reviewed again. Your phone number and email stay private by default, and the optional WhatsApp contact button only appears if you choose to switch it on.`,
          ],
        },
      ]}
    />
  );
}
