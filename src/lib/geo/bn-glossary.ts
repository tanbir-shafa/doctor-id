/**
 * Bengali (বাংলা) glossary for Daktar.Link's location + specialty taxonomy.
 *
 * Task 5 (partial): the bounded, well-known translations of the 8 divisions,
 * 64 districts, and the specialty catalog. Feeds future Bangla `alternateName`
 * (task 29) and the bilingual UI (task 35). Per-doctor name transliteration is
 * NOT here — that needs a data source (the remaining part of task 5).
 *
 * District/division English keys mirror src/lib/geo/bd-districts.ts exactly.
 * Spellings were drafted and cross-checked by two independent Bengali reviewers
 * (e.g. নেত্রকোনা not নেত্রকোণা; রাঙামাটি not রাঙ্গামাটি).
 */

export const BD_DIVISION_BN: Readonly<Record<string, string>> = {
  Dhaka: "ঢাকা",
  Chattogram: "চট্টগ্রাম",
  Rajshahi: "রাজশাহী",
  Khulna: "খুলনা",
  Barishal: "বরিশাল",
  Sylhet: "সিলেট",
  Rangpur: "রংপুর",
  Mymensingh: "ময়মনসিংহ",
};

export const BD_DISTRICT_BN: Readonly<Record<string, string>> = {
  Dhaka: "ঢাকা",
  Faridpur: "ফরিদপুর",
  Gazipur: "গাজীপুর",
  Gopalganj: "গোপালগঞ্জ",
  Kishoreganj: "কিশোরগঞ্জ",
  Madaripur: "মাদারীপুর",
  Manikganj: "মানিকগঞ্জ",
  Munshiganj: "মুন্সিগঞ্জ",
  Narayanganj: "নারায়ণগঞ্জ",
  Narsingdi: "নরসিংদী",
  Rajbari: "রাজবাড়ী",
  Shariatpur: "শরীয়তপুর",
  Tangail: "টাঙ্গাইল",
  Bandarban: "বান্দরবান",
  Brahmanbaria: "ব্রাহ্মণবাড়িয়া",
  Chandpur: "চাঁদপুর",
  Chittagong: "চট্টগ্রাম",
  Comilla: "কুমিল্লা",
  "Cox's Bazar": "কক্সবাজার",
  Feni: "ফেনী",
  Khagrachhari: "খাগড়াছড়ি",
  Lakshmipur: "লক্ষ্মীপুর",
  Noakhali: "নোয়াখালী",
  Rangamati: "রাঙামাটি",
  Bogra: "বগুড়া",
  Chapainawabganj: "চাঁপাইনবাবগঞ্জ",
  Joypurhat: "জয়পুরহাট",
  Naogaon: "নওগাঁ",
  Natore: "নাটোর",
  Pabna: "পাবনা",
  Rajshahi: "রাজশাহী",
  Sirajganj: "সিরাজগঞ্জ",
  Bagerhat: "বাগেরহাট",
  Chuadanga: "চুয়াডাঙ্গা",
  Jessore: "যশোর",
  Jhenaidah: "ঝিনাইদহ",
  Khulna: "খুলনা",
  Kushtia: "কুষ্টিয়া",
  Magura: "মাগুরা",
  Meherpur: "মেহেরপুর",
  Narail: "নড়াইল",
  Satkhira: "সাতক্ষীরা",
  Barguna: "বরগুনা",
  Barisal: "বরিশাল",
  Bhola: "ভোলা",
  Jhalokati: "ঝালকাঠি",
  Patuakhali: "পটুয়াখালী",
  Pirojpur: "পিরোজপুর",
  Habiganj: "হবিগঞ্জ",
  Moulvibazar: "মৌলভীবাজার",
  Sunamganj: "সুনামগঞ্জ",
  Sylhet: "সিলেট",
  Dinajpur: "দিনাজপুর",
  Gaibandha: "গাইবান্ধা",
  Kurigram: "কুড়িগ্রাম",
  Lalmonirhat: "লালমনিরহাট",
  Nilphamari: "নীলফামারী",
  Panchagarh: "পঞ্চগড়",
  Rangpur: "রংপুর",
  Thakurgaon: "ঠাকুরগাঁও",
  Jamalpur: "জামালপুর",
  Mymensingh: "ময়মনসিংহ",
  Netrokona: "নেত্রকোনা",
  Sherpur: "শেরপুর",
};

