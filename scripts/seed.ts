/**
 * Seed script — populates dev/staging databases with realistic data.
 *
 * Run with: `npm run seed` (uses .env.local automatically via tsx --env-file).
 *
 * Idempotent: drops and re-inserts each collection it owns. Safe to run
 * repeatedly. Will refuse to run if NODE_ENV === 'production'.
 */

// Env vars are loaded by `tsx --env-file=.env.local` (see package.json `seed` script).
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { User, Specialty, Doctor } from "@/lib/db/models";
import { generateSlug } from "@/lib/utils/slug";
import { computeCompleteness } from "@/lib/utils/completeness";
import type { DoctorDocLike } from "@/types/doctor";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production. Set to development to run.");
  process.exit(1);
}

faker.seed(20260528); // deterministic output

// --- Bangladesh-specific reference data ---

const SPECIALTIES: Array<{
  name: string;
  nameBangla: string;
  slug: string;
  fhirCode: string;
  snomedCode: string;
  sortOrder: number;
}> = [
  { name: "Cardiology", nameBangla: "হৃদরোগ", slug: "cardiology", fhirCode: "394579002", snomedCode: "394579002", sortOrder: 1 },
  { name: "Gynecology", nameBangla: "স্ত্রীরোগ", slug: "gynecology", fhirCode: "394586005", snomedCode: "394586005", sortOrder: 2 },
  { name: "Pediatrics", nameBangla: "শিশুরোগ", slug: "pediatrics", fhirCode: "394537008", snomedCode: "394537008", sortOrder: 3 },
  { name: "Dermatology", nameBangla: "চর্মরোগ", slug: "dermatology", fhirCode: "394582007", snomedCode: "394582007", sortOrder: 4 },
  { name: "General Medicine", nameBangla: "সাধারণ চিকিৎসা", slug: "general-medicine", fhirCode: "419192003", snomedCode: "419192003", sortOrder: 5 },
  { name: "Neurology", nameBangla: "স্নায়ুরোগ", slug: "neurology", fhirCode: "394591006", snomedCode: "394591006", sortOrder: 6 },
  { name: "Orthopedics", nameBangla: "অর্থোপেডিক", slug: "orthopedics", fhirCode: "394801008", snomedCode: "394801008", sortOrder: 7 },
  { name: "Ophthalmology", nameBangla: "চক্ষুরোগ", slug: "ophthalmology", fhirCode: "394594003", snomedCode: "394594003", sortOrder: 8 },
  { name: "Psychiatry", nameBangla: "মানসিক রোগ", slug: "psychiatry", fhirCode: "394587001", snomedCode: "394587001", sortOrder: 9 },
  { name: "Surgery", nameBangla: "শল্যচিকিৎসা", slug: "surgery", fhirCode: "394609007", snomedCode: "394609007", sortOrder: 10 },
  { name: "Urology", nameBangla: "মূত্র-প্রস্রাব", slug: "urology", fhirCode: "394612005", snomedCode: "394612005", sortOrder: 11 },
  { name: "Oncology", nameBangla: "ক্যান্সার", slug: "oncology", fhirCode: "394593009", snomedCode: "394593009", sortOrder: 12 },
  { name: "Endocrinology", nameBangla: "এন্ডোক্রাইন (ডায়াবেটিস)", slug: "endocrinology", fhirCode: "394583002", snomedCode: "394583002", sortOrder: 13 },
  { name: "Gastroenterology", nameBangla: "পরিপাকতন্ত্র", slug: "gastroenterology", fhirCode: "394584008", snomedCode: "394584008", sortOrder: 14 },
  { name: "Nephrology", nameBangla: "কিডনি রোগ", slug: "nephrology", fhirCode: "394589003", snomedCode: "394589003", sortOrder: 15 },
  { name: "Pulmonology", nameBangla: "শ্বাসতন্ত্র", slug: "pulmonology", fhirCode: "418112009", snomedCode: "418112009", sortOrder: 16 },
  { name: "Rheumatology", nameBangla: "বাত-ব্যথা", slug: "rheumatology", fhirCode: "394810000", snomedCode: "394810000", sortOrder: 17 },
  { name: "Hematology", nameBangla: "রক্তরোগ", slug: "hematology", fhirCode: "394803006", snomedCode: "394803006", sortOrder: 18 },
  { name: "ENT", nameBangla: "নাক-কান-গলা", slug: "ent", fhirCode: "394605004", snomedCode: "394605004", sortOrder: 19 },
  { name: "Obstetrics", nameBangla: "প্রসূতিবিদ্যা", slug: "obstetrics", fhirCode: "394585009", snomedCode: "394585009", sortOrder: 20 },
];

