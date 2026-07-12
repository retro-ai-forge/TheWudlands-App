import type { Metadata } from "next";
import "./globals.css";
import Header from "./main/Header";
import Footer from "./main/Footer";
import { WalletProvider } from "./main/WalletProvider";
import { VersionBadge } from "./main/VersionBadge";
export const metadata: Metadata = {
  title: "The Wudlands | Old School Fantasy RPG",
  description: "A decision based, choice driven narrative RPG with fatal consequences. Experience old school round-based Fighting Fantasy style adventures inspired by UltraQuest, EverQuest, and GAVUN WUD meme. Browser-based fantasy RPG with pixel-art, ASCII-art, and onchain character progression.",
  keywords: "RPG, fantasy, choice-driven, narrative RPG, fatal, old school, round-based, Fighting Fantasy, UltraQuest, EverQuest, GAVUN WUD, browser game, pixel-art, ASCII-art, adventure game, onchain, blockchain",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "The Wudlands",
    description: "A choice-driven narrative RPG with fatal consequences. Old-school Fantasy style adventures with onchain character progression.",
    type: "website",
    url: "https://thewudlands.eu",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Wudlands | Old School Fantasy RPG",
    description: "Decision based, choice driven narrative RPG inspired by Fighting Fantasy and EverQuest.",
  },
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
