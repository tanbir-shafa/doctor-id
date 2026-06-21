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
    specialties: ["Cardiology", "General Medicine"],
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
