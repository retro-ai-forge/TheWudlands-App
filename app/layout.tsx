import type { Metadata } from "next";
import "./globals.css";
import Header from "./main/Header";
import Footer from "./main/Footer";
import { WalletProvider } from "./main/WalletProvider";
import { HeaderVisibilityProvider } from "./main/HeaderVisibilityProvider";
import { SoundProvider } from "./main/SoundProvider";
import { VersionBadge } from "./main/VersionBadge";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, pageMetadata } from "./lib/seo";

// Defaults for every page; each page sets its own title/description/canonical
// through pageMetadata() (app/lib/seo.ts).
export const metadata: Metadata = {
  ...pageMetadata({ description: SITE_DESCRIPTION, path: "/" }),
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  applicationName: SITE_NAME,
  // Canonical URLs are per page only - a page without its own must not
  // point at the home page.
  alternates: undefined,
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="scanlines" />
        <WalletProvider>
          <SoundProvider>
            <HeaderVisibilityProvider>
              <Header />
              <div className="pageContent">{children}</div>
              <VersionBadge />
            </HeaderVisibilityProvider>
            <Footer />
          </SoundProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
