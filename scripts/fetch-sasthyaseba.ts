/**
 * Snapshot Sasthya Seba's public catalog (doctors + hospitals) to local files.
 *
 * Phase 1: walk /api/v1/search?type=doctor&country=bd to enumerate all doctor slugs.
 * Phase 2: walk /api/v1/search?type=hospital&country=bd to enumerate all hospital slugs.
 * Phase 3: GET /api/v1/doctors/{slug} for each doctor (sequential, jittered, resumable).
 * Phase 4: GET /api/v1/hospitals/{slug} for each hospital (sequential, jittered, resumable).
 * Phase 5: download each doctor's + hospital's photo from cdn.sasthyaseba.com.
 * Phase 6: merge list + detail + photo path into data/sasthyaseba/{doctors,hospitals}.json.
 *
 * One-shot scraper — does NOT touch Mongo. Output is consumed by a future
 * DB-import script (not in this PR).
 *
 * Run:
 *   tsx --env-file=.env.local scripts/fetch-sasthyaseba.ts
 *
 * Env knobs (all optional):
 *   SASTHYASEBA_COUNTRY            default "bd" (empty string → global sweep)
 *   SASTHYASEBA_LIST_DELAY_MS      default 1500
 *   SASTHYASEBA_DETAIL_DELAY_MS    default 1500
 *   SASTHYASEBA_DETAIL_JITTER_MS   default 400
 *   SASTHYASEBA_PHOTO_CONCURRENCY  default 2
 *   SASTHYASEBA_START_PAGE         default 1
 *   SASTHYASEBA_LIMIT              default unlimited (caps detail/photo passes per corpus)
 *   SASTHYASEBA_SKIP_PHOTOS        truthy → skip photo phase
 *   SASTHYASEBA_DOCTOR_ONLY        truthy → skip hospital phases
 *   SASTHYASEBA_HOSPITAL_ONLY      truthy → skip doctor phases
 */

