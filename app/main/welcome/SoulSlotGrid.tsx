"use client";

/**
 * The ten soul-creation slots on the welcome page.
 *
 * Slot 1 is free and clickable immediately, without waiting for any lookup.
 * The other nine start greyed out with a spinner over them while the wallet
 * is checked, then either turn full colour and become clickable, or stay
 * greyed with the requirement still showing.
 *
 * The two Grid Miner star slots resolve on a slower second request, so they
 * keep their spinner after the rest of the grid has settled.
 */

import { useEffect, useState } from "react";
import styles from "../../page.module.css";

export interface SoulSlotDefinition {
  number: number;
  kind: "free" | "nft" | "stars" | "token";
  label: string;
  image: string | null;
  slow: boolean;
}

interface SlotState {
  slots: SoulSlotDefinition[];
  unlocked: number[];
  starsPending: boolean;
  starSlots: number[];
  checked: boolean;
}

const IMAGE_BASE = "/images/soul-creation/";

export function SoulSlotGrid({ onCreate }: { onCreate: () => void }) {
  const [state, setState] = useState<SlotState | null>(null);
  // Distinct from `state === null`: the first request has come back but the
  // slow star pass has not.
  const [starsPending, setStarsPending] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me/soul-slots", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SlotState | null) => {
        if (cancelled || !data) {
          if (!cancelled) setState(null);
          return;
        }
        setState(data);
        setStarsPending(data.starsPending);

        // Kick off the slow star lookup only when it is still unresolved.
        if (!data.starsPending) return;

        fetch("/api/auth/me/soul-slots/stars", { credentials: "include" })
          .then((res) => (res.ok ? res.json() : null))
          .then((stars) => {
            if (cancelled) return;
            if (stars) {
              setState((prev) =>
                prev ? { ...prev, unlocked: stars.unlocked } : prev
              );
            }
            setStarsPending(false);
          })
          .catch(() => {
            if (!cancelled) setStarsPending(false);
          });
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Until the first response lands we still render the grid, so the layout
  // does not jump - every slot but the free one shows its spinner.
  const slots = state?.slots ?? FALLBACK_SLOTS;
  const unlocked = new Set(state?.unlocked ?? [1]);
  const awaitingFirstResponse = state === null;

  return (
    <div className={styles.characterMatrix}>
      <h2 className={styles.characterMatrixHeading}>Character Preview</h2>
      <div className={styles.characterGrid}>
        {slots.map((slot) => {
          const isFree = slot.kind === "free";
          const isUnlocked = isFree || unlocked.has(slot.number);
          const isLoading =
            !isFree &&
            !isUnlocked &&
            (awaitingFirstResponse || (slot.slow && starsPending));

          return (
            // The requirement sits outside the button: the artwork becomes the
            // player's character portrait later, and a portrait should not
            // carry unlock text across it.
            <div key={slot.number} className={styles.slotCell}>
              <button
                className={styles.characterSlot}
                disabled={!isUnlocked}
                onClick={isUnlocked ? onCreate : undefined}
              >
                <span className={styles.slotArt}>
                  {slot.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={
                        isUnlocked ? styles.slotImage : styles.slotImageLocked
                      }
                      src={IMAGE_BASE + slot.image}
                      alt=""
                    />
                  ) : (
                    <span className={styles.characterSlotMark}>?</span>
                  )}
                  {isLoading && (
                    <span className={styles.slotSpinner} aria-hidden="true" />
                  )}
                </span>

                <span className={styles.characterSlotLabel}>
                  {isUnlocked ? `Create Soul ${slot.number}` : "Locked"}
                </span>
              </button>

              <span
                className={
                  isUnlocked ? styles.slotRequirementMet : styles.slotRequirement
                }
              >
                {slot.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Shape-only placeholder so the grid renders before the first response. */
const FALLBACK_SLOTS: SoulSlotDefinition[] = [
  { number: 1, kind: "free", label: "FREE", image: null, slow: false },
  { number: 2, kind: "nft", label: "WUD 1st YEAR NFT", image: "nft-wud-1st-year.jpg", slow: false },
  { number: 3, kind: "nft", label: "WUD 2nd YEAR NFT", image: "nft-wud-2nd-year.jpg", slow: false },
  { number: 4, kind: "nft", label: "OG WUD BURN NFT", image: "nft-wud-og-burn.jpg", slow: false },
  { number: 5, kind: "token", label: "1B WUD", image: "assset-wud.jpg", slow: false },
  { number: 6, kind: "token", label: "5B WUD", image: "assset-wud.jpg", slow: false },
  { number: 7, kind: "token", label: "1000 DOT", image: "asset-dot.png", slow: false },
  { number: 8, kind: "token", label: "5000 DOT", image: "asset-dot.png", slow: false },
  { number: 9, kind: "stars", label: "20 STARS", image: "nft-wud-grid-miner.jpg", slow: true },
  { number: 10, kind: "stars", label: "100 STARS", image: "nft-wud-grid-miner.jpg", slow: true },
];
