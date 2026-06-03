/**
 * Snapshot Ibn Sina Trust's public doctor catalog to local files.
 *
 * Phase 1: GET find_doctor_branchwise.php → parse branch dropdown.
 * Phase 2: POST view_find_doctor_branchwise.php?bid=<id> for each branch,
 *          parse the doctor cards out of the HTML.
 * Phase 3: aggregate cards into one record per unique doctor (keyed by
 *          the view_doctor_profile_up.php?id= value).
 * Phase 4: download each doctor's photo to data/ibn-sina/photos/.
 * Phase 5: write doctors.json, doctor-ids.json, meta.json.
 *
 * One-shot scraper — does NOT touch Mongo. Output is consumed by a future
 * DB-import script.
 *
 * Run:
 *   tsx --env-file=.env.local scripts/fetch-ibn-sina.ts
 *
 * Env knobs (all optional, no token needed):
 *   IBN_BRANCH_DELAY_MS    default 400
 *   IBN_BRANCH_JITTER_MS   default 150
 *   IBN_PHOTO_CONCURRENCY  default 4
 *   IBN_LIMIT              cap doctors processed in photo phase (0 = unlimited)
 *   IBN_FORCE_REFETCH      if "1", ignore cached branch-pages/<bid>.html
 */

import { mkdir, readFile, rename, writeFile, access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://www.ibnsinatrust.com";
const LIST_URL = `${BASE}/find_doctor_branchwise.php`;
const VIEW_URL = `${BASE}/view_find_doctor_branchwise.php`;

const OUT_DIR = "data/ibn-sina";
const BRANCH_PAGES_DIR = join(OUT_DIR, "branch-pages");
const PHOTOS_DIR = join(OUT_DIR, "photos");

const UA =
  "Mozilla/5.0 (compatible; doctor.id.bd-snapshot/1.0; +https://doctor.id.bd)";

// ---------- env ----------

const BRANCH_DELAY = num(process.env.IBN_BRANCH_DELAY_MS, 400);
const BRANCH_JITTER = num(process.env.IBN_BRANCH_JITTER_MS, 150);
const PHOTO_CONCURRENCY = num(process.env.IBN_PHOTO_CONCURRENCY, 4);
const LIMIT = process.env.IBN_LIMIT ? num(process.env.IBN_LIMIT, 0) : 0;
const FORCE_REFETCH = process.env.IBN_FORCE_REFETCH === "1";

function num(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------- types ----------

interface BranchRef {
  id: number;
  name: string;
}

interface BranchEntry {
  branch_id: number;
  name: string;
  map: string | null;
  phone: string | null;
  telephones: string[];
  chamber_time: string | null;
  off_day: string | null;
  floor_number: string | null;
  room_number: string | null;
  schedule: ScheduleEntry[];
}

interface ScheduleEntry {
  key: number;
  day: string;
  start_time: string;
  end_time: string;
  appointment_type: string;
}

interface Specialist {
  specialist_id: number | null;
  specialist_name: string;
}

interface DoctorRecord {
  id: number;
  name: string | null;
  mobile: string | null;
  email: string | null;
  image: string | null;
  degree: string | null;
  gender: string | null;
  education: string | null;
  designation: string | null;
  institute: string | null;
  language_spoken: string | null;
  specialty: string | null;
  previous_experience: string | null;
  experience_summery: string | null;
  profile_url: string;
  practicing_branches: string;
  branches: BranchEntry[];
  specialists: Specialist[];
  localPhotoPath: string | null;
  fetchedAt: string | null;
}

interface FailureEntry {
  id?: number;
  branchId?: number;
  url?: string;
  status?: number;
  error: string;
}

interface ScheduleFailure {
  doctorId: number;
  branchId: number;
  chamberTime: string | null;
  offDay: string | null;
  reason: string;
}

interface FieldConflict {
  doctorId: number;
  field: string;
  first: string;
  second: string;
}

interface Meta {
  startedAt: string;
  finishedAt: string | null;
  sourceList: string;
  sourceBranch: string;
  totalBranches: number;
  totalDoctors: number;
  totalPhotosDownloaded: number;
  branchFailures: FailureEntry[];
  parseFailures: FailureEntry[];
  photoFailures: FailureEntry[];
  fieldConflicts: FieldConflict[];
  scheduleParseFailures: ScheduleFailure[];
}

// ---------- helpers ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function jitteredBranchDelay() {
  return BRANCH_DELAY + Math.random() * BRANCH_JITTER;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}

async function writeAtomic(p: string, data: string | Buffer) {
  await ensureDir(dirname(p));
  const tmp = `${p}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, p);
}

function extFromContentType(ct: string | null): string {
  if (!ct) return ".bin";
  const lc = ct.toLowerCase();
  if (lc.includes("jpeg")) return ".jpg";
  if (lc.includes("png")) return ".png";
  if (lc.includes("webp")) return ".webp";
  if (lc.includes("gif")) return ".gif";
  if (lc.includes("svg")) return ".svg";
  return ".bin";
}

// ---------- HTTP with retry ----------

interface FetchResult {
  ok: boolean;
  status: number;
  headers: Headers;
  body: Buffer;
  error?: string;
}

async function pollFetch(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<FetchResult> {
  let lastErr = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": UA,
          ...(init.headers ?? {}),
        },
      });
      const status = res.status;

      if (status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 60;
        console.warn(`[http] 429 — sleeping ${ra}s`);
        await sleep(ra * 1000);
        continue;
      }

      if (status >= 500 && status < 600 && attempt < attempts) {
        lastStatus = status;
        lastErr = `HTTP ${status}`;
        const backoff = 1000 * Math.pow(3, attempt - 1);
        console.warn(`[http] ${status} on ${url} — backoff ${backoff}ms`);
        await sleep(backoff);
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: res.ok, status, headers: res.headers, body: buf };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < attempts) {
        const backoff = 1000 * Math.pow(3, attempt - 1);
        console.warn(`[http] network error on ${url} — ${lastErr} — backoff ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }

  return {
    ok: false,
    status: lastStatus,
    headers: new Headers(),
    body: Buffer.alloc(0),
    error: lastErr || "exhausted retries",
  };
}

