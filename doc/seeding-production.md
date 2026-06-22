# Seeding production (DocTime doctors + photos, health guides)

A one-time runbook to load **only the DocTime dataset** (`data/unified/doctime-new.json`)
plus its photos and the cornerstone health guides into the **production** database
(`doctor-directory`). The existing `doctors.json` corpus (4,899 rows) is already in
prod and is **not** re-seeded.

## How this works (read once)

We do **not** load `.env.production.local` (that would force `NODE_ENV=production` →
the cross-account AWS STS role, which a laptop can't assume). Instead we run the
normal scripts, which already load **`.env.local`**, and **override only `MONGO_URI`**
to point at the prod cluster:

- `NODE_ENV=development` (from `.env.local`) → `getS3()` uses your **static AWS keys**.
- Dev and prod **share the same S3 bucket** (`doctor-id-public`, `ap-southeast-1`), so
  seeded photo URLs resolve on the live site with no bucket change.
- `MONGO_URI` is the **only** thing that changes — set in the shell, which Node's
  `--env-file` defers to (shell vars win over the file).
- Because `NODE_ENV` isn't `production`, the seed guards pass with no `ALLOW_PROD_SEED`.

**Requirement:** your static keys in `.env.local` must have write access to the
`doctor-id-public` bucket (they already do for dev — same bucket).

---

## 0. Prerequisites

1. **Deploy the latest code** to daktar.link first, so the live site renders the new
   fields (BMDC chip, guide reviewer/citations, JSON-LD, `/editorial-policy`, `/llms.txt`).
2. **Back up the prod DB:**
   ```bash
   mongodump --uri="$(sed -n 's/^MONGO_URI=//p' .env.production.local)" --out=./backup-$(date +%Y%m%d)
   ```
3. **Capture the prod Mongo URL once** into a shell var (read straight from the prod
   env file — only this one value, nothing else from it):
   ```bash
   PROD_MONGO="$(sed -n 's/^MONGO_URI=//p' .env.production.local)"
   echo "${PROD_MONGO%%@*}@…"   # sanity check it's the prod cluster, secret hidden
   ```
   Every command below injects `MONGO_URI="$PROD_MONGO"` for that command only — so a
   later `npm run dev` in the same terminal still uses the dev DB.

---

## 1. Ensure DocTime chambers exist in prod (idempotent)

DocTime doctors link to chambers that must be in prod's `Chamber` catalog. This upserts
the catalog from the git-tracked `data/chambers/chamber-locations.json`. It also upserts
admin + specialties — all idempotent, and the **admin password is set-on-insert only, so
it is never reset.** Skip only if you know prod's chamber catalog is already current.

```bash
MONGO_URI="$PROD_MONGO" npm run seed
```

---

## 2. DocTime doctors (1,393)

```bash
# preview 20, no writes
MONGO_URI="$PROD_MONGO" npm run seed:unified -- --file=data/unified/doctime-new.json --limit=20 --dry-run

# full run
MONGO_URI="$PROD_MONGO" npm run seed:unified -- --file=data/unified/doctime-new.json
```

Upserts key on `(sourceProvider:"unified", sourceProviderId)`; DocTime ids have **zero
overlap** with `doctors.json`, so this only *inserts* the 1,393 new rows and never
touches the existing 4,899. Slug clashes get a `-u<id>` suffix; a BMDC already used by
another doctor is skipped (existing row wins), never overwritten.

---

## 3. DocTime photos → S3 (`doctor-id-public`) + `Doctor.photo`

```bash
# inventory only (no writes) — should report 1,393 usable, 0 placeholders
MONGO_URI="$PROD_MONGO" npm run seed:unified:photos -- --file=data/unified/doctime-new.json --report

# small REAL run to prove the static-key S3 write works
MONGO_URI="$PROD_MONGO" npm run seed:unified:photos -- --file=data/unified/doctime-new.json --limit=10

# full run
MONGO_URI="$PROD_MONGO" npm run seed:unified:photos -- --file=data/unified/doctime-new.json
```

Content-addressed + idempotent (`doctor/profile-picture/_seed/<sha>.<ext>`): re-runs
re-upload nothing, already-set photos are skipped (`--force` to re-evaluate). Only the
1,393 DocTime rows are touched — existing photos are untouched.

---

## 4. Health guides (drafts)

```bash
MONGO_URI="$PROD_MONGO" npm run seed:articles
```

Creates the 14 guides as **drafts** (idempotent — existing slugs are skipped).

---

## 5. Publish + stamp the medical reviewer

```bash
# preview
MONGO_URI="$PROD_MONGO" \
REVIEWER_NAME="Dr. Abdul Mahin Tazbir" \
REVIEWER_CREDENTIAL="MBBS, MD (Rheumatology) BMU, MACP (America), Assistant Professor · BIRDEM General Hospitals" \
REVIEWER_PROFILE_URL="https://daktar.link/abdul-mahin-tazbir-rheumatologist" \
npm run publish:articles -- --dry-run

# apply (drop --dry-run)
MONGO_URI="$PROD_MONGO" \
REVIEWER_NAME="Dr. Abdul Mahin Tazbir" \
REVIEWER_CREDENTIAL="MBBS, MD (Rheumatology) BMU, MACP (America), Assistant Professor · BIRDEM General Hospitals" \
REVIEWER_PROFILE_URL="https://daktar.link/abdul-mahin-tazbir-rheumatologist" \
npm run publish:articles
```

Publishes all guides + sets the public "Medically reviewed by …" byline and
`reviewedBy`/`lastReviewed` JSON-LD. Safe to re-run. References/Key-facts aren't seeded —
add them per guide later in `/admin/articles` on the live site.

---

## 6. Verify on the live site

- `https://daktar.link/sitemap.xml` and `/llms.txt` list the new doctors + guides.
- A DocTime profile loads with photo + BMDC chip.
- `/guides/<slug>` shows the reviewer byline + "Last reviewed"; source has
  `"@type":["MedicalWebPage","Article"]` + `reviewedBy`. Spot-check in Google Rich Results.

## Rollback

Every step is additive/idempotent. To undo, restore the step-0 `mongodump`, or remove
rows by seed signature (`{sourceProvider:"unified", sourceProviderId:…}` for doctors; the
seeded guide slugs for articles). Seeded S3 objects are content-addressed and harmless to leave.
