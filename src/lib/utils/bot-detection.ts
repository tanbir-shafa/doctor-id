/**
 * User-agent based bot detection for profile-view counting.
 *
 * Context: profile views are recorded on every render of a public profile.
 * Crawlers (SEO bots, AI training bots, social previewers, monitoring probes,
 * scripting clients) fetch those pages constantly and inflated the view counter
 * by ~10× vs. real humans. This filter keeps the counter to genuine visitors.
 *
 * Strategy: a broad regex over the User-Agent string. The generic
 * `bot|crawl|spider|slurp` tokens catch the long tail; named patterns catch
 * the high-volume offenders observed in production (SemrushBot, AhrefsBot,
 * MJ12bot, GPTBot, ClaudeBot, meta-externalagent, Amzn-SearchBot, …) plus
 * headless/scripting HTTP clients that omit those tokens.
 *
 * A MISSING or empty UA is treated as a bot — no real browser omits its
 * User-Agent, so an absent one signals a programmatic client.
 *
 * This is intentionally dependency-free (no `isbot` package) and matches the
 * curated-list convention already used in `src/app/robots.ts`.
 */

const BOT_UA_PATTERN = new RegExp(
  [
    // Generic crawler tokens — the broad net.
    "bot\\b",
    "bot/",
    "\\bbots\\b",
    "crawl",
    "spider",
    "slurp",
    "scraper",
    "search\\.marginalia",
    // Named SEO / backlink crawlers (top production offenders).
    "semrush",
    "ahrefs",
    "mj12",
    "dotbot",
    "serpstat",
    "dataforseo",
    "blexbot",
    "rogerbot",
    "screaming frog",
    "seokicks",
    "dataprovider",
    "builtwith",
    "yoast",
    // AI training / answer crawlers.
    "gptbot",
    "oai-searchbot",
    "chatgpt",
    "ccbot",
    "claude",
    "anthropic",
    "perplexity",
    "google-extended",
    "bytespider",
    "amazonbot",
    "applebot",
    "meta-external",
    "meta-web",
    "cohere",
    "diffbot",
    "omgili",
    "imagesift",
    "youbot",
    "timpibot",
    "petalbot",
    // Social / link preview fetchers.
    "facebookexternalhit",
    "facebookcatalog",
    "whatsapp",
    "telegrambot",
    "slackbot",
    "discordbot",
    "twitterbot",
    "linkedinbot",
    "pinterest",
    "embedly",
    "quora link preview",
    "redditbot",
    "skypeuripreview",
    "vkshare",
    // Monitoring / performance probes.
    "uptimerobot",
    "pingdom",
    "statuscake",
    "gtmetrix",
    "lighthouse",
    "headlesschrome",
    "phantomjs",
    "puppeteer",
    "playwright",
    "chrome-lighthouse",
    "google page speed",
    // Scripting / programmatic HTTP clients.
    "python-requests",
    "python-httpx",
    "aiohttp",
    "httpx",
    "scrapy",
    "\\bcurl/",
    "wget",
    "libwww",
    "httpclient",
    "okhttp",
    "go-http-client",
    "java/",
    "node-fetch",
    "axios",
    "guzzle",
    "postmanruntime",
    "insomnia",
    "apache-httpclient",
    "dart:io",
    "winhttp",
  ].join("|"),
  "i",
);

/**
 * Returns true if the User-Agent looks like a bot / non-human client (or is
 * absent). Used to skip view-count increments and to purge bot events in the
 * migration script.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return true;
  return BOT_UA_PATTERN.test(userAgent);
}
