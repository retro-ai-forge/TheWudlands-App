"use client";

import { useEffect, useState } from "react";
import styles from "./SoulCreation.module.css";

const PAGE_COUNT = 4;

export function SoulCreation({ onExit }: { onExit: () => void }) {
  const [page, setPage] = useState(0);

  const isLastPage = page === PAGE_COUNT - 1;

  // The wizard is a fixed full-viewport overlay, but the page behind it
  // (header + welcomeScreen + footer) can still exceed 100vh and scroll
  // underneath it. Some browsers scroll the html element rather than body,
  // so both need to be locked while the wizard is mounted.
  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  function handleContinue() {
    if (isLastPage) {
      onExit();
    } else {
      setPage((p) => p + 1);
    }
  }

  return (
    <div className={styles.wizard}>
      <div className={page === 1 ? `${styles.content} ${styles.contentTop}` : styles.content}>
        {page === 0 ? (
          <>
            <h1 className={styles.headline}>Shaping forces</h1>
            <p className={styles.introText}>
              Every character is shaped by three forces. Body and Soul share one reserve of points —
              strengthen one, and the other yields — those points will be distributed across your attributes.
            </p>

            <div className={styles.attributeRow}>
              <div className={styles.attributeItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.attributeIcon}
                  src="/images/soul-creation/equilize-body.png"
                  alt="Body"
                />
                <span className={styles.attributeLabel}>Body</span>
              </div>
              <div className={styles.attributeItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.attributeIcon}
                  src="/images/soul-creation/equilize-soul.png"
                  alt="Soul"
                />
                <span className={styles.attributeLabel}>Soul</span>
              </div>
              <div className={styles.attributeItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.attributeIcon}
                  src="/images/soul-creation/equilize-life.png"
                  alt="Life"
                />
                <span className={styles.attributeLabel}>Life</span>
              </div>
            </div>

            <p className={styles.introText}>
              Life Energy sets that reserve&apos;s size — more Energy means more points, but rises your starting age. Body and Soul each range from 5–100;
            </p>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.middleIllustration}
              src="/images/soul-creation/equilize-middle-illu.png"
              alt="The mystic triangle"
            />

            <p className={styles.introText}>
              Click continue to activate the mystic triangle to balance Body, Soul, and Life Energy.
            </p>

          </>
        ) : (
          <h1 className={styles.headline}>Page {page + 1}</h1>
        )}
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
