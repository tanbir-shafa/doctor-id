import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

// AI / LLM-training crawlers and bulk-scraper agents we explicitly bar from the
// directory (Terms §4 — no scraping, no AI/TDM use). Search engines (Googlebot,
// Bingbot, DuckDuckBot, …) are deliberately NOT listed: the public profiles are
// the product's SEO surface and must stay indexable for ordinary search.
//
// robots.txt is advisory — well-behaved crawlers honour it. Enforcement against
// bad actors is the rate-limiter + Cloudflare Turnstile + first-party API +
// nginx layer (see CLAUDE.md #21), plus the X-Robots-Tag / TDM-Reservation
// response headers set in next.config.ts.
const BLOCKED_AI_AND_SCRAPER_AGENTS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Google (AI/Gemini training — distinct from Googlebot, which stays allowed)
  "Google-Extended",
  // Anthropic
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  // Common Crawl (feeds most training datasets)
  "CCBot",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
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

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    rules: [
      // Search engines + everyone else: index the public directory, but never
      // the authenticated/admin areas or auth endpoints.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api/auth"],
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