// ---------- HTML utilities ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a labeled field's raw HTML value from a card chunk.
 * Matches `<b>Label:</b>` (with optional whitespace inside the bold tag)
 * and captures everything up to the next `<b>`, `</p>`, or `<a `.
 */
function extractFieldRaw(html: string, label: string): string | null {
  // Note the `\b` after `<b` in the lookahead — without it, `<b[^>]*>` would
  // also match `<br />` (since `r /` fits `[^>]*` and `>` closes), causing
  // the value to be truncated at the very first `<br>`.
  const re = new RegExp(
    `<b\\b[^>]*>\\s*${escapeRegex(label)}\\s*:\\s*</b>([\\s\\S]*?)(?=<b\\b[^>]*>|</p>|<a\\s)`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractField(html: string, label: string): string | null {
  const raw = extractFieldRaw(html, label);
  if (raw == null) return null;
  const text = cleanText(raw);
  return text.length ? text : null;
}

function extractFieldLines(html: string, label: string): string[] {
  const raw = extractFieldRaw(html, label);
  if (raw == null) return [];
  return raw
    .split(/<br\s*\/?>/i)
    .map((s) => cleanText(s))
    .filter(Boolean);
}

// ---------- schedule parsing ----------

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2, tuseday: 2,
  wed: 3, weds: 3, wednesday: 3, wednsday: 3, wedensday: 3, wednesd: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thusday: 4,
  fri: 5, friday: 5,
  sat: 6, satur: 6, saturday: 6,
};

function dayIdx(token: string): number | null {
  const k = token.toLowerCase();
  return Object.prototype.hasOwnProperty.call(DAY_MAP, k) ? DAY_MAP[k] : null;
}

/**
 * Expand "X to Y" range tokens (inclusive, modulo 7). Returns null if either
 * endpoint can't be resolved.
 */
function expandRange(a: string, b: string): number[] | null {
  const i = dayIdx(a);
  const j = dayIdx(b);
  if (i == null || j == null) return null;
  const out: number[] = [];
  for (let d = i, k = 0; k < 7; k++) {
    out.push(d);
    if (d === j) return out;
    d = (d + 1) % 7;
  }
  return out;
}

function parseOffDays(raw: string | null): Set<number> {
  const offDays = new Set<number>();
  if (!raw) return offDays;
  let s = raw;

  // First handle "X to Y" ranges.
  const rangeRe = /([A-Za-z]+)\s+to\s+([A-Za-z]+)/gi;
  s = s.replace(rangeRe, (m, a, b) => {
    const days = expandRange(a, b);
    if (days) {
      for (const d of days) offDays.add(d);
      return " ";
    }
    return m;
  });

  const tokens = s
    .toLowerCase()
    .replace(/\b(closed|off|day|holiday)\b/g, " ")
    .replace(/[&/–—\-,]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const t of tokens) {
    const d = dayIdx(t);
    if (d != null) offDays.add(d);
  }
  return offDays;
}

interface ParsedTime {
  hour: number;
  minute: number;
  meridiem: "am" | "pm" | null;
}

function parseTimeToken(tok: string): ParsedTime | null {
  const t = tok.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})(?:[:.](\d{1,2}))?(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isFinite(hour) || hour < 1 || hour > 23) return null;
  const minute = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(minute) || minute < 0 || minute >= 60) return null;
  let meridiem: "am" | "pm" | null = null;
  if (m[3]) meridiem = m[3].startsWith("a") ? "am" : "pm";
  return { hour, minute, meridiem };
}

