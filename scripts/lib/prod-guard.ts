/**
 * Shared production guard for the seed/publish scripts.
 *
 * By default every seed/publish script refuses to run when NODE_ENV ===
 * "production" — a safety net against accidentally mutating the live database.
 * A DELIBERATE production seed (e.g. the first-time data load against the prod
 * cluster) opts in with `ALLOW_PROD_SEED=1`. The bypass logs a loud warning so
 * a production write is never silent.
 *
 *   # blocked (default):
 *   NODE_ENV=production tsx scripts/seed-unified.ts
 *   # intentional prod seed:
 *   ALLOW_PROD_SEED=1 NODE_ENV=production tsx scripts/seed-unified.ts
 */
export function assertSeedAllowed(action = "seed"): void {
  if (process.env.NODE_ENV !== "production") return;
  const optedIn = process.env.ALLOW_PROD_SEED === "1" || process.env.ALLOW_PROD_SEED === "true";
  if (optedIn) {
    console.warn(
      `⚠  NODE_ENV=production + ALLOW_PROD_SEED set — running "${action}" against the PRODUCTION database.`,
    );
    return;
  }
  console.error(
    `Refusing to ${action}: NODE_ENV is production (safety guard).\n` +
      `  To intentionally ${action} the production database, re-run with ALLOW_PROD_SEED=1.`,
  );
  process.exit(1);
}
