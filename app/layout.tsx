import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import { WalletProvider } from "./components/WalletProvider";

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
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
