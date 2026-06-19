import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "About Daktar.Link — a free, verified directory of Bangladeshi doctors",
  description:
    "Daktar.Link is a free, verified public directory of Bangladeshi doctors, built and operated by Shafa Care Ltd. Find a doctor, or claim your profile.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About Daktar.Link"
      intro="Daktar.Link is a free, public directory of doctors practising in Bangladesh. Every doctor has a profile page anyone can visit, and verified profiles carry a blue tick that means a real person has checked the doctor's credentials and identity. It is built and operated by Shafa Care Ltd."
      sections={[
        {
          heading: "What Daktar.Link is, and why it exists",
          paragraphs: [
            `Finding a trustworthy doctor in Bangladesh is harder than it should be. Listings are scattered across clinic websites and aggregators, credentials are difficult to confirm, and patients are often left guessing. Daktar.Link exists to fix that with one simple, durable thing: a clean public profile for every doctor, at a stable web address (daktar.link followed by the doctor's name), that a doctor can put on a WhatsApp bio, a prescription pad, or a business card.`,
            `The directory is free to use and free to be listed in. We think of it as a gift to the profession and to the patients it serves. It is also the front door to something larger: Daktar.Link is the supply-side channel for Shafa Care's forthcoming electronic medical record (EMR) and hospital management product. Doctors who establish a verified presence here are first in line for those tools as they arrive, but nothing on this directory is locked behind them.`,
          ],
        },
        {
          heading: "Who operates it",
          paragraphs: [
            `Daktar.Link is built and operated by Shafa Care Ltd, a Bangladesh-based health technology company. Shafa Care builds clinical software for doctors and clinics, and the directory is the public, patient-facing part of that mission.`,
            `Because the same team is building the future EMR, the profile data model is designed from day one to feed it cleanly. That means the structured information a doctor maintains here — qualifications, specialties, chambers, schedules — is captured properly rather than as loose text, so it carries forward without a doctor having to re-enter it later.`,
          ],
        },
        {
          heading: "Who it serves",
          paragraphs: [
            `For patients and the public, Daktar.Link is a way to search for a doctor by specialty and district, see their qualifications, chambers, weekly schedule and consultation fees, and judge at a glance whether the profile has been verified. Where a doctor has claimed their profile, a patient can send an appointment request directly from the page. Please note that an appointment request is exactly that — a request, not a confirmed booking — and that Daktar.Link provides no medical advice and is not a substitute for professional medical care.`,
            `For doctors, Daktar.Link is a profile you own and control. Many profiles on the directory were compiled from information that was already publicly available on the internet and are listed as unclaimed until the doctor claims them. Once you claim your profile you can correct any detail, decide what is shown, get verified, and request removal if you wish. Your contact details stay private: a doctor's phone number and email are hidden by default, and the WhatsApp contact button is opt-in, so you choose what patients can see.`,
          ],
        },
        {
          heading: "How we build trust: the blue tick",
          paragraphs: [
            `Verification on Daktar.Link runs along two independent axes. The first is professional registration with the Bangladesh Medical & Dental Council (BMDC). The second is identity — confirming the person behind the profile using a government photo ID and their legal name. Each axis is reviewed individually by a real member of our team, both are currently free, and review is typically completed within 24 hours.`,
            `When both axes are confirmed, the profile earns the blue Verified tick. A profile that has cleared only one axis shows its own, lesser status rather than the full tick, so the badge always means what it says. We take care with the sensitive documents this requires: the live-camera selfie collected at registration and any government ID are kept in private storage and are readable only through short-lived, time-limited links generated solely for our reviewers — they are never exposed on a public page.`,
            `To protect both patients and doctors against impersonation, registration is anti-fraud by design. A doctor signs up with a phone number and a one-time SMS code (there is no password to leak), their BMDC registration number, their name, and a mandatory live selfie taken on the spot. Email is optional.`,
          ],
        },
        {
          heading: "Claim your profile or get in touch",
          paragraphs: [
            `If you are a doctor, the best first step is to find your profile and claim it. Registration takes a few minutes from any phone with a camera, and once you are claimed and verified your profile becomes a credible, shareable home for your practice — at no cost.`,
            `If you have spotted an error, want a profile corrected or removed, or have a question about how the directory works, we want to hear from you. You can reach the Daktar.Link team at support@daktar.link or on 01531390647, operated by Shafa Care Ltd. For questions about how your personal information is handled, please also see our Privacy and Terms pages.`,
          ],
        },
      ]}
    />
  );
}
