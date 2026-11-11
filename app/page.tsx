import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SOCIAL_IMAGE, SOCIAL_LINKS, pageMetadata } from "./lib/seo";

export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

// Structured data (schema.org) for search engines: the site, who runs it and
// the game itself.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      sameAs: [SOCIAL_LINKS.telegram, SOCIAL_LINKS.github],
    },
    {
      "@type": "VideoGame",
      "@id": `${SITE_URL}/#game`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      image: `${SITE_URL}${SOCIAL_IMAGE.url}`,
      genre: ["Role-playing game", "Interactive fiction", "Dark fantasy"],
      gamePlatform: "Web browser",
      applicationCategory: "Game",
      operatingSystem: "Any",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <HomeClient />
    </>
  );
}
