/**
 * Snapshot doctorbangladesh.com's public doctor catalog to local files.
 *
 * Source: WordPress REST API (no auth). All 7,206 doctor profiles live in the
 * single `Doctors` category (id=1). Each "post" has the doctor profile inside
 * `content.rendered` HTML, plus `yoast_head_json` for SEO metadata, plus a
 * `featured_media` ID we can resolve inline via `_embed=1`.
 *
 * Phase 1: walk /wp-json/wp/v2/posts?categories=1&per_page=100&page=N&_embed=1
 *          — capture full post payload + embedded featured-media URL.
 *          Each post is written to data/doctor-bangladesh/details/{id}.json (resumable).
 * Phase 2: download each doctor's featured image to data/doctor-bangladesh/photos/.
 * Phase 3: merge into data/doctor-bangladesh/doctors.json + write meta.json.
 *
 * One-shot scraper — does NOT touch Mongo. Output is consumed by a future
 * DB-import script (see scripts/lib/providers/popular.ts for the pattern).
 *
 * Run:
 *   tsx --env-file=.env.local scripts/fetch-doctor-bangladesh.ts
 *
 * Env knobs (all optional):
 *   DOCBD_LIST_DELAY_MS      default 400   (between list pages)
 *   DOCBD_PHOTO_CONCURRENCY  default 4
 *   DOCBD_START_PAGE         default 1
 *   DOCBD_LIMIT              default unlimited (cap posts processed in phase 2)
 *   DOCBD_PER_PAGE           default 100 (WP REST max)
 */

import { mkdir, rename, writeFile, access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://www.doctorbangladesh.com/wp-json/wp/v2";
const CATEGORY_ID = 1; // "Doctors"
const OUT_DIR = "data/doctor-bangladesh";
const DETAILS_DIR = join(OUT_DIR, "details");
const PHOTOS_DIR = join(OUT_DIR, "photos");

const UA =
  "Mozilla/5.0 (compatible; daktar.link-snapshot/1.0; +https://daktar.link)";

// ---------- env ----------

const LIST_DELAY = num(process.env.DOCBD_LIST_DELAY_MS, 400);
const PHOTO_CONCURRENCY = num(process.env.DOCBD_PHOTO_CONCURRENCY, 4);
const START_PAGE = Math.max(1, num(process.env.DOCBD_START_PAGE, 1));
const LIMIT = process.env.DOCBD_LIMIT ? num(process.env.DOCBD_LIMIT, 0) : 0;
const PER_PAGE = Math.min(100, Math.max(1, num(process.env.DOCBD_PER_PAGE, 100)));

function num(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------- types (loose; we preserve the upstream shape verbatim) ----------

type Json = unknown;

interface WpPost {
  id: number;
  date?: string;
  modified?: string;
  slug?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  featured_media?: number;
  categories?: number[];
  tags?: number[];
  yoast_head_json?: Record<string, Json>;
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      id?: number;
      source_url?: string;
      media_details?: Record<string, Json>;
      alt_text?: string;
      mime_type?: string;
    }>;
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
  totalReported: number | null;
  totalPagesReported: number | null;
  totalListFetched: number;
  totalPhotosDownloaded: number;
  listFailures: FailureEntry[];
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
          `[http] 429 — sleeping ${ra}s and increasing list backoff (×${LIST_BACKOFF_MULT})`,
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
    categories: String(CATEGORY_ID),
    per_page: String(PER_PAGE),
    page: String(page),
    orderby: "id",
    order: "asc",
    _embed: "1",
  });
  return `${BASE}/posts?${q.toString()}`;
}

// ---------- phase 1: list (everything per post comes inline via _embed) ----------

async function fetchAllListPages(meta: Meta): Promise<Map<number, WpPost>> {
  console.log("[list] phase 1 — walking /wp/v2/posts (category=Doctors)");
  const byId = new Map<number, WpPost>();

  // First page tells us totals via headers.
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
    return byId;
  }

  const total = Number(first.headers.get("x-wp-total")) || null;
  const totalPages = Number(first.headers.get("x-wp-totalpages")) || null;
  meta.totalReported = total;
  meta.totalPagesReported = totalPages;

  await ingestPage(first.body, byId, meta, START_PAGE, firstUrl);
  console.log(
    `[list] page ${START_PAGE}/${totalPages ?? "?"} — running total ${byId.size}/${total ?? "?"}`,
  );

  const lastPage = totalPages ?? START_PAGE;
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
    await ingestPage(res.body, byId, meta, page, url);
    console.log(`[list] page ${page}/${lastPage} — running total ${byId.size}/${total ?? "?"}`);

    if (LIMIT > 0 && byId.size >= LIMIT) {
      console.log(`[list] hit DOCBD_LIMIT=${LIMIT}, stopping early`);
      break;
    }
  }

  meta.totalListFetched = byId.size;
  if (total != null && byId.size !== total && LIMIT === 0) {
    console.warn(`[list] WARNING: fetched ${byId.size} but API reported total=${total}`);
  }
  return byId;
}

