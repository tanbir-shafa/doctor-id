/**
 * Snapshot doctime.net's public doctor catalog to local files.
 *
 * Source (unauthenticated public JSON):
 *   List   : https://api.doctime.net/api/doctors/search?page=N&per_page=50
 *   Detail : https://api.doctime.net/api/doctors/{user.id}
 *
 * The list endpoint reports ~1,558 doctors across 32 pages at per_page=50.
 * The detail endpoint adds fields not present in the list response (bio,
 * reg_no, status, member_since, degrees[], clinic[]) so we hit it per-doctor.
 *
 * Phase 1: walk /api/doctors/search?page=N — collect user.id values into
 *          doctor-ids.json.
 * Phase 2: fetch /api/doctors/{id} — write raw response (wrapper preserved)
 *          to data/doctime/details/{id}.json. Resumable.
 * Phase 3: download each user.profile_photo to data/doctime/photos/. Resumable.
 * Phase 4: merge into data/doctime/doctors.json + write meta.json.
 *
 * One-shot scraper — does NOT touch Mongo. Output is consumed by a future
 * DB-import step (see scripts/lib/providers/*.ts for the pattern).
 *
 * Run:
 *   tsx --env-file=.env.local scripts/fetch-doctime.ts
 *
 * Env knobs (all optional):
 *   DOCTIME_LIST_DELAY_MS      default 400   (between list pages)
 *   DOCTIME_DETAIL_CONCURRENCY default 4
 *   DOCTIME_PHOTO_CONCURRENCY  default 4
 *   DOCTIME_START_PAGE         default 1
 *   DOCTIME_LIMIT              default unlimited (cap doctors processed in phases 2-4)
 *   DOCTIME_PER_PAGE           default 50  (API max appears to be 50)
 */

import { mkdir, readFile, rename, writeFile, access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://api.doctime.net/api";
const OUT_DIR = "data/doctime";
const DETAILS_DIR = join(OUT_DIR, "details");
const PHOTOS_DIR = join(OUT_DIR, "photos");

const UA =
  "Mozilla/5.0 (compatible; daktar.link-snapshot/1.0; +https://daktar.link)";

// ---------- env ----------

const LIST_DELAY = num(process.env.DOCTIME_LIST_DELAY_MS, 400);
const DETAIL_CONCURRENCY = num(process.env.DOCTIME_DETAIL_CONCURRENCY, 4);
const PHOTO_CONCURRENCY = num(process.env.DOCTIME_PHOTO_CONCURRENCY, 4);
const START_PAGE = Math.max(1, num(process.env.DOCTIME_START_PAGE, 1));
const LIMIT = process.env.DOCTIME_LIMIT ? num(process.env.DOCTIME_LIMIT, 0) : 0;
const PER_PAGE = Math.min(50, Math.max(1, num(process.env.DOCTIME_PER_PAGE, 50)));

function num(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------- types (loose — we preserve upstream shapes verbatim) ----------

type Json = unknown;

interface DoctimeUser {
  id: number;
  title?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  gender?: string;
  profile_photo?: string | null;
  search_code?: string;
  [k: string]: Json;
}

interface DoctimeListEntry {
  user: DoctimeUser;
  [k: string]: Json;
}

interface DoctimeListPage {
  data: DoctimeListEntry[];
  links?: Record<string, Json>;
  meta?: {
    current_page?: number;
    last_page?: number;
    total?: number;
    per_page?: number;
    [k: string]: Json;
  };
}

interface DoctimeDetailResponse {
  message?: string;
  data?: {
    user?: DoctimeUser;
    [k: string]: Json;
  };
  [k: string]: Json;
}

interface FailureEntry {
  id?: number;
  page?: number;
  url?: string;
  status?: number;
  error: string;
}

interface Meta {
  startedAt: string;
  finishedAt: string | null;
  sourceList: string;
  sourceDetail: string;
  totalReported: number | null;
  totalPagesReported: number | null;
  totalListFetched: number;
  totalDetailFetched: number;
  totalPhotosDownloaded: number;
  listFailures: FailureEntry[];
  detailFailures: FailureEntry[];
  photoFailures: FailureEntry[];
}

// ---------- small helpers ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

function extFromContentType(ct: string | null): string | null {
  if (!ct) return null;
  const lc = ct.toLowerCase();
  if (lc.includes("jpeg")) return ".jpg";
  if (lc.includes("png")) return ".png";
  if (lc.includes("webp")) return ".webp";
  if (lc.includes("gif")) return ".gif";
  if (lc.includes("svg")) return ".svg";
  return null;
}

function extFromUrl(url: string): string | null {
  const m = url.match(/\.(jpe?g|png|webp|gif|svg)(?:\?|#|$)/i);
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === "jpeg" ? ".jpg" : `.${e}`;
}

// ---------- HTTP with retry + Retry-After + 429 cooldown ----------

interface FetchResult {
  ok: boolean;
  status: number;
  headers: Headers;
  body: Buffer;
  error?: string;
}

let LIST_BACKOFF_MULT = 1;

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
          Accept: "application/json,image/*;q=0.8,*/*;q=0.5",
          ...(init.headers ?? {}),
        },
      });
      const status = res.status;

      if (status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 60;
        LIST_BACKOFF_MULT = Math.min(LIST_BACKOFF_MULT * 2, 16);
        console.warn(
          `[http] 429 — sleeping ${ra}s and increasing backoff (×${LIST_BACKOFF_MULT})`,
        );
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

function listUrl(page: number) {
  const q = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
  });
  return `${BASE}/doctors/search?${q.toString()}`;
}