export const SPECIALTY_BN: Readonly<Record<string, string>> = {
  Cardiology: "হৃদরোগ বিশেষজ্ঞ",
  Gynecology: "স্ত্রীরোগ বিশেষজ্ঞ",
  Pediatrics: "শিশু বিশেষজ্ঞ",
  Dermatology: "চর্মরোগ বিশেষজ্ঞ",
  "General Medicine": "মেডিসিন বিশেষজ্ঞ",
  Neurology: "স্নায়ুরোগ বিশেষজ্ঞ",
  Orthopedics: "হাড় ও জোড়া বিশেষজ্ঞ (অর্থোপেডিক)",
  Ophthalmology: "চক্ষু বিশেষজ্ঞ",
  Psychiatry: "মানসিক রোগ বিশেষজ্ঞ",
  Surgery: "সার্জারি বিশেষজ্ঞ (শল্যচিকিৎসক)",
  Urology: "মূত্ররোগ ও কিডনি সার্জারি বিশেষজ্ঞ (ইউরোলজি)",
  Oncology: "ক্যান্সার বিশেষজ্ঞ",
  Endocrinology: "হরমোন ও ডায়াবেটিস বিশেষজ্ঞ (এন্ডোক্রাইনোলজি)",
  Gastroenterology: "পরিপাকতন্ত্র ও পেটের রোগ বিশেষজ্ঞ (গ্যাস্ট্রোএন্টারোলজি)",
  Nephrology: "কিডনি রোগ বিশেষজ্ঞ",
  Pulmonology: "বক্ষব্যাধি ও শ্বাসকষ্ট বিশেষজ্ঞ",
  Rheumatology: "বাত-ব্যথা বিশেষজ্ঞ (রিউমাটোলজি)",
  Hematology: "রক্তরোগ বিশেষজ্ঞ",
  ENT: "নাক-কান-গলা বিশেষজ্ঞ",
  "Obstetrics & Gynaecology": "প্রসূতি ও স্ত্রীরোগ বিশেষজ্ঞ",
  Neurosurgery: "নিউরোসার্জারি বিশেষজ্ঞ (স্নায়ু শল্যচিকিৎসক)",
  "Cardiothoracic Surgery": "হৃদরোগ ও বক্ষ সার্জারি বিশেষজ্ঞ (কার্ডিওথোরাসিক সার্জন)",
  "Plastic Surgery": "প্লাস্টিক সার্জারি বিশেষজ্ঞ",
  "Pediatric Surgery": "শিশু সার্জারি বিশেষজ্ঞ",
  "Vascular Surgery": "রক্তনালী সার্জারি বিশেষজ্ঞ (ভাস্কুলার সার্জন)",
  "Colorectal Surgery": "কোলোরেক্টাল সার্জারি বিশেষজ্ঞ (পায়ুপথ ও বৃহদন্ত্র)",
  "Physical Medicine & Rehabilitation": "ফিজিক্যাল মেডিসিন ও পুনর্বাসন বিশেষজ্ঞ",
  "Nuclear Medicine": "নিউক্লিয়ার মেডিসিন বিশেষজ্ঞ",
  "Critical Care Medicine": "ক্রিটিক্যাল কেয়ার (নিবিড় পরিচর্যা) বিশেষজ্ঞ",
  "Pain Medicine": "ব্যথা ব্যবস্থাপনা বিশেষজ্ঞ",
  "Gynaecological Oncology": "স্ত্রীরোগ ক্যান্সার বিশেষজ্ঞ (গাইনোকোলজিক্যাল অনকোলজি)",
  "Sports Medicine": "স্পোর্টস মেডিসিন বিশেষজ্ঞ",
  "Dental Surgery": "দন্ত বিশেষজ্ঞ (দাঁতের ডাক্তার)",
  Radiology: "রেডিওলজি ও ইমেজিং বিশেষজ্ঞ",
  "Nutrition & Dietetics": "পুষ্টি ও ডায়েট বিশেষজ্ঞ",
  Anesthesiology: "অ্যানেস্থেসিয়া বিশেষজ্ঞ (অজ্ঞান বিশেষজ্ঞ)",
  Pathology: "প্যাথলজি বিশেষজ্ঞ",
  "Family Medicine": "পারিবারিক চিকিৎসা বিশেষজ্ঞ (ফ্যামিলি মেডিসিন)",
  Neonatology: "নবজাতক বিশেষজ্ঞ",
  "Hepatobiliary Surgery": "যকৃৎ-পিত্তথলি সার্জারি বিশেষজ্ঞ",
  "Maxillofacial Surgery": "মুখমণ্ডল ও চোয়াল সার্জারি বিশেষজ্ঞ (ম্যাক্সিলোফেসিয়াল)",
  "Allergy & Immunology": "অ্যালার্জি ও ইমিউনোলজি বিশেষজ্ঞ",
  "Public Health Medicine": "জনস্বাস্থ্য বিশেষজ্ঞ",
  Hepatology: "যকৃৎ ও লিভার রোগ বিশেষজ্ঞ (হেপাটোলজি)",
  "Diabetic Medicine": "ডায়াবেটিস বিশেষজ্ঞ",
  "Adolescent Medicine": "কিশোর-কিশোরী স্বাস্থ্য বিশেষজ্ঞ",
  "Emergency Medicine": "জরুরি চিকিৎসা বিশেষজ্ঞ",
  "Other / Unspecified": "অন্যান্য / অনির্দিষ্ট",
};

function lookup(map: Readonly<Record<string, string>>, en: string | null | undefined): string | null {
  if (!en) return null;
  if (map[en]) return map[en];
  const hit = Object.keys(map).find((k) => k.toLowerCase() === String(en).toLowerCase());
  return hit ? map[hit]! : null;
}

/** Bengali name for a division (case-insensitive). Null if unknown. */
export function divisionBn(en: string | null | undefined): string | null {
  return lookup(BD_DIVISION_BN, en);
}

/** Bengali name for a district (case-insensitive). Null if unknown. */
export function districtBn(en: string | null | undefined): string | null {
  return lookup(BD_DISTRICT_BN, en);
}

/** Bengali label for a specialty (case-insensitive). Null if unknown. */
export function specialtyBn(en: string | null | undefined): string | null {
  return lookup(SPECIALTY_BN, en);
}
