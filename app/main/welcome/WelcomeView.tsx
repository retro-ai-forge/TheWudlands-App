"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "../../page.module.css";
import { FeedbackForm } from "./FeedbackForm";
import { SoulCreation } from "./SoulCreation";

// SoulSlotGrid reads localStorage (a wallet's cached slot unlocks) during
// its very first render. Server-rendered HTML can never see that cache, so
// letting this component go through SSR means the server always paints
// every slot locked, and the client's hydration render - which can see the
// cache immediately - then disagrees with it. React resolves that by
// discarding and regenerating the mismatched subtree, which is slower and
// jankier than a normal re-render and defeats the "no flash" point of
// caching in the first place. Skipping SSR for it means the client's own
// first render is the only render, free to read localStorage synchronously.
//
// That does mean the grid's own code chunk loads in after the rest of the
// page - without a placeholder occupying its spot in the meantime, the page
// below it (the feedback form) would render right up against the intro
// text and then jump down once the grid pops in. `loading` reserves the
// same footprint with the real grid's own classes, so nothing shifts.
const SoulSlotGrid = dynamic(
  () => import("./SoulSlotGrid").then((mod) => mod.SoulSlotGrid),
  { ssr: false, loading: SoulSlotGridSkeleton }
);

function SoulSlotGridSkeleton() {
  return (
    <div className={styles.characterMatrix}>
      <h2 className={styles.characterMatrixHeading}>Soul Slots</h2>
      <div className={styles.characterGrid}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={styles.slotCell}>
            <button className={styles.characterSlot} disabled />
            <span className={styles.slotRequirement}>&nbsp;</span>
          </div>
        ))}
      </div>
      <button className={styles.reloadButton} disabled>
        &nbsp;
      </button>
    </div>
  );
}

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

      </div>

      {/* Outside .welcomeBody deliberately - that wrapper caps at 34rem for
          prose readability, which would squeeze the grid down to the same
          narrow column instead of letting it use the full 900px the page
          now allows. */}
      {characterCount === null && <SoulSlotGridSkeleton />}
      {characterCount === 0 && (
        <SoulSlotGrid onCreate={() => setCreatingSoul(true)} />
      )}

      <div className={styles.welcomeBody}>
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