import { mkdir, readFile, rename, writeFile, access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const API_BASE = "https://sasthyaseba.com/api/v1";
const CDN_BASE = "https://cdn.sasthyaseba.com";
const OUT_DIR = "data/sasthyaseba";
const DOC_DETAIL_DIR = join(OUT_DIR, "details", "doctors");
const HOSP_DETAIL_DIR = join(OUT_DIR, "details", "hospitals");
const DOC_PHOTO_DIR = join(OUT_DIR, "photos", "doctors");
const HOSP_PHOTO_DIR = join(OUT_DIR, "photos", "hospitals");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const COMMON_HEADERS: HeadersInit = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------- env ----------

const COUNTRY = process.env.SASTHYASEBA_COUNTRY ?? "bd";
const LIST_DELAY = num(process.env.SASTHYASEBA_LIST_DELAY_MS, 1500);
let DETAIL_DELAY = num(process.env.SASTHYASEBA_DETAIL_DELAY_MS, 1500);
const DETAIL_JITTER = num(process.env.SASTHYASEBA_DETAIL_JITTER_MS, 400);
const PHOTO_CONCURRENCY = Math.max(1, num(process.env.SASTHYASEBA_PHOTO_CONCURRENCY, 2));
const START_PAGE = Math.max(1, num(process.env.SASTHYASEBA_START_PAGE, 1));
const LIMIT = process.env.SASTHYASEBA_LIMIT ? num(process.env.SASTHYASEBA_LIMIT, 0) : 0;
const SKIP_PHOTOS = truthy(process.env.SASTHYASEBA_SKIP_PHOTOS);
const DOCTOR_ONLY = truthy(process.env.SASTHYASEBA_DOCTOR_ONLY);
const HOSPITAL_ONLY = truthy(process.env.SASTHYASEBA_HOSPITAL_ONLY);

function num(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

// ---------- types ----------

type Json = unknown;

interface SearchListItem {
  id: number;
  type: "doctor" | "hospital";
  doctor?: {
    uid?: string;
    slug?: string;
    name?: string;
    photo_uri?: string | null;
    [k: string]: Json;
  } | null;
  hospital?: {
    uid?: string;
    slug?: string;
    name?: string;
    logo_uri?: string | null;
    [k: string]: Json;
  } | null;
  [k: string]: Json;
}

interface SearchPage {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  data: SearchListItem[];
}

interface FailureEntry {
  slug?: string;
  id?: number;
  page?: number;
  url?: string;
  status?: number;
  error: string;
}

interface CorpusMeta {
  totalReported: number | null;
  totalListFetched: number;
  totalDetailFetched: number;
  totalPhotosDownloaded: number;
  listFailures: FailureEntry[];
  detailFailures: FailureEntry[];
  photoFailures: FailureEntry[];
}

interface Meta {
  startedAt: string;
  finishedAt: string | null;
  apiBase: string;
  cdnBase: string;
  country: string;
  userAgent: string;
  doctors: CorpusMeta;
  hospitals: CorpusMeta;
  ratelimitMinRemaining: number | null;
}

function emptyCorpusMeta(): CorpusMeta {
  return {
    totalReported: null,
    totalListFetched: 0,
    totalDetailFetched: 0,
    totalPhotosDownloaded: 0,
    listFailures: [],
    detailFailures: [],
    photoFailures: [],
  };
}

// ---------- helpers ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function jitteredDetailDelay() {
  return DETAIL_DELAY + Math.random() * DETAIL_JITTER;
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

function stripHashFragment(uri: string): string {
  const i = uri.indexOf("#");
  return i >= 0 ? uri.slice(0, i) : uri;
}

function photoUrl(uri: string): string {
  const path = stripHashFragment(uri).replace(/^\/+/, "");
  return `${CDN_BASE}/${path}`;
}

// ---------- HTTP with retry + 429 cooldown + adaptive ratelimit pacing ----------

interface FetchResult {
  ok: boolean;
  status: number;
  headers: Headers;
  body: Buffer;
  error?: string;
}

let ratelimitMinRemaining: number | null = null;

async function pollFetch(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<FetchResult> {
  let lastErr = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...COMMON_HEADERS,
          ...(init.headers ?? {}),
        },
      });
      const status = res.status;

      // Adaptive ratelimit pacing: read the header, track the floor, slow down
      // when we're within 5 of the limit.
      const remainHdr = res.headers.get("x-ratelimit-remaining");
      if (remainHdr != null) {
        const remain = Number(remainHdr);
        if (Number.isFinite(remain)) {
          if (ratelimitMinRemaining == null || remain < ratelimitMinRemaining) {
            ratelimitMinRemaining = remain;
          }
          if (remain <= 5) {
            const cool = Math.min(5000, Math.max(1000, DETAIL_DELAY * 2));
            console.warn(
              `[http] x-ratelimit-remaining=${remain} — cooling ${cool}ms`,
            );
            DETAIL_DELAY = Math.min(5000, DETAIL_DELAY * 2);
            await sleep(cool);
          }
        }
      }

      if (status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 60;
        console.warn(
          `[http] 429 — sleeping ${ra}s and doubling base detail delay (was ${DETAIL_DELAY}ms)`,
        );
        DETAIL_DELAY = Math.min(5000, DETAIL_DELAY * 2);
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

function listUrl(type: "doctor" | "hospital", page: number): string {
  const params = new URLSearchParams({
    type,
    page: String(page),
    per_page: "50",
  });
  if (COUNTRY) params.set("country", COUNTRY);
  return `${API_BASE}/search?${params.toString()}`;
}

function doctorDetailUrl(slug: string): string {
  return `${API_BASE}/doctors/${encodeURIComponent(slug)}`;
}
function hospitalDetailUrl(slug: string): string {
  return `${API_BASE}/hospitals/${encodeURIComponent(slug)}`;
}

// ---------- phase 1+2: list ----------

interface ListEntry {
  id: number;
  slug: string;
  raw: SearchListItem;
}

async function fetchAllListPages(
  type: "doctor" | "hospital",
  corpus: CorpusMeta,
): Promise<ListEntry[]> {
  console.log(`[list] phase — enumerating ${type}s${COUNTRY ? ` (country=${COUNTRY})` : ""}`);
  const all: ListEntry[] = [];
  const seenSlugs = new Set<string>();

  const firstUrl = listUrl(type, START_PAGE);
  const first = await pollFetch(firstUrl);
  if (!first.ok) {
    corpus.listFailures.push({ page: START_PAGE, url: firstUrl, status: first.status, error: first.error ?? `HTTP ${first.status}` });
    console.error(`[list] ${type}: first page failed: ${first.error ?? first.status}`);
    return all;
  }

  let firstPayload: SearchPage;
  try {
    firstPayload = JSON.parse(first.body.toString("utf8")) as SearchPage;
  } catch (err) {
    corpus.listFailures.push({ page: START_PAGE, url: firstUrl, status: first.status, error: `parse: ${err instanceof Error ? err.message : String(err)}` });
    return all;
  }

  const lastPage = firstPayload.last_page;
  corpus.totalReported = firstPayload.total;

  pushListEntries(firstPayload.data, type, all, seenSlugs);
  console.log(`[list] ${type}: page ${START_PAGE}/${lastPage} +${firstPayload.data.length} (reported total ${firstPayload.total})`);

  for (let page = START_PAGE + 1; page <= lastPage; page++) {
    await sleep(LIST_DELAY);
    const url = listUrl(type, page);
    const res = await pollFetch(url);
    if (!res.ok) {
      corpus.listFailures.push({ page, url, status: res.status, error: res.error ?? `HTTP ${res.status}` });
      console.warn(`[list] ${type}: page ${page} failed: ${res.error ?? res.status}`);
      continue;
    }
    try {
      const payload = JSON.parse(res.body.toString("utf8")) as SearchPage;
      pushListEntries(payload.data, type, all, seenSlugs);
      console.log(`[list] ${type}: page ${page}/${lastPage} +${payload.data.length} (running ${all.length})`);
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      corpus.listFailures.push({ page, url, status: res.status, error: `parse: ${e}` });
    }
  }

  corpus.totalListFetched = all.length;
  if (corpus.totalReported != null && all.length !== corpus.totalReported) {
    console.warn(`[list] ${type}: WARNING fetched ${all.length} but API reported total=${corpus.totalReported}`);
  }
  return all;
}

function pushListEntries(
  data: SearchListItem[],
  type: "doctor" | "hospital",
  out: ListEntry[],
  seen: Set<string>,
) {
  for (const item of data) {
    const sub = type === "doctor" ? item.doctor : item.hospital;
    const slug = sub && typeof sub.slug === "string" ? sub.slug : null;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ id: item.id, slug, raw: item });
  }
}

