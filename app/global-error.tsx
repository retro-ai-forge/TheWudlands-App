"use client";

import { useEffect } from "react";
import "./globals.css";
import h from "@/app/styles/headings.module.css";
import styles from "@/app/styles/statusPage.module.css";
import { SITE_NAME } from "./lib/seo";

// The root layout itself failed (header, wallet or sound provider...), which
// error.tsx can't catch. This replaces the whole layout, so it renders its
// own html and body and nothing from the layout - that may be what broke.
// Reload and the home link load the page fresh instead of re-rendering it.
// Only the digest is shown, never the message (see error.tsx).
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>{`Something went wrong | ${SITE_NAME}`}</title>
        <main className={`${styles.page} ${styles.fullHeight}`}>
          <section className={styles.box}>
            <h1 className={`${h.pageTitle} ${h.center}`}>Something went wrong</h1>
            <p className={styles.text}>
              The Wudlands could not be opened just now. Reload the page, or come back in a
              moment.
            </p>
            {error.digest && <p className={styles.reference}>Reference: {error.digest}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={() => window.location.reload()}>
                Reload
              </button>
              {/* A plain link on purpose: a full page load, not the client router. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={styles.button}>
                Back to the start
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
