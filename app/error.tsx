"use client";

import { startTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import h from "@/app/styles/headings.module.css";
import styles from "@/app/styles/statusPage.module.css";

// A page that throws while rendering. The header and footer stay around it;
// an error in the root layout itself goes to global-error.tsx instead.
// Only the digest is shown - the reference for finding the error in the
// server logs - never the message, which can hold internals.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // reset() alone only renders the page again; refreshing first also asks
  // the server again, in case the error came from there.
  function tryAgain() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className={styles.page}>
      <section className={styles.box}>
        <h1 className={`${h.pageTitle} ${h.center}`}>Something went wrong</h1>
        <p className={styles.text}>
          The wizard called it &ldquo;stable.&rdquo; This page tripped over its own spell.
          Try again, or go back to the start.
        </p>
        {error.digest && <p className={styles.reference}>Reference: {error.digest}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={tryAgain}>
            Try again
          </button>
          <Link href="/" className={styles.button}>
            Back to the start
          </Link>
        </div>
      </section>
    </div>
  );
}
