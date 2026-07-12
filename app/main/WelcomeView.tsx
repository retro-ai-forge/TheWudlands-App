"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../page.module.css";
import { FeedbackForm } from "./FeedbackForm";
import { CharacterSheet } from "./CharacterSheet";
import { loadCharacter } from "./characterData";

export function WelcomeView() {
  const [selectedSoul, setSelectedSoul] = useState<number | null>(null);

  if (selectedSoul !== null) {
    return (
      <CharacterSheet
        character={loadCharacter(selectedSoul)}
        onBack={() => setSelectedSoul(null)}
      />
    );
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

        <div className={styles.characterMatrix}>
          <h2 className={styles.characterMatrixHeading}>Character Preview</h2>
          <div className={styles.characterGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <button
                key={i}
                className={styles.characterSlot}
                onClick={() => setSelectedSoul(i + 1)}
              >
                <span className={styles.characterSlotMark}>?</span>
                <span className={styles.characterSlotLabel}>Create Soul {i + 1}</span>
              </button>
            ))}
          </div>
        </div>

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
