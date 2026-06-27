/**
 * Clean bot-inflated profile views — keep real visitors only.
 *
 * Background: profile views were recorded server-side on every page render, so
 * crawlers (SemrushBot, AhrefsBot, GPTBot, ClaudeBot, meta-externalagent, …)
 * inflated the counter ~10× vs. humans. Going forward, views are recorded from
 * the client + UA-filtered (see `recordProfileViewAction` + `bot-detection.ts`).
 * This one-off backfill fixes the EXISTING data:
 *
 *   1. Classifies every `profileViews` event by its stored `userAgent` using the
 *      same `isBotUserAgent()` filter.
 *   2. Deletes the bot events from the `profileViews` collection.
 *   3. Recomputes each Doctor's `profileViews`, `metrics.profileViews30d` and
 *      `metrics.lastViewedAt` from the surviving (human) events.
 *
 * Why recomputing the LIFETIME `profileViews` from events is valid right now:
 * the event collection has a 90-day TTL but the system is < 90 days old, so no
 * events have expired yet — events == lifetime. The script warns if that stops
 * being true (oldest event older than the TTL window).
 *
 * SAFETY: dry-run by default. Pass `--apply` to rewrite the Doctor counters.
 * Bot EVENTS are kept unless `--delete-events` is ALSO passed (the destructive,
 * irreversible step). Recomputed counters are human-only either way.
 *
 *   # dry-run against production (read-only — reports impact, no writes):
 *   npx tsx --env-file=.env.production.local scripts/clean-bot-views.ts
 *
 *   # apply against production — rewrite counters, KEEP bot events:
 *   npx tsx --env-file=.env.production.local scripts/clean-bot-views.ts --apply
 *
 *   # apply AND permanently delete bot events:
 *   npx tsx --env-file=.env.production.local scripts/clean-bot-views.ts --apply --delete-events
 */

import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView } from "@/lib/db/models";
import type { Loose } from "@/lib/db/models/loose";
import { isBotUserAgent } from "@/lib/utils/bot-detection";

const APPLY = process.argv.includes("--apply");
const DELETE_EVENTS = process.argv.includes("--delete-events");
const TTL_DAYS = 90;
const WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;

const PV = ProfileView as unknown as Loose;
const DOC = Doctor as unknown as Loose;