function formatTime(t: ParsedTime): string {
  let hr = t.hour;
  let mer = t.meridiem ?? "pm";
  if (hr === 12 && mer === "am") hr = 12;
  else if (hr > 12) {
    hr -= 12;
    mer = "pm";
  }
  const mm = String(t.minute).padStart(2, "0");
  return `${hr}:${mm} ${mer}`;
}

function to24h(t: ParsedTime, assumedMeridiem: "am" | "pm"): number {
  const mer = t.meridiem ?? assumedMeridiem;
  let hr = t.hour % 12;
  if (mer === "pm") hr += 12;
  return hr * 60 + t.minute;
}

interface ParsedRange {
  start: string;
  end: string;
}

/**
 * Try to extract a single time range from a segment. Returns null if it
 * doesn't contain a parseable range.
 */
function parseSegmentRange(segmentRaw: string): ParsedRange | null {
  const s = segmentRaw
    .replace(/[–—]/g, "-")
    .replace(/-+/g, "-")
    .replace(/\bto\b/gi, "-")
    .trim();

  // Find the first parseable pair of time tokens in the string. We use a
  // generic regex that catches "9:30 AM", "5pm", "6.00 PM", "10", etc.
  const TIME_RE = /(\d{1,2})[:.]?(\d{0,2})\s*(am|pm|a\.m\.|p\.m\.)?/gi;
  type Candidate = { token: string; afterIdx: number };
  const candidates: Candidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(s)) !== null) {
    // Reject standalone bare numbers that don't look like a time (e.g. a year).
    if (!m[2] && !m[3] && m[1].length > 2) continue;
    candidates.push({ token: m[0], afterIdx: m.index + m[0].length });
  }
  if (candidates.length < 2) return null;

  // Prefer a pair separated by a "-"; otherwise just take the first two.
  let startTok = candidates[0].token;
  let endTok = candidates[1].token;
  for (let i = 0; i < candidates.length - 1; i++) {
    const between = s.slice(candidates[i].afterIdx, s.indexOf(candidates[i + 1].token, candidates[i].afterIdx));
    if (/-/.test(between)) {
      startTok = candidates[i].token;
      endTok = candidates[i + 1].token;
      break;
    }
  }

  const start = parseTimeToken(startTok);
  const end = parseTimeToken(endTok);
  if (!start || !end) return null;

  let startMer: "am" | "pm";
  let endMer: "am" | "pm";

  if (start.meridiem && end.meridiem) {
    startMer = start.meridiem;
    endMer = end.meridiem;
  } else if (!start.meridiem && end.meridiem) {
    endMer = end.meridiem;
    const sameMin = to24h({ ...start, meridiem: endMer }, endMer);
    const endMin = to24h(end, endMer);
    startMer = sameMin <= endMin ? endMer : endMer === "pm" ? "am" : "pm";
  } else if (start.meridiem && !end.meridiem) {
    startMer = start.meridiem;
    const sameMin = to24h({ ...end, meridiem: startMer }, startMer);
    const startMin = to24h(start, startMer);
    endMer = sameMin >= startMin ? startMer : startMer === "am" ? "pm" : "am";
  } else {
    startMer = "pm";
    endMer = "pm";
  }

  return {
    start: formatTime({ ...start, meridiem: startMer }),
    end: formatTime({ ...end, meridiem: endMer }),
  };
}