async function ingestPage(
  body: Buffer,
  byId: Map<number, WpPost>,
  meta: Meta,
  page: number,
  url: string,
) {
  let payload: WpPost[];
  try {
    payload = JSON.parse(body.toString("utf8")) as WpPost[];
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    meta.listFailures.push({ page, url, error: `parse: ${e}` });
    return;
  }
  if (!Array.isArray(payload)) {
    meta.listFailures.push({ page, url, error: "payload not an array" });
    return;
  }

  for (const post of payload) {
    if (typeof post?.id !== "number") continue;
    byId.set(post.id, post);
    // Resumable per-post snapshot.
    const path = join(DETAILS_DIR, `${post.id}.json`);
    if (!(await exists(path))) {
      await writeAtomic(path, JSON.stringify(post, null, 2));
    }
  }
}

// ---------- phase 2: photos ----------

interface PhotoJob {
  id: number;
  imageUrl: string;
}

function pickFeaturedMediaUrl(post: WpPost): string | null {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  if (media?.source_url && typeof media.source_url === "string") return media.source_url;
  // Fallback: yoast og:image
  const yoast = post.yoast_head_json;
  if (yoast && Array.isArray(yoast["og_image"])) {
    const og = (yoast["og_image"] as Array<Record<string, Json>>)[0];
    if (og && typeof og["url"] === "string") return og["url"] as string;
  }
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
  console.log(`[photo] phase 2 — downloading ${jobs.length} photos (concurrency=${PHOTO_CONCURRENCY})`);
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

// ---------- phase 3: assemble ----------

async function main() {
  const startedAt = new Date().toISOString();
  const meta: Meta = {
    startedAt,
    finishedAt: null,
    sourceList: `${BASE}/posts?categories=${CATEGORY_ID}&per_page=${PER_PAGE}&page=N&_embed=1`,
    totalReported: null,
    totalPagesReported: null,
    totalListFetched: 0,
    totalPhotosDownloaded: 0,
    listFailures: [],
    photoFailures: [],
  };

  await ensureDir(OUT_DIR);
  await ensureDir(DETAILS_DIR);

  // Phase 1: list + per-post detail (inline)
  const byId = await fetchAllListPages(meta);
  const ids = [...byId.keys()].sort((a, b) => a - b);
  const workIds = LIMIT > 0 ? ids.slice(0, LIMIT) : ids;
  await writeAtomic(join(OUT_DIR, "doctor-ids.json"), JSON.stringify(workIds, null, 2));
  console.log(`[list] wrote ${workIds.length} IDs to ${join(OUT_DIR, "doctor-ids.json")}`);

  // Phase 2: photos
  const photoJobs: PhotoJob[] = [];
  for (const id of workIds) {
    const post = byId.get(id);
    if (!post) continue;
    const url = pickFeaturedMediaUrl(post);
    if (url) photoJobs.push({ id, imageUrl: url });
  }
  const photoPathById = await downloadAllPhotos(photoJobs, meta);

  // Phase 3: merge
  console.log("[assemble] phase 3 — merging post + photo paths");
  const fetchedAt = new Date().toISOString();
  const merged = workIds.map((id) => {
    const post = byId.get(id) ?? ({} as WpPost);
    return {
      id,
      slug: post.slug ?? null,
      link: post.link ?? null,
      title: post.title?.rendered ?? null,
      contentHtml: post.content?.rendered ?? null,
      excerptHtml: post.excerpt?.rendered ?? null,
      date: post.date ?? null,
      modified: post.modified ?? null,
      categories: post.categories ?? [],
      tags: post.tags ?? [],
      featuredMediaId: post.featured_media ?? null,
      featuredMediaUrl: pickFeaturedMediaUrl(post),
      yoast: post.yoast_head_json ?? null,
      localPhotoPath: photoPathById.get(id) ?? null,
      fetchedAt,
    };
  });
  await writeAtomic(join(OUT_DIR, "doctors.json"), JSON.stringify(merged, null, 2));

  meta.finishedAt = new Date().toISOString();
  await writeAtomic(join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  console.log(
    `\nDone. fetched ${meta.totalListFetched} posts, ${meta.totalPhotosDownloaded} photos.`,
  );
  console.log(
    `Failures — list:${meta.listFailures.length} photo:${meta.photoFailures.length}`,
  );
  console.log(`Output: ${OUT_DIR}/doctors.json + ${OUT_DIR}/meta.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
