import type { Metadata } from "next";
import { pageMetadata } from "../lib/seo";

// Metadata for the page (a client component, which can't export it itself).
export const metadata: Metadata = pageMetadata({
  title: "The World",
  description: "Behind the forests and the choices: how the Wudlands works - Minne, your nature, survival and combat, character and party, availability and story effects.",
  path: "/theworld",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
