"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../../page.module.css";
import { FeedbackForm } from "./FeedbackForm";
import { SoulCreation } from "./SoulCreation";
import { SoulSlotGrid } from "./SoulSlotGrid";

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
          This is the <strong>beta</strong> version of
          The Wudlands. Character creation is life. Check our{" "}
          <Link href="/dev-section#roadmap" className={styles.welcomeLink}>roadmap</Link>{" "}
          in the dev-section to see what&apos;s planned.
        </p>

        {characterCount === 0 && (
          <SoulSlotGrid onCreate={() => setCreatingSoul(true)} />
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
