/**
 * Seed the first cornerstone health guides (SEO task 47) into the Article
 * collection, as DRAFTS for editorial/medical review before publishing.
 *
 *   npm run seed:articles            # upsert the guides as drafts
 *   npm run seed:articles -- --dry-run
 *
 * Non-destructive + idempotent: an article that already exists (matched by
 * slug) is LEFT UNTOUCHED — re-running never clobbers content you've edited or
 * published. Only missing guides are created. Refuses NODE_ENV=production.
 *
 * ⚠️ This is AI-drafted patient-education content. It is production-GRADE
 * (structured, accurate, conservative) but is seeded as `draft` precisely so a
 * qualified person reviews it (set `reviewedBy` on approval) before it goes
 * live on this YMYL site. Publish each from /admin/articles after review.
 */

import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Article } from "@/lib/db/models";
import type { Loose } from "@/lib/db/models/loose";
import { assertSeedAllowed } from "./lib/prod-guard";

assertSeedAllowed("seed articles");

const DRY_RUN = process.argv.includes("--dry-run");

interface SeedArticle {
  title: string;
  slug: string;
  excerpt: string;
  specialties: string[];
  body: string;
  // Optional Bangla version (publishes at /bn/guides/[slug] when present).
  titleBn?: string;
  excerptBn?: string;
  bodyBn?: string;
}