// Common BD first/last names (transliteration). Used to make profiles credible.
const BD_FIRST_NAMES_M = ["Karim", "Rahim", "Imran", "Nazmul", "Shahriar", "Tanvir", "Faisal", "Saiful", "Mahbub", "Arif", "Nasir", "Rezaul", "Habibur", "Mostafa", "Sajid"];
const BD_FIRST_NAMES_F = ["Fatema", "Sumaiya", "Nasrin", "Tahmina", "Rumana", "Saima", "Sharmin", "Jannatul", "Farhana", "Mahiya", "Tasnim", "Israt", "Nusrat", "Sabina", "Lutfa"];
const BD_LAST_NAMES = ["Rahman", "Hossain", "Ahmed", "Islam", "Khan", "Chowdhury", "Akhter", "Karim", "Mahmud", "Siddique", "Begum", "Sultana", "Haque", "Bhuiyan", "Talukder"];

const BD_AREAS_DHAKA = ["Dhanmondi", "Gulshan", "Banani", "Mirpur", "Uttara", "Mohammadpur", "Bashundhara", "Tejgaon", "Mohakhali", "Shantinagar", "Lalmatia", "Wari"];
const BD_AREAS_CHITTAGONG = ["Agrabad", "Khulshi", "Nasirabad", "GEC Circle", "Kotwali", "Panchlaish"];
const BD_AREAS_SYLHET = ["Zindabazar", "Subidbazar", "Amberkhana", "Chowhatta"];

const CITIES: Array<{ city: string; division: string; areas: string[]; lat: [number, number]; lng: [number, number] }> = [
  { city: "Dhaka", division: "Dhaka", areas: BD_AREAS_DHAKA, lat: [23.70, 23.85], lng: [90.35, 90.45] },
  { city: "Chittagong", division: "Chittagong", areas: BD_AREAS_CHITTAGONG, lat: [22.30, 22.40], lng: [91.80, 91.85] },
  { city: "Sylhet", division: "Sylhet", areas: BD_AREAS_SYLHET, lat: [24.88, 24.92], lng: [91.85, 91.90] },
];

const MEDICAL_INSTITUTIONS = [
  "Dhaka Medical College",
  "Sir Salimullah Medical College",
  "Chittagong Medical College",
  "Sylhet MAG Osmani Medical College",
  "Bangabandhu Sheikh Mujib Medical University",
  "Mymensingh Medical College",
  "Rajshahi Medical College",
  "Sher-e-Bangla Medical College",
];

const DEGREES = ["MBBS", "FCPS (Medicine)", "FCPS (Surgery)", "FCPS (Gynae)", "MD", "MS", "MRCP (UK)", "FRCS", "DLO", "DTCD", "DO", "DCH", "DGO"];

