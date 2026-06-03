/**
 * Snapshot Popular Diagnostic's public doctor catalog to local files.
 *
 * Phase 1: walk /api/doctors?page=N to enumerate all doctor IDs.
 * Phase 2: GET /api/doctor/{id} for each ID (sequential, jittered, resumable).
 * Phase 3: download each doctor's photo to data/popular-diagnostic/photos/.
 * Phase 4: merge list + detail + photo path into data/popular-diagnostic/doctors.json.
 *
 * One-shot scraper — does NOT touch Mongo. Output is consumed by a future
 * DB-import script.
 *
 * Run:
 *   POPULAR_API_TOKEN=... tsx --env-file=.env.local scripts/fetch-popular-diagnostic.ts
 *
 * Env knobs (all optional except the token):
 *   POPULAR_API_TOKEN          (required)
 *   POPULAR_LIST_DELAY_MS      default 400
 *   POPULAR_DETAIL_DELAY_MS    default 400
 *   POPULAR_DETAIL_JITTER_MS   default 150
 *   POPULAR_PHOTO_CONCURRENCY  default 4
 *   POPULAR_START_PAGE         default 1
 *   POPULAR_LIMIT              default unlimited (cap doctors processed in phase 2/3)
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://api.populardiagnostic.com/api";
const OUT_DIR = "data/popular-diagnostic";
const DETAILS_DIR = join(OUT_DIR, "details");
const PHOTOS_DIR = join(OUT_DIR, "photos");

const UA =
  "Mozilla/5.0 (compatible; doctor.id.bd-snapshot/1.0; +https://doctor.id.bd)";

// ---------- env ----------

const TOKEN = process.env.POPULAR_API_TOKEN;
if (!TOKEN) {
  console.error(
    "POPULAR_API_TOKEN is required. Set it in .env.local or pass inline: POPULAR_API_TOKEN=... tsx --env-file=.env.local scripts/fetch-popular-diagnostic.ts",
  );
  process.exit(1);
}

const LIST_DELAY = num(process.env.POPULAR_LIST_DELAY_MS, 400);
let DETAIL_DELAY = num(process.env.POPULAR_DETAIL_DELAY_MS, 400);
const DETAIL_JITTER = num(process.env.POPULAR_DETAIL_JITTER_MS, 150);
const PHOTO_CONCURRENCY = num(process.env.POPULAR_PHOTO_CONCURRENCY, 4);
const START_PAGE = num(process.env.POPULAR_START_PAGE, 1);
const LIMIT = process.env.POPULAR_LIMIT ? num(process.env.POPULAR_LIMIT, 0) : 0;

function num(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------- types (loose; we preserve the upstream shape verbatim) ----------

type Json = unknown;

interface ListPage {
  data: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    data: Array<Record<string, Json> & { id?: number }>;
  };
}

interface DetailResponse {
  data: Record<string, Json> | null;
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
  tokenHashHint: string;
  totalReported: number | null;
  totalListFetched: number;
  totalDetailFetched: number;
  totalPhotosDownloaded: number;
  listFailures: FailureEntry[];
  detailFailures: FailureEntry[];
  photoFailures: FailureEntry[];
}

// ---------- small helpers ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function jitteredDetailDelay() {
  return DETAIL_DELAY + Math.random() * DETAIL_JITTER;
}

function tokenHint(): string {
  const h = createHash("sha256").update(TOKEN!).digest("hex");
  return `sha256:${h.slice(0, 8)}…${TOKEN!.slice(-6)}`;
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

// ---------- HTTP with retry + Retry-After + 429 cooldown ----------

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
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
      const status = res.status;

      if (status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 60;
        console.warn(
          `[http] 429 — sleeping ${ra}s and doubling base detail delay (was ${DETAIL_DELAY}ms)`,
        );
        DETAIL_DELAY *= 2;
        await sleep(ra * 1000);
        continue; // retry
      }

      if (status >= 500 && status < 600 && attempt < attempts) {
        lastStatus = status;
        lastErr = `HTTP ${status}`;
        const backoff = 1000 * Math.pow(3, attempt - 1); // 1s, 3s, 9s
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
  return `${BASE}/doctors?token=${encodeURIComponent(TOKEN!)}&page=${page}`;
}
function detailUrl(id: number | string) {
  return `${BASE}/doctor/${id}?token=${encodeURIComponent(TOKEN!)}`;
}

// ---------- phase 1: list ----------

async function fetchAllListPages(meta: Meta): Promise<Array<Record<string, Json> & { id?: number }>> {
  console.log("[list] phase 1 — enumerating doctor IDs");
  const all: Array<Record<string, Json> & { id?: number }> = [];

  // Discover totals via page 1 (or START_PAGE).
  const firstUrl = listUrl(START_PAGE);
  const first = await pollFetch(firstUrl, { method: "GET" });
  if (!first.ok) {
    meta.listFailures.push({ page: START_PAGE, url: firstUrl, status: first.status, error: first.error ?? `HTTP ${first.status}` });
    console.error(`[list] failed to fetch first page: ${first.error ?? first.status}`);
    return all;
  }

  const firstPayload = JSON.parse(first.body.toString("utf8")) as ListPage;
  const lastPage = firstPayload.data.last_page;
  const total = firstPayload.data.total;
  meta.totalReported = total;
  all.push(...firstPayload.data.data);
  console.log(`[list] page ${START_PAGE}/${lastPage} +${firstPayload.data.data.length} doctors (reported total ${total})`);

  for (let page = START_PAGE + 1; page <= lastPage; page++) {
    await sleep(LIST_DELAY);
    const url = listUrl(page);
    const res = await pollFetch(url, { method: "GET" });
    if (!res.ok) {
      meta.listFailures.push({ page, url, status: res.status, error: res.error ?? `HTTP ${res.status}` });
      console.warn(`[list] page ${page} failed: ${res.error ?? res.status}`);
      continue;
    }
    try {
      const payload = JSON.parse(res.body.toString("utf8")) as ListPage;
      all.push(...payload.data.data);
      console.log(`[list] page ${page}/${lastPage} +${payload.data.data.length} doctors`);
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      meta.listFailures.push({ page, url, status: res.status, error: `parse: ${e}` });
      console.warn(`[list] page ${page} parse error: ${e}`);
    }
  }

  meta.totalListFetched = all.length;
  if (total != null && all.length !== total) {
    console.warn(`[list] WARNING: fetched ${all.length} but API reported total=${total}`);
  }
  return all;
}

// ---------- phase 2: detail ----------

async function fetchAllDetails(
  ids: number[],
  meta: Meta,
): Promise<Map<number, Record<string, Json>>> {
  console.log(`[detail] phase 2 — fetching ${ids.length} detail records (sequential, ~${DETAIL_DELAY}ms ± ${DETAIL_JITTER}ms)`);
  await ensureDir(DETAILS_DIR);

  const out = new Map<number, Record<string, Json>>();
  let cached = 0;
  let fetched = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const path = join(DETAILS_DIR, `${id}.json`);

    // Resume: use cached file if present.
    if (await exists(path)) {
      try {
        const cachedJson = JSON.parse(await readFile(path, "utf8")) as Record<string, Json>;
        out.set(id, cachedJson);
        cached++;
        if ((i + 1) % 50 === 0) {
          console.log(`[detail] ${i + 1}/${ids.length} — ${cached} cached, ${fetched} fetched, ${meta.detailFailures.length} failed`);
        }
        continue;
      } catch {
        // fall through and re-fetch
      }
    }

    await sleep(jitteredDetailDelay());
    const url = detailUrl(id);
    const res = await pollFetch(url, { method: "GET" });

    if (!res.ok) {
      meta.detailFailures.push({ id, url, status: res.status, error: res.error ?? `HTTP ${res.status}` });
      if ((i + 1) % 50 === 0) {
        console.log(`[detail] ${i + 1}/${ids.length} — ${cached} cached, ${fetched} fetched, ${meta.detailFailures.length} failed`);
      }
      continue;
    }

    try {
      const payload = JSON.parse(res.body.toString("utf8")) as DetailResponse;
      if (!payload.data) {
        meta.detailFailures.push({ id, url, status: res.status, error: "no data field in response" });
        continue;
      }
      await writeAtomic(path, JSON.stringify(payload.data, null, 2));
      out.set(id, payload.data);
      fetched++;
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      meta.detailFailures.push({ id, url, status: res.status, error: `parse: ${e}` });
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[detail] ${i + 1}/${ids.length} — ${cached} cached, ${fetched} fetched, ${meta.detailFailures.length} failed`);
    }
  }

  meta.totalDetailFetched = out.size;
  console.log(`[detail] done — ${out.size}/${ids.length} successful (${cached} cached, ${fetched} fetched, ${meta.detailFailures.length} failed)`);
  return out;
}

// ---------- phase 3: photos ----------

interface PhotoJob {
  id: number;
  imageUrl: string;
}

async function downloadPhoto(job: PhotoJob, meta: Meta): Promise<string | null> {
  // Resume: look for any existing photos/{id}.* file.
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
  console.log(`[photo] phase 3 — downloading ${jobs.length} photos (concurrency=${PHOTO_CONCURRENCY})`);
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

// ---------- phase 4: assemble ----------

function pickId(rec: Record<string, Json>): number | null {
  const v = (rec as { id?: unknown }).id;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

// ---------- main ----------

async function main() {
  const startedAt = new Date().toISOString();
  const meta: Meta = {
    startedAt,
    finishedAt: null,
    sourceList: `${BASE}/doctors?token=…&page=N`,
    sourceDetail: `${BASE}/doctor/{id}?token=…`,
    tokenHashHint: tokenHint(),
    totalReported: null,
    totalListFetched: 0,
    totalDetailFetched: 0,
    totalPhotosDownloaded: 0,
    listFailures: [],
    detailFailures: [],
    photoFailures: [],
  };

  await ensureDir(OUT_DIR);

  // Phase 1
  const listRecords = await fetchAllListPages(meta);
  const ids: number[] = [];
  const idToList = new Map<number, Record<string, Json>>();
  for (const rec of listRecords) {
    const id = pickId(rec);
    if (id == null) continue;
    if (!idToList.has(id)) {
      idToList.set(id, rec);
      ids.push(id);
    }
  }
  ids.sort((a, b) => a - b);
  await writeAtomic(join(OUT_DIR, "doctor-ids.json"), JSON.stringify(ids, null, 2));
  console.log(`[list] wrote ${ids.length} unique IDs to ${join(OUT_DIR, "doctor-ids.json")}`);

  // Optional cap for smoke-test runs
  const workIds = LIMIT > 0 ? ids.slice(0, LIMIT) : ids;
  if (LIMIT > 0) {
    console.log(`[limit] POPULAR_LIMIT=${LIMIT} — processing first ${workIds.length} of ${ids.length} doctors`);
  }

  // Phase 2
  const detailById = await fetchAllDetails(workIds, meta);

  // Phase 3
  const photoJobs: PhotoJob[] = [];
  for (const id of workIds) {
    const list = idToList.get(id);
    const detail = detailById.get(id);
    const imageUrl =
      (detail && typeof detail.image === "string" && detail.image) ||
      (list && typeof list.image === "string" && list.image) ||
      "";
    if (imageUrl) photoJobs.push({ id, imageUrl });
  }
  const photoPathById = await downloadAllPhotos(photoJobs, meta);

  // Phase 4
  console.log("[assemble] phase 4 — merging list + detail + photo paths");
  const fetchedAt = new Date().toISOString();
  const merged = workIds.map((id) => {
    const list = idToList.get(id) ?? {};
    return {
      ...list,
      id,
      detail: detailById.get(id) ?? null,
      localPhotoPath: photoPathById.get(id) ?? null,
      fetchedAt,
    };
  });
  await writeAtomic(join(OUT_DIR, "doctors.json"), JSON.stringify(merged, null, 2));

  meta.finishedAt = new Date().toISOString();
  await writeAtomic(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  console.log(
    `\nDone. fetched ${meta.totalListFetched} list records, ${meta.totalDetailFetched} details, ${meta.totalPhotosDownloaded} photos.`,
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
