import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

/**
 * Renders user-authored bio markdown to safe HTML.
 *
 * We use `isomorphic-dompurify` so this works in both the browser and the Node
 * server runtime (RSC). The allow-list is intentionally conservative — only
 * inline formatting + links + lists. No images, no script tags, no iframes.
 */

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "h2",
  "h3",
  "h4",
];

const ALLOWED_ATTR = ["href", "title", "rel", "target"];

export function renderBioMarkdown(markdown: string | null | undefined): string {
  if (!markdown) return "";
  const html = marked.parse(markdown, { async: false, breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Force external links to open safely.
    ADD_ATTR: ["rel", "target"],
  });
}
