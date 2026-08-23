"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "../../page.module.css";
import { FeedbackForm } from "./FeedbackForm";
import { SoulCreation } from "./soul-creation/SoulCreation";
import { CharacterPreview, type TabKey } from "./character-preview/CharacterPreview";
import type { SlotCharacterSummary } from "./SoulSlotGrid";

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
  // The soul slot clicked to start the wizard; null means not creating.
  const [creatingSlot, setCreatingSlot] = useState<number | null>(null);
  // The character whose preview is open; null means not viewing one.
  const [viewingCharacter, setViewingCharacter] = useState<SlotCharacterSummary | null>(null);
  // null while loading the roster for the first time.
  const [characters, setCharacters] = useState<SlotCharacterSummary[] | null>(null);
  // The player's own shared resource vault, pooled across every character -
  // used by the character sheet's Inventory tab alongside that character's
  // own resourceBalances.
  const [playerResourceBalances, setPlayerResourceBalances] = useState<Record<string, number>>({});
  // Which tab CharacterPreview should open on - only meaningful alongside
  // viewingCharacter, set when restoring from a ?character=&tab= URL below.
  const [viewingTab, setViewingTab] = useState<TabKey>("stats");

  const refreshCharacters = () => {
    fetch("/api/auth/me/characters", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setCharacters(data?.characters ?? []);
        setPlayerResourceBalances(data?.resourceBalances ?? {});
      })
      .catch(() => setCharacters([]));
  };

  useEffect(() => {
    refreshCharacters();
  }, []);

  // Restores the exact character/tab a player left from, e.g. via the
  // Inventory tab's link out to the recipe viewer's own full page - that
  // page returns here with ?character=<id>&tab=<tab> once the roster has
  // loaded, since the character being linked to has to actually exist in
  // it. The URL is cleared right after so a later refresh doesn't keep
  // re-opening the same character.
  const VALID_TABS: TabKey[] = ["stats", "body", "soul", "adventure", "inventory"];
  useEffect(() => {
    if (characters === null) return;
    const params = new URLSearchParams(window.location.search);
    const characterId = params.get("character");
    const tabParam = params.get("tab");
    if (!characterId) return;
    const match = characters.find((c) => c.id === characterId);
    if (match) {
      setViewingCharacter(match);
      setViewingTab(VALID_TABS.includes(tabParam as TabKey) ? (tabParam as TabKey) : "stats");
    }
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters]);

  if (creatingSlot !== null) {
    return (
      <SoulCreation
        slotNumber={creatingSlot}
        onExit={() => {
          // The wizard only calls onExit after a successful save, so the
          // character roster just changed - refresh rather than relying on
          // the mount-only fetch above, or the newly created soul wouldn't
          // show in its slot until the next full page load.
          setCreatingSlot(null);
          refreshCharacters();
        }}
      />
    );
  }

  if (viewingCharacter !== null) {
    return (
      <CharacterPreview
        character={viewingCharacter}
        playerResourceBalances={playerResourceBalances}
        initialTab={viewingTab}
        onClose={() => setViewingCharacter(null)}
        onDeleted={() => {
          // The character is gone - close the preview and refresh the
          // roster so its slot goes back to unlocked-but-empty.
          setViewingCharacter(null);
          refreshCharacters();
        }}
        onPortraitSaved={(updated) => {
          // Update the open preview immediately (its `character` prop is a
          // snapshot, not live) and refresh the roster so the soul slot grid
          // picks up the new portrait too.
          setViewingCharacter(updated);
          refreshCharacters();
        }}
      />
    );
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
      {characters === null && <SoulSlotGridSkeleton />}
      {characters !== null && (
        <SoulSlotGrid
          characters={characters}
          onCreate={(slotNumber) => setCreatingSlot(slotNumber)}
          onViewCharacter={(character) => setViewingCharacter(character)}
        />
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
