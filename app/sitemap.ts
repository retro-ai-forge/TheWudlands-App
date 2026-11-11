import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "./lib/seo";

// Served as /sitemap.xml - every public page (list in app/lib/seo.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(({ path, main }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    priority: path === "/" ? 1 : main ? 0.8 : 0.5,
  }));
}
