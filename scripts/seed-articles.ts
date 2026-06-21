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

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production. Set to development to run.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

interface SeedArticle {
  title: string;
  slug: string;
  excerpt: string;
  specialties: string[];
  body: string;
}

const ARTICLES: SeedArticle[] = [
  {
    title: "High Blood Pressure: Symptoms, Causes, and When to See a Doctor",
    slug: "high-blood-pressure-symptoms-and-when-to-see-a-doctor",
    excerpt:
      "High blood pressure rarely causes symptoms but quietly raises your risk of heart attack, stroke and kidney disease. Here's what to watch for and when to see a doctor.",
    specialties: ["Cardiology", "Medicine"],
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
    specialties: ["Endocrinology", "Medicine"],
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
    specialties: ["Medicine"],
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
    excerpt:
      "Early pregnancy care protects both mother and baby. Here's what happens at your first antenatal visits, which tests to expect, and the symptoms that need a doctor right away.",
    specialties: ["Gynecology"],
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