interface ChamberParseResult {
  range: ParsedRange | null;
  explicitDays: Set<number> | null;
  error: string | null;
}

/**
 * Extract a parseable time range from a free-form chamber_time string, plus
 * any explicit day list embedded in the string (which, if present, takes
 * precedence over the off_day exclusion set when generating schedule days).
 *
 * Strategy: clean up the string, split on multi-range delimiters (`&`, `and`,
 * newline, comma), and take the first segment that yields a parseable range.
 */
function parseChamberTime(raw: string | null): ChamberParseResult {
  if (!raw || !raw.trim()) return { range: null, explicitDays: null, error: "empty chamber_time" };

  // Normalize escape sequences and unicode dashes / whitespace.
  let s = raw
    .replace(/\\+r\\+n|\\+n/g, " ")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[.,;]\s*$/g, "")
    .trim();

  // Flatten parens — many strings keep the time range *inside* the parens
  // (e.g. "Everyday (09:00AM - 5:00PM)", "Sun, Wed, Thu (4pm-7pm)") so we
  // keep the contents and just strip the brackets.
  s = s.replace(/[()]/g, " ");

  // "Everyday" → all 7 days.
  let everyday = false;
  if (/\beveryday\b/i.test(s)) {
    everyday = true;
    s = s.replace(/\beveryday\b/gi, " ");
  }

  // Day mentions anywhere in the string (used as the available-day hint).
  const explicitDayMentions = extractDayMentions(s);

  // Find the first parseable time range anywhere in the string.
  const range = parseSegmentRange(s);
  if (!range) return { range: null, explicitDays: null, error: `no parseable time range in "${raw}"` };

  let explicitDays: Set<number> | null = null;
  if (everyday) {
    explicitDays = new Set([0, 1, 2, 3, 4, 5, 6]);
  } else if (explicitDayMentions.size > 0) {
    explicitDays = explicitDayMentions;
  }

  return { range, explicitDays, error: null };
}

function extractDayMentions(s: string): Set<number> {
  const found = new Set<number>();
  if (!s) return found;

  // "X to Y" ranges first.
  const rangeRe = /\b([A-Za-z]+)\s+to\s+([A-Za-z]+)\b/gi;
  let m: RegExpExecArray | null;
  let stripped = s;
  while ((m = rangeRe.exec(s)) !== null) {
    const r = expandRange(m[1], m[2]);
    if (r) for (const d of r) found.add(d);
    stripped = stripped.replace(m[0], " ");
  }

  for (const tok of stripped.toLowerCase().split(/[\s,&/\-]+/)) {
    const d = dayIdx(tok);
    if (d != null) found.add(d);
  }
  return found;
}

