import type { Metadata } from "next";
import { pageMetadata } from "../../lib/seo";

// Metadata for the page (a client component, which can't export it itself).
export const metadata: Metadata = pageMetadata({
  title: "Submit Status",
  description: "Status of the stories submitted to The Wudlands for review.",
  path: "/create/review",
  noIndex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
