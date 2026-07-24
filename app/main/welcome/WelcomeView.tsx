"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../../page.module.css";
import { FeedbackForm } from "./FeedbackForm";
import { SoulCreation } from "./SoulCreation";

const SOUL_SLOTS = [
  { subtitle: "FREE", disabled: false },
  { subtitle: "Test", disabled: false },
  { subtitle: "Wud 1st year NFT", disabled: true },
  { subtitle: "WUD BURN NFT", disabled: true },
  { subtitle: "own 100 mio WUD", disabled: true },
  { subtitle: "own 1 B WUD", disabled: true },
  { subtitle: "own 5 B WUD", disabled: true },
];

export function WelcomeView() {
  const [creatingSoul, setCreatingSoul] = useState(false);
  // null while loading; once resolved, an empty array means the player has no characters yet.
  const [characterCount, setCharacterCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me/characters", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCharacterCount(data?.characters?.length ?? 0))
      .catch(() => setCharacterCount(0));
  }, []);

  if (creatingSoul) {
    return <SoulCreation onExit={() => setCreatingSoul(false)} />;
  }

  return (
    <>
      <div className={styles.welcomeBody}>
        <h1 className={styles.welcomeHeadline}>Welcome to The Wudlands</h1>
        <p className={styles.welcomeMessage}>
          Thanks for signing in! This is a <strong>beta</strong> version of
          The Wudlands. There is no game yet!
          Our app engine is still in development as we gather
          ideas on how to structure and develop it. Check our{" "}
          <Link href="/dev-section#roadmap" className={styles.welcomeLink}>roadmap</Link>{" "}
          in the dev-section to see what&apos;s planned.
        </p>

        {characterCount === 0 && (
          <div className={styles.characterMatrix}>
            <h2 className={styles.characterMatrixHeading}>Character Preview</h2>
            <div className={styles.characterGrid}>
              {SOUL_SLOTS.map(({ subtitle, disabled }, i) => (
                <button
                  key={i}
                  className={styles.characterSlot}
                  disabled={disabled}
                  onClick={() => setCreatingSoul(true)}
                >
                  {disabled ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.characterSlotIcon}
                      src="/images/soul-creation/lookup.png"
                      alt=""
                    />
                  ) : (
                    <span className={styles.characterSlotMark}>?</span>
                  )}
                  <span className={styles.characterSlotLabel}>Create Soul {i + 1}</span>
                  <span className={styles.characterSlotSubtitle}>{subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <br/>
        <p className={styles.welcomeMessage}>
          We&apos;d love your feedback and ideas!
          Submit them in the template below, or clone the repository
          to contribute. For FAQ and release notes please join Telegram.
        </p>
        <br/>
        <p className={styles.welcomeMessage}>
          Nova wallet and Polkadot.js extension have been tested.
          Metamask, Talisman, and SubWallet should work but
          haven&apos;t been tested yet. If you have any issues
          with wallet connection, please let us know.
        </p>
        <br/>
        <p className={styles.welcomeMessage}>
          No coins or assets can be spend before alpha version.
        </p>

      </div>

      <FeedbackForm />
    </>
  );
}