function buildSchedule(
  chamberTime: string | null,
  offDay: string | null,
): { schedule: ScheduleEntry[]; error: string | null } {
  const parsed = parseChamberTime(chamberTime);
  if (parsed.error || !parsed.range) return { schedule: [], error: parsed.error ?? "no range" };

  // If chamber_time embedded explicit days, those are the doctor's available
  // days. Otherwise fall back to [0..6] minus off_day exclusions.
  let availableDays: number[];
  if (parsed.explicitDays) {
    availableDays = Array.from(parsed.explicitDays).sort((a, b) => a - b);
  } else {
    const offDays = parseOffDays(offDay);
    availableDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !offDays.has(d));
  }
  if (availableDays.length === 0) return { schedule: [], error: "no available days after off_day exclusion" };

  const schedule: ScheduleEntry[] = availableDays.map((d) => ({
    key: d,
    day: DAY_NAME[d],
    start_time: parsed.range!.start,
    end_time: parsed.range!.end,
    appointment_type: "General Appointment",
  }));
  return { schedule, error: null };
}

// ---------- branch list (phase 1) ----------

async function fetchBranches(meta: Meta): Promise<BranchRef[]> {
  console.log("[branches] phase 1 — fetching branch dropdown");
  const res = await pollFetch(LIST_URL, { method: "GET" });
  if (!res.ok) {
    meta.branchFailures.push({
      url: LIST_URL,
      status: res.status,
      error: res.error ?? `HTTP ${res.status}`,
    });
    console.error(`[branches] failed to fetch list page: ${res.error ?? res.status}`);
    return [];
  }

  const html = res.body.toString("utf8");

  // The branch dropdown is the only <select> we care about. Pick all
  // <option value="N">Name</option> where N is a positive integer.
  const branches: BranchRef[] = [];
  const optRe = /<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(html)) !== null) {
    const id = Number(m[1]);
    const name = decodeEntities(m[2]).trim();
    if (Number.isFinite(id) && id > 0 && name) {
      branches.push({ id, name });
    }
  }

  console.log(`[branches] found ${branches.length} branches`);
  return branches;
}

// ---------- per-branch fetch + parse (phase 2) ----------

interface RawCard {
  id: number;
  name: string | null;
  imageFilename: string | null;
  qualifications: string | null;
  specialty: string | null;
  languageSpoken: string | null;
  designation: string | null;
  institute: string | null;
  departmentName: string | null;
  appointment: string | null;
  chamberTime: string | null;
  offDay: string | null;
  floorNumber: string | null;
  roomNumber: string | null;
  branchName: string | null;
  branchAddress: string | null;
}

const CARD_SEPARATOR = /<img\s+[^>]*src="img\/line\.png"[^>]*>/gi;

function splitCards(html: string): string[] {
  // Each card is followed by `<img src="img/line.png">`. Split on that and
  // keep chunks that actually contain a doctor profile link.
  const parts = html.split(CARD_SEPARATOR);
  return parts.filter((p) => /view_doctor_profile_up\.php/i.test(p));
}

function parseCard(chunk: string): RawCard | null {
  const idMatch = chunk.match(/view_doctor_profile_up\.php\?id=(\d+)/i);
  if (!idMatch) return null;
  const id = Number(idMatch[1]);

  const nameMatch = chunk.match(
    /<p[^>]*color:#00E[^>]*font-size:19px[^>]*>([\s\S]*?)<\/p>/i,
  );
  const name = nameMatch ? cleanText(nameMatch[1]) || null : null;

  const imgMatch = chunk.match(/<img\s+[^>]*src="upload\/([^"]+)"/i);
  const imageFilename = imgMatch ? decodeEntities(imgMatch[1]) : null;

  const branchLines = extractFieldLines(chunk, "Branch Name & Address");
  const branchName = branchLines[0] ?? null;
  const branchAddress =
    branchLines.length > 1 ? branchLines.slice(1).join(", ") : null;

  return {
    id,
    name,
    imageFilename,
    qualifications: extractField(chunk, "Qualifications"),
    specialty: extractField(chunk, "Specialty"),
    languageSpoken: extractField(chunk, "Language Spoken"),
    designation: extractField(chunk, "Designation"),
    institute: extractField(chunk, "Institute"),
    departmentName: extractField(chunk, "Department Name"),
    appointment: extractField(chunk, "Appointment"),
    chamberTime: extractField(chunk, "Chamber Time"),
    offDay: extractField(chunk, "Off Day"),
    floorNumber: extractField(chunk, "Floor Number"),
    roomNumber: extractField(chunk, "Room Number"),
    branchName,
    branchAddress,
  };
}