function detailUrl(id: number) {
  return `${BASE}/doctors/${id}`;
}

// ---------- phase 1: list pagination ----------

async function fetchAllListPages(meta: Meta): Promise<number[]> {
  console.log("[list] phase 1 — walking /api/doctors/search");
  const ids = new Set<number>();

  // Fetch page 1 first to learn last_page.
  const firstUrl = listUrl(START_PAGE);
  const first = await pollFetch(firstUrl, { method: "GET" });
  if (!first.ok) {
    meta.listFailures.push({
      page: START_PAGE,
      url: firstUrl,
      status: first.status,
      error: first.error ?? `HTTP ${first.status}`,
    });
    console.error(`[list] failed to fetch first page: ${first.error ?? first.status}`);
    return [];
  }

  let firstPage: DoctimeListPage;
  try {
    firstPage = JSON.parse(first.body.toString("utf8")) as DoctimeListPage;
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    meta.listFailures.push({ page: START_PAGE, url: firstUrl, error: `parse: ${e}` });
    return [];
  }

  meta.totalReported = firstPage.meta?.total ?? null;
  meta.totalPagesReported = firstPage.meta?.last_page ?? null;

  ingestListPage(firstPage, ids);
  console.log(
    `[list] page ${START_PAGE}/${meta.totalPagesReported ?? "?"} — running total ${ids.size}/${meta.totalReported ?? "?"}`,
  );

  const lastPage = meta.totalPagesReported ?? START_PAGE;
  for (let page = START_PAGE + 1; page <= lastPage; page++) {
    await sleep(LIST_DELAY * LIST_BACKOFF_MULT);
    const url = listUrl(page);
    const res = await pollFetch(url, { method: "GET" });
    if (!res.ok) {
      meta.listFailures.push({
        page,
        url,
        status: res.status,
        error: res.error ?? `HTTP ${res.status}`,
      });
      console.warn(`[list] page ${page} failed: ${res.error ?? res.status}`);
      continue;
    }
    let parsed: DoctimeListPage;
    try {
      parsed = JSON.parse(res.body.toString("utf8")) as DoctimeListPage;
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      meta.listFailures.push({ page, url, error: `parse: ${e}` });
      continue;
    }
    ingestListPage(parsed, ids);
    console.log(
      `[list] page ${page}/${lastPage} — running total ${ids.size}/${meta.totalReported ?? "?"}`,
    );
  }

  meta.totalListFetched = ids.size;
  if (meta.totalReported != null && ids.size !== meta.totalReported) {
    console.warn(
      `[list] WARNING: fetched ${ids.size} but API reported total=${meta.totalReported}`,
    );
  }

  return [...ids].sort((a, b) => a - b);
}

function ingestListPage(page: DoctimeListPage, ids: Set<number>) {
  if (!Array.isArray(page.data)) return;
  for (const entry of page.data) {
    const id = entry?.user?.id;
    if (typeof id === "number") ids.add(id);
  }
}

// ---------- phase 2: per-doctor detail fetch ----------

