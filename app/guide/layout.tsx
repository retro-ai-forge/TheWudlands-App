import type { Metadata } from "next";
import { pageMetadata } from "../lib/seo";

// Metadata for the page (a client component, which can't export it itself).
export const metadata: Metadata = pageMetadata({
  title: "Guide",
  description: "How to play The Wudlands: your character, gear, professions, death and rebirth, crafting together, and how to enter with a wallet - explained from a wanderer's eyes.",
  path: "/guide",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