async function fetchBranchPage(bid: number, meta: Meta): Promise<string | null> {
  const cachePath = join(BRANCH_PAGES_DIR, `${bid}.html`);

  if (!FORCE_REFETCH && (await exists(cachePath))) {
    try {
      const buf = await readFile(cachePath, "utf8");
      if (buf.length > 0) return buf;
    } catch {
      // fall through and re-fetch
    }
  }

  const res = await pollFetch(VIEW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
    },
    body: `bid=${encodeURIComponent(String(bid))}`,
  });

  if (!res.ok) {
    meta.branchFailures.push({
      branchId: bid,
      url: VIEW_URL,
      status: res.status,
      error: res.error ?? `HTTP ${res.status}`,
    });
    return null;
  }

  const html = res.body.toString("utf8");
  await writeAtomic(cachePath, html);
  return html;
}

// ---------- aggregation (phase 3) ----------

function buildImageUrl(filename: string | null): string | null {
  if (!filename) return null;
  return `${BASE}/upload/${encodeURIComponent(filename)}`;
}

function extractCityFromAddress(address: string | null, branchName: string | null): string | null {
  // Branch names look like "Ibn Sina Diagnostic & Imaging Center, Dhanmondi"
  // Addresses look like "House 48, Road 9/A, Dhanmondi, Dhaka-1209"
  // Take the chunk just before "Dhaka-xxxx" if present, else the last comma segment of the branch name.
  if (address) {
    const beforeDhaka = address.match(/,\s*([A-Za-z][\w\s]+?)\s*,\s*Dhaka/i);
    if (beforeDhaka) return beforeDhaka[1].trim();
  }
  if (branchName) {
    const parts = branchName.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      return parts[parts.length - 1].replace(/\.$/, "");
    }
  }
  return null;
}

function recordFieldConflict(
  meta: Meta,
  doctorId: number,
  field: string,
  first: string | null,
  second: string | null,
) {
  if (!first || !second) return;
  if (first.trim() === second.trim()) return;
  meta.fieldConflicts.push({ doctorId, field, first, second });
}

interface AggregateState {
  doctors: Map<number, DoctorRecord>;
  citiesByDoctor: Map<number, Set<string>>;
}

