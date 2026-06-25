"use client";

import { useState } from "react";
import styles from "./page.module.css";

const STEPS = [
  { src: "/images/guide/wallet-01.jpg", title: "Download Nova Wallet" },
  { src: "/images/guide/wallet-02.jpg", title: "Create wallet go to Apps" },
  { src: "/images/guide/wallet-03.jpg", title: "Insert Wudlands address" },
  { src: "/images/guide/wallet-04.jpg", title: "Accept warning\n(will be listed soon)" },
  { src: "/images/guide/wallet-05.jpg", title: "Login" },
  { src: "/images/guide/wallet-06.jpg", title: "Check details" },
  { src: "/images/guide/wallet-07.jpg", title: "Off-chain transaction" },
  { src: "/images/guide/wallet-08.jpg", title: "Sign message" },
];

export default function WalletGuide() {
  const [enlarged, setEnlarged] = useState<string | null>(null);

  return (
    <>
      <p className={styles.body}>Nova Wallet is recommended for the best experience.</p>
      <details id="wallet-guide" className={styles.walletGuide}>
        <summary className={styles.walletGuideSummary}>[ Get started ]</summary>
        <div className={styles.walletGuideGrid}>
          {STEPS.map((item) => (
            <figure
              key={item.src}
              className={styles.walletGuideItem}
              onClick={() => setEnlarged(item.src)}
            >
              <img src={item.src} alt={item.title} className={styles.walletGuideImg} />
              <figcaption className={styles.walletGuideCaption}>{item.title}</figcaption>
            </figure>
          ))}
        </div>
      </details>

      {enlarged && (
        <div className={styles.lightboxOverlay} onClick={() => setEnlarged(null)}>
          <img
            src={enlarged}
            alt={STEPS.find((s) => s.src === enlarged)?.title}
            className={styles.lightboxImg}
          />
        </div>
      )}
    </>
  );
}
