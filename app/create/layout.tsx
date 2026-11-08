import type { Metadata } from "next";
import { pageMetadata } from "../lib/seo";

// Metadata for the page (a client component, which can't export it itself).
export const metadata: Metadata = pageMetadata({
  title: "Call for Artists & Writers",
  description: "Write interactive dark fantasy stories for The Wudlands and earn from every wanderer who plays them. How story submission, revenue share and artwork work.",
  path: "/create",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