function mergeCard(
  state: AggregateState,
  branchRef: BranchRef,
  card: RawCard,
  meta: Meta,
) {
  let rec = state.doctors.get(card.id);
  if (!rec) {
    rec = {
      id: card.id,
      name: card.name,
      mobile: null,
      email: null,
      image: buildImageUrl(card.imageFilename),
      degree: card.qualifications,
      gender: null,
      education: card.qualifications,
      designation: card.designation,
      institute: card.institute,
      language_spoken: card.languageSpoken,
      specialty: card.specialty,
      previous_experience: null,
      experience_summery: null,
      profile_url: `${BASE}/view_doctor_profile_up.php?id=${card.id}`,
      practicing_branches: "",
      branches: [],
      specialists: card.departmentName
        ? [{ specialist_id: null, specialist_name: card.departmentName }]
        : [],
      localPhotoPath: null,
      fetchedAt: null,
    };
    state.doctors.set(card.id, rec);
    state.citiesByDoctor.set(card.id, new Set());
  } else {
    // First non-empty wins; log conflicts where the new value disagrees.
    const setIfEmpty = <K extends keyof DoctorRecord>(
      key: K,
      value: DoctorRecord[K] | null,
      field: string,
    ) => {
      if (rec![key] == null || rec![key] === "") {
        if (value != null && value !== "") rec![key] = value as DoctorRecord[K];
      } else if (value != null && value !== "") {
        recordFieldConflict(meta, card.id, field, String(rec![key]), String(value));
      }
    };
    setIfEmpty("name", card.name, "name");
    setIfEmpty("image", buildImageUrl(card.imageFilename), "image");
    setIfEmpty("degree", card.qualifications, "degree");
    setIfEmpty("education", card.qualifications, "education");
    setIfEmpty("designation", card.designation, "designation");
    setIfEmpty("institute", card.institute, "institute");
    setIfEmpty("language_spoken", card.languageSpoken, "language_spoken");
    setIfEmpty("specialty", card.specialty, "specialty");

    if (card.departmentName) {
      const exists = rec.specialists.some(
        (s) => s.specialist_name.toLowerCase() === card.departmentName!.toLowerCase(),
      );
      if (!exists) {
        rec.specialists.push({ specialist_id: null, specialist_name: card.departmentName });
      }
    }
  }

  const { schedule, error } = buildSchedule(card.chamberTime, card.offDay);
  if (error && card.chamberTime) {
    meta.scheduleParseFailures.push({
      doctorId: card.id,
      branchId: branchRef.id,
      chamberTime: card.chamberTime,
      offDay: card.offDay,
      reason: error,
    });
  }

  const branchEntry: BranchEntry = {
    branch_id: branchRef.id,
    name: card.branchName ?? branchRef.name,
    map: card.branchAddress,
    phone: card.appointment,
    telephones: [],
    chamber_time: card.chamberTime,
    off_day: card.offDay,
    floor_number: card.floorNumber,
    room_number: card.roomNumber,
    schedule,
  };

  // Dedup: same doctor + same branch_id should only appear once. If a
  // branch page somehow lists the doctor twice we keep the first entry.
  if (!rec.branches.some((b) => b.branch_id === branchEntry.branch_id)) {
    rec.branches.push(branchEntry);
  }

  const city = extractCityFromAddress(card.branchAddress, card.branchName);
  if (city) state.citiesByDoctor.get(card.id)!.add(city);
}

// ---------- photos (phase 4) ----------

interface PhotoJob {
  id: number;
  imageUrl: string;
}

async function downloadPhoto(job: PhotoJob, meta: Meta): Promise<string | null> {
  for (const ext of [".jpg", ".png", ".webp", ".gif", ".svg", ".bin"]) {
    const p = join(PHOTOS_DIR, `${job.id}${ext}`);
    if (await exists(p)) {
      try {
        const st = await stat(p);
        if (st.size > 0) return p;
      } catch {
        // re-download
      }
    }
  }

  const res = await pollFetch(job.imageUrl, { method: "GET" }, 2);
  if (!res.ok || res.body.length === 0) {
    meta.photoFailures.push({
      id: job.id,
      url: job.imageUrl,
      status: res.status,
      error: res.error ?? `HTTP ${res.status} or empty body`,
    });
    return null;
  }

  const ext = extFromContentType(res.headers.get("content-type"));
  const out = join(PHOTOS_DIR, `${job.id}${ext}`);
  await writeAtomic(out, res.body);
  return out;
}

async function downloadAllPhotos(
  jobs: PhotoJob[],
  meta: Meta,
): Promise<Map<number, string>> {
  console.log(`[photo] phase 4 — downloading ${jobs.length} photos (concurrency=${PHOTO_CONCURRENCY})`);
  await ensureDir(PHOTOS_DIR);

  const result = new Map<number, string>();
  let done = 0;
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= jobs.length) return;
      const job = jobs[idx];
      const path = await downloadPhoto(job, meta);
      if (path) result.set(job.id, path);
      done++;
      if (done % 100 === 0) {
        console.log(`[photo] ${done}/${jobs.length} — ${result.size} ok, ${meta.photoFailures.length} failed`);
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, worker));
  meta.totalPhotosDownloaded = result.size;
  console.log(`[photo] done — ${result.size}/${jobs.length} downloaded, ${meta.photoFailures.length} failed`);
  return result;
}

// ---------- main ----------

