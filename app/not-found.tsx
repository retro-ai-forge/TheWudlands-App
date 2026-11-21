import type { Metadata } from "next";
import Link from "next/link";
import h from "@/app/styles/headings.module.css";
import styles from "@/app/styles/statusPage.module.css";

// Any address that leads nowhere, and every notFound() call. Next answers it
// with status 404 and adds noindex itself; the title goes through the
// layout's "%s | The Wudlands". Not a public page: it stays out of
// PUBLIC_PAGES and the sitemap.
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className={styles.page}>
      <section className={styles.box}>
        <p className={styles.code} aria-hidden="true">
          404
        </p>
        <h1 className={`${h.pageTitle} ${h.center}`}>Page not found</h1>
        <p className={styles.text}>
          This path leads nowhere. The torchlight is trying to remember where it was.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.button}>
            Back to the start
          </Link>
        </div>
      </section>
    </div>
  );
}
