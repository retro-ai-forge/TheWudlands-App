import type { Metadata } from "next";
import "./globals.css";
import Header from "./main/Header";
import Footer from "./main/Footer";
import { WalletProvider } from "./main/WalletProvider";
import { VersionBadge } from "./main/VersionBadge";
export const metadata: Metadata = {
  title: "The Wudlands",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="scanlines" />
        <WalletProvider>
          <Header />
          <div className="pageContent">{children}</div>
          <Footer />
          <VersionBadge />
        </WalletProvider>
      </body>
    </html>
  );
}