async function main() {
  await dbConnect();
  const now = Date.now();
  const since30 = new Date(now - WINDOW_30D_MS);

  const mode = APPLY
    ? `APPLY — rewrite counters${DELETE_EVENTS ? " + DELETE bot events" : " (keep bot events)"}`
    : "DRY RUN — no writes";
  console.log(`\n=== clean-bot-views (${mode}) ===\n`);

  const totalEvents: number = await PV.countDocuments({});
  console.log(`profileViews events total: ${totalEvents.toLocaleString()}`);
  if (totalEvents === 0) {
    console.log("Nothing to do.");
    await dbDisconnect();
    return;
  }

  // TTL sanity: if the oldest surviving event is older than the TTL window, a
  // lifetime recompute from events would undercount (some history already gone).
  const oldest = (await PV.find({}).sort({ viewedAt: 1 }).limit(1).select("viewedAt").lean()) as {
    viewedAt: Date;
  }[];
  const oldestDays = oldest[0] ? Math.floor((now - new Date(oldest[0].viewedAt).getTime()) / 86400000) : 0;
  console.log(`oldest event: ${oldestDays} days ago (TTL window is ${TTL_DAYS} days)`);
  if (oldestDays >= TTL_DAYS - 1) {
    console.warn(
      "  ⚠ events have started expiring — recomputed lifetime counts may undercount older history.",
    );
  }

  // Classify the distinct user-agents (small set vs. event count).
  const distinctUAs = (await PV.distinct("userAgent")) as (string | null)[];
  const botUAs = distinctUAs.filter((ua) => isBotUserAgent(ua));
  const humanUAs = distinctUAs.filter((ua) => !isBotUserAgent(ua));
  console.log(
    `\ndistinct user-agents: ${distinctUAs.length} (bot: ${botUAs.length}, human: ${humanUAs.length})`,
  );

  // A null/empty UA is classified as bot by isBotUserAgent — match those plus
  // the explicit bot strings. We delete by "NOT a human UA" so nulls are covered.
  const botEvents: number = await PV.countDocuments({ userAgent: { $nin: humanUAs } });
  const humanEvents = totalEvents - botEvents;
  console.log(`\nbot events:   ${botEvents.toLocaleString()}  (${((botEvents / totalEvents) * 100).toFixed(1)}%)`);
  console.log(`human events: ${humanEvents.toLocaleString()}  (${((humanEvents / totalEvents) * 100).toFixed(1)}%)`);

  // Recompute per-doctor human counters from the surviving events.
  const humanByDoctor = (await PV.aggregate([
    { $match: { userAgent: { $in: humanUAs } } },
    {
      $group: {
        _id: "$doctorId",
        total: { $sum: 1 },
        v30: { $sum: { $cond: [{ $gte: ["$viewedAt", since30] }, 1, 0] } },
        last: { $max: "$viewedAt" },
      },
    },
  ])) as { _id: unknown; total: number; v30: number; last: Date }[];

  const humanMap = new Map<string, { total: number; v30: number; last: Date }>();
  for (const r of humanByDoctor) humanMap.set(String(r._id), { total: r.total, v30: r.v30, last: r.last });

  // Sum of human lifetime views across all doctors (the new "all-time" total).
  const newAllTime = humanByDoctor.reduce((acc, r) => acc + r.total, 0);

  // Doctors whose counters are currently non-zero (need reset even if 0 humans).
  const nonZero = (await DOC.find({
    $or: [{ profileViews: { $gt: 0 } }, { "metrics.profileViews30d": { $gt: 0 } }],
  })
    .select("_id")
    .lean()) as { _id: unknown }[];

  const toUpdate = new Set<string>(humanMap.keys());
  for (const d of nonZero) toUpdate.add(String(d._id));
  console.log(`\ndoctors with human views: ${humanMap.size.toLocaleString()}`);
  console.log(`doctors to update (incl. resets to 0): ${toUpdate.size.toLocaleString()}`);
  console.log(`new all-time profileViews total (humans only): ${newAllTime.toLocaleString()}`);

  if (!APPLY) {
    console.log("\nDRY RUN complete — re-run with --apply to rewrite counters");
    console.log("(add --delete-events to also purge the bot events).\n");
    await dbDisconnect();
    return;
  }

  // 1. Optionally delete bot events (irreversible — opt-in only).
  if (DELETE_EVENTS) {
    const del = await PV.deleteMany({ userAgent: { $nin: humanUAs } });
    console.log(`\ndeleted ${(<{ deletedCount?: number }>del).deletedCount?.toLocaleString() ?? "?"} bot events.`);
  } else {
    console.log("\nkept bot events (no --delete-events) — counters recomputed from human events only.");
  }

  // 2. Rewrite per-doctor counters in batches.
  const ids = [...toUpdate];
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const ops = ids.slice(i, i + BATCH).map((id) => {
      const h = humanMap.get(id);
      return {
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              profileViews: h?.total ?? 0,
              "metrics.profileViews30d": h?.v30 ?? 0,
              "metrics.lastViewedAt": h?.last ?? null,
            },
          },
        },
      };
    });
    const res = await DOC.bulkWrite(ops, { ordered: false });
    written += (<{ modifiedCount?: number }>res).modifiedCount ?? 0;
  }
  console.log(`updated ${written.toLocaleString()} doctor docs.`);
  console.log("\nAPPLY complete.\n");
  await dbDisconnect();
}

main().catch(async (err) => {
  console.error(err);
  await dbDisconnect();
  process.exit(1);
});