const ARTICLES: SeedArticle[] = [
  {
    title: "High Blood Pressure: Symptoms, Causes, and When to See a Doctor",
    slug: "high-blood-pressure-symptoms-and-when-to-see-a-doctor",
    excerpt:
      "High blood pressure rarely causes symptoms but quietly raises your risk of heart attack, stroke and kidney disease. Here's what to watch for and when to see a doctor.",
    specialties: ["Cardiology", "General Medicine"],
    titleBn: "উচ্চ রক্তচাপ: উপসর্গ, কারণ এবং কখন ডাক্তার দেখাবেন",
    excerptBn:
      "উচ্চ রক্তচাপে সাধারণত কোনো উপসর্গ থাকে না, কিন্তু এটি নীরবে হার্ট অ্যাটাক, স্ট্রোক ও কিডনি রোগের ঝুঁকি বাড়ায়। কী লক্ষণ খেয়াল করবেন এবং কখন ডাক্তার দেখাবেন, জেনে নিন।",
    bodyBn: `উচ্চ রক্তচাপ (হাইপারটেনশন) বাংলাদেশে সবচেয়ে সাধারণ স্বাস্থ্য সমস্যাগুলোর একটি — এবং সবচেয়ে বিপজ্জনকগুলোর একটি, কারণ এতে সাধারণত কোনো উপসর্গই থাকে না। অনেকে তা টের পান হার্ট, কিডনি বা রক্তনালির ক্ষতি হয়ে যাওয়ার পরই।

## উচ্চ রক্তচাপ কী?

রক্তচাপ হলো ধমনির দেয়ালে রক্তের চাপ। এটি দুটি সংখ্যায় লেখা হয় — যেমন ১২০/৮০ mmHg। উপরের সংখ্যা (সিস্টোলিক) হৃৎপিণ্ড সংকুচিত হওয়ার সময়ের চাপ, নিচেরটি (ডায়াস্টোলিক) বিশ্রামের সময়ের চাপ। চাপ বারবার **১৪০/৯০ mmHg বা তার বেশি** থাকলে সাধারণত তাকে উচ্চ রক্তচাপ ধরা হয়।

## কেন একে "নীরব ঘাতক" বলা হয়

বেশিরভাগ মানুষ স্বাভাবিক বোধ করেন, কোনো সতর্কসংকেত থাকে না। কিন্তু বছরের পর বছর এই বাড়তি চাপ ধমনি ও অঙ্গপ্রত্যঙ্গের ক্ষতি করে, ফলে **হার্ট অ্যাটাক, স্ট্রোক, কিডনি বিকল ও দৃষ্টিশক্তি হারানোর** ঝুঁকি বাড়ে। তাই ভালো বোধ করলেও নিয়মিত মাপা জরুরি।

## যেসব লক্ষণ খেয়াল করবেন

সাধারণত কোনো উপসর্গ থাকে না। চাপ খুব বেশি হলে কারও কারও দেখা দিতে পারে:

- মাথাব্যথা, বিশেষত মাথার পেছনে বা সকালে
- মাথা ঘোরা
- ঝাপসা দৃষ্টি
- শ্বাসকষ্ট বা বুকে অস্বস্তি

এগুলো নির্ভরযোগ্য লক্ষণ নয় — রক্তচাপ জানার একমাত্র উপায় তা মাপা।

## ঝুঁকি বেশি কাদের

- পরিবারে উচ্চ রক্তচাপের ইতিহাস
- বয়স ৪০-এর বেশি
- অতিরিক্ত ওজন বা পরিশ্রমের অভাব
- লবণযুক্ত খাবার বেশি খাওয়া
- ধূমপান ও অতিরিক্ত মদ্যপান
- ডায়াবেটিস

## নিয়ন্ত্রণে রাখার উপায়

- লবণ ও লবণাক্ত খাবার কমান
- বেশি করে শাকসবজি, ফল ও আঁশযুক্ত খাবার খান
- প্রায় প্রতিদিন ৩০ মিনিট হাঁটার মতো শরীরচর্চা করুন
- স্বাস্থ্যকর ওজন বজায় রাখুন
- ধূমপান বর্জন করুন ও মদ্যপান সীমিত করুন
- ডাক্তার ওষুধ দিলে প্রতিদিন নিয়ম করে খান — **ভালো বোধ করলেই ওষুধ বন্ধ করবেন না।** বন্ধ করলে চাপ আবার বেড়ে যায়।

## কখন ডাক্তার দেখাবেন

অন্তত বছরে একবার রক্তচাপ মাপান; বয়স ৪০-এর বেশি হলে বা ঝুঁকি থাকলে আরও ঘন ঘন। একাধিকবার **১৪০/৯০ mmHg বা বেশি** এলে ডাক্তার দেখান।

চাপ **১৮০/১২০ mmHg বা বেশি** হওয়ার সঙ্গে বুকে ব্যথা, শ্বাসকষ্ট, তীব্র মাথাব্যথা, দৃষ্টিতে সমস্যা, শরীরের একপাশ দুর্বল হওয়া বা কথা বলতে অসুবিধা হলে — সঙ্গে সঙ্গে জরুরি চিকিৎসা নিন। এগুলো হার্ট অ্যাটাক বা স্ট্রোকের লক্ষণ হতে পারে।`,
    body: `High blood pressure, or hypertension, is one of the most common health problems in Bangladesh — and one of the most dangerous, precisely because it usually causes no symptoms at all. Many people only discover it after it has already damaged the heart, kidneys or blood vessels.

## What is high blood pressure?

Blood pressure is the force of blood pushing against the walls of your arteries. It is written as two numbers — for example, 120/80 mmHg. The top number (systolic) is the pressure when your heart beats; the bottom (diastolic) is the pressure when it rests between beats. A reading that stays at or above **140/90 mmHg** is generally considered high.

## Why it is called the "silent killer"

Most people with high blood pressure feel completely normal. There is often nothing to warn you. But over months and years, the extra pressure quietly damages your arteries and organs, increasing the risk of **heart attack, stroke, kidney failure and vision loss**. This is why regular checks matter even when you feel fine.

## Symptoms to watch for

There are usually no symptoms. When blood pressure becomes very high, some people notice:

- Headaches, often at the back of the head or in the morning
- Dizziness or a feeling of pressure in the head
- Blurred vision
- Shortness of breath or chest discomfort

These are not reliable signs — the only way to know your blood pressure is to measure it.

## Who is at higher risk

- A family history of high blood pressure
- Age over 40
- Being overweight or physically inactive
- A high-salt diet (common with restaurant and processed food)
- Smoking and excess alcohol
- Diabetes

## How to keep it under control

- Cut down on salt and salty foods
- Eat more vegetables, fruit and whole grains
- Aim for about 30 minutes of activity, such as brisk walking, on most days
- Reach and maintain a healthy weight
- Avoid smoking and limit alcohol
- If your doctor prescribes medicine, take it every day — **do not stop just because you feel well.** Blood pressure usually rises again once medication stops.

## When to see a doctor

Have your blood pressure checked at least once a year, or more often if you are over 40 or have any risk factors. See a doctor if a reading is **140/90 mmHg or higher** on more than one occasion.

Seek emergency care immediately if a reading is **180/120 mmHg or higher together with** chest pain, breathlessness, a severe headache, vision changes, weakness on one side of the body, or difficulty speaking — these can be signs of a heart attack or stroke.`,
  },
  {
    title: "Type 2 Diabetes: Early Signs and How to Manage It",
    slug: "type-2-diabetes-early-signs-and-management",
    excerpt:
      "Type 2 diabetes is common and often develops slowly. Learn the early signs, the risk factors, and the day-to-day steps that keep blood sugar under control.",
    specialties: ["Endocrinology", "Diabetic Medicine"],
    titleBn: "টাইপ ২ ডায়াবেটিস: প্রাথমিক লক্ষণ ও নিয়ন্ত্রণের উপায়",
    excerptBn:
      "টাইপ ২ ডায়াবেটিস সাধারণ এবং প্রায়ই ধীরে ধীরে দেখা দেয়। প্রাথমিক লক্ষণ, ঝুঁকির কারণ এবং রক্তে শর্করা নিয়ন্ত্রণে রাখার দৈনন্দিন উপায়গুলো জেনে নিন।",
    bodyBn: `বাংলাদেশে ডায়াবেটিস খুবই সাধারণ, আর সবচেয়ে প্রচলিত ধরন — টাইপ ২ ডায়াবেটিস — প্রায়ই বছরের পর বছর ধীরে ধীরে দেখা দেয়। আগেভাগে ধরা পড়লে ও ভালোভাবে নিয়ন্ত্রণ করলে অনেক জটিলতা এড়ানো যায়।

## টাইপ ২ ডায়াবেটিস কী?

আমরা যা খাই তা শরীর গ্লুকোজে (চিনি) পরিণত করে, আর ইনসুলিন নামের হরমোনের সাহায্যে কোষ সেই গ্লুকোজকে শক্তি হিসেবে ব্যবহার করে। টাইপ ২ ডায়াবেটিসে শরীর হয় যথেষ্ট ইনসুলিন তৈরি করে না, নয়তো ঠিকমতো ব্যবহার করতে পারে না — ফলে রক্তে চিনি জমতে থাকে। দীর্ঘদিন উচ্চ রক্তে চিনি চোখ, কিডনি, স্নায়ু ও রক্তনালির ক্ষতি করে।

## প্রাথমিক লক্ষণ

শুরুতে লক্ষণ মৃদু হতে পারে:

- বেশি পিপাসা ও বেশি পানি পান
- ঘন ঘন প্রস্রাব, বিশেষত রাতে
- ক্লান্তি বা দুর্বলতা
- ঝাপসা দৃষ্টি
- ক্ষত বা কাটা ধীরে শুকানো
- হাত-পায়ে ঝিনঝিন বা অবশভাব
- কারণ ছাড়াই ওজন কমা

## ঝুঁকি বেশি কাদের

- পরিবারে ডায়াবেটিসের ইতিহাস
- অতিরিক্ত ওজন, বিশেষত পেটের চারপাশে
- চিনি ও পরিশোধিত শর্করাযুক্ত খাবার বেশি খাওয়া
- শারীরিক পরিশ্রমের অভাব
- উচ্চ রক্তচাপ
- গর্ভকালীন ডায়াবেটিসের ইতিহাস

## নিয়ন্ত্রণের উপায়

টাইপ ২ ডায়াবেটিস "নিরাময়" হয় না, তবে বেশিরভাগ মানুষই ভালোভাবে নিয়ন্ত্রণে রাখতে পারেন:

- **খাবার:** সুষম খাবার খান, ভাত ও মিষ্টির পরিমাণ নিয়ন্ত্রণ করুন, শাকসবজি, ডাল ও আঁশযুক্ত খাবার বেছে নিন। চিনিযুক্ত পানীয় কমান।
- **পরিশ্রম:** নিয়মিত চলাফেরা, যেমন প্রতিদিন ৩০ মিনিট হাঁটা, শরীরকে ইনসুলিন ভালোভাবে ব্যবহারে সাহায্য করে।
- **ওজন:** সামান্য বাড়তি ওজন কমালেও রক্তে চিনি উন্নত হয়।
- **ওষুধ:** অনেকের ট্যাবলেট লাগে, কারও ইনসুলিন। ঠিক যেভাবে দেওয়া হয়েছে সেভাবে নিন।
- **পর্যবেক্ষণ:** পরামর্শ অনুযায়ী রক্তে চিনি মাপুন এবং নিয়মিত চোখ, কিডনি ও পায়ের পরীক্ষা করান।

## কখন ডাক্তার দেখাবেন

উপরের লক্ষণ দেখা দিলে, বা ঝুঁকি থাকা সত্ত্বেও সম্প্রতি পরীক্ষা না করালে ডাক্তার দেখান — একটি সাধারণ রক্ত পরীক্ষায় রোগটি নিশ্চিত হওয়া যায়। আগে থেকেই ডায়াবেটিস থাকলে নিয়মিত ডাক্তারের পরামর্শ নিন।

রক্তে চিনি খুব বেশি হওয়ার সঙ্গে বমি, ঝিমুনি, বিভ্রান্তি, দ্রুত শ্বাস বা মুখে ফলের মতো গন্ধ থাকলে — দ্রুত জরুরি চিকিৎসা নিন; এগুলো বিপজ্জনক ডায়াবেটিক জরুরি অবস্থার লক্ষণ হতে পারে।`,
    body: `Diabetes is very common in Bangladesh, and type 2 diabetes — the most common form — often develops slowly over years. Catching it early and managing it well can prevent serious complications.

## What is type 2 diabetes?

Your body turns the food you eat into glucose (sugar), which your cells use for energy with the help of a hormone called insulin. In type 2 diabetes, the body either does not make enough insulin or cannot use it properly, so glucose builds up in the blood. Over time, high blood sugar can damage the eyes, kidneys, nerves and blood vessels.

## Early signs to watch for

Symptoms can be mild at first and easy to miss:

- Feeling very thirsty and drinking more than usual
- Passing urine more often, especially at night
- Feeling tired or low on energy
- Blurred vision
- Cuts or wounds that heal slowly
- Numbness or tingling in the hands or feet
- Unexplained weight loss

## Who is at higher risk

- A family history of diabetes
- Being overweight, especially around the waist
- A diet high in sugar and refined carbohydrates
- Physical inactivity
- High blood pressure
- A history of diabetes during pregnancy (gestational diabetes)

## How it is managed

Type 2 diabetes is managed, not "cured", but most people can keep it well controlled:

- **Food:** Eat balanced meals, control portion sizes of rice and sweets, and choose vegetables, pulses and whole grains. Limit sugary drinks.
- **Activity:** Regular movement, such as 30 minutes of walking most days, helps your body use insulin better.
- **Weight:** Even losing a small amount of excess weight can improve blood sugar.
- **Medicine:** Many people need tablets, and some need insulin. Take them exactly as prescribed.
- **Monitoring:** Check your blood sugar as advised, and have regular tests of your eyes, kidneys and feet.

## When to see a doctor

See a doctor if you notice the early signs above, or if you have risk factors and have not been tested recently — a simple blood test can confirm the diagnosis. If you already have diabetes, see your doctor regularly to review your control and screen for complications.

Seek urgent care if you have very high blood sugar with vomiting, drowsiness, confusion, deep or rapid breathing, or a fruity smell on the breath — these can be signs of a dangerous diabetic emergency.`,
  },
  {
    title: "Dengue Fever: Warning Signs and When to Go to Hospital",
    slug: "dengue-fever-warning-signs",
    excerpt:
      "Dengue is a mosquito-borne illness that flares up every monsoon in Bangladesh. Know the symptoms, the danger signs that mean go to hospital now, and how to care for someone at home.",
    specialties: ["General Medicine"],
    titleBn: "ডেঙ্গু জ্বর: বিপদের লক্ষণ এবং কখন হাসপাতালে যাবেন",
    excerptBn:
      "প্রতি বর্ষায় বাংলাদেশে ডেঙ্গু বাড়ে। উপসর্গ, যেসব বিপদ-লক্ষণে এখনই হাসপাতালে যেতে হবে, এবং বাড়িতে কীভাবে যত্ন নেবেন — জেনে নিন।",
    bodyBn: `ডেঙ্গু জ্বর ছড়ায় আক্রান্ত এডিস মশার কামড়ে এবং বাংলাদেশে বর্ষাকালে ও তার পরে বেড়ে যায়। বেশিরভাগ মানুষ সেরে ওঠেন, তবে ডেঙ্গু দ্রুত জটিল হয়ে যেতে পারে, তাই বিপদের লক্ষণ জানা জরুরি।

## সাধারণ উপসর্গ

মশার কামড়ের ৪–১০ দিন পর সাধারণত উপসর্গ দেখা দেয়:

- হঠাৎ তীব্র জ্বর
- তীব্র মাথাব্যথা ও চোখের পেছনে ব্যথা
- পেশি, গিরা ও হাড়ে ব্যথা
- বমি বমি ভাব বা বমি
- শরীরে র‍্যাশ
- নাক বা মাড়ি থেকে সামান্য রক্তপাত

## বাড়িতে যত্ন

মৃদু ডেঙ্গুতে যত্নই মূল চিকিৎসা:

- **বিশ্রাম** নিন এবং প্রচুর তরল পান করুন — পানি, খাবার স্যালাইন (ORS), ডাবের পানি, স্যুপ — পানিশূন্যতা এড়াতে।
- জ্বর ও ব্যথায় **প্যারাসিটামল** ব্যবহার করুন।
- **অ্যাসপিরিন, আইবুপ্রোফেন বা এ-জাতীয় ব্যথানাশক এড়িয়ে চলুন** — এগুলো ডেঙ্গুতে রক্তক্ষরণের ঝুঁকি বাড়ায়।
- বিপদ-লক্ষণগুলোর দিকে খেয়াল রাখুন, বিশেষত জ্বর কমে আসার সময় (৩–৭ দিনের মধ্যে) — এ সময়ই মারাত্মক ডেঙ্গু হওয়ার আশঙ্কা বেশি।

## বিপদের লক্ষণ — এখনই হাসপাতালে যান

নিচের যেকোনো লক্ষণ দেখা দিলে দ্রুত চিকিৎসা নিন:

- তীব্র বা ক্রমাগত পেটব্যথা
- বারবার বমি
- মাড়ি বা নাক থেকে রক্তপাত, বমি বা পায়খানায় রক্ত, অস্বাভাবিক কালশিটে দাগ
- কালো, পিচ্ছিল পায়খানা
- অস্থিরতা, ঝিমুনি বা বিভ্রান্তি
- ঠান্ডা, আঠালো ত্বক বা শ্বাসকষ্ট
- প্রস্রাব কমে যাওয়া বা না হওয়া
- হঠাৎ তাপমাত্রা কমে দুর্বল হয়ে পড়া

এগুলো মারাত্মক ডেঙ্গুর লক্ষণ হতে পারে, যা জীবনঘাতী এবং হাসপাতালে চিকিৎসা প্রয়োজন।

## কীভাবে রক্ষা পাবেন

- বাড়ির আশপাশে জমে থাকা পানি ফেলে দিন — ফুলের টব, বালতি, পাত্র, পরিত্যক্ত টায়ার
- মশা তাড়ানোর উপায়, মশারি ও জানালার নেট ব্যবহার করুন
- এডিস মশা মূলত দিনে কামড়ায়, তাই দিনেও সতর্ক থাকুন

## কখন ডাক্তার দেখাবেন

ডেঙ্গু মৌসুমে তীব্র জ্বর হলে আগেভাগেই ডাক্তার দেখান — রক্ত পরীক্ষায় রোগ নিশ্চিত করতে এবং পর্যবেক্ষণের পরামর্শ নিতে। খুব অসুস্থ বোধ করলে বিপদ-লক্ষণের জন্য অপেক্ষা করবেন না।`,
    body: `Dengue fever spreads through the bite of infected *Aedes* mosquitoes and surges during and after the monsoon in Bangladesh. Most people recover, but dengue can become serious quickly, so knowing the warning signs is important.

## Common symptoms

Symptoms usually appear 4–10 days after a mosquito bite and may include:

- Sudden high fever
- Severe headache and pain behind the eyes
- Muscle, joint and bone pain (dengue is sometimes called "breakbone fever")
- Nausea or vomiting
- A skin rash
- Mild bleeding, such as from the nose or gums

## Caring for someone at home

For mild dengue, most care is supportive:

- **Rest** and drink plenty of fluids — water, oral rehydration solution (ORS), coconut water, soups — to prevent dehydration.
- Use **paracetamol** for fever and pain.
- **Avoid aspirin, ibuprofen and other NSAID painkillers** — they increase the risk of bleeding in dengue.
- Watch closely for the warning signs below, especially when the fever starts to drop (days 3–7), which is when serious dengue is most likely to develop.

## Warning signs — go to hospital now

Get medical care urgently if you or your child develops any of these:

- Severe or persistent abdominal pain
- Repeated vomiting
- Bleeding from the gums or nose, blood in vomit or stool, or unusual bruising
- Black, tarry stools
- Restlessness, drowsiness or confusion
- Cold, clammy skin or difficulty breathing
- Passing little or no urine
- A sudden drop in temperature with weakness

These can signal severe dengue, which is life-threatening and needs hospital treatment.

## How to protect yourself

- Remove standing water around the home where mosquitoes breed — flower pots, buckets, containers, discarded tyres
- Use mosquito repellent, nets and screens
- *Aedes* mosquitoes bite mostly in the daytime, so protect yourself during the day too

## When to see a doctor

See a doctor early if you have a high fever during dengue season, especially to confirm the diagnosis with a blood test and to be advised on monitoring. Do not wait for warning signs to appear if you feel very unwell.`,
  },
  {
    title: "Antenatal Care: A Guide to Your First-Trimester Checkups",
    slug: "antenatal-care-first-trimester-checkups",
    titleBn: "অ্যান্টিনেটাল কেয়ার: প্রথম তিন মাসের চেকআপ গাইড",
    excerptBn:
      "গর্ভাবস্থার শুরুর যত্ন মা ও শিশু দুজনকেই রক্ষা করে। প্রথম অ্যান্টিনেটাল ভিজিটে কী হয়, কোন পরীক্ষাগুলো হয়, এবং কোন লক্ষণে দ্রুত ডাক্তার দেখাবেন — জেনে নিন।",
    bodyBn: `গর্ভাবস্থায় শুরুতেই অ্যান্টিনেটাল (গর্ভকালীন) যত্ন শুরু করলে মা ও শিশুর জন্য সবচেয়ে ভালো সূচনা হয়। প্রথম তিন মাস (প্রথম ১২ সপ্তাহ) গর্ভাবস্থা নিশ্চিত করা, মায়ের স্বাস্থ্য পরীক্ষা এবং পরিকল্পনার জন্য গুরুত্বপূর্ণ সময়।

## কখন প্রথম ভিজিট করবেন

গর্ভবতী মনে হলে যত দ্রুত সম্ভব ডাক্তার দেখান, আদর্শভাবে প্রথম ৮–১২ সপ্তাহের মধ্যে। আগেভাগে দেখালে ডাক্তার সম্ভাব্য তারিখ নির্ণয় করতে এবং কোনো সমস্যা থাকলে তা ধরতে পারেন।

## প্রথম ভিজিটগুলোতে কী হয়

ডাক্তার সাধারণত:

- গর্ভাবস্থা নিশ্চিত করেন ও কত সপ্তাহ চলছে আনুমানিক বলেন
- আপনার স্বাস্থ্যের ইতিহাস, আগের গর্ভধারণ ও ওষুধ সম্পর্কে জানতে চান
- ওজন, রক্তচাপ ও সাধারণ স্বাস্থ্য পরীক্ষা করেন
- রক্ত পরীক্ষার ব্যবস্থা করেন (যেমন রক্তের গ্রুপ, রক্তস্বল্পতার জন্য হিমোগ্লোবিন, রক্তে চিনি, সংক্রমণের স্ক্রিনিং)
- প্রায়ই গর্ভাবস্থা ও তারিখ নিশ্চিত করতে আল্ট্রাসাউন্ড করান

## নিজের যত্ন

- **ফলিক অ্যাসিড:** পরামর্শ অনুযায়ী নিন — আদর্শভাবে গর্ভধারণের আগে থেকে এবং প্রথম তিন মাস — শিশুর বিকাশ রক্ষায় সাহায্য করে।
- **ভালো খাবার:** আয়রনসমৃদ্ধ খাবার, ফল ও শাকসবজিসহ সুষম খাবার খান; খাবার ভালোভাবে ধুয়ে নিন।
- **এড়িয়ে চলুন:** ধূমপান, মদ্যপান এবং ডাক্তারের অনুমোদন ছাড়া কোনো ওষুধ।
- সাধ্যমতো বিশ্রাম ও হালকা চলাফেরা করুন।
- শুরুর দিকে হালকা বমিভাব ও ক্লান্তি স্বাভাবিক।

## কোন লক্ষণে এখনই ডাক্তার দেখাবেন

নিচের কিছু হলে দ্রুত ডাক্তার দেখান বা হাসপাতালে যান:

- যোনিপথে রক্তপাত
- তলপেটে তীব্র বা একপাশের ব্যথা
- এত বেশি বমি যে কিছু খেতে-পান করতে পারছেন না
- প্রচণ্ড জ্বর
- অজ্ঞান হওয়া বা তীব্র মাথা ঘোরা
- প্রস্রাবে জ্বালা বা ব্যথা

এগুলো একটোপিক প্রেগন্যান্সি বা সংক্রমণের মতো সমস্যার লক্ষণ হতে পারে, যা জরুরি মনোযোগ দরকার।

## নিয়মিত চেকআপ চালিয়ে যান

পুরো গর্ভাবস্থায় নিয়মিত অ্যান্টিনেটাল চেকআপ চলতে থাকে। এতে ডাক্তার আপনার রক্তচাপ, শিশুর বৃদ্ধি ও সার্বিক স্বাস্থ্য পর্যবেক্ষণ করতে এবং যেকোনো সমস্যা আগেভাগে ধরতে পারেন।`,
    excerpt:
      "Early pregnancy care protects both mother and baby. Here's what happens at your first antenatal visits, which tests to expect, and the symptoms that need a doctor right away.",
    specialties: ["Obstetrics & Gynaecology", "Gynecology"],
    body: `Starting antenatal (pregnancy) care early gives you and your baby the best start. The first trimester — the first 12 weeks — is an important time to confirm the pregnancy, check your health, and plan ahead.

## When to book your first visit

Try to see a doctor as soon as you think you are pregnant, ideally in the first 8–12 weeks. An early visit allows your doctor to estimate your due date and pick up anything that needs attention.

## What happens at the first visits

Your doctor will usually:

- Confirm the pregnancy and estimate how many weeks along you are
- Ask about your health history, past pregnancies and any medicines you take
- Check your weight, blood pressure and general health
- Arrange blood tests (for example blood group, haemoglobin to check for anaemia, blood sugar, and screening for infections)
- Often arrange an ultrasound scan to confirm the pregnancy and dates

## Looking after yourself

- **Folic acid:** Take it as advised — ideally from before pregnancy and through the first trimester — to help protect the baby's development.
- **Eat well:** Balanced meals with iron-rich foods, fruit and vegetables. Wash food carefully.
- **Avoid:** Smoking, alcohol, and any medicine not approved by your doctor.
- **Rest** and gentle activity as you feel able.
- Mild nausea ("morning sickness") and tiredness are common in early pregnancy.

## When to see a doctor right away

Contact your doctor or go to hospital promptly if you have:

- Vaginal bleeding
- Severe or one-sided lower abdominal pain
- Severe vomiting that stops you keeping fluids down
- High fever
- Fainting or severe dizziness
- Burning or pain when passing urine

These can be signs of problems such as an ectopic pregnancy or infection that need urgent attention.

## Keep your appointments

Regular antenatal checkups continue throughout pregnancy. They let your doctor monitor your blood pressure, the baby's growth and your overall health, and catch any concerns early.`,
  },
  {
    title: "Fever in Children: When Should You Worry?",
    slug: "fever-in-children-when-to-worry",
    titleBn: "শিশুর জ্বর: কখন চিন্তিত হবেন?",
    excerptBn:
      "শিশুর জ্বর সাধারণ এবং বেশিরভাগ সময় ক্ষতিকর নয়, তবে কিছু লক্ষণে ডাক্তার দেখানো জরুরি। জ্বরে শিশুর যত্ন এবং কখন দ্রুত সাহায্য নেবেন — জেনে নিন।",
    bodyBn: `শিশুর জ্বর বাবা-মায়ের দুশ্চিন্তার সবচেয়ে সাধারণ কারণগুলোর একটি। বেশিরভাগ ক্ষেত্রে এটি সংক্রমণের বিরুদ্ধে শরীরের স্বাভাবিক প্রতিক্রিয়া এবং নিজে থেকেই সেরে যায় — তবে কিছু লক্ষণে দেরি না করে ডাক্তার দেখানো উচিত।

## কতটা তাপমাত্রা জ্বর?

সাধারণত শরীরের তাপমাত্রা **৩৮°C (১০০.৪°F) বা তার বেশি** হলে জ্বর ধরা হয়। তবে সংখ্যার চেয়ে শিশুর আচরণ বেশি গুরুত্বপূর্ণ। জ্বর থাকলেও যে শিশু সজাগ, পানি বা খাবার খাচ্ছে ও খেলছে — সে সাধারণত কম উদ্বেগের; বিপরীতে ঝিমিয়ে থাকা ও কিছু খেতে না-চাওয়া শিশু বেশি চিন্তার।

## বাড়িতে যত্ন

- পানিশূন্যতা এড়াতে অল্প অল্প করে বারবার তরল দিন
- পাতলা পোশাক পরান; মোটা কাপড়ে শক্ত করে জড়াবেন না
- শিশুকে আরাম দিতে ওজন অনুযায়ী সঠিক মাত্রায় **প্যারাসিটামল** (বা ডাক্তার বললে আইবুপ্রোফেন) দিন
- বিশ্রাম দিন
- রাতেসহ নিয়মিত খেয়াল রাখুন

## দ্রুত ডাক্তার দেখান, যদি শিশুর

- বয়স **৩ মাসের কম** এবং জ্বর আছে
- ৩৯°C-এর বেশি জ্বর যা কমছে না
- ঝিমুনি, জাগানো কঠিন, বা অস্বাভাবিক নেতিয়ে পড়া
- দ্রুত, শব্দ করে বা কষ্ট করে শ্বাস নেওয়া
- কাচ দিয়ে চাপ দিলে মিলিয়ে যায় না এমন র‍্যাশ
- ঘাড় শক্ত হওয়া, তীব্র মাথাব্যথা বা আলোতে অস্বস্তি
- কিছু পান না করা, বা অনেক কম প্রস্রাব (শুকনো মুখ, কান্নায় চোখের পানি নেই, চোখ বসে যাওয়া)
- খিঁচুনি
- ৩–৫ দিনের বেশি স্থায়ী জ্বর

সন্দেহ হলে নিজের অনুভূতিকে গুরুত্ব দিন — শিশুকে গুরুতর অসুস্থ মনে হলে তাপমাত্রা বেশি না হলেও সাহায্য নিন।

## কখন জরুরি চিকিৎসা

শিশুকে জাগানো খুব কঠিন হলে, শ্বাসকষ্ট হলে, ঠোঁট নীল হলে, মিলিয়ে না-যাওয়া র‍্যাশ থাকলে, বা খিঁচুনি দ্রুত না থামলে — সঙ্গে সঙ্গে হাসপাতালে যান।`,
    excerpt:
      "Fever in children is common and usually harmless, but some signs mean it's time to see a doctor. Here's how to care for a feverish child and when to seek help quickly.",
    specialties: ["Pediatrics"],
    body: `Fever is one of the most common reasons parents worry about their child. In most cases it is the body's normal response to an infection and settles on its own — but a few signs mean you should see a doctor without delay.

## What counts as a fever?

A fever is usually a body temperature of **38°C (100.4°F) or higher**. The exact number matters less than how your child looks and behaves. A child who is feverish but alert, drinking and playing is usually less worrying than one who is drowsy and refusing fluids.

## Caring for a feverish child at home

- Offer plenty of fluids in small, frequent amounts to prevent dehydration
- Dress them in light clothing; don't wrap them up tightly
- Use **paracetamol** (or ibuprofen if your doctor advises) at the correct dose for their weight to help them feel more comfortable
- Let them rest
- Check on them regularly, including overnight

## See a doctor quickly if your child

- Is **under 3 months old** and has any fever
- Has a fever above 39°C that is not coming down
- Is drowsy, difficult to wake, or unusually floppy
- Is breathing fast, noisily, or with difficulty
- Has a rash that does not fade when pressed with a glass
- Has a stiff neck, a severe headache, or dislikes bright light
- Is not drinking, or is passing much less urine than usual (a dry mouth, no tears, sunken eyes)
- Has a fit (convulsion)
- Has a fever lasting more than 3–5 days

When in doubt, trust your instinct — if your child seems seriously unwell, seek medical help even if the temperature is not very high.

## When to seek emergency care

Go to hospital immediately if your child is very difficult to wake, has trouble breathing, has blue lips, has a non-fading rash, or has a convulsion that does not stop quickly.`,
  },
  {
    title: "Asthma: Symptoms, Triggers, and How to Keep It Under Control",
    slug: "asthma-symptoms-triggers-and-control",
    titleBn: "অ্যাজমা (হাঁপানি): উপসর্গ, উদ্দীপক এবং নিয়ন্ত্রণের উপায়",
    excerptBn:
      "অ্যাজমায় শ্বাসনালি সরু ও প্রদাহিত হয়, ফলে শ্বাসকষ্ট ও সাঁই-সাঁই শব্দ হয়। সাধারণ উদ্দীপক, ইনহেলার কীভাবে কাজ করে, এবং তীব্র অ্যাটাকের বিপদ-লক্ষণ জেনে নিন।",
    bodyBn: `অ্যাজমা (হাঁপানি) একটি দীর্ঘমেয়াদি রোগ, যাতে শ্বাসনালি প্রদাহিত ও সরু হয়ে শ্বাস নিতে কষ্ট হয়। এটি শিশু ও বড় উভয়ের মধ্যেই সাধারণ, এবং সঠিক চিকিৎসায় বেশিরভাগ মানুষ স্বাভাবিক জীবন যাপন করতে পারেন।

## সাধারণ উপসর্গ

- সাঁই-সাঁই শব্দ (শ্বাস ছাড়ার সময় শিসের মতো আওয়াজ)
- শ্বাসকষ্ট
- বুকে চাপ ধরা অনুভূতি
- কাশি, প্রায়ই রাতে বা ভোরে বেশি

উপসর্গ আসে-যায়, এবং কোনো উদ্দীপকের সংস্পর্শে এলে বেড়ে যায় (অ্যাটাক)।

## সাধারণ উদ্দীপক

- ধুলো ও ধুলোর মাইট
- ধোঁয়া (সিগারেট, রান্নার ধোঁয়া, মশার কয়েল)
- বায়ুদূষণ
- ঠান্ডা বাতাস বা হঠাৎ আবহাওয়া পরিবর্তন
- ফুলের রেণু ও ছত্রাক
- কড়া গন্ধ বা স্প্রে
- সর্দি-কাশি ও বুকের সংক্রমণ
- পরিশ্রম (কারও কারও ক্ষেত্রে)

নিজের উদ্দীপক চিনে এড়িয়ে চলা নিয়ন্ত্রণের বড় অংশ।

## কীভাবে নিয়ন্ত্রণ করবেন

- **ইনহেলারই মূল চিকিৎসা।** *রিলিভার* ইনহেলার (সাধারণত নীল) উপসর্গ দেখা দিলে ব্যবহার করা হয়; *প্রিভেন্টার* ইনহেলার প্রতিদিন ব্যবহার করতে হয় শ্বাসনালি শান্ত রাখতে — ভালো বোধ করলেও।
- **পরামর্শ অনুযায়ী ব্যবহার করুন।** অনেক অ্যাটাক হয় কারণ মানুষ ভালো বোধ করলেই প্রিভেন্টার বন্ধ করে দেন।
- সঠিক ইনহেলার ব্যবহারের কৌশল শিখুন — ডাক্তারকে দেখিয়ে নিন; স্পেসার যন্ত্র, বিশেষত শিশুদের জন্য, সাহায্য করে।
- বাড়িতে উদ্দীপক কমান: বিছানা পরিষ্কার রাখুন, ঘরে ধোঁয়া এড়ান, রান্নাঘরে বাতাস চলাচল রাখুন।
- রিলিভার ইনহেলার সবসময় সঙ্গে রাখুন।

## কখন ডাক্তার দেখাবেন

ঘন ঘন উপসর্গ হলে, রাতে ঘুম ভাঙলে, রিলিভার বারবার লাগলে, অথবা অ্যাজমা সন্দেহ হলেও এখনো নির্ণয় না হলে — ডাক্তার দেখান।

রিলিভার নেওয়ার পরও অ্যাটাক না কমলে, শ্বাস নিতে খুব কষ্ট হলে, ঠোঁট বা আঙুল নীল হয়ে গেলে, বা পুরো বাক্য বলতে না পারলে — **সঙ্গে সঙ্গে জরুরি চিকিৎসা নিন।** তীব্র অ্যাজমা অ্যাটাক একটি মেডিকেল জরুরি অবস্থা।`,
    excerpt:
      "Asthma makes the airways narrow and inflamed, causing wheezing and breathlessness. Learn the common triggers, how inhalers work, and the danger signs of a severe attack.",
    specialties: ["Pulmonology", "General Medicine"],
    body: `Asthma is a long-term condition in which the airways become inflamed and narrow, making it hard to breathe. It is common in both children and adults and, with the right treatment, most people can lead a completely normal life.

## Common symptoms

- Wheezing (a whistling sound when breathing out)
- Shortness of breath
- A tight feeling in the chest
- Coughing, often worse at night or early morning

Symptoms often come and go, and may flare up ("attacks") when you meet a trigger.

## Common triggers

- Dust and house-dust mites
- Smoke (cigarette smoke, cooking smoke, mosquito coils)
- Air pollution
- Cold air or sudden weather change
- Pollen and mould
- Strong smells or sprays
- Colds and chest infections
- Exercise (in some people)

Knowing and avoiding your own triggers is a big part of control.

## How asthma is controlled

- **Inhalers are the main treatment.** A *reliever* inhaler (usually blue) is used when symptoms strike; a *preventer* inhaler is used every day to keep the airways calm — even when you feel well.
- **Use them as prescribed.** Many flare-ups happen because people stop the preventer once they feel fine.
- Learn the correct inhaler technique — ask your doctor to check it; a spacer device helps, especially for children.
- Reduce triggers at home: keep bedding clean, avoid smoke indoors, ventilate cooking areas.
- Keep a reliever inhaler with you.

## When to see a doctor

See a doctor if you have frequent symptoms, are waking at night, are using your reliever often, or think you (or your child) may have asthma but have not been diagnosed.

**Seek emergency care immediately** if an attack does not improve after using the reliever, if breathing is very difficult, if lips or fingertips look blue, or if the person is too breathless to speak in full sentences. A severe asthma attack is a medical emergency.`,
  },
  {
    title: "Acidity and Gastric Problems: Causes, Relief, and When to See a Doctor",
    slug: "acidity-and-gastric-problems-causes-and-relief",
    titleBn: "অ্যাসিডিটি ও গ্যাস্ট্রিকের সমস্যা: কারণ, উপশম এবং কখন ডাক্তার দেখাবেন",
    excerptBn:
      "“গ্যাস্ট্রিক” — অ্যাসিডিটি, বুকজ্বালা ও বদহজম — বাংলাদেশে অন্যতম সাধারণ সমস্যা। এর কারণ, উপশমের উপায় এবং কোন বিপদ-লক্ষণে ডাক্তার দেখানো জরুরি, জেনে নিন।",
    bodyBn: `অ্যাসিডিটি, বুকজ্বালা ও বদহজম — যাকে অনেকে "গ্যাস্ট্রিক" বলেন — বাংলাদেশে সবচেয়ে সাধারণ অভিযোগগুলোর একটি। সাধারণত এটি গুরুতর নয়, তবে ঘন ঘন বা তীব্র উপসর্গ উপেক্ষা করা উচিত নয়।

## কেমন লাগে

- বুকে বা পেটের উপরের অংশে জ্বালাপোড়া (বুকজ্বালা)
- মুখে টক বা তেতো স্বাদ
- পেট ফাঁপা, ঢেকুর বা অতিরিক্ত ভরা ভাব
- খাওয়ার পর বা শুয়ে পড়লে অস্বস্তি বাড়া

## কী কারণে হয়

পাকস্থলীর অ্যাসিড পেটের আবরণে জ্বালা ধরালে বা খাদ্যনালিতে উঠে এলে এসব হয়। সাধারণ কারণ:

- ঝাল, তেলযুক্ত বা ভাজাপোড়া খাবার
- বড় বড় খাবার, বা রাতে দেরি করে খাওয়া
- অনিয়মিত বা খাবার বাদ দেওয়া
- চা, কফি ও কোমল পানীয়
- ধূমপান
- দুশ্চিন্তা
- অতিরিক্ত ওজন
- নিয়মিত কিছু ব্যথানাশক (NSAID) খাওয়া
- *হেলিকোব্যাক্টর পাইলোরি* নামের পাকস্থলীর সংক্রমণ, যা আলসার ঘটাতে পারে

## সহজ উপশম

- বড় খাবারের বদলে অল্প অল্প করে নিয়মিত খান
- উদ্দীপক খাবার এড়ান; তেল ও অতিরিক্ত ঝাল কমান
- খাওয়ার পর ২–৩ ঘণ্টা শুয়ে পড়বেন না
- রাতে সমস্যা হলে বিছানার মাথার দিক একটু উঁচু করুন
- বাড়তি ওজন কমান, ধূমপান বর্জন করুন
- মাঝেমধ্যের উপসর্গে অ্যান্টাসিড সাহায্য করতে পারে

## কখন ডাক্তার দেখাবেন

মাঝেমধ্যের অ্যাসিডিটি সাধারণত ক্ষতিকর নয়। তবে উপরের পদক্ষেপের পরও উপসর্গ ঘন ঘন, তীব্র বা বারবার ফিরে এলে ডাক্তার দেখান — দীর্ঘমেয়াদি "গ্যাস্ট্রিক" আলসার বা অন্য সমস্যা হতে পারে, আর মাসের পর মাস নিজে নিজে ওষুধ খাওয়া বুদ্ধিমানের কাজ নয়।

নিচের বিপদ-লক্ষণ থাকলে **দ্রুত ডাক্তার দেখান**:

- গিলতে অসুবিধা বা ব্যথা
- বমি, বিশেষত রক্ত বা কফির গুঁড়ার মতো বমি
- কালো, পিচ্ছিল পায়খানা
- কারণ ছাড়াই ওজন কমা
- ক্রমাগত বমি বা তীব্র পেটব্যথা
- ৪০–৪৫ বছর বয়সের পর প্রথমবার এমন উপসর্গ শুরু হলে

এগুলো গুরুতর কিছুর ইঙ্গিত হতে পারে, যা সঠিকভাবে পরীক্ষা করা দরকার।`,
    excerpt:
      "“Gastric” — acidity, heartburn and indigestion — is one of the most common complaints in Bangladesh. Here's what causes it, how to get relief, and the red flags that need a doctor.",
    specialties: ["Gastroenterology", "General Medicine"],
    body: `Acidity, heartburn and indigestion — often called "gastric" — are among the most common complaints in Bangladesh. They are usually not serious, but frequent or severe symptoms should not be ignored.

## What it feels like

- A burning feeling in the chest or upper stomach (heartburn)
- A sour or bitter taste in the mouth
- Bloating, belching or feeling overly full
- Discomfort that is worse after meals or when lying down

## What causes it

Symptoms happen when stomach acid irritates the stomach lining or rises into the food pipe. Common contributors:

- Spicy, oily or fried food
- Large meals, or eating late at night
- Irregular or skipped meals
- Tea, coffee and carbonated drinks
- Smoking
- Stress
- Being overweight
- Certain painkillers (NSAIDs) taken regularly
- *Helicobacter pylori*, a stomach infection that can cause ulcers

## Simple ways to get relief

- Eat smaller, regular meals instead of large ones
- Avoid your trigger foods, and cut down on oily and very spicy dishes
- Don't lie down or sleep for 2–3 hours after eating
- Raise the head of the bed if night-time symptoms are a problem
- Lose excess weight, and avoid smoking
- Over-the-counter antacids can ease occasional symptoms

## When to see a doctor

Occasional acidity is usually harmless. See a doctor if symptoms are frequent, severe, or keep coming back despite the steps above — long-term "gastric" can be an ulcer or another condition, and self-medicating for months is not wise.

**See a doctor urgently** if you have any of these red flags:

- Difficulty or pain when swallowing
- Vomiting, especially vomiting blood or material like coffee grounds
- Black, tarry stools
- Unintentional weight loss
- Persistent vomiting, or severe stomach pain
- Symptoms that first start after age 40–45

These can point to something more serious that needs proper investigation.`,
  },
  {
    title: "Thyroid Problems: Signs of an Underactive or Overactive Thyroid",
    slug: "thyroid-problems-underactive-and-overactive-signs",
    titleBn: "থাইরয়েডের সমস্যা: থাইরয়েড কম বা বেশি সক্রিয় হওয়ার লক্ষণ",
    excerptBn:
      "থাইরয়েড শরীরের বিপাক নিয়ন্ত্রণ করে। এটি খুব ধীরে বা খুব দ্রুত কাজ করলে শক্তি, ওজন, মেজাজ ও হৃৎস্পন্দনে প্রভাব ফেলে। লক্ষণ এবং যে সহজ পরীক্ষায় এটি ধরা পড়ে, জেনে নিন।",
    bodyBn: `থাইরয়েড গলার একটি ছোট গ্রন্থি, যা বিপাক নিয়ন্ত্রণকারী হরমোন তৈরি করে — অর্থাৎ শরীর কীভাবে শক্তি ব্যবহার করবে তা ঠিক করে। থাইরয়েডের সমস্যা সাধারণ, বিশেষত নারীদের মধ্যে, আর উপসর্গ অস্পষ্ট বলে প্রায়ই ধরা পড়তে দেরি হয়।

## থাইরয়েড কম সক্রিয় (হাইপোথাইরয়েড)

হরমোন কম তৈরি হলে শরীর ধীর হয়ে যায়। লক্ষণ:

- ক্লান্তি ও দুর্বলতা
- ওজন বাড়া
- ঠান্ডা লাগা
- শুষ্ক ত্বক ও চুল, বা চুল পড়া
- কোষ্ঠকাঠিন্য
- মন খারাপ বা মনোযোগে সমস্যা
- বেশি বা অনিয়মিত মাসিক

## থাইরয়েড বেশি সক্রিয় (হাইপারথাইরয়েড)

হরমোন বেশি তৈরি হলে শরীর দ্রুত হয়ে যায়। লক্ষণ:

- স্বাভাবিক বা বেশি খাওয়া সত্ত্বেও ওজন কমা
- দ্রুত বা অনিয়মিত হৃৎস্পন্দন, ধড়ফড়
- গরম লাগা ও সহজে ঘাম হওয়া
- উদ্বেগ, অস্থিরতা বা খিটখিটে ভাব
- হাত কাঁপা
- ঘুমে সমস্যা
- ঘন ঘন পাতলা পায়খানা

কারও কারও গলায় ফোলা (গয়টার) বা চোখে পরিবর্তনও দেখা যায়।

## ঝুঁকি বেশি কাদের

- নারী, বিশেষত সন্তান জন্মের পর বা মধ্যবয়সে
- পরিবারে থাইরয়েড রোগের ইতিহাস
- অন্যান্য অটোইমিউন রোগ, যেমন টাইপ ১ ডায়াবেটিস

## নির্ণয় ও চিকিৎসা

একটি সাধারণ রক্ত পরীক্ষা (সাধারণত TSH দিয়ে শুরু) ডাক্তারকে জানায় থাইরয়েড কম না বেশি সক্রিয়। চিকিৎসা সাধারণত কার্যকর: কম সক্রিয় হলে প্রতিদিন একটি হরমোন ট্যাবলেট, আর বেশি সক্রিয় হলে ওষুধ (কখনো অন্য চিকিৎসা)। হরমোনের মাত্রা ঠিক হলে বেশিরভাগ মানুষ অনেক ভালো বোধ করেন।

## কখন ডাক্তার দেখাবেন

উপরের কয়েকটি লক্ষণ, গলায় ফোলা, বা পারিবারিক ইতিহাসের সঙ্গে স্থায়ী উপসর্গ থাকলে ডাক্তার দেখান — একটি রক্ত পরীক্ষাই যথেষ্ট। থাইরয়েডের ওষুধ চললে নিয়মিত ফলোআপে যান, যাতে মাত্রা সমন্বয় করা যায়।`,
    excerpt:
      "The thyroid controls your body's metabolism. When it works too slowly or too fast it affects energy, weight, mood and heart rate. Learn the signs and the simple test that diagnoses it.",
    specialties: ["Endocrinology", "General Medicine"],
    body: `The thyroid is a small gland in the neck that makes hormones controlling your metabolism — how your body uses energy. Thyroid problems are common, especially in women, and are easy to miss because the symptoms are often vague.

## Underactive thyroid (hypothyroidism)

When the thyroid makes too little hormone, the body slows down. Signs include:

- Tiredness and low energy
- Weight gain
- Feeling cold
- Dry skin and hair, or hair thinning
- Constipation
- Low mood or poor concentration
- Heavier or irregular periods

## Overactive thyroid (hyperthyroidism)

When the thyroid makes too much hormone, the body speeds up. Signs include:

- Weight loss despite a normal or increased appetite
- A fast or irregular heartbeat, or palpitations
- Feeling hot and sweating easily
- Anxiety, restlessness or irritability
- Trembling hands
- Difficulty sleeping
- Frequent loose stools

Some people also notice a swelling in the neck (a goitre) or eye changes.

## Who is more at risk

- Women, especially after pregnancy or around middle age
- A family history of thyroid disease
- Other autoimmune conditions, such as type 1 diabetes

## How it is diagnosed and treated

A simple blood test (usually starting with TSH) tells your doctor whether the thyroid is underactive or overactive. Treatment is usually effective: a daily hormone tablet for an underactive thyroid, or medicines (and sometimes other treatments) for an overactive one. Most people feel much better once their levels are corrected.

## When to see a doctor

See a doctor if you have several of the signs above, a neck swelling, or a family history and persistent symptoms — a blood test is all it takes to check. If you are already on thyroid medicine, keep your follow-up appointments so the dose can be adjusted.`,
  },
  {
    title: "Childhood Vaccination: Why It Matters and Staying on Schedule",
    slug: "childhood-vaccination-why-it-matters-and-schedule",
    titleBn: "শিশুর টিকা: কেন জরুরি এবং সময়মতো দেওয়া",
    excerptBn:
      "টিকা শিশুকে গুরুতর, প্রতিরোধযোগ্য রোগ থেকে রক্ষা করে। কেন এটি গুরুত্বপূর্ণ, টিকার পর কী আশা করবেন, এবং কোনো ডোজ বাদ পড়লে কী করবেন, জেনে নিন।",
    bodyBn: `টিকা আপনার শিশুর স্বাস্থ্য রক্ষার সবচেয়ে নিরাপদ ও কার্যকর উপায়গুলোর একটি। বাংলাদেশের জাতীয় টিকাদান কর্মসূচি (ইপিআই) শিশুদের বেশ কিছু গুরুতর রোগ থেকে বিনামূল্যে রক্ষা করে — যেমন যক্ষ্মা, পোলিও, হাম, ডিপথেরিয়া, হুপিং কাশি, ধনুষ্টংকার, হেপাটাইটিস বি ও আরও অনেক কিছু।

## কেন টিকা জরুরি

- এটি শিশুকে এমন রোগ থেকে রক্ষা করে যা গুরুতর অসুস্থতা, আজীবন প্রতিবন্ধিতা বা মৃত্যু ঘটাতে পারে।
- বেশিরভাগ শিশু টিকা নিলে রোগ কম ছড়ায়, তাই এটি অন্য শিশু ও দুর্বল মানুষকেও রক্ষা করে।
- টিকার কারণেই এসব রোগ আজ বিরল হয়েছে — কিন্তু শিশুরা সুরক্ষিত না থাকলে রোগগুলো আবার ফিরে আসতে পারে।

## সময়সূচি মেনে চলা

সঠিক সময়ে সুরক্ষা গড়ে তুলতে নির্দিষ্ট বয়সে টিকা দেওয়া হয়। শিশুর **টিকা কার্ড** যত্নে রাখুন এবং প্রতিবার সঙ্গে আনুন; ডাক্তার বা নিকটস্থ ইপিআই কেন্দ্র যে সময়সূচি দেয় তা অনুসরণ করুন। কোন টিকা কখন দিতে হবে নিশ্চিত না হলে ডাক্তার বা স্বাস্থ্যকর্মীকে জিজ্ঞাসা করুন — তাঁরা কার্ড দেখে পরামর্শ দিতে পারবেন।

## টিকার পর কী আশা করবেন

হালকা প্রতিক্রিয়া সাধারণ এবং সাধারণত এক-দুই দিনে চলে যায়:

- হালকা জ্বর
- ইনজেকশনের জায়গায় ব্যথা, লালচে ভাব বা ছোট ফোলা
- একটু খিটখিটে বা ঘুম-ঘুম ভাব

শিশুকে আদর-সান্ত্বনা দিন, বেশি করে তরল দিন, এবং ডাক্তার বললে সঠিক মাত্রায় প্যারাসিটামল দিন। গুরুতর প্রতিক্রিয়া বিরল।

## কোনো ডোজ বাদ পড়লে

চিন্তা করবেন না, এবং বাদ দেবেন না — প্রায় সব ক্ষেত্রেই বাদ পড়া টিকা পরে দেওয়া যায়। যত দ্রুত সম্ভব ডাক্তার দেখান বা ইপিআই কেন্দ্রে যান; তাঁরা শিশুকে সময়সূচিতে ফিরিয়ে আনার পরামর্শ দেবেন।

## কখন ডাক্তার দেখাবেন

টিকার পর শিশুর যদি না-কমা প্রচণ্ড জ্বর হয়, অস্বাভাবিক ঝিমুনি বা জাগানো কঠিন হয়, খিঁচুনি হয়, বা এমন কোনো প্রতিক্রিয়া হয় যা আপনাকে উদ্বিগ্ন করে — ডাক্তার দেখান। সন্দেহ হলে জিজ্ঞাসা করা সবসময়ই যুক্তিসঙ্গত।`,
    excerpt:
      "Vaccines protect children from serious, preventable diseases. Here's why they matter, what to expect after a vaccination, and what to do if your child has missed a dose.",
    specialties: ["Pediatrics"],
    body: `Vaccination is one of the safest and most effective ways to protect your child's health. Bangladesh's national immunization programme (EPI) protects children against a number of serious diseases — including tuberculosis, polio, measles, diphtheria, whooping cough, tetanus, hepatitis B and more — free of charge.

## Why vaccination matters

- It protects your child from diseases that can cause serious illness, lifelong disability or death.
- It also protects other children and vulnerable people in the community, because diseases spread less when most children are vaccinated.
- Many of these diseases have become rare precisely because of vaccination — but they can return if children are not protected.

## Following the schedule

Vaccines are given at set ages so that protection builds at the right time. Keep your child's **vaccination card** safe and bring it to every visit, and follow the schedule your doctor or the nearest EPI centre gives you. If you are unsure which vaccines are due, ask a doctor or health worker — they can check the card and advise.

## What to expect afterwards

Mild reactions are common and usually settle within a day or two:

- A mild fever
- Soreness, redness or a small lump where the injection was given
- Being a bit irritable or sleepy

You can comfort your child, offer extra fluids, and use paracetamol at the correct dose if your doctor advises. Serious reactions are rare.

## If your child has missed a dose

Don't worry, and don't skip it — in almost all cases a missed vaccine can be "caught up". See a doctor or visit an EPI centre as soon as possible; they will advise how to get your child back on track.

## When to see a doctor

See a doctor if, after a vaccination, your child has a high fever that does not settle, is unusually drowsy or difficult to wake, has a fit, or has any reaction that worries you. When in doubt, it is always reasonable to ask.`,
  },
  {
    title: "Piles and Anal Fistula: Symptoms, Relief, and When to See a Doctor",
    slug: "piles-and-anal-fistula-symptoms-and-treatment",
    titleBn: "পাইলস ও অ্যানাল ফিস্টুলা: উপসর্গ, উপশম এবং কখন ডাক্তার দেখাবেন",
    excerptBn:
      "পাইলস (অর্শ) ও অ্যানাল ফিস্টুলা সাধারণ, তবে লজ্জায় অনেকে চেপে রাখেন। পার্থক্য, উপসর্গ কমানোর উপায়, এবং কেন যেকোনো মলদ্বারের রক্তপাত পরীক্ষা করানো জরুরি — জানুন।",
    bodyBn: `মলদ্বারের আশপাশের সমস্যা — পাইলস ও ফিস্টুলা — খুব সাধারণ, তবে লজ্জায় অনেকে ডাক্তার দেখাতে দেরি করেন। এগুলো চিকিৎসাযোগ্য, আর আগেভাগে পরীক্ষা করানো জরুরি।

## পাইলস (অর্শ) কী?

পাইলস হলো মলদ্বারের ভেতরে ও আশপাশে ফুলে ওঠা রক্তনালি। সাধারণ উপসর্গ:

- উজ্জ্বল লাল রক্তপাত, সাধারণত মলত্যাগের পর টয়লেট পেপারে বা প্যানে দেখা যায়
- মলদ্বারের চারপাশে চুলকানি বা জ্বালা
- মলদ্বারের কাছে ফোলা বা চাকা অনুভব করা
- অস্বস্তি, বা পাইলসে রক্ত জমাট বাঁধলে হঠাৎ ব্যথা

## অ্যানাল ফিস্টুলা কী?

ফিস্টুলা আলাদা — এটি মলদ্বারের ভেতর থেকে কাছের ত্বক পর্যন্ত তৈরি হওয়া একটি সরু সুড়ঙ্গ, প্রায়ই ফোড়া (পুঁজের সংগ্রহ) হওয়ার পর। লক্ষণ:

- মলদ্বারের কাছে অনবরত পুঁজ বা তরল নিঃসরণ
- বারবার ব্যথাযুক্ত ফোলা বা ফোড়া
- ছিদ্রের চারপাশে ত্বকের জ্বালা

ফিস্টুলা সাধারণত একজন সার্জনের মূল্যায়ন প্রয়োজন।

## কেন হয়

- কোষ্ঠকাঠিন্য ও মলত্যাগে চাপ দেওয়া
- আঁশ কম খাওয়া
- দীর্ঘক্ষণ বসে থাকা (টয়লেটে দীর্ঘক্ষণ বসা সহ)
- গর্ভাবস্থা
- অতিরিক্ত ওজন

## উপসর্গ কমানো ও প্রতিরোধ

- বেশি আঁশযুক্ত খাবার — শাকসবজি, ফল, লাল চাল বা আটা — খান এবং প্রচুর পানি পান করুন, মল নরম রাখতে
- মলত্যাগে চাপ দেবেন না বা টয়লেটে দীর্ঘক্ষণ বসবেন না
- সক্রিয় থাকুন
- উপশমকারী ক্রিম বা কুসুম গরম পানিতে বসা (সিৎজ বাথ) অস্বস্তি কমায়
- কোষ্ঠকাঠিন্য আগেভাগে সামলান

মৃদু পাইলস প্রায়ই এসব উপায়ে কমে; বেশি সমস্যাযুক্ত পাইলস বা ফিস্টুলায় ছোট প্রক্রিয়া বা সার্জারি লাগতে পারে।

## কখন ডাক্তার দেখাবেন

**মলদ্বার থেকে রক্তপাত হলে সবসময় ডাক্তার দেখান** — শুধু পাইলস ধরে নেবেন না। রক্তপাতের অন্য কারণও থাকতে পারে, কিছু গুরুতরও, আর পরীক্ষা ছাড়া তা বোঝা যায় না। অনবরত রক্তপাত, স্থায়ী চাকা, নিঃসরণ, বারবার ফোড়া, তীব্র ব্যথা, মলত্যাগের অভ্যাসে পরিবর্তন, বা কারণ ছাড়া ওজন কমলে দ্রুত ডাক্তার দেখান।`,
    excerpt:
      "Piles (haemorrhoids) and anal fistula are common but often hidden out of embarrassment. Learn the difference, how to ease symptoms, and why any rectal bleeding should be checked.",
    specialties: ["Colorectal Surgery", "Surgery"],
    body: `Problems around the back passage — piles and fistula — are very common, but many people delay seeing a doctor out of embarrassment. They are treatable, and getting checked early matters.

## What are piles (haemorrhoids)?

Piles are swollen blood vessels in and around the back passage. Common symptoms:

- Bright red bleeding, usually noticed on toilet paper or in the toilet after passing stool
- Itching or irritation around the anus
- A lump you can feel near the anus
- Discomfort or, if a pile becomes thrombosed, sudden pain

## What is an anal fistula?

A fistula is different — it is a small tunnel that forms between the inside of the back passage and the skin nearby, often after an abscess (a collection of pus). Signs include:

- Persistent discharge of pus or fluid near the anus
- Recurrent painful swelling or abscess
- Skin irritation around the opening

A fistula usually needs to be assessed by a surgeon.

## Why they happen

- Constipation and straining to pass stool
- A low-fibre diet
- Sitting for long periods (including long spells on the toilet)
- Pregnancy
- Being overweight

## Easing symptoms and preventing them

- Eat more fibre — vegetables, fruit, whole grains — and drink plenty of water to keep stools soft
- Don't strain or sit on the toilet for long periods
- Stay active
- Soothing creams or warm sitz baths can relieve discomfort
- Treat constipation early

Mild piles often settle with these steps; more troublesome piles or any fistula may need a procedure or surgery.

## When to see a doctor

**Always see a doctor about rectal bleeding** — do not just assume it is piles. Bleeding can have other causes, including serious ones, and only an examination can tell. See a doctor promptly if you have ongoing bleeding, a persistent lump, discharge, recurrent abscesses, severe pain, a change in your usual bowel habit, or unexplained weight loss.`,
  },
  {
    title: "Kidney Stones: Symptoms, Causes, and How to Prevent Them",
    slug: "kidney-stones-symptoms-and-prevention",
    titleBn: "কিডনিতে পাথর: উপসর্গ, কারণ এবং প্রতিরোধের উপায়",
    excerptBn:
      "কিডনির পাথর মানুষের অন্যতম তীব্র ব্যথার কারণ। সতর্ক-লক্ষণ, গরম আবহাওয়ায় পর্যাপ্ত পানি কেন জরুরি, এবং কখন পাথরের ব্যথা একটি জরুরি অবস্থা — জেনে নিন।",
    bodyBn: `কিডনির পাথর হলো প্রস্রাবের খনিজ পদার্থ থেকে কিডনিতে তৈরি হওয়া শক্ত দলা। ছোট পাথর টের না পেয়েই বেরিয়ে যেতে পারে, কিন্তু প্রস্রাবের পথ আটকে দেওয়া পাথর হঠাৎ তীব্র ব্যথা ঘটাতে পারে।

## উপসর্গ

- পাঁজরের নিচে পাশে ও পিঠে তীব্র ব্যথা, যা ঢেউয়ের মতো আসে
- ব্যথা তলপেট ও কুঁচকির দিকে ছড়ায়
- প্রস্রাবে ব্যথা বা জ্বালা
- গোলাপি, লাল বা বাদামি প্রস্রাব (রক্ত)
- ঘোলাটে বা দুর্গন্ধযুক্ত প্রস্রাব
- বমি বমি ভাব ও বমি
- ঘন ঘন প্রস্রাবের বেগ

## কেন পাথর হয়

- **পর্যাপ্ত পানি না খাওয়া** — বড় কারণ, বিশেষত বাংলাদেশের গরম-আর্দ্র আবহাওয়ায় যেখানে ঘামে অনেক পানি বেরিয়ে যায়
- লবণ বেশি খাওয়া
- অতিরিক্ত ওজন
- পরিবারে বা নিজের পাথরের ইতিহাস
- কিছু রোগ

## ঝুঁকি কমানোর উপায়

- **সারাদিন প্রচুর পানি পান করুন** — যেন প্রস্রাব হালকা রঙের থাকে, গাঢ় নয়
- লবণ ও লবণাক্ত খাবার কমান
- সুষম খাবার খান; অতিরিক্ত আমিষ বা অক্সালেটযুক্ত খাবারে বাড়াবাড়ি করবেন না
- স্বাস্থ্যকর ওজন বজায় রাখুন

## চিকিৎসা

অনেক ছোট পাথর পানি ও ব্যথানাশকেই নিজে থেকে বেরিয়ে যায়। বড় পাথর, বা যেগুলো প্রস্রাব আটকায় বা সংক্রমণ ঘটায়, সেগুলো ভাঙা বা বের করার প্রক্রিয়া লাগতে পারে — আকার ও অবস্থান অনুযায়ী ডাক্তার পরামর্শ দেবেন।

## কখন ডাক্তার দেখাবেন

পাথরের উপসর্গ থাকলে, বিশেষত প্রস্রাবে রক্ত দেখলে ডাক্তার দেখান। তীব্র ব্যথার সঙ্গে **জ্বর ও কাঁপুনি** থাকলে (আটকে যাওয়া সংক্রমিত কিডনি একটি জরুরি অবস্থা), বমিতে কিছু রাখতে না পারলে, বা একদমই প্রস্রাব করতে না পারলে — **সঙ্গে সঙ্গে জরুরি চিকিৎসা নিন।**`,
    excerpt:
      "Kidney stones cause some of the most severe pain people experience. Learn the warning signs, why staying hydrated matters in a hot climate, and when stone pain is an emergency.",
    specialties: ["Urology", "Nephrology"],
    body: `Kidney stones are hard deposits that form in the kidneys from minerals in the urine. Small stones may pass unnoticed, but a stone that blocks the flow of urine can cause sudden, severe pain.

## Symptoms

- Severe pain in the side and back, below the ribs, that may come in waves
- Pain that spreads to the lower abdomen and groin
- Pain or a burning feeling when passing urine
- Pink, red or brown urine (blood)
- Cloudy or foul-smelling urine
- Nausea and vomiting
- Needing to pass urine more often

## Why stones form

- **Not drinking enough fluid** — a big factor, especially in Bangladesh's hot, humid climate where you lose a lot through sweat
- A diet high in salt
- Being overweight
- A family or personal history of stones
- Some medical conditions

## How to lower your risk

- **Drink plenty of water** through the day — enough that your urine stays pale, not dark
- Cut down on salt and very salty foods
- Eat a balanced diet; don't overdo high-oxalate or high-protein extremes
- Maintain a healthy weight

## Treatment

Many small stones pass on their own with fluids and pain relief. Larger stones, or ones that block the urine or cause infection, may need a procedure to break up or remove them — your doctor will advise based on the size and position.

## When to see a doctor

See a doctor if you have stone symptoms, especially blood in the urine. **Seek emergency care immediately** if you have severe pain with **fever and chills** (a blocked, infected kidney is a medical emergency), if you are vomiting and cannot keep fluids down, or if you are unable to pass urine at all.`,
  },
  {
    title: "PCOS (Polycystic Ovary Syndrome): Symptoms and Management",
    slug: "pcos-symptoms-and-management",
    titleBn: "পিসিওএস (পলিসিস্টিক ওভারি সিনড্রোম): উপসর্গ ও ব্যবস্থাপনা",
    excerptBn:
      "পিসিওএস নারীদের একটি সাধারণ হরমোনজনিত সমস্যা, যা মাসিক, ত্বক, ওজন ও সন্তানধারণে প্রভাব ফেলে। লক্ষণ, কেন এটি দীর্ঘমেয়াদে গুরুত্বপূর্ণ, এবং কীভাবে নিয়ন্ত্রণ করা হয় — জানুন।",
    bodyBn: `পলিসিস্টিক ওভারি সিনড্রোম (পিসিওএস) প্রজননক্ষম বয়সের নারীদের একটি সাধারণ হরমোনজনিত সমস্যা। এটি ভালোভাবে নিয়ন্ত্রণযোগ্য, তবে উপসর্গ একেকজনের একেক রকম বলে প্রায়ই বছরের পর বছর ধরা পড়ে না।

## সাধারণ উপসর্গ

- অনিয়মিত, কম বা বন্ধ মাসিক
- গর্ভধারণে অসুবিধা
- মুখ বা শরীরে অতিরিক্ত লোম
- ব্রণ বা তৈলাক্ত ত্বক
- ওজন বাড়া, বা ওজন কমাতে অসুবিধা
- মাথার চুল পাতলা হওয়া

সবার সব উপসর্গ থাকে না, আর তীব্রতাও কম-বেশি হয়।

## কেন এটি গুরুত্বপূর্ণ

মাসিক ও সন্তানধারণের বাইরেও পিসিওএস টাইপ ২ ডায়াবেটিস, উচ্চ রক্তচাপ ও উচ্চ কোলেস্টেরলের দীর্ঘমেয়াদি ঝুঁকির সঙ্গে যুক্ত। তাই এর ব্যবস্থাপনা শুধু উপসর্গ নয়, সার্বিক স্বাস্থ্যের বিষয়।

## কীভাবে নিয়ন্ত্রণ করা হয়

একক কোনো নিরাময় নেই, তবে উপসর্গ ভালোভাবে নিয়ন্ত্রণ করা যায়:

- **জীবনযাপনই ভিত্তি** — সুষম খাবার, নিয়মিত পরিশ্রম ও স্বাস্থ্যকর ওজন মাসিক নিয়মিত করতে এবং উপসর্গ উল্লেখযোগ্যভাবে কমাতে পারে।
- **ওষুধ** মাসিক নিয়মিত করতে, অতিরিক্ত লোম বা ব্রণ সামলাতে, বা সন্তান নেওয়ার সময় সহায়তা করতে পারে — ডাক্তারের পরামর্শে।
- রক্তে চিনি, রক্তচাপ ও কোলেস্টেরল নিয়মিত পরীক্ষা দীর্ঘমেয়াদি স্বাস্থ্য রক্ষায় সাহায্য করে।

## কখন ডাক্তার দেখাবেন

মাসিক অনিয়মিত বা বন্ধ থাকলে, বিরক্তিকর ব্রণ বা অতিরিক্ত লোম থাকলে, বা গর্ভধারণে অসুবিধা হলে ডাক্তার দেখান। কয়েকটি সাধারণ পরীক্ষায় ডাক্তার পিসিওএস নিশ্চিত করতে পারেন এবং আপনার লক্ষ্য অনুযায়ী — নিয়মিত মাসিক, পরিষ্কার ত্বক বা গর্ভধারণের পরিকল্পনা — একটি পরিকল্পনা সাজিয়ে দিতে পারেন।`,
    excerpt:
      "PCOS is a common hormonal condition in women that affects periods, skin, weight and fertility. Learn the signs, why it matters for long-term health, and how it's managed.",
    specialties: ["Gynecology", "Endocrinology"],
    body: `Polycystic ovary syndrome (PCOS) is a common hormonal condition affecting women of reproductive age. It is very manageable, but because the symptoms vary, it often goes undiagnosed for years.

## Common symptoms

- Irregular, infrequent or absent periods
- Difficulty getting pregnant
- Excess hair growth on the face or body
- Acne or oily skin
- Weight gain, or difficulty losing weight
- Thinning hair on the scalp

Not everyone has every symptom, and they range from mild to more troublesome.

## Why it matters

Beyond periods and fertility, PCOS is linked to a higher long-term risk of type 2 diabetes, high blood pressure and high cholesterol. That is why managing it is about overall health, not just symptoms.

## How it is managed

There is no single cure, but symptoms can be controlled well:

- **Lifestyle is the foundation** — a balanced diet, regular activity, and reaching a healthy weight can restore more regular periods and improve symptoms significantly.
- **Medicines** can help regulate periods, manage excess hair or acne, or help with fertility when you are trying to conceive — guided by your doctor.
- Regular checks of blood sugar, blood pressure and cholesterol help protect long-term health.

## When to see a doctor

See a doctor if your periods are irregular or absent, if you have troubling acne or excess hair growth, or if you are having difficulty becoming pregnant. A doctor can confirm PCOS with a few simple tests and put together a plan that fits your goals — whether that's regular periods, clearer skin, or planning a pregnancy.`,
  },
  {
    title: "Low Back Pain: Common Causes, Self-Care, and Warning Signs",
    slug: "low-back-pain-causes-and-relief",
    titleBn: "কোমর ব্যথা: সাধারণ কারণ, ঘরোয়া যত্ন এবং সতর্ক-লক্ষণ",
    excerptBn:
      "বেশিরভাগ কোমর ব্যথা গুরুতর নয় এবং নিজে থেকেই কমে যায়। কী সাহায্য করে, কী এড়াবেন, এবং কোন সতর্ক-লক্ষণে দেরি না করে ডাক্তার দেখাবেন — জেনে নিন।",
    bodyBn: `কোমর ব্যথা খুবই সাধারণ — বেশিরভাগ মানুষই কখনো না কখনো ভোগেন। ভালো খবর হলো, বেশিরভাগ ক্ষেত্রেই এটি গুরুতর নয় এবং কয়েক সপ্তাহের মধ্যে নিজে থেকেই ভালো হয়ে যায়।

## সাধারণ কারণ

- ভারী তোলা, ঝোঁকা বা হঠাৎ বেকায়দা নড়াচড়ায় পেশি বা লিগামেন্টে টান
- ভুল ভঙ্গি, বা দীর্ঘক্ষণ বসে থাকা
- ভারী বা বারবার ওজন তোলা
- অতিরিক্ত ওজন বা শারীরিক অক্ষমতা
- কখনো ডিস্ক সরে গিয়ে স্নায়ুতে চাপ

## কী সাহায্য করে

- **চলাফেরা চালিয়ে যান।** হালকা, স্বাভাবিক কাজকর্ম শুয়ে থাকার চেয়ে দ্রুত সারায় — দীর্ঘক্ষণ শুয়ে থাকা এড়ান।
- আরামের জন্য সেঁক (কুসুম গরম) দিন।
- সক্রিয় থাকতে প্যারাসিটামলের মতো সাধারণ ব্যথানাশক, বা ডাক্তার বললে অন্য ওষুধ, সাহায্য করতে পারে।
- ভঙ্গির দিকে খেয়াল রাখুন; কিছু তোলার সময় হাঁটু ভাঁজ করুন ও পিঠ সোজা রাখুন।
- ধীরে ধীরে স্বাভাবিক কাজে ফিরুন।

বেশিরভাগ ক্ষেত্রে এ উপায়ে কয়েক সপ্তাহে সেরে যায়।

## সতর্ক-লক্ষণ — ডাক্তার দেখান

নিচের কিছু কোমর ব্যথার সঙ্গে থাকলে দ্রুত ডাক্তার দেখান:

- এক বা দুই পায়ে অবশভাব, ঝিনঝিন বা দুর্বলতা
- বড় কোনো পড়ে যাওয়া বা আঘাতের পর ব্যথা
- জ্বর, বা সার্বিকভাবে অসুস্থ বোধ
- কারণ ছাড়াই ওজন কমা
- ক্রমাগত, তীব্র, বা রাতে স্পষ্টতই বেশি ব্যথা
- কয়েক সপ্তাহেও না কমা ব্যথা

প্রস্রাব-পায়খানার নিয়ন্ত্রণ হারালে, বা মলদ্বার বা ভেতরের ঊরুর চারপাশে অবশভাব হলে — **সঙ্গে সঙ্গে জরুরি চিকিৎসা নিন**; এগুলো বিরল হলেও গুরুতর লক্ষণ।`,
    excerpt:
      "Most low back pain is not serious and improves on its own. Learn what helps, what to avoid, and the warning signs that mean you should see a doctor without delay.",
    specialties: ["Orthopedics", "Physical Medicine & Rehabilitation"],
    body: `Low back pain is extremely common — most people experience it at some point. The good news is that the great majority of cases are not serious and improve within a few weeks.

## Common causes

- Muscle or ligament strain from lifting, bending or a sudden awkward movement
- Poor posture, or sitting for long periods
- Heavy or repeated lifting
- Being overweight or out of condition
- Sometimes a "slipped" (prolapsed) disc pressing on a nerve

## What helps

- **Keep moving.** Gentle, normal activity helps recovery more than bed rest — avoid long periods lying down.
- Use heat (a warm compress) for comfort.
- Simple painkillers such as paracetamol, or others if your doctor advises, can help you stay active.
- Pay attention to posture; when lifting, bend your knees and keep your back straight.
- Gradually return to your usual activities.

Most episodes settle within a few weeks with this approach.

## Warning signs — see a doctor

See a doctor promptly if your back pain comes with any of these:

- Numbness, tingling or weakness in one or both legs
- Pain that follows a significant fall or injury
- A fever, or feeling generally unwell
- Unexplained weight loss
- Pain that is constant, severe, or noticeably worse at night
- Pain that is not improving after a few weeks

**Seek emergency care immediately** if you lose control of your bladder or bowels, or have numbness around the back passage or inner thighs — these are rare but serious signs that need urgent attention.`,
  },
  {
    title: "Skin Allergies and Rashes: Causes, Care, and When to Worry",
    slug: "skin-allergy-and-rashes-causes-and-care",
    titleBn: "ত্বকের অ্যালার্জি ও র‍্যাশ: কারণ, যত্ন এবং কখন চিন্তিত হবেন",
    excerptBn:
      "চুলকানিযুক্ত র‍্যাশ ও আমবাত সাধারণ এবং বেশিরভাগ সময় ক্ষতিকর নয়। সাধারণ উদ্দীপক, ঘরে ত্বক শান্ত করার উপায়, এবং তীব্র অ্যালার্জির জরুরি লক্ষণ — জেনে নিন।",
    bodyBn: `চুলকানিযুক্ত ত্বক, র‍্যাশ ও আমবাত মানুষের ডাক্তার দেখানোর অন্যতম সাধারণ কারণ। বেশিরভাগই ক্ষতিকর নয় ও দ্রুত কমে যায়, তবে উদ্দীপক চেনা — এবং বিরল কিছু লক্ষণ যা জরুরি চিকিৎসা দরকার — জানা ভালো।

## সাধারণ ধরন

- **সংস্পর্শজনিত প্রতিক্রিয়া** — ত্বক জ্বালাকর কিছুর (সাবান, প্রসাধনী, ধাতু, গাছ, রাসায়নিক) সংস্পর্শে এলে যেখানে লাল ও চুলকানি হয়
- **আমবাত (urticaria)** — উঁচু, চুলকানিযুক্ত চাকা যা কয়েক ঘণ্টায় আসে-যায়
- **একজিমা** — শুষ্ক, চুলকানিযুক্ত, প্রদাহিত দাগ, প্রায়ই দীর্ঘমেয়াদি

## সাধারণ উদ্দীপক

- কিছু খাবার
- ওষুধ
- সাবান, ডিটারজেন্ট, প্রসাধনী ও সুগন্ধি
- ধাতু (যেমন সস্তা গয়নায়) ও কিছু কাপড়
- গাছপালা, ধুলো ও ফুলের রেণু
- গরম ও ঘাম, যা আর্দ্র আবহাওয়ায় সাধারণ জ্বালাকর

## ঘরে ত্বক শান্ত করা

- পারলে উদ্দীপক চিনে এড়িয়ে চলুন
- চুলকানি কমাতে ঠান্ডা সেঁক দিন
- ত্বক আর্দ্র রাখুন; মৃদু, সুগন্ধিহীন পণ্য ব্যবহার করুন
- চুলকানি ও আমবাতে ওভার-দ্য-কাউন্টার অ্যান্টিহিস্টামিন উপশম দিতে পারে
- চুলকাবেন না — এতে জ্বালা বাড়ে ও সংক্রমণ হতে পারে

## কখন ডাক্তার দেখাবেন

র‍্যাশ ছড়িয়ে পড়লে, ব্যথাযুক্ত বা ফোসকা পড়লে, না-কমলে; বারবার ফিরে এলে; সংক্রমিত মনে হলে (গরম, পুঁজ, ছড়ানো লালচে ভাব); বা ঘুম বা দৈনন্দিন জীবন ব্যাহত করলে ডাক্তার দেখান।

## জরুরি — সঙ্গে সঙ্গে ব্যবস্থা নিন

ত্বকের প্রতিক্রিয়ার সঙ্গে **মুখ, ঠোঁট, জিভ বা গলা ফুলে যাওয়া, শ্বাসকষ্ট, সাঁই-সাঁই শব্দ, মাথা ঘোরা বা অজ্ঞান হওয়া** থাকলে তখনই জরুরি সাহায্য নিন বা হাসপাতালে যান। এটি অ্যানাফাইল্যাক্সিস হতে পারে — একটি তীব্র, জীবনঘাতী অ্যালার্জি, যা কয়েক মিনিটের মধ্যে চিকিৎসা দরকার।`,
    excerpt:
      "Itchy rashes and hives are common and usually harmless. Learn the typical triggers, how to calm your skin at home, and the emergency signs of a severe allergic reaction.",
    specialties: ["Dermatology", "Allergy & Immunology"],
    body: `Itchy skin, rashes and hives are among the most common reasons people see a doctor. Most are harmless and settle quickly, but it helps to know the triggers — and the rare signs that need emergency care.

## Common types

- **Contact reactions** — redness and itching where the skin touched something irritating (soap, cosmetics, metal, plants, chemicals)
- **Hives (urticaria)** — raised, itchy welts that can appear and fade within hours
- **Eczema** — dry, itchy, inflamed patches, often long-term

## Common triggers

- Certain foods
- Medicines
- Soaps, detergents, cosmetics and perfumes
- Metals (such as in cheap jewellery) and some fabrics
- Plants, dust and pollen
- Heat and sweat, which are common irritants in a humid climate

## Calming your skin at home

- Identify and avoid the trigger if you can
- Use a cool compress to ease itching
- Keep skin moisturised; use gentle, fragrance-free products
- An over-the-counter antihistamine can relieve itching and hives
- Try not to scratch, which worsens irritation and can cause infection

## When to see a doctor

See a doctor if a rash is widespread, painful, blistering, or not improving; if it keeps coming back; if it looks infected (warm, oozing, spreading redness); or if it is affecting your sleep or daily life. A doctor can help identify the cause and prescribe stronger treatment if needed.

## Emergency — act immediately

Call for emergency help or go to hospital at once if a skin reaction comes with **swelling of the face, lips, tongue or throat, difficulty breathing, wheezing, dizziness or fainting**. This can be anaphylaxis — a severe, life-threatening allergic reaction that needs treatment within minutes.`,
  },
];

async function main() {
  await dbConnect();
  const model = Article as unknown as Loose;
  let created = 0;
  let skipped = 0;

  for (const a of ARTICLES) {
    const existing = await model.findOne({ slug: a.slug });
    if (existing) {
      skipped += 1;
      console.log(`  skip   ${a.slug} (already exists)`);
      continue;
    }
    if (DRY_RUN) {
      created += 1;
      console.log(`  create ${a.slug} (dry-run)`);
      continue;
    }
    await model.create({
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      body: a.body,
      titleBn: a.titleBn ?? null,
      excerptBn: a.excerptBn ?? "",
      bodyBn: a.bodyBn ?? null,
      specialties: a.specialties,
      authorType: "admin",
      authorName: "Daktar.Link Editorial",
      status: "draft", // review + publish from /admin/articles
    });
    created += 1;
    console.log(`  create ${a.slug}`);
  }

  console.log(
    `\nDone. ${created} ${DRY_RUN ? "would be created" : "created"}, ${skipped} skipped (existing).` +
      `\nReview them at /admin/articles, then Publish each after a medical/editorial check.`,
  );
  await dbDisconnect();
  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
