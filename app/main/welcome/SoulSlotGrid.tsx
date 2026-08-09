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
  /** Star target for "stars" slots (20, 100, ...); unused otherwise. */
  amount: number;
}

interface SlotState {
  slots: SoulSlotDefinition[];
  unlocked: number[];
  starsPending: boolean;
  starSlots: number[];
  checked: boolean;
  /** How many Grid Miner stars the wallet has, once known. */
  stars: number | null;
}

const IMAGE_BASE = "/images/soul-creation/";

export function SoulSlotGrid({ onCreate }: { onCreate: () => void }) {
  const [state, setState] = useState<SlotState | null>(null);
  // Distinct from `state === null`: the first request has come back but the
  // slow star pass has not.
  const [starsPending, setStarsPending] = useState(true);
  const [reloading, setReloading] = useState(false);

  const load = (force: boolean) => {
    let cancelled = false;

    const url = force
      ? "/api/auth/me/soul-slots?force=true"
      : "/api/auth/me/soul-slots";

    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SlotState | null) => {
        if (cancelled || !data) {
          if (!cancelled) {
            setState(null);
            setReloading(false);
          }
          return;
        }
        setState(data);
        setStarsPending(data.starsPending);

        // Kick off the slow star lookup only when it is still unresolved.
        if (!data.starsPending) {
          setReloading(false);
          return;
        }

        fetch("/api/auth/me/soul-slots/stars", { credentials: "include" })
          .then((res) => (res.ok ? res.json() : null))
          .then((stars) => {
            if (cancelled) return;
            if (stars) {
              setState((prev) =>
                prev
                  ? { ...prev, unlocked: stars.unlocked, stars: stars.stars }
                  : prev
              );
            }
            setStarsPending(false);
            setReloading(false);
          })
          .catch(() => {
            if (!cancelled) {
              setStarsPending(false);
              setReloading(false);
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          setState(null);
          setReloading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => load(false), []);

  const handleReload = () => {
    if (reloading) return;
    setReloading(true);
    // Re-show the spinners while the forced re-check runs, same as first load.
    setState(null);
    setStarsPending(true);
    load(true);
  };

  // Until the first response lands we still render the grid, so the layout
  // does not jump - every slot but the free one shows its spinner.
  const slots = state?.slots ?? FALLBACK_SLOTS;
  const unlocked = new Set(state?.unlocked ?? [1]);
  const awaitingFirstResponse = state === null;
  const starsOwned = state?.stars ?? 0;

  return (
    <div className={styles.characterMatrix}>
      {/* Shared gradient for every filled star below - defined once so each
          icon can reference the same id instead of duplicating a <defs>. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id="soulSlotStarGloss" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff6c6" />
            <stop offset="45%" stopColor="#ffd54a" />
            <stop offset="100%" stopColor="#c9971f" />
          </linearGradient>
        </defs>
      </svg>

      <h2 className={styles.characterMatrixHeading}>Soul Slots</h2>
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
                  {slot.kind === "stars" && (
                    <StarOverlay
                      total={slot.amount}
                      filled={Math.min(starsOwned, slot.amount)}
                      slotNumber={slot.number}
                    />
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

      <button
        type="button"
        className={styles.reloadButton}
        onClick={handleReload}
        disabled={reloading}
      >
        {reloading ? "Reloading Balances & NFTs…" : "Reload Balances & NFTs"}
      </button>
    </div>
  );
}

/** Shape-only placeholder so the grid renders before the first response. */
const FALLBACK_SLOTS: SoulSlotDefinition[] = [
  { number: 1, kind: "free", label: "FREE", image: null, slow: false, amount: 0 },
  { number: 2, kind: "nft", label: "WUD 1st YEAR NFT", image: "nft-wud-1st-year.jpg", slow: false, amount: 0 },
  { number: 3, kind: "nft", label: "WUD 2nd YEAR NFT", image: "nft-wud-2nd-year.jpg", slow: false, amount: 0 },
  { number: 4, kind: "nft", label: "OG WUD BURN NFT", image: "nft-wud-og-burn.jpg", slow: false, amount: 0 },
  { number: 5, kind: "token", label: "1B WUD", image: "assset-wud.jpg", slow: false, amount: 1e9 },
  { number: 6, kind: "token", label: "5B WUD", image: "assset-wud.jpg", slow: false, amount: 5e9 },
  { number: 7, kind: "token", label: "1000 DOT", image: "asset-dot.png", slow: false, amount: 1000 },
  { number: 8, kind: "token", label: "5000 DOT", image: "asset-dot.png", slow: false, amount: 5000 },
  { number: 9, kind: "stars", label: "20 MINING STARS", image: "nft-wud-grid-miner.jpg", slow: true, amount: 20 },
  { number: 10, kind: "stars", label: "100 MINING STARS", image: "nft-wud-grid-miner.jpg", slow: true, amount: 100 },
];

/**
 * A grid of star icons overlaid on a Grid Miner slot's artwork: outlined
 * ("see-through") by default, filled in glossy yellow up to however many
 * of the slot's star target the wallet currently has.
 */
function StarOverlay({
  total,
  filled,
  slotNumber,
}: {
  total: number;
  filled: number;
  slotNumber: number;
}) {
  const columns = Math.ceil(Math.sqrt(total));
  // Rows are set explicitly rather than left to grid-auto-rows: an implicit
  // "auto" row's height depends on its content's intrinsic size, and a
  // square SVG icon's intrinsic height can end up taller than a 1fr column
  // is wide, stretching the grid past its container - which is exactly how
  // "100 stars" was rendering as more like 12 rows of 10 (120 cells' worth
  // of space) instead of a clean 10x10. Pinning both axes to 1fr forces
  // rows and columns to divide the same fixed box evenly, no matter what
  // the icons would prefer on their own.
  const rows = Math.ceil(total / columns);
  // A dense grid (e.g. 10x10 for 100 stars) has nine gaps per row eating
  // into the available space - the same 8%/6% inset and gap that look right
  // at 5 columns (20 stars) leave almost nothing for the icon at 10, so both
  // shrink past that point rather than using one fixed size for every count.
  const inset = Math.max(2, 8 - Math.max(0, columns - 5));
  const gap = Math.max(1.5, 6 - Math.max(0, columns - 5) * 0.7);

  // The shine layer below is clipped to exactly the filled stars' shapes,
  // computed in the same 0-1 objectBoundingBox space the grid itself lays
  // out in - a mix-blend-mode alone still paints (faintly) over the outline
  // stars and the gaps between cells, which reads as "a shine over the
  // whole panel" rather than "a shine on just the owned stars".
  const gapFraction = gap / 100;
  const cellWidth = (1 - (columns - 1) * gapFraction) / columns;
  const cellHeight = (1 - (rows - 1) * gapFraction) / rows;
  const clipId = `soulSlotFilledStars-${slotNumber}`;
  const filledCells = Array.from({ length: filled }, (_, i) => ({
    x: (i % columns) * (cellWidth + gapFraction),
    y: Math.floor(i / columns) * (cellHeight + gapFraction),
  }));

  return (
    <div
      className={styles.starOverlay}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        inset: `${inset}%`,
        gap: `${gap}%`,
      }}
      aria-hidden="true"
    >
      {filled > 0 && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              {filledCells.map((cell, i) => (
                <path
                  key={i}
                  d={STAR_PATH_UNIT}
                  transform={`translate(${cell.x} ${cell.y}) scale(${cellWidth} ${cellHeight})`}
                />
              ))}
            </clipPath>
          </defs>
        </svg>
      )}

      {Array.from({ length: total }, (_, i) => (
        <StarIcon key={i} filled={i < filled} />
      ))}

      {/* One diagonal band, not one per star - clipped to the union of every
          currently-filled star's exact shape, so it only ever shows on the
          owned stars, never the outline ones or the gaps between them.
          Absolutely positioned so it never participates in the grid's own
          layout (an earlier version, as a normal spanning grid item,
          contributed to row-track sizing and pushed the stars down).

          The clip lives on this OUTER span and is static per render; the
          actual animation is a transform on the inner .gridShineBand only.
          transform is compositor-only, so the browser can rasterize the
          clipped mask once and just slide that layer each frame. Animating
          background-position directly under the clip (the first version)
          forces a full repaint of the mask on every frame instead, which
          is what was visibly flickering. */}
      {filled > 0 && (
        <span
          className={styles.gridShine}
          style={{ clipPath: `url(#${clipId})` }}
          aria-hidden="true"
        >
          <span className={styles.gridShineBand} />
        </span>
      )}
    </div>
  );
}

const STAR_PATH =
  "M12 2.5 L14.9 9.1 L22 9.8 L16.6 14.6 L18.2 21.5 L12 17.8 L5.8 21.5 L7.4 14.6 L2 9.8 L9.1 9.1 Z";
// STAR_PATH's coordinates divided by the 24x24 viewBox, so they compose
// with clipPathUnits="objectBoundingBox" (a 0-1 coordinate space) above.
const STAR_PATH_UNIT =
  "M0.5 0.1042 L0.6208 0.3792 L0.9167 0.4083 L0.6917 0.6083 L0.7583 0.8958 L0.5 0.7417 L0.2417 0.8958 L0.3083 0.6083 L0.0833 0.4083 L0.3792 0.3792 Z";

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={filled ? styles.starFilled : styles.starOutline}
    >
      <path d={STAR_PATH} />
    </svg>
  );
}