// ---------- phase 3+4: details ----------

async function fetchAllDetails(
  type: "doctor" | "hospital",
  entries: ListEntry[],
  corpus: CorpusMeta,
): Promise<Map<string, Record<string, Json>>> {
  const detailDir = type === "doctor" ? DOC_DETAIL_DIR : HOSP_DETAIL_DIR;
  const urlFn = type === "doctor" ? doctorDetailUrl : hospitalDetailUrl;
  console.log(`[detail] ${type}: ${entries.length} records (≈${DETAIL_DELAY}ms ± ${DETAIL_JITTER}ms)`);
  await ensureDir(detailDir);

  const out = new Map<string, Record<string, Json>>();
  let cached = 0;
  let fetched = 0;

  for (let i = 0; i < entries.length; i++) {
    const { slug, id } = entries[i];
    const path = join(detailDir, `${slug}.json`);

    if (await exists(path)) {
      try {
        const cachedJson = JSON.parse(await readFile(path, "utf8")) as Record<string, Json>;
        out.set(slug, cachedJson);
        cached++;
        if ((i + 1) % 50 === 0) {
          console.log(`[detail] ${type}: ${i + 1}/${entries.length} — ${cached} cached, ${fetched} fetched, ${corpus.detailFailures.length} failed`);
        }
        continue;
      } catch {
        // fall through and re-fetch
      }
    }

    await sleep(jitteredDetailDelay());
    const url = urlFn(slug);
    const res = await pollFetch(url);

    if (!res.ok) {
      corpus.detailFailures.push({ slug, id, url, status: res.status, error: res.error ?? `HTTP ${res.status}` });
    } else {
      try {
        const payload = JSON.parse(res.body.toString("utf8")) as Record<string, Json>;
        await writeAtomic(path, JSON.stringify(payload, null, 2));
        out.set(slug, payload);
        fetched++;
      } catch (err) {
        const e = err instanceof Error ? err.message : String(err);
        corpus.detailFailures.push({ slug, id, url, status: res.status, error: `parse: ${e}` });
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[detail] ${type}: ${i + 1}/${entries.length} — ${cached} cached, ${fetched} fetched, ${corpus.detailFailures.length} failed`);
    }
  }

  corpus.totalDetailFetched = out.size;
  console.log(`[detail] ${type}: done — ${out.size}/${entries.length} (${cached} cached, ${fetched} fetched, ${corpus.detailFailures.length} failed)`);
  return out;
}

// ---------- phase 5: photos ----------

interface PhotoJob {
  slug: string;
  id: number;
  url: string;
}

async function downloadPhoto(
  job: PhotoJob,
  outDir: string,
  corpus: CorpusMeta,
): Promise<string | null> {
  for (const ext of [".jpg", ".png", ".webp", ".gif", ".svg", ".bin"]) {
    const p = join(outDir, `${job.slug}${ext}`);
    if (await exists(p)) {
      try {
        const st = await stat(p);
        if (st.size > 0) return p;
      } catch {
        // re-download
      }
    }
  }

  const res = await pollFetch(job.url, {}, 2);
  if (!res.ok || res.body.length === 0) {
    corpus.photoFailures.push({
      slug: job.slug,
      id: job.id,
      url: job.url,
      status: res.status,
      error: res.error ?? `HTTP ${res.status} or empty body`,
    });
    return null;
  }

  const ext = extFromContentType(res.headers.get("content-type"));
  const out = join(outDir, `${job.slug}${ext}`);
  await writeAtomic(out, res.body);
  return out;
}

async function downloadAllPhotos(
  jobs: PhotoJob[],
  outDir: string,
  corpus: CorpusMeta,
  label: string,
): Promise<Map<string, string>> {
  console.log(`[photo] ${label}: ${jobs.length} jobs (concurrency=${PHOTO_CONCURRENCY})`);
  await ensureDir(outDir);

  const result = new Map<string, string>();
  let done = 0;
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= jobs.length) return;
      const job = jobs[idx];
      const path = await downloadPhoto(job, outDir, corpus);
      if (path) result.set(job.slug, path);
      done++;
      if (done % 100 === 0) {
        console.log(`[photo] ${label}: ${done}/${jobs.length} — ${result.size} ok, ${corpus.photoFailures.length} failed`);
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, worker));
  corpus.totalPhotosDownloaded = result.size;
  console.log(`[photo] ${label}: done — ${result.size}/${jobs.length} ok, ${corpus.photoFailures.length} failed`);
  return result;
}

// ---------- phase 6: assemble ----------

interface MergedDoctorRecord {
  id: number;
  slug: string;
  list: SearchListItem;
  detail: Record<string, Json> | null;
  localPhotoPath: string | null;
  fetchedAt: string;
}

function pickPhotoUri(
  type: "doctor" | "hospital",
  list: SearchListItem,
  detail: Record<string, Json> | null,
): string | null {
  if (type === "doctor") {
    const fromDetail = detail && typeof detail.photo_uri === "string" ? (detail.photo_uri as string) : null;
    const fromList = list.doctor && typeof list.doctor.photo_uri === "string" ? list.doctor.photo_uri : null;
    return fromDetail || fromList || null;
  }
  const fromDetail = detail && typeof detail.logo_uri === "string" ? (detail.logo_uri as string) : null;
  const fromList = list.hospital && typeof list.hospital.logo_uri === "string" ? list.hospital.logo_uri : null;
  return fromDetail || fromList || null;
}

// ---------- main ----------

async function processCorpus(
  type: "doctor" | "hospital",
  meta: Meta,
): Promise<void> {
  const corpus = type === "doctor" ? meta.doctors : meta.hospitals;
  const detailDir = type === "doctor" ? DOC_DETAIL_DIR : HOSP_DETAIL_DIR;
  const photoDir = type === "doctor" ? DOC_PHOTO_DIR : HOSP_PHOTO_DIR;
  const idsPath = join(OUT_DIR, `${type}-ids.json`);
  const mergedPath = join(OUT_DIR, `${type}s.json`);

  void detailDir;
  void photoDir;

  const entries = await fetchAllListPages(type, corpus);
  await writeAtomic(
    idsPath,
    JSON.stringify(
      entries.map((e) => ({ id: e.id, slug: e.slug })),
      null,
      2,
    ),
  );
  console.log(`[list] ${type}: wrote ${entries.length} entries to ${idsPath}`);

  const workEntries = LIMIT > 0 ? entries.slice(0, LIMIT) : entries;
  if (LIMIT > 0) {
    console.log(`[limit] SASTHYASEBA_LIMIT=${LIMIT} — ${type}: processing first ${workEntries.length}/${entries.length}`);
  }

  const detailBySlug = await fetchAllDetails(type, workEntries, corpus);

  const photoJobs: PhotoJob[] = [];
  for (const e of workEntries) {
    const uri = pickPhotoUri(type, e.raw, detailBySlug.get(e.slug) ?? null);
    if (uri) photoJobs.push({ slug: e.slug, id: e.id, url: photoUrl(uri) });
  }

  const photoPathBySlug = SKIP_PHOTOS
    ? new Map<string, string>()
    : await downloadAllPhotos(photoJobs, type === "doctor" ? DOC_PHOTO_DIR : HOSP_PHOTO_DIR, corpus, type);

  const fetchedAt = new Date().toISOString();
  const merged: MergedDoctorRecord[] = workEntries.map((e) => ({
    id: e.id,
    slug: e.slug,
    list: e.raw,
    detail: detailBySlug.get(e.slug) ?? null,
    localPhotoPath: photoPathBySlug.get(e.slug) ?? null,
    fetchedAt,
  }));
  await writeAtomic(mergedPath, JSON.stringify(merged, null, 2));
  console.log(`[assemble] ${type}: wrote ${merged.length} merged records to ${mergedPath}`);
}

async function main() {
  if (DOCTOR_ONLY && HOSPITAL_ONLY) {
    console.error("Cannot set both SASTHYASEBA_DOCTOR_ONLY and SASTHYASEBA_HOSPITAL_ONLY.");
    process.exit(1);
  }

  const meta: Meta = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    apiBase: API_BASE,
    cdnBase: CDN_BASE,
    country: COUNTRY,
    userAgent: UA,
    doctors: emptyCorpusMeta(),
    hospitals: emptyCorpusMeta(),
    ratelimitMinRemaining: null,
  };

  await ensureDir(OUT_DIR);

  if (!HOSPITAL_ONLY) {
    await processCorpus("doctor", meta);
  }
  if (!DOCTOR_ONLY) {
    await processCorpus("hospital", meta);
  }

  meta.ratelimitMinRemaining = ratelimitMinRemaining;
  meta.finishedAt = new Date().toISOString();
  await writeAtomic(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  console.log("\nDone.");
  console.log(
    `  doctors:   list ${meta.doctors.totalListFetched}, detail ${meta.doctors.totalDetailFetched}, photos ${meta.doctors.totalPhotosDownloaded}, failures L${meta.doctors.listFailures.length} D${meta.doctors.detailFailures.length} P${meta.doctors.photoFailures.length}`,
  );
  console.log(
    `  hospitals: list ${meta.hospitals.totalListFetched}, detail ${meta.hospitals.totalDetailFetched}, photos ${meta.hospitals.totalPhotosDownloaded}, failures L${meta.hospitals.listFailures.length} D${meta.hospitals.detailFailures.length} P${meta.hospitals.photoFailures.length}`,
  );
  console.log(`  min x-ratelimit-remaining observed: ${meta.ratelimitMinRemaining}`);
  console.log(`Output: ${OUT_DIR}/{doctors,hospitals}.json + ${OUT_DIR}/meta.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
