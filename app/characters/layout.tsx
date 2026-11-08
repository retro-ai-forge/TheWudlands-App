import type { Metadata } from "next";
import { pageMetadata } from "../lib/seo";

// Metadata for the page (a client component, which can't export it itself).
export const metadata: Metadata = pageMetadata({
  title: "Origins",
  description: "Races, upbringings and professions of The Wudlands - who your character is before the road, and the body and soul attributes that shape every choice.",
  path: "/characters",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