async function main() {
  const startedAt = new Date().toISOString();
  const meta: Meta = {
    startedAt,
    finishedAt: null,
    sourceList: LIST_URL,
    sourceBranch: VIEW_URL,
    totalBranches: 0,
    totalDoctors: 0,
    totalPhotosDownloaded: 0,
    branchFailures: [],
    parseFailures: [],
    photoFailures: [],
    fieldConflicts: [],
    scheduleParseFailures: [],
  };

  await ensureDir(OUT_DIR);
  await ensureDir(BRANCH_PAGES_DIR);

  // Phase 1
  const branches = await fetchBranches(meta);
  meta.totalBranches = branches.length;
  await writeAtomic(join(OUT_DIR, "branches.json"), JSON.stringify(branches, null, 2));

  // Phase 2 + 3
  const state: AggregateState = {
    doctors: new Map(),
    citiesByDoctor: new Map(),
  };

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    if (i > 0) await sleep(jitteredBranchDelay());

    const html = await fetchBranchPage(branch.id, meta);
    if (!html) {
      console.warn(`[branch ${branch.id}] fetch failed — skipping`);
      continue;
    }

    const chunks = splitCards(html);
    let cards = 0;
    let parseFails = 0;
    for (const chunk of chunks) {
      const card = parseCard(chunk);
      if (!card) {
        parseFails++;
        meta.parseFailures.push({
          branchId: branch.id,
          error: "card chunk had no doctor id",
        });
        continue;
      }
      mergeCard(state, branch, card, meta);
      cards++;
    }
    console.log(
      `[branch ${branch.id}/${branches.length}] "${branch.name.slice(0, 40)}" — +${cards} cards, ${parseFails} parse fail`,
    );
  }

  // Compute practicing_branches from accumulated cities.
  for (const [id, rec] of state.doctors) {
    const cities = state.citiesByDoctor.get(id);
    if (cities && cities.size) {
      rec.practicing_branches = Array.from(cities).join(", ");
    }
  }

  // Write doctor-ids.json
  const ids = Array.from(state.doctors.keys()).sort((a, b) => a - b);
  await writeAtomic(join(OUT_DIR, "doctor-ids.json"), JSON.stringify(ids, null, 2));
  console.log(`[aggregate] ${ids.length} unique doctors across ${branches.length} branches`);

  // Phase 4 — photos
  const workIds = LIMIT > 0 ? ids.slice(0, LIMIT) : ids;
  if (LIMIT > 0) {
    console.log(`[limit] IBN_LIMIT=${LIMIT} — photo-downloading first ${workIds.length} of ${ids.length} doctors`);
  }

  const photoJobs: PhotoJob[] = [];
  for (const id of workIds) {
    const rec = state.doctors.get(id);
    if (rec?.image) photoJobs.push({ id, imageUrl: rec.image });
  }
  const photoPathById = await downloadAllPhotos(photoJobs, meta);

  // Phase 5 — assemble
  const fetchedAt = new Date().toISOString();
  for (const id of ids) {
    const rec = state.doctors.get(id)!;
    rec.localPhotoPath = photoPathById.get(id) ?? null;
    rec.fetchedAt = fetchedAt;
  }

  const merged = ids.map((id) => state.doctors.get(id)!);
  meta.totalDoctors = merged.length;

  await writeAtomic(join(OUT_DIR, "doctors.json"), JSON.stringify(merged, null, 2));

  meta.finishedAt = new Date().toISOString();
  await writeAtomic(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  console.log(
    `\nDone. ${meta.totalBranches} branches, ${meta.totalDoctors} doctors, ${meta.totalPhotosDownloaded} photos.`,
  );
  console.log(
    `Failures — branch:${meta.branchFailures.length} parse:${meta.parseFailures.length} photo:${meta.photoFailures.length} schedule:${meta.scheduleParseFailures.length} conflicts:${meta.fieldConflicts.length}`,
  );
  console.log(`Output: ${OUT_DIR}/doctors.json + ${OUT_DIR}/meta.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
