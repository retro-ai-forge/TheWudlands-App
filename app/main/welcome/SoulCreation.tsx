"use client";

import { useEffect, useState } from "react";
import styles from "./SoulCreation.module.css";

const PAGE_COUNT = 4;

export function SoulCreation({ onExit }: { onExit: () => void }) {
  const [page, setPage] = useState(0);

  const isFirstPage = page === 0;
  const isLastPage = page === PAGE_COUNT - 1;

  // The wizard is a fixed full-viewport overlay, but the page behind it
  // (header + welcomeScreen + footer) can still exceed 100vh and scroll
  // underneath it. Lock body scroll while the wizard is mounted.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function handleBack() {
    if (isFirstPage) {
      onExit();
    } else {
      setPage((p) => p - 1);
    }
  }

  function handleContinue() {
    if (isLastPage) {
      onExit();
    } else {
      setPage((p) => p + 1);
    }
  }

  return (
    <div className={styles.wizard}>
      <button className={`${styles.navButton} ${styles.back}`} onClick={handleBack}>
        Back
      </button>

      <div className={page === 1 ? `${styles.content} ${styles.contentTop}` : styles.content}>
        <h1 className={styles.headline}>Page {page + 1}</h1>
      </div>

      {page === 1 && (
        <div className={styles.triangleGroup}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.medallion} ${styles.medallionBody}`}
            src="/images/soul-creation/equilize-body.png"
            alt="Body"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.medallion} ${styles.medallionSoul}`}
            src="/images/soul-creation/equilize-soul.png"
            alt="Soul"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.medallion} ${styles.medallionLife}`}
            src="/images/soul-creation/equilize-life.png"
            alt="Life"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.triangleImg}
            src="/images/soul-creation/equilize-triangle.png"
            alt=""
          />
        </div>
      )}

      <button className={`${styles.navButton} ${styles.continue}`} onClick={handleContinue}>
        Continue
      </button>
    </div>
  );
}
