import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

// Two distinct AI-crawler intents — kept separate on purpose:
//
//  1. AI *search / answer* crawlers fetch a handful of pages to answer one
//     user's question and *cite the source with a clickable link*. That is the
//     acquisition channel for an SEO-first directory, so we ALLOW them (they
//     index the public profiles + guides, never the authed areas).
//  2. AI *training* crawlers + bulk scrapers ingest content into model weights
//     or harvest the dataset wholesale — no attribution, no traffic, hard to
//     revoke. We keep BLOCKING those, and the TDM-Reservation header in
//     next.config.ts reserves our text-and-data-mining (training) rights in law.
//
// Ordinary search engines (Googlebot, Bingbot, DuckDuckBot, …) are NOT listed
// at all — they stay indexable under the `*` rule (the public profiles are the
// product's SEO surface, and Googlebot is what feeds Google AI Overviews).
//
// robots.txt is advisory — well-behaved crawlers honour it. Enforcement against
// bad actors (incl. mass enumeration of the directory) is the rate-limiter +
// Cloudflare Turnstile + first-party API + nginx layer (see CLAUDE.md #21);
// allowing per-query search bots does NOT change that exposure.

// AI search/answer crawlers — allowed to index + cite the public directory.
const ALLOWED_AI_SEARCH_AGENTS = [
  // OpenAI — OAI-SearchBot indexes for ChatGPT Search; ChatGPT-User fetches a
  // page live when a user's prompt references it.
  "OAI-SearchBot",
  "ChatGPT-User",
  // Perplexity — PerplexityBot indexes; Perplexity-User fetches on demand.
  "PerplexityBot",
  "Perplexity-User",
];

// AI-training crawlers + bulk scrapers — barred from the whole site.
const BLOCKED_AI_AND_SCRAPER_AGENTS = [
  // OpenAI (model training)
  "GPTBot",
  // Google (Gemini training/grounding — distinct from Googlebot, which stays allowed)
  "Google-Extended",
  // Anthropic
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  // Common Crawl (feeds most training datasets)
  "CCBot",
  // ByteDance / TikTok
  "Bytespider",
  // Amazon / Apple / Meta AI
  "Amazonbot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  // Other AI / data-mining / bulk scrapers
  "cohere-ai",
  "Diffbot",
  "Omgilibot",
  "Omgili",
  "ImagesiftBot",
  "YouBot",
  "Timpibot",
  "Scrapy",
  "magpie-crawler",
  "DataForSeoBot",
];

const PRIVATE_PATHS = ["/dashboard", "/admin", "/api/auth"];

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    rules: [
      // Search engines + everyone else: index the public directory, but never
      // the authenticated/admin areas or auth endpoints.
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // AI search/answer crawlers: explicitly welcomed to the public surface
      // (same private-path carve-outs). Listing them by name documents the
      // intent and guards against a future regression to the blocklist.
      {
        userAgent: ALLOWED_AI_SEARCH_AGENTS,
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // AI-training crawlers and bulk scrapers: barred from the whole site.
      {
        userAgent: BLOCKED_AI_AND_SCRAPER_AGENTS,
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
