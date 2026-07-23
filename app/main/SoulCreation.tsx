"use client";

import { useState } from "react";
import styles from "./SoulCreation.module.css";

const PAGE_COUNT = 4;

export function SoulCreation({ onExit }: { onExit: () => void }) {
  const [page, setPage] = useState(0);

  const isFirstPage = page === 0;
  const isLastPage = page === PAGE_COUNT - 1;

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

      <div className={styles.content}>
        <h1 className={styles.headline}>Page {page + 1}</h1>
      </div>

      <button className={`${styles.navButton} ${styles.continue}`} onClick={handleContinue}>
        Continue
      </button>
    </div>
  );
}
