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
 *
 * Once a slot has been confirmed unlocked, it stays showing unlocked on
 * every later visit for this wallet - a fresh page load, or leaving and
 * returning from character creation - without flashing back to locked
 * while the background check re-runs. A wallet's confirmed slots are
 * cached in localStorage (see loadCachedUnlocked/persistUnlocked below)
 * and used to seed the very first render, before any fetch has resolved.
 * The lock/reveal sequence is only genuinely shown for: the first time
 * this wallet is ever checked (nothing cached yet), the rare ~3% login
 * that the backend independently chooses to re-verify, or an explicit
 * click on Reload - which does intentionally reset everything to locked
 * and re-check from scratch, same as before.
 */

import { useEffect, useRef, useState } from "react";
import styles from "../../page.module.css";
import { useWallet } from "../WalletProvider";
import { getPortraitCropImgStyle, type PortraitArea } from "@/app/lib/portraitCrop";

export interface SoulSlotDefinition {
  number: number;
  kind: "free" | "nft" | "stars" | "token";
  label: string;
  image: string | null;
  slow: boolean;
  /** Star target for "stars" slots (20, 100, ...); unused otherwise. */
  amount: number;
  /** Where a locked slot sends the player to go earn it; null for slot 1. */
  link: string | null;
}

export interface CharacterAvailability {
  name: string;
  timeRdy: string;
}

export interface CharacterClasses {
  class1: string;
  lvl1: number;
  class2: string;
  lvl2: number;
}

export interface CharacterProfessions {
  prof1: string;
  lvl1: number;
  exp1: number;
  prof2: string;
  lvl2: number;
  exp2: number;
  prof3: string;
  lvl3: number;
  exp3: number;
}

export interface CharacterAttributes {
  migh: number;
  agil: number;
  endu: number;
  prec: number;
  will: number;
  insi: number;
  lore: number;
  pres: number;
}

/**
 * The character (if any) already living in a given soul slot. Carries the
 * full character record (stats, professions, portrait crops, inventory) -
 * not just enough to render the slot thumbnail - since this is also what
 * gets handed to CharacterPreview's full character sheet.
 */
export interface SlotCharacterSummary {
  id: string;
  slotNumber: number;
  firstName: string;
  lastName: string;
  vitalStatus: string;
  age_month: number;
  gender: string;
  raceGroup: string;
  race: string;
  birthsign: string;
  portraitUrl: string;
  portraitZoom: number;
  portraitPan: { x: number; y: number };
  /** Full-body crop, for equipment-slot rendering; null pre-dates the feature. */
  portraitFrameArea: PortraitArea | null;
  /** Face-only crop framed during creation; null falls back to a plain cover-fit image. */
  portraitFaceArea: PortraitArea | null;
  availability: CharacterAvailability;
  classes: CharacterClasses;
  profession: CharacterProfessions;
  attr: CharacterAttributes;
  resources: Record<string, number>;
  /** Tools this character currently holds (id -> quantity), checked out of the player's shared pool. */
  tools: Record<string, number>;
  /** Blueprint ids this character has learned - soulbound, never moves. */
  blueprints: string[];
}

interface SlotState {
  slots: SoulSlotDefinition[];
  unlocked: number[];
  starsPending: boolean;
  starSlots: number[];
  checked: boolean;
  /** How many Grid Miner stars the wallet has, once known. */
  stars: number | null;
  /** Percent of its required amount held, one entry per "token" slot in ascending slot order. */
  tokenProgress: number[];
}

const IMAGE_BASE = "/images/soul-creation/";

// Keyed by address so switching wallets in the same browser never shows one
// wallet's confirmed slots for another.
const CACHE_KEY_PREFIX = "soul-slots-unlocked:";

function loadCachedUnlocked(address: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY_PREFIX + address) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function saveCachedUnlocked(address: string, unlocked: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY_PREFIX + address, JSON.stringify(unlocked));
  } catch {
    // Best-effort: a full or blocked localStorage just means the next visit
    // replays the reveal instead of skipping it - not a functional break.
  }
}

// Same key WalletProvider itself reads to restore a session. Reading it here
// too lets the cache be consulted before WalletProvider's own async
// verification of that address has resolved.
function getStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("player_address");
}

