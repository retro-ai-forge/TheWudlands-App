"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../soul-creation/SoulCreation.module.css";
import tabStyles from "./CharacterTabs.module.css";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { PortraitEditor, type PortraitEditorValue } from "../PortraitEditor";
import { BIRTHSIGNS } from "@/app/lib/characterOptions";
import { StatsTab } from "./StatsTab";
import { BodyTab } from "./BodyTab";
import { SoulTab } from "./SoulTab";
import { AdventureTab } from "./AdventureTab";
import { InventoryTab, type RawPlayerData } from "./InventoryTab";

export type TabKey = "stats" | "body" | "soul" | "adventure" | "inventory";

const ICON_BASE = "/images/character/char-preview-";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "stats", label: "Stats", icon: `${ICON_BASE}stats.png` },
  { key: "body", label: "Body", icon: `${ICON_BASE}body.png` },
  { key: "soul", label: "Soul", icon: `${ICON_BASE}soul.png` },
  { key: "inventory", label: "Inventory", icon: `${ICON_BASE}inventory.png` },
  { key: "adventure", label: "Adventure", icon: `${ICON_BASE}adventure.png` },
];

// Opened by clicking an active soul slot's character. Five subpages - Stats
// (attributes + face), Body (equipment slots), Soul (soul equipment),
// Inventory (this character's vault vs. the player's shared vault), and
// Adventure (addon selection) - reached by tapping one of TABS' icons, laid
// out in a row above the character's name; the current one is highlighted,
// the rest greyed out. Close sits fixed top-right, always visible regardless
// of which page is showing. Delete only shows on Stats, fixed bottom-left.
export function CharacterPreview({
  character,
  playerResourceBalances,
  playerTools,
  onClose,
  onDeleted,
  onPortraitSaved,
  onPlayerDataUpdated,
  initialTab = "stats",
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
  onClose: () => void;
  onDeleted: () => void;
  onPortraitSaved: (character: SlotCharacterSummary) => void;
  /** Called with the fresh roster/vault/pool after a resource/tool transfer on the Inventory tab. */
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** Which page to open on - e.g. restoring from a link that sent the player
   * away to a full page (like the recipe viewer) and back. */
  initialTab?: TabKey;
}) {
  const { setHidden: setHeaderHidden } = useHeaderVisibility();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  // Delete (Stats page only, see below) starts barely visible and inert,
  // only lighting up once the player has actually scrolled this page's
  // content down to its end - deliberate friction against an accidental tap
  // on a permanent, unconfirmed-by-anything-else destructive action.
  // .wizard (ref'd here) is the actual scrolling element (.wizardScrollable
  // sets its own overflow-y:auto), not .mainColumn or .sheet.
  const wizardScrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledToEnd, setIsScrolledToEnd] = useState(true);

  function checkScrolledToEnd() {
    const el = wizardScrollRef.current;
    if (!el) return;
    setIsScrolledToEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  }

  // Re-check on every tab switch too - a short page (nothing to scroll)
  // should start unlocked rather than stuck on whatever the previous page's
  // scroll position implied.
  useEffect(() => {
    checkScrolledToEnd();
  }, [activeTab]);

  // Standalone portrait editor, opened by clicking the face portrait on the
  // Stats tab. The draft lives in a ref rather than state - PortraitEditor's
  // onChange fires on every drag/zoom frame, and this component doesn't need
  // to re-render for those, only to read the latest value once, on Save.
  const [editingPortrait, setEditingPortrait] = useState(false);
  const [isSavingPortrait, setIsSavingPortrait] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const portraitDraftRef = useRef<PortraitEditorValue | null>(null);

  // Birthsign popup, opened by clicking the Birthsign row on the Stats tab.
  // Rendered as a sibling of .stage below (not nested inside StatsTab) so it
  // sits in the same stacking context as the fixed corner buttons and
  // correctly covers them - .sheet establishes its own stacking context
  // (position:relative + z-index:2), so an overlay nested inside it can
  // never outrank their z-index:6 no matter what z-index it's given.
  const [showBirthsignPopup, setShowBirthsignPopup] = useState(false);
  const [birthsignFlipped, setBirthsignFlipped] = useState(false);
  const birthsignInfo = BIRTHSIGNS.find((b) => b.id === character.birthsign) ?? null;

  useEffect(() => {
    setHeaderHidden(true);
    return () => setHeaderHidden(false);
  }, [setHeaderHidden]);

  // .wizard is a fixed full-viewport overlay, but the page behind it
  // (header + welcomeScreen + footer) can still exceed 100vh and scroll
  // underneath it, showing a second scrollbar alongside .wizardScrollable's
  // own. Some browsers scroll the html element rather than body, so both
  // need to be locked while this preview is mounted - same fix as the
  // wizard's own SoulCreation.tsx.
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

  async function handleSavePortrait() {
    const draft = portraitDraftRef.current;
    if (!draft || isSavingPortrait) return;

    setPortraitError(null);
    setIsSavingPortrait(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/portrait`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Same "empty" placeholder convention as the wizard's own save -
          // see SoulCreation.tsx's handleContinue.
          portraitUrl: draft.portraitUrl.trim() || "empty",
          portraitZoom: draft.portraitZoom,
          portraitPan: draft.portraitPan,
          portraitFrameArea: draft.portraitFrameArea,
          portraitFaceArea: draft.portraitFaceArea,
        }),
      });
      if (!res.ok) throw new Error("Failed to save portrait");
      setEditingPortrait(false);
      onPortraitSaved({
        ...character,
        portraitUrl: draft.portraitUrl.trim() || "empty",
        portraitZoom: draft.portraitZoom,
        portraitPan: draft.portraitPan,
        portraitFrameArea: draft.portraitFrameArea,
        portraitFaceArea: draft.portraitFaceArea,
      });
    } catch {
      setPortraitError("Could not save the portrait. Please try again.");
    } finally {
      setIsSavingPortrait(false);
    }
  }

  function handleDeleteClick() {
    if (isDeleting) return;
    setDeleteError(null);
    setShowDeleteWarning(true);
  }

  // A resource/tool id -> quantity pool, checked in one id at a time via the
  // same per-id endpoints the Inventory tab's transfer buttons use - there's
  // no bulk "check in everything" endpoint, so this just loops.
  async function checkInAll(kind: "resources" | "tools", pool: Record<string, number>) {
    for (const [id, amount] of Object.entries(pool)) {
      if (amount <= 0) continue;
      const res = await fetch(
        `/api/auth/me/characters/${character.id}/${kind}/${id}/check-in`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        }
      );
      if (!res.ok) throw new Error(`Failed to check in ${kind} ${id}`);
    }
  }

  async function handleConfirmDelete() {
    if (isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      // Soulbound blueprints are lost either way (never transfer), but
      // resources and tools this character is holding move to the shared
      // vault first - otherwise deleting the character would just discard
      // them, since nothing else can reach a deleted character's storage.
      await checkInAll("resources", character.resources);
      await checkInAll("tools", character.tools);

      const res = await fetch(`/api/auth/me/characters/${character.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete character");
      setShowDeleteWarning(false);
      onDeleted();
    } catch {
      setDeleteError("Could not delete this character. Please try again.");
      setIsDeleting(false);
    }
  }

  return (
    <div
      className={`${styles.wizard} ${styles.wizardScrollable}`}
      ref={wizardScrollRef}
      onScroll={checkScrolledToEnd}
    >
      {/* Sticky, not fixed - stays in normal flow (so nothing below it needs
          manual top-padding to avoid sitting underneath) but pins to the top
          of .wizard's own scroll once the page scrolls past it. Only the
          icon row (.topBarBackground) carries a solid fill; the name below
          it sits directly on .wizard's own tiled background. */}
      <div className={tabStyles.topBar}>
        <div className={tabStyles.topBarBackground}>
          <div className={tabStyles.topBarRow}>
            <nav className={tabStyles.tabRow}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`${tabStyles.tabRowButton} ${
                    activeTab === tab.key ? tabStyles.tabRowButtonActive : tabStyles.tabRowButtonInactive
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={activeTab === tab.key}
                  title={tab.label}
                  aria-label={tab.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tab.icon} alt="" className={tabStyles.tabIcon} />
                </button>
              ))}
            </nav>

            <button type="button" className={tabStyles.closeButton} onClick={onClose} title="Close" aria-label="Close">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ICON_BASE}close.png`} alt="" className={tabStyles.tabIcon} />
            </button>
          </div>
        </div>
      </div>

      <div className={tabStyles.sheet}>
        {deleteError && <p className={styles.submitError}>{deleteError}</p>}

        <h1 className={tabStyles.name}>
          {character.firstName} {character.lastName}
        </h1>

        <div className={activeTab === "inventory" ? tabStyles.mainColumn : `${tabStyles.mainColumn} ${tabStyles.mainColumnPadded}`}>
          {activeTab === "stats" && (
            <StatsTab
              character={character}
              onEditPortrait={() => setEditingPortrait(true)}
              onOpenBirthsign={() => {
                setBirthsignFlipped(false);
                setShowBirthsignPopup(true);
              }}
            />
          )}
          {activeTab === "body" && <BodyTab character={character} />}
          {activeTab === "soul" && <SoulTab character={character} />}
          {activeTab === "adventure" && <AdventureTab character={character} />}
          {activeTab === "inventory" && (
            <InventoryTab
              character={character}
              playerResourceBalances={playerResourceBalances}
              playerTools={playerTools}
              onPlayerDataUpdated={onPlayerDataUpdated}
            />
          )}
        </div>
      </div>

      {activeTab === "stats" && (
        <button
          type="button"
          className={`${tabStyles.deleteButton} ${isScrolledToEnd ? "" : tabStyles.deleteButtonLocked}`}
          onClick={handleDeleteClick}
          disabled={isDeleting || !isScrolledToEnd}
          title={isDeleting ? "Deleting…" : isScrolledToEnd ? "Delete Character" : "Scroll to the end of the page to delete"}
          aria-label={isDeleting ? "Deleting…" : isScrolledToEnd ? "Delete Character" : "Scroll to the end of the page to delete"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ICON_BASE}delete.png`} alt="" className={tabStyles.tabIcon} />
        </button>
      )}

      {editingPortrait && (
        // Mirrors the wizard's own Portrait step (page 3 of SoulCreation.tsx)
        // as closely as possible - same .wizard/.stage/.content chrome and
        // the same .headline treatment, just naming the character instead of
        // the step ("Portrait"), and Save standing in for that step's
        // Continue in the same bottom-right slot.
        <div className={`${styles.wizard} ${styles.noTouchScroll}`}>
          <div className={styles.stage}>
            <div className={`${styles.content} ${styles.contentTop} ${styles.contentTopTight}`}>
              <h1 className={styles.headline}>
                {character.firstName} {character.lastName}
              </h1>
              <PortraitEditor
                // "empty" is the DB's own unloadable-placeholder sentinel for
                // "no portrait set" (see handleSavePortrait below and the
                // wizard's matching save) - showing it as literal text would
                // leave the player deleting it by hand before they can paste
                // a real URL.
                initialUrl={character.portraitUrl === "empty" ? "" : character.portraitUrl}
                initialZoom={character.portraitZoom}
                initialPan={character.portraitPan}
                onChange={(value) => {
                  portraitDraftRef.current = value;
                }}
              />
            </div>
          </div>
          {portraitError && <p className={styles.submitError}>{portraitError}</p>}
          <button
            type="button"
            className={`${styles.navButton} ${styles.continue}`}
            onClick={handleSavePortrait}
            disabled={isSavingPortrait}
          >
            {isSavingPortrait ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {birthsignInfo && showBirthsignPopup && (
        <div className={tabStyles.birthsignPopupOverlay} onClick={() => setShowBirthsignPopup(false)}>
          <button
            type="button"
            className={`${styles.birthsignTile} ${tabStyles.birthsignPopupCard}`}
            onClick={(e) => {
              e.stopPropagation();
              setBirthsignFlipped((flipped) => !flipped);
            }}
            aria-label={`${birthsignInfo.name}: ${birthsignFlipped ? "hide" : "show"} description`}
          >
            <div className={`${styles.birthsignFlipper} ${birthsignFlipped ? styles.birthsignFlipperFlipped : ""}`}>
              <div className={styles.birthsignFace}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={birthsignInfo.image} alt={birthsignInfo.name} className={styles.birthsignImage} />
              </div>
              <div className={`${styles.birthsignFace} ${styles.birthsignFaceBack}`}>
                <h3 className={styles.birthsignName}>{birthsignInfo.name}</h3>
                <p className={styles.birthsignFlavor}>{birthsignInfo.flavor}</p>
                <p className={styles.birthsignEffect}>
                  <span className={styles.birthsignEffectLabel}>Event: </span>
                  {birthsignInfo.effect}
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {showDeleteWarning && (
        <div className={tabStyles.birthsignPopupOverlay}>
          <div className={tabStyles.deleteWarningCard}>
            <p>
              Permanently delete {character.firstName} {character.lastName}? This cannot be undone.
            </p>
            <p>
              A new character in this soul slot won&apos;t receive a starter resource kit (this slot
              already claimed one). Clicking Continue will first move this character&apos;s resources
              and tools to your shared vault, then delete the character.
            </p>
            {deleteError && <p className={styles.submitError}>{deleteError}</p>}
            <div className={tabStyles.deleteWarningActions}>
              <button
                type="button"
                className={tabStyles.deleteWarningCancel}
                onClick={() => setShowDeleteWarning(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={tabStyles.deleteWarningContinue}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
