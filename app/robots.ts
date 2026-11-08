import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/seo";

// Served as /robots.txt. Search engines and AI crawlers (GPTBot, ClaudeBot,
// PerplexityBot, Google-Extended...) are all welcome on the public pages;
// only the API and the story editor are off limits. Pages that shouldn't
// show up in results use a noindex tag instead (e.g. /create/review), which
// a crawler can only read when it's allowed to fetch the page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/twine/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
