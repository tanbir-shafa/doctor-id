/**
 * Split existing profile-view data into human vs. bot counters.
 *
 * Profile views were originally recorded for every request, so crawlers
 * (SemrushBot, AhrefsBot, GPTBot, ClaudeBot, meta-externalagent, Applebot,
 * Googlebot, …) were mixed into the same counter as real visitors. Going
 * forward, `recordProfileViewAction` classifies each view by User-Agent and
 * increments separate counters. This one-off backfill fixes EXISTING data:
 *
 *   1. Tags every `profileViews` event with `isBot` (from isBotUserAgent).
 *   2. Recomputes each Doctor's HUMAN counters (`profileViews`,
 *      `metrics.profileViews30d`, `metrics.lastViewedAt`) from human events and
 *      its BOT counters (`botViews`, `metrics.botViews30d`,
 *      `metrics.lastBotViewedAt`) from bot events.
 *
 * No events are deleted — the crawler signal is kept (admin uses it to see SEO
 * coverage per profile). Lifetime counters are recomputed from events, valid
 * while the system is younger than the 90-day event TTL (warns otherwise).
 *
 * SAFETY: dry-run by default. Pass `--apply` to tag events + rewrite counters.
 *
 *   # dry-run against production (read-only — reports impact, no writes):
 *   npx tsx --env-file=.env.production.local scripts/split-profile-views.ts
 *
 *   # apply against production:
 *   npx tsx --env-file=.env.production.local scripts/split-profile-views.ts --apply
 */

import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView } from "@/lib/db/models";
import type { Loose } from "@/lib/db/models/loose";
import { isBotUserAgent } from "@/lib/utils/bot-detection";

const APPLY = process.argv.includes("--apply");
const TTL_DAYS = 90;
const WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;

const PV = ProfileView as unknown as Loose;
const DOC = Doctor as unknown as Loose;

interface PerDoctor {
  total: number;
  v30: number;
  last: Date;
}

async function perDoctor(matchUAs: { $in: (string | null)[] } | { $nin: (string | null)[] }, since: Date) {
  const rows = (await PV.aggregate([
    { $match: { userAgent: matchUAs } },
    {
      $group: {
        _id: "$doctorId",
        total: { $sum: 1 },
        v30: { $sum: { $cond: [{ $gte: ["$viewedAt", since] }, 1, 0] } },
        last: { $max: "$viewedAt" },
      },
    },
  ])) as { _id: unknown; total: number; v30: number; last: Date }[];
  const map = new Map<string, PerDoctor>();
  for (const r of rows) map.set(String(r._id), { total: r.total, v30: r.v30, last: r.last });
  return map;
}

async function main() {
  await dbConnect();
  const now = Date.now();
  const since30 = new Date(now - WINDOW_30D_MS);

  console.log(`\n=== split-profile-views (${APPLY ? "APPLY — will mutate" : "DRY RUN — no writes"}) ===\n`);

  const totalEvents: number = await PV.countDocuments({});
  console.log(`profileViews events total: ${totalEvents.toLocaleString()}`);
  if (totalEvents === 0) {
    console.log("Nothing to do.");
    await dbDisconnect();
    return;
  }

  const oldest = (await PV.find({}).sort({ viewedAt: 1 }).limit(1).select("viewedAt").lean()) as {
    viewedAt: Date;
  }[];
  const oldestDays = oldest[0] ? Math.floor((now - new Date(oldest[0].viewedAt).getTime()) / 86400000) : 0;
  console.log(`oldest event: ${oldestDays} days ago (TTL window is ${TTL_DAYS} days)`);
  if (oldestDays >= TTL_DAYS - 1) {
    console.warn("  ⚠ events have started expiring — recomputed lifetime counts may undercount older history.");
  }

  // Classify distinct UAs (small set) → human vs bot.
  const distinctUAs = (await PV.distinct("userAgent")) as (string | null)[];
  const humanUAs = distinctUAs.filter((ua) => !isBotUserAgent(ua));
  console.log(`\ndistinct user-agents: ${distinctUAs.length} (human: ${humanUAs.length}, bot: ${distinctUAs.length - humanUAs.length})`);

  // We split by "is this UA human?" — null/empty UAs are bots (isBotUserAgent).
  const humanEvents: number = await PV.countDocuments({ userAgent: { $in: humanUAs } });
  const botEvents = totalEvents - humanEvents;
  console.log(`human events: ${humanEvents.toLocaleString()}  (${((humanEvents / totalEvents) * 100).toFixed(1)}%)`);
  console.log(`bot events:   ${botEvents.toLocaleString()}  (${((botEvents / totalEvents) * 100).toFixed(1)}%)`);

  const humanMap = await perDoctor({ $in: humanUAs }, since30);
  const botMap = await perDoctor({ $nin: humanUAs }, since30);

  const humanTotal = [...humanMap.values()].reduce((a, r) => a + r.total, 0);
  const botTotal = [...botMap.values()].reduce((a, r) => a + r.total, 0);
  console.log(`\ndoctors with human views: ${humanMap.size.toLocaleString()}  (sum ${humanTotal.toLocaleString()})`);
  console.log(`doctors crawled by bots:  ${botMap.size.toLocaleString()}  (sum ${botTotal.toLocaleString()})`);

  // Every doctor that has any event OR a currently-nonzero counter must be written.
  const nonZero = (await DOC.find({
    $or: [
      { profileViews: { $gt: 0 } },
      { botViews: { $gt: 0 } },
      { "metrics.profileViews30d": { $gt: 0 } },
      { "metrics.botViews30d": { $gt: 0 } },
    ],
  })
    .select("_id")
    .lean()) as { _id: unknown }[];
  const toUpdate = new Set<string>([...humanMap.keys(), ...botMap.keys()]);
  for (const d of nonZero) toUpdate.add(String(d._id));
  console.log(`doctors to update: ${toUpdate.size.toLocaleString()}`);

  if (!APPLY) {
    console.log("\nDRY RUN complete — re-run with --apply to tag events and rewrite counters.\n");
    await dbDisconnect();
    return;
  }

  // 1. Tag every event with isBot (humans first, then everything else).
  const humanTag = await PV.updateMany({ userAgent: { $in: humanUAs } }, { $set: { isBot: false } });
  const botTag = await PV.updateMany({ userAgent: { $nin: humanUAs } }, { $set: { isBot: true } });
  console.log(
    `\ntagged events — human: ${(<{ modifiedCount?: number }>humanTag).modifiedCount?.toLocaleString() ?? "?"}, bot: ${(<{ modifiedCount?: number }>botTag).modifiedCount?.toLocaleString() ?? "?"}`,
  );

  // 2. Rewrite per-doctor human + bot counters in batches.
  const ids = [...toUpdate];
  const BATCH = 500;
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const ops = ids.slice(i, i + BATCH).map((id) => {
      const h = humanMap.get(id);
      const b = botMap.get(id);
      return {
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              profileViews: h?.total ?? 0,
              botViews: b?.total ?? 0,
              "metrics.profileViews30d": h?.v30 ?? 0,
              "metrics.botViews30d": b?.v30 ?? 0,
              "metrics.lastViewedAt": h?.last ?? null,
              "metrics.lastBotViewedAt": b?.last ?? null,
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