// Sizes/positions an <img> (absolutely positioned inside an overflow-hidden,
// position-relative wrapper the same size as the slot) so only the fractional
// crop rect (see PortraitArea) is visible, stretched to fill the wrapper.
// An <img>, not a CSS background-image, specifically so a broken portraitUrl
// still fires a real onError the caller can react to. Implementation lives in
// app/lib/portraitCrop.ts, shared with the character sheet's own crops.
const getFaceCropImgStyle = getPortraitCropImgStyle;

export function SoulSlotGrid({
  onCreate,
  onViewCharacter,
  characters,
}: {
  onCreate: (slotNumber: number) => void;
  onViewCharacter: (character: SlotCharacterSummary) => void;
  characters: SlotCharacterSummary[];
}) {
  const { account } = useWallet();
  const address = account?.address ?? null;
  // WalletProvider only confirms `account` after an awaited fetch, so
  // `address` is still null on this component's very first render even for
  // a wallet that is already logged in. The same address is already sitting
  // in localStorage from that earlier login (see WalletProvider's restore
  // effect) - read it directly for cache purposes so a returning wallet's
  // confirmed slots render unlocked from the first paint, rather than
  // waiting on that verification round-trip and briefly mounting each slot
  // as locked (which plays its lock-reveal animation once corrected).
  const cacheAddress = address ?? getStoredAddress();

  const [state, setState] = useState<SlotState | null>(null);
  // Distinct from `state === null`: the first request has come back but the
  // slow star pass has not.
  const [starsPending, setStarsPending] = useState(true);
  const [reloading, setReloading] = useState(false);

  // False only until the very first fetch of this mount resolves. Reload
  // clears `state` back to null too, but by then this is already true, so
  // the fallback below correctly tells the two situations apart.
  const hasLoadedOnceRef = useRef(false);

  const load = (force: boolean) => {
    let cancelled = false;

    // Read fresh here rather than trusting a value captured once at mount -
    // see the `cacheAddress` comment above for why this can differ from
    // `address` this early.
    let runningUnlocked = cacheAddress ? loadCachedUnlocked(cacheAddress) : [];

    // On a passive check (not Reload), a slot already known unlocked stays
    // shown unlocked even if this particular response doesn't happen to
    // repeat it - it only ever grows. On an explicit Reload, the fresh
    // result is trusted exactly as returned, which is what lets Reload
    // genuinely reset a slot that turned out to no longer qualify.
    const mergeAndCache = (freshUnlocked: number[]): number[] => {
      runningUnlocked = force
        ? freshUnlocked
        : Array.from(new Set([...runningUnlocked, ...freshUnlocked]));
      if (cacheAddress) saveCachedUnlocked(cacheAddress, runningUnlocked);
      return runningUnlocked;
    };

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
        hasLoadedOnceRef.current = true;
        const unlocked = mergeAndCache(data.unlocked);
        setState({ ...data, unlocked });
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
              const starsUnlocked = mergeAndCache(stars.unlocked);
              setState((prev) =>
                prev
                  ? { ...prev, unlocked: starsUnlocked, stars: stars.stars }
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
  // does not jump - every slot but the free one shows its spinner, UNLESS
  // it's already known unlocked from a previous visit (see loadCachedUnlocked),
  // in which case it renders straight into its resting unlocked look with
  // no spinner and no lock ever shown. `hasLoadedOnceRef` is what keeps this
  // from also applying while Reload has deliberately cleared `state` back to
  // null to reset already-confirmed slots to locked - the cache is only
  // consulted for the very first paint of a fresh mount.
  const slots = state?.slots ?? FALLBACK_SLOTS;
  const unlocked = new Set(
    state?.unlocked ??
      (hasLoadedOnceRef.current
        ? [1]
        : [1, ...(cacheAddress ? loadCachedUnlocked(cacheAddress) : [])])
  );
  const awaitingFirstResponse = state === null;
  const starsOwned = state?.stars ?? 0;

  // state.tokenProgress is indexed by ascending token-slot order (matching
  // TOKEN_SLOT_NUMBERS on the backend), not by slot number - map it back to
  // slot number here so SoulSlotCard can just look its own progress up.
  const tokenProgressBySlot = new Map<number, number>();
  if (state?.tokenProgress) {
    slots
      .filter((s) => s.kind === "token")
      .forEach((s, i) => tokenProgressBySlot.set(s.number, state.tokenProgress[i] ?? 0));
  }

  const charactersBySlot = new Map(characters.map((c) => [c.slotNumber, c]));

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
            <SoulSlotCard
              key={slot.number}
              slot={slot}
              isUnlocked={isUnlocked}
              isLoading={isLoading}
              starsOwned={starsOwned}
              tokenProgress={tokenProgressBySlot.get(slot.number) ?? 0}
              occupant={charactersBySlot.get(slot.number)}
              onCreate={onCreate}
              onViewCharacter={onViewCharacter}
            />
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
  { number: 1, kind: "free", label: "FREE", image: null, slow: false, amount: 0, link: null },
  { number: 2, kind: "nft", label: "WUD 1st YEAR NFT", image: "nft-wud-1st-year.jpg", slow: false, amount: 0, link: "https://www.chaotic.art/ahp/collection/441" },
  { number: 3, kind: "nft", label: "WUD 2nd YEAR NFT", image: "nft-wud-2nd-year.jpg", slow: false, amount: 0, link: "https://www.chaotic.art/ahp/collection/842" },
  { number: 4, kind: "nft", label: "OG WUD BURN NFT", image: "nft-wud-og-burn.jpg", slow: false, amount: 0, link: "https://www.chaotic.art/ahp/collection/244" },
  { number: 5, kind: "token", label: "1B WUD", image: "assset-wud.jpg", slow: false, amount: 1e9, link: "https://app.hydration.net/" },
  { number: 6, kind: "token", label: "5B WUD", image: "assset-wud.jpg", slow: false, amount: 5e9, link: "https://app.hydration.net/" },
  { number: 7, kind: "token", label: "1000 DOT", image: "asset-dot.png", slow: false, amount: 1000, link: "https://app.hydration.net/" },
  { number: 8, kind: "token", label: "5000 DOT", image: "asset-dot.png", slow: false, amount: 5000, link: "https://app.hydration.net/" },
  { number: 9, kind: "stars", label: "20 MINING STARS", image: "nft-wud-grid-miner.jpg", slow: true, amount: 20, link: "https://gavunminer.xyz/" },
  { number: 10, kind: "stars", label: "100 MINING STARS", image: "nft-wud-grid-miner.jpg", slow: true, amount: 100, link: "https://gavunminer.xyz/" },
];

// Reveal sequence for a slot that carries a padlock (kinds "nft"/"token"):
// the lock fades away while the dimmed artwork underneath simultaneously
// turns full colour, then the card flips to the "?" mystery-box face as
// soon as that finishes. Each duration must match the CSS transition it
// drives - see the corresponding rules in page.module.css.
const REVEAL_MS = 3000;
const FLIP_MS = 100;

type RevealPhase = "locked" | "revealing" | "flipping" | "unlockedResting";

/**
 * One soul-creation slot: the flip button plus its requirement caption.
 *
 * Owns its own reveal-phase state because the padlock-fade / colour-reveal
 * / flip sequence needs independent timing per slot - two slots unlocking
 * on the same load must not share one timer.
 */
function SoulSlotCard({
  slot,
  isUnlocked,
  isLoading,
  starsOwned,
  tokenProgress,
  occupant,
  onCreate,
  onViewCharacter,
}: {
  slot: SoulSlotDefinition;
  isUnlocked: boolean;
  isLoading: boolean;
  starsOwned: number;
  tokenProgress: number;
  occupant?: SlotCharacterSummary;
  onCreate: (slotNumber: number) => void;
  onViewCharacter: (character: SlotCharacterSummary) => void;
}) {
  const isOccupied = occupant !== undefined;
  // True once occupant.portraitUrl has failed to load (a broken external
  // link, most likely) - drives the large "?" placeholder below instead of
  // a blank/broken image sitting in the slot.
  const [faceCropFailed, setFaceCropFailed] = useState(false);
  useEffect(() => {
    setFaceCropFailed(false);
  }, [occupant?.portraitUrl]);

  const isFree = slot.kind === "free";
  const isStars = slot.kind === "stars";
  // Slots 2-8 (NFT and token requirements) get a padlock badge, and the
  // staged reveal, while locked. The star slots (9-10) carry their own
  // progress overlay instead and just flip immediately once unlocked, same
  // as the free slot always has - they still show the padlock while locked,
  // but stacked beneath the star overlay rather than driving a reveal.
  const showsPadlock = slot.kind === "nft" || slot.kind === "token";

  const [phase, setPhase] = useState<RevealPhase>(
    isUnlocked ? "unlockedResting" : "locked"
  );

  // Tracks `isUnlocked` in both directions. The grid clears its state (so
  // every slot's `isUnlocked` prop goes briefly false) at the start of
  // every Reload click, before the fresh check comes back - which is
  // exactly the mechanism used here to reset slots 2-10 to their locked
  // look on Reload: this snaps straight back to "locked" (no fade-out
  // animation for the reset itself), and once the new data confirms the
  // slot is still unlocked, the reveal sequence below plays again from the
  // start. The free slot never sees `isUnlocked` go false in the first
  // place, so it's unaffected regardless.
  // Safe on mount too: if the slot is already unlocked when this first
  // runs, `prev` is already "unlockedResting", so the update is a no-op.
  useEffect(() => {
    if (isFree) return;
    setPhase((prev) => {
      if (!isUnlocked) return "locked";
      if (prev !== "locked") return prev;
      return showsPadlock ? "revealing" : "unlockedResting";
    });
  }, [isFree, isUnlocked, showsPadlock]);

  // Chains each timed phase to the next. A slot unmounting mid-sequence
  // (e.g. the grid re-rendering with fresh data) clears the pending timer
  // via the effect cleanup, rather than firing a setState after unmount.
  useEffect(() => {
    let delay: number | null = null;
    let next: RevealPhase | null = null;

    if (phase === "revealing") {
      delay = REVEAL_MS;
      next = "flipping";
    } else if (phase === "flipping") {
      delay = FLIP_MS;
      next = "unlockedResting";
    }

    if (delay === null || next === null) return;
    const resolvedNext = next;
    const timer = setTimeout(() => setPhase(resolvedNext), delay);
    return () => clearTimeout(timer);
  }, [phase]);

  const padlockShown =
    (showsPadlock || isStars) && (phase === "locked" || phase === "revealing");
  const padlockFading = phase === "revealing";
  const imageIsColor = phase !== "locked";
  const flipped = phase === "flipping" || phase === "unlockedResting";
  // The button stays inert until the reveal has actually finished, so a
  // click mid-animation can't fire onCreate while the card still looks
  // locked or is mid-flip.
  const canInteract = isFree || phase === "unlockedResting";
  // An occupied slot only shows its character while the slot's requirement
  // is still currently met (or it's the free slot, which never re-locks) -
  // `phase` already tracks that live (see the effect above, keyed off
  // isUnlocked), so a wallet that no longer qualifies (NFT sold, balance
  // dropped, Reload finding it no longer holds) falls straight back to the
  // same locked artwork any other locked slot shows, character or not.
  const showsOccupantPreview = isOccupied && canInteract;

  // Locked, a slot sends the player to go earn it (buy the NFT, get the
  // token, play the mining game) instead of doing nothing. Placeholder
  // destinations for now - see SoulSlot.link - expected to be replaced
  // once in-app soul creation covers this itself.
  const handleClick = () => {
    // An unlocked occupied slot already has its soul made - open its
    // preview instead of the creation wizard. A re-locked occupied slot
    // falls through below same as any other locked slot (send them to go
    // re-earn it) - showsOccupantPreview is false there.
    if (showsOccupantPreview) {
      onViewCharacter(occupant);
      return;
    }
    if (canInteract) {
      onCreate(slot.number);
    } else if (slot.link) {
      window.open(slot.link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    // The requirement sits outside the button. Locked, it shows the real
    // (greyed) artwork with a padlock badge over it and the requirement
    // caption beneath. Unlocked, the slot flips like a postcard to the same
    // "?" mystery-box face slot 1 always shows - what you've earned stops
    // being about the specific reward and becomes a soul waiting to be
    // made, same as the free slot.
    <div className={styles.slotCell}>
      <button
        className={styles.characterSlot}
        disabled={!canInteract && !slot.link}
        onClick={canInteract || slot.link ? handleClick : undefined}
        title={
          showsOccupantPreview
            ? `${occupant.firstName} ${occupant.lastName}`
            : !canInteract && slot.link
            ? "Opens in a new tab"
            : undefined
        }
      >
        {showsOccupantPreview ? (
          <span className={styles.slotArt}>
            {occupant.portraitUrl && !faceCropFailed ? (
              occupant.portraitFaceArea ? (
                <span className={styles.slotFaceCropWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={occupant.portraitUrl}
                    alt={occupant.firstName}
                    style={getFaceCropImgStyle(occupant.portraitFaceArea)}
                    onError={() => setFaceCropFailed(true)}
                  />
                </span>
              ) : (
                // No framed face crop (e.g. a character that predates this
                // feature) - fall back to the whole image, cover-fit rather
                // than precisely cropped.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={`${styles.slotImageLocked} ${styles.slotImageColor}`}
                  src={occupant.portraitUrl}
                  alt={occupant.firstName}
                  onError={() => setFaceCropFailed(true)}
                />
              )
            ) : occupant.portraitUrl ? (
              // A portrait URL was set but failed to load - show a plain
              // placeholder instead of a blank/broken image.
              <span className={styles.slotQuestionMark} aria-hidden="true">
                <svg viewBox="0 0 100 100" className={styles.slotQuestionMarkIcon}>
                  <text x="50" y="54" textAnchor="middle" dominantBaseline="middle">
                    ?
                  </text>
                </svg>
              </span>
            ) : (
              // No portrait was ever set for this character.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`${styles.slotImageLocked} ${styles.slotImageColor}`}
                src={`${IMAGE_BASE}char-empty.jpg`}
                alt={occupant.firstName}
              />
            )}
          </span>
        ) : (
          <span className={styles.slotArt}>
            <span
              className={[
                styles.slotArtFlip,
                // Animated only once a reveal is actually in progress or
                // finished - not while "locked". Reload resets phase straight
                // to "locked" to snap the card back immediately; if the
                // transition stayed active for that too, removing the flip
                // class would slowly un-rotate it over the same 2.5s instead
                // of resetting right away.
                phase !== "locked" ? styles.slotArtFlipAnimated : "",
                flipped ? styles.slotArtFlipped : "",
              ]
                .filter(Boolean)
                .join(" ")
              }
            >
              <span className={`${styles.slotArtFace} ${styles.slotArtFront}`}>
                {slot.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={
                      imageIsColor
                        ? `${styles.slotImageLocked} ${styles.slotImageColor}`
                        : styles.slotImageLocked
                    }
                    src={IMAGE_BASE + slot.image}
                    alt=""
                  />
                )}
                {padlockShown && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={
                      padlockFading
                        ? `${styles.slotPadlock} ${styles.slotPadlockFading}`
                        : styles.slotPadlock
                    }
                    src={`${IMAGE_BASE}padlock.png`}
                    alt=""
                  />
                )}
                {slot.kind === "token" && (phase === "locked" || phase === "revealing") && (
                  <span
                    className={styles.tokenProgressLine}
                    style={{ width: `${tokenProgress}%` }}
                    aria-hidden="true"
                  />
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
              <span className={`${styles.slotArtFace} ${styles.slotArtBack}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.slotEmptyImage}
                  src={`${IMAGE_BASE}char-empty.jpg`}
                  alt=""
                />
                <span className={styles.slotEmptyGlow} aria-hidden="true" />
              </span>
            </span>
          </span>
        )}
      </button>

      <span
        className={
          isUnlocked ? styles.slotRequirementMet : styles.slotRequirement
        }
      >
        {showsOccupantPreview ? `${occupant.firstName} ${occupant.lastName}` : slot.label}
      </span>
    </div>
  );
}

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
