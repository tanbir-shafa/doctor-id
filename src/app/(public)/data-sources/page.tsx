import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";

export const metadata: Metadata = {
  title: "Our data sources & editorial policy",
  description:
    "How Daktar.Link compiles, verifies and corrects doctor profiles — and how doctors claim, fix or remove their own listing. Free, person-reviewed.",
  alternates: { canonical: "/data-sources" },
};

export default function DataSourcesPage() {
  return (
    <ContentPage
      title="Data sources & editorial policy"
      intro="Daktar.Link is a public, SEO-first directory of Bangladeshi doctors operated by Shafa Care Ltd. This page explains where our profile information comes from, how we handle accuracy, and how any doctor can claim, correct, or remove their own listing. We want patients to trust what they read here, so we are open about what is compiled from public sources and what has been verified by a real person."
      sections={[
        {
          heading: "Where our profiles come from",
          paragraphs: [
            `Many of the profiles you see on Daktar.Link were compiled from publicly available Bangladeshi sources — for example doctor directories published by Popular Diagnostic, Ibn Sina, Sasthya Seba, Doctime, and Doctor Bangladesh. We gathered information that was already publicly listed, such as a doctor's name, specialty, qualifications, and chamber details, and organised it into a single, searchable profile.`,
            `Profiles built this way are clearly marked as unclaimed until the doctor concerned takes ownership of the listing. An unclaimed profile is a compilation of publicly available facts; it has not been confirmed or curated by the doctor, and it has not passed our verification checks. We store the original source against each compiled profile so that its provenance is traceable.`,
            `We do not publish private contact details from these sources. A doctor's personal phone number and email are private by default and are only displayed if the doctor later claims their profile and chooses to opt in to showing them.`,
          ],
        },
        {
          heading: "Unclaimed, claimed and verified — the difference",
          paragraphs: [
            `There are three states a profile can be in, and we keep the distinction clear so patients know how much weight to give the information. An unclaimed profile is compiled from public directories and is not maintained by the doctor. A claimed profile is one the doctor has taken control of, so they can correct and keep it up to date. A verified profile additionally carries our checks.`,
            `Verification on Daktar.Link has two independent axes. The first is BMDC professional registration, confirming the doctor's medical registration. The second is identity, confirming a government photo ID against the legal name on the profile. Each axis is reviewed individually by a real person, is free of charge, and is typically completed within 24 hours. When both axes are confirmed, the profile shows a blue Verified tick; a profile that has passed only one axis displays that partial status rather than the full tick.`,
            `Documents submitted for verification — the live registration selfie and any government ID — are held in private storage and are never shown publicly. They are readable only by our reviewers through short-lived, expiring links, solely to confirm the person is who they say they are.`,
          ],
        },
        {
          heading: "How we handle accuracy",
          paragraphs: [
            `Compiled information can be out of date or imperfect, because the public sources it came from can be out of date. We are honest about this: an unclaimed listing reflects what was publicly available at the time of compilation, not a curated record maintained by the doctor. The most reliable profiles are the ones a doctor has claimed and verified, because the doctor is then responsible for the content and we have confirmed their registration and identity.`,
            `Every published profile carries a Report this profile link so that anyone can flag a problem — for example impersonation, incorrect credentials, or details that are simply wrong. Reports are reviewed by our team. We would always rather correct a profile than leave inaccurate information online, so we encourage doctors, patients, and colleagues to tell us when something looks off.`,
          ],
        },
        {
          heading: "How a doctor claims, corrects, or removes a listing",
          paragraphs: [
            `If a profile is yours, you can claim it and take full control. Registration uses your phone number and a one-time code sent by SMS — there is no password to remember. To register you provide your BMDC registration number, your name, and a mandatory live-camera selfie, which we use to deter impersonation and fraud; an email address is optional. Once you have claimed the profile you can correct every field, manage your chambers and schedule, and decide whether to display your contact details.`,
            `Claiming and verification are free. After claiming, you can request BMDC and identity verification from your dashboard, each reviewed by a person and usually completed within a day, to earn the blue Verified tick.`,
            `If you would prefer not to be listed at all, you can request removal. Use the Report this profile link on your listing, or contact us at [privacy@daktar.link], and we will review your request. We respect a doctor's choice about whether their compiled profile remains public.`,
          ],
        },
        {
          heading: "Our editorial stance",
          paragraphs: [
            `Daktar.Link publishes factual professional information only — a doctor's name, specialty, qualifications, chambers, and consultation schedule. We do not publish opinions, ratings dressed up as fact, or anything that is not part of a doctor's professional record.`,
            `Crucially, Daktar.Link does not provide medical advice and is not a substitute for professional medical care. The directory helps you find and contact a doctor; it does not diagnose, treat, or recommend treatment. Where a profile is claimed, you may send the doctor an appointment request, but this is a request to be in touch, not a confirmed booking. For any health concern, please consult a qualified medical professional directly.`,
          ],
        },
      ]}
    />
  );
}