async function fetchAllDetails(
  ids: number[],
  meta: Meta,
): Promise<Map<number, DoctimeDetailResponse>> {
  console.log(
    `[detail] phase 2 — fetching ${ids.length} detail records (concurrency=${DETAIL_CONCURRENCY})`,
  );
  await ensureDir(DETAILS_DIR);

  const byId = new Map<number, DoctimeDetailResponse>();
  let done = 0;
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= ids.length) return;
      const id = ids[idx];
      const path = join(DETAILS_DIR, `${id}.json`);

      // Resume: existing file wins.
      if (await exists(path)) {
        try {
          const raw = await readFile(path, "utf8");
          const parsed = JSON.parse(raw) as DoctimeDetailResponse;
          byId.set(id, parsed);
          done++;
          continue;
        } catch {
          // re-fetch on bad cache
        }
      }

      const url = detailUrl(id);
      const res = await pollFetch(url, { method: "GET" });
      if (!res.ok) {
        meta.detailFailures.push({
          id,
          url,
          status: res.status,
          error: res.error ?? `HTTP ${res.status}`,
        });
      } else {
        try {
          const parsed = JSON.parse(res.body.toString("utf8")) as DoctimeDetailResponse;
          await writeAtomic(path, JSON.stringify(parsed, null, 2));
          byId.set(id, parsed);
        } catch (err) {
          const e = err instanceof Error ? err.message : String(err);
          meta.detailFailures.push({ id, url, error: `parse: ${e}` });
        }
      }
      done++;
      if (done % 100 === 0) {
        console.log(
          `[detail] ${done}/${ids.length} — ${byId.size} ok, ${meta.detailFailures.length} failed`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
  meta.totalDetailFetched = byId.size;
  console.log(
    `[detail] done — ${byId.size}/${ids.length} fetched, ${meta.detailFailures.length} failed`,
  );
  return byId;
}

// ---------- phase 3: photos ----------

interface PhotoJob {
  id: number;
  imageUrl: string;
}

function pickProfilePhotoUrl(detail: DoctimeDetailResponse): string | null {
  const url = detail?.data?.user?.profile_photo;
  if (typeof url === "string" && url.length > 0) return url;
  return null;
}

async function downloadPhoto(job: PhotoJob, meta: Meta): Promise<string | null> {
  // Resume: any existing photos/{id}.* wins.
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

  const ext =
    extFromContentType(res.headers.get("content-type")) ||
    extFromUrl(job.imageUrl) ||
    ".bin";
  const out = join(PHOTOS_DIR, `${job.id}${ext}`);
  await writeAtomic(out, res.body);
  return out;
}

async function downloadAllPhotos(
  jobs: PhotoJob[],
  meta: Meta,
): Promise<Map<number, string>> {
  console.log(
    `[photo] phase 3 — downloading ${jobs.length} photos (concurrency=${PHOTO_CONCURRENCY})`,
  );
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
        console.log(
          `[photo] ${done}/${jobs.length} — ${result.size} ok, ${meta.photoFailures.length} failed`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, worker));
  meta.totalPhotosDownloaded = result.size;
  console.log(
    `[photo] done — ${result.size}/${jobs.length} downloaded, ${meta.photoFailures.length} failed`,
  );
  return result;
}

// ---------- phase 4: assemble ----------

async function main() {
  const startedAt = new Date().toISOString();
  const meta: Meta = {
    startedAt,
    finishedAt: null,
    sourceList: `${BASE}/doctors/search?page=N&per_page=${PER_PAGE}`,
    sourceDetail: `${BASE}/doctors/{id}`,
    totalReported: null,
    totalPagesReported: null,
    totalListFetched: 0,
    totalDetailFetched: 0,
    totalPhotosDownloaded: 0,
    listFailures: [],
    detailFailures: [],
    photoFailures: [],
  };

  await ensureDir(OUT_DIR);
  await ensureDir(DETAILS_DIR);

  // Phase 1: list walk
  const allIds = await fetchAllListPages(meta);
  await writeAtomic(join(OUT_DIR, "doctor-ids.json"), JSON.stringify(allIds, null, 2));
  console.log(`[list] wrote ${allIds.length} IDs to ${join(OUT_DIR, "doctor-ids.json")}`);

  const workIds = LIMIT > 0 ? allIds.slice(0, LIMIT) : allIds;
  if (LIMIT > 0) {
    console.log(`[list] DOCTIME_LIMIT=${LIMIT} — phases 2-4 will process ${workIds.length} IDs`);
  }

  // Phase 2: details
  const detailById = await fetchAllDetails(workIds, meta);

  // Phase 3: photos
  const photoJobs: PhotoJob[] = [];
  for (const id of workIds) {
    const detail = detailById.get(id);
    if (!detail) continue;
    const url = pickProfilePhotoUrl(detail);
    if (url) photoJobs.push({ id, imageUrl: url });
  }
  const photoPathById = await downloadAllPhotos(photoJobs, meta);

  // Phase 4: merge
  console.log("[assemble] phase 4 — merging detail + photo paths");
  const fetchedAt = new Date().toISOString();
  const merged = workIds.map((id) => {
    const detail = detailById.get(id);
    const data = detail?.data ?? null;
    return {
      id,
      message: detail?.message ?? null,
      data,
      localPhotoPath: photoPathById.get(id) ?? null,
      fetchedAt,
    };
  });
  await writeAtomic(join(OUT_DIR, "doctors.json"), JSON.stringify(merged, null, 2));

  meta.finishedAt = new Date().toISOString();
  await writeAtomic(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  console.log(
    `\nDone. list:${meta.totalListFetched} details:${meta.totalDetailFetched} photos:${meta.totalPhotosDownloaded}`,
  );
  console.log(
    `Failures — list:${meta.listFailures.length} detail:${meta.detailFailures.length} photo:${meta.photoFailures.length}`,
  );
  console.log(`Output: ${OUT_DIR}/doctors.json + ${OUT_DIR}/meta.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