// --- Helpers ---

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomBmdcNumber(used: Set<string>): string {
  // BMDC numbers in the public registry are typically 5 digits, growing into 6.
  for (let i = 0; i < 100; i++) {
    const n = String(faker.number.int({ min: 30000, max: 199999 }));
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  throw new Error("Couldn't generate a unique BMDC number");
}

function randomCoordinatesIn(city: (typeof CITIES)[number]): { lat: number; lng: number } {
  return {
    lat: parseFloat(faker.number.float({ min: city.lat[0], max: city.lat[1], fractionDigits: 6 }).toFixed(6)),
    lng: parseFloat(faker.number.float({ min: city.lng[0], max: city.lng[1], fractionDigits: 6 }).toFixed(6)),
  };
}

function randomSchedule(): Array<{ day: string; startTime: string; endTime: string; available: boolean }> {
  const days = ["sat", "sun", "mon", "tue", "wed", "thu"]; // Bangladesh standard week (Fri off)
  return days.map((day) => ({
    day,
    startTime: "17:00",
    endTime: "21:00",
    available: faker.datatype.boolean({ probability: 0.8 }),
  }));
}

async function main() {
  console.log("→ Connecting to Mongo…");
  await dbConnect();

  console.log("→ Dropping seed collections (drops stale indexes too)…");
  // Use `collection.drop()` so any indexes left over from previous schema
  // shapes are removed. Mongoose will recreate the current indexes on the
  // next write. `try` because dropping a non-existent collection throws.
  for (const m of [Specialty, Doctor]) {
    try {
      await m.collection.drop();
    } catch (err: unknown) {
      const e = err as { codeName?: string };
      if (e.codeName !== "NamespaceNotFound") throw err;
    }
  }
  // Only wipe seeded users — leave any admins/real signups alone.
  await User.deleteMany({ email: { $regex: /@seed\.doctor\.id\.bd$/ } });

  // Recreate indexes so the dropped collections come back with the current shape.
  await Promise.all([Specialty.syncIndexes(), Doctor.syncIndexes()]);

  // --- Specialties ---
  console.log(`→ Inserting ${SPECIALTIES.length} specialties…`);
  const specialtyDocs = await Specialty.insertMany(SPECIALTIES.map((s) => ({ ...s, active: true })));
  console.log(`  ✓ ${specialtyDocs.length} specialties inserted.`);

  // --- Admin user ---
  const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim() || "admin@doctor.id.bd";
  const adminPassword = "ChangeMe!2026";
  const adminHash = await bcrypt.hash(adminPassword, 12);
  console.log(`→ Upserting admin user ${adminEmail}…`);
  await User.findOneAndUpdate(
    { email: adminEmail.toLowerCase() },
    {
      $set: {
        email: adminEmail.toLowerCase(),
        passwordHash: adminHash,
        role: "admin",
        emailVerified: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  console.log(`  ✓ Admin: ${adminEmail} / ${adminPassword}`);

  // --- 50 doctors ---
  console.log("→ Generating 50 doctor profiles…");
  const bmdcUsed = new Set<string>();
  const slugUsed = new Set<string>();
  // Mongoose's `insertMany` does its own runtime validation against the schema,
  // so we keep this loose and rely on the model — strict typing across the
  // seed's faker output adds friction without catching real bugs.
  const docsToInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < 50; i++) {
    const gender = faker.datatype.boolean() ? "male" : "female";
    const first = gender === "male" ? pick(BD_FIRST_NAMES_M) : pick(BD_FIRST_NAMES_F);
    const last = pick(BD_LAST_NAMES);
    const displayName = `${first} ${last}`;
    const primarySpecialty = pick(SPECIALTIES);
    const extraSpecialty = faker.datatype.boolean({ probability: 0.3 }) ? pick(SPECIALTIES) : null;

    let slug = generateSlug({ displayName, primarySpecialty: primarySpecialty.name });
    if (slugUsed.has(slug)) {
      slug = generateSlug({ displayName, primarySpecialty: primarySpecialty.name, disambiguator: i });
    }
    slugUsed.add(slug);

    const bmdcNumber = randomBmdcNumber(bmdcUsed);
    const city = pick(CITIES);
    const area = pick(city.areas);
    const ownerId = new mongoose.Types.ObjectId(); // pre-seeded profiles don't have a real user yet

    const qualifications = Array.from({ length: faker.number.int({ min: 2, max: 4 }) }, () => ({
      degree: pick(DEGREES),
      institution: pick(MEDICAL_INSTITUTIONS),
      year: faker.number.int({ min: 1995, max: 2022 }),
      country: "Bangladesh",
    }));

    const yearsExp = faker.number.int({ min: 4, max: 30 });
    const experience = [
      {
        role: "Consultant",
        organization: faker.helpers.arrayElement(MEDICAL_INSTITUTIONS) + " Hospital",
        from: new Date(new Date().getFullYear() - yearsExp, 0, 1),
        to: null,
        current: true,
      },
    ];

    const chambers = [
      {
        name: `${pick(["Popular", "Square", "Labaid", "United", "Apollo", "Ibn Sina"])} Diagnostic Centre — ${area}`,
        address: `${faker.location.streetAddress()}, ${area}, ${city.city}`,
        area,
        city: city.city,
        division: city.division,
        coordinates: randomCoordinatesIn(city),
        phone: `+8801${faker.number.int({ min: 300000000, max: 999999999 })}`,
        schedule: randomSchedule(),
        consultationFee: { amount: faker.number.int({ min: 500, max: 2500 }), currency: "BDT" as const },
        isPrimary: true,
      },
    ];

    const verificationRoll = Math.random();
    const verificationLevel: "unverified" | "bmdc_verified" | "fully_verified" =
      verificationRoll < 0.15 ? "fully_verified" : verificationRoll < 0.55 ? "bmdc_verified" : "unverified";

    const docLike = {
      ownerType: "doctor" as const,
      ownerId,
      userId: null,
      slug,
      bmdcNumber,
      bmdcVerified: verificationLevel !== "unverified",
      bmdcVerifiedAt: verificationLevel !== "unverified" ? new Date() : null,
      nidVerified: verificationLevel === "fully_verified",
      verificationLevel,
      name: { prefix: "Dr." as const, first, last, displayName },
      photo: {
        url: `https://i.pravatar.cc/400?img=${(i % 70) + 1}`,
        s3Key: `seed/avatars/${i}.jpg`,
      },
      coverPhoto: null,
      bio: faker.lorem.paragraphs({ min: 1, max: 2 }, "\n\n").slice(0, 1800),
      gender,
      languages: faker.datatype.boolean({ probability: 0.3 }) ? ["Bangla", "English", "Hindi"] : ["Bangla", "English"],
      specialties: [
        { name: primarySpecialty.name, isPrimary: true, fhirCode: primarySpecialty.fhirCode },
        ...(extraSpecialty && extraSpecialty.name !== primarySpecialty.name
          ? [{ name: extraSpecialty.name, isPrimary: false, fhirCode: extraSpecialty.fhirCode }]
          : []),
      ],
      subSpecialties: [],
      qualifications,
      experience,
      chambers,
      registrations: [{ council: "BMDC" as const, number: bmdcNumber, validFrom: null, validTo: null }],
      contact: {
        publicPhone: chambers[0]!.phone,
        publicEmail: null,
        whatsapp: chambers[0]!.phone,
        website: null,
      },
      socialLinks: {},
      profileViews: faker.number.int({ min: 0, max: 5000 }),
      isClaimed: false,
      status: "published" as const,
      seoTitle: null,
      seoDescription: null,
      privacyHidePhone: false,
      privacyHideEmail: false,
      profileCompletenessScore: 0, // computed below
    };

    const { score } = computeCompleteness(docLike as unknown as DoctorDocLike);
    docLike.profileCompletenessScore = score;

    docsToInsert.push(docLike);
  }

  const inserted = await Doctor.insertMany(docsToInsert);
  console.log(`  ✓ ${inserted.length} doctors inserted.`);

  // --- Summary ---
  const counts = {
    specialties: await Specialty.countDocuments(),
    doctors: await Doctor.countDocuments({ status: "published" }),
    verifiedDoctors: await Doctor.countDocuments({ verificationLevel: { $ne: "unverified" } }),
    admins: await User.countDocuments({ role: "admin" }),
  };
  console.log("\n✓ Seed complete:");
  console.table(counts);
  console.log(`  Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`  Try: http://localhost:3000/${inserted[0]!.get("slug")}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbDisconnect();
  });
