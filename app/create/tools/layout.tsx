import type { Metadata } from "next";
import { pageMetadata } from "../../lib/seo";

// Metadata for the page (a client component, which can't export it itself).
export const metadata: Metadata = pageMetadata({
  title: "Tools for Creators",
  description: "Story design tools for Wudlands authors: image dimensions, CSS image style previews, scene previews and examples to bring your interactive story to life.",
  path: "/create/tools",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
