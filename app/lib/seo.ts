import type { Metadata } from "next";

// Search engine / social preview data shared by every page. Each page sets
// its own title, description and path through pageMetadata(); the root
// layout holds the defaults (app/layout.tsx), app/robots.ts and
// app/sitemap.ts list what crawlers may visit.

export const SITE_URL = "https://thewudlands.eu";
export const SITE_NAME = "The Wudlands";
export const SITE_TAGLINE = "Old-School Fantasy RPG";
export const SITE_DESCRIPTION =
  "A choice-driven narrative RPG with fatal consequences. Old-school, round-based adventures in the tradition of Fighting Fantasy and EverQuest - played in your browser, with character progression that is yours to keep.";

export const SOCIAL_LINKS = {
  telegram: "https://t.me/+GNokB3Y-FllhNjBi",
  github: "https://github.com/retro-ai-forge/TheWudlands-App",
};

// Preview image for links shared on X, Telegram, Discord... Keep width/height
// in sync with the file.
export const SOCIAL_IMAGE = {
  url: "/images/social-media-banner/wudlands-banner.jpg",
  width: 1200,
  height: 630,
  alt: "The Wudlands - cursed forest, lost souls. A dark fantasy gamebook you play in your browser: your hero, your story, onchain.",
};

// Every page the sitemap lists (path, whether it's a main page).
export const PUBLIC_PAGES: { path: string; main?: boolean }[] = [
  { path: "/", main: true },
  { path: "/guide", main: true },
  { path: "/theworld", main: true },
  { path: "/theworld/ancient" },
  { path: "/characters" },
  { path: "/create", main: true },
  { path: "/create/tools" },
  { path: "/create/tutorial" },
  { path: "/dev-section" },
  { path: "/gtc" },
];

/** Title, description, canonical URL and social preview for one page.
 *  `title` is the page name only; " | The Wudlands" is added here (set as an
 *  absolute title - the layout's template doesn't reach pages nested under
 *  another layout with its own title). `noIndex` keeps the page out of
 *  search results. */
export function pageMetadata({ title, description, path, noIndex }: {
  title?: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | ${SITE_TAGLINE}`;
  return {
    ...(title ? { title: { absolute: fullTitle } } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en",
      url: path,
      title: fullTitle,
      description,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [SOCIAL_IMAGE.url],
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
