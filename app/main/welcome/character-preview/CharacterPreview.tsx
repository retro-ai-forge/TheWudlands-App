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
import { AdventureTab } from "./AdventureTab";
import { InventoryTab, type ItemInstance, type RawPlayerData } from "./InventoryTab";
import { CampView } from "./CampView";

export type TabKey = "stats" | "body" | "crafting" | "adventure" | "inventory";

const ICON_BASE = "/images/character/char-preview-";

const TABS: { key: TabKey; label: string; icon: string; secondIcon?: string; emojiIcon?: string; lightenWhenActive?: boolean }[] = [
  { key: "stats", label: "Stats", icon: `${ICON_BASE}stats.png` },
  { key: "body", label: "Body & Soul", icon: `${ICON_BASE}body.png`, secondIcon: `${ICON_BASE}soul.png`, lightenWhenActive: true },
  { key: "inventory", label: "Inventory", icon: "/images/character/vault.png" },
  { key: "crafting", label: "Crafting", icon: "", emojiIcon: "🔧" },
  { key: "adventure", label: "Adventure", icon: `${ICON_BASE}adventure.png`, lightenWhenActive: true },
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
  playerItemBalances,
  playerItems,
  onClose,
  onDeleted,
  onPortraitSaved,
  onPlayerDataUpdated,
  initialTab = "stats",
  openCraftingSectionByDefault = false,
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
  playerItemBalances: Record<string, number>;
  playerItems: ItemInstance[];
  onClose: () => void;
  onDeleted: () => void;
  onPortraitSaved: (character: SlotCharacterSummary) => void;
  /** Called with the fresh roster/vault/pool after a resource/tool transfer on the Inventory tab. */
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** Which page to open on - e.g. restoring from a link that sent the player
   * away to a full page (like the recipe viewer) and back. */
  initialTab?: TabKey;
  /** Passed straight through to InventoryTab - opens its character Crafting
   * section right away, for a soul slot click that came in with an active
   * crafting timer showing. */
  openCraftingSectionByDefault?: boolean;
}) {
  const { setHidden: setHeaderHidden } = useHeaderVisibility();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // Opened via the camp button on the Body tab (see BodyTab.tsx's
  // onOpenCamp) - replaces the normal per-tab content below the name
  // heading rather than being its own TABS entry, and (like the Vault
  // tab) suspends .wizard's own vertical scroll so only its item grid
  // scrolls, horizontally. Cleared by switching to any of the 5 real tabs.
  const [showCamp, setShowCamp] = useState(false);
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
  const [isScrolledToEnd, setIsScrolledToEnd] = useState(false);

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

  // The Vault tab suspends .wizard's own vertical scroll entirely (see the
  // className below) - if the page was already scrolled down from a
  // longer Crafting view right before switching, freezing that scroll
  // position would leave the name/tab-strip cut off above the fold with
  // no way back up. Snap to the top the moment Vault becomes active.
  useEffect(() => {
    if (showCamp || activeTab === "inventory") {
      wizardScrollRef.current?.scrollTo(0, 0);
    }
  }, [activeTab, showCamp]);

  // Standalone portrait editor, opened by clicking the face portrait on the
  // Stats tab. The draft lives in a ref rather than state - PortraitEditor's
  // onChange fires on every drag/zoom frame, and this component doesn't need
  // to re-render for those, only to read the latest value once, on Save.
  const [editingPortrait, setEditingPortrait] = useState(false);
  const [isSavingPortrait, setIsSavingPortrait] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const portraitDraftRef = useRef<PortraitEditorValue | null>(null);
  // Mirrors the draft's own `ready` flag into real state (unlike the rest of
  // the draft, this needs to trigger a re-render, to disable Save while a
  // freshly-pasted image hasn't loaded yet - see PortraitEditor's own
  // isPortraitReady comment for why saving in that window would stretch it).
  const [isPortraitReady, setIsPortraitReady] = useState(true);

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
    if (!draft || isSavingPortrait || !draft.ready) return;

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
      await checkInAll("resources", character.crafting.resources);
      await checkInAll("tools", character.crafting.tools);

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
      className={`${styles.wizard} ${
        showCamp || activeTab === "inventory" ? "" : styles.wizardScrollable
      }`}
      ref={wizardScrollRef}
      onScroll={checkScrolledToEnd}
    >
      {/* Sticky, not fixed - stays in normal flow (so nothing below it needs
          manual top-padding to avoid sitting underneath) but pins to the top
          of .wizard's own scroll once the page scrolls past it. Only the
          icon row (.topBarBackground) carries a solid fill; the name below
          it sits directly on .wizard's own tiled background. */}
      {/* Hidden outright while CampView is showing - it gets its own
          lower-right exit.webp button (CampView's onExitCamp) back to the
          Body tab instead, and ItemGrid's own measure() already falls
          back gracefully to a flat reserve when this isn't in the DOM to
          measure (see its own comment) - see the "no bottom bar,
          exit.webp only" request this replaced the fixed footer for. */}
      {!showCamp && (
        <div className={tabStyles.topBar} data-role="character-preview-topbar">
          <div className={tabStyles.topBarBackground}>
            <div className={tabStyles.topBarRow}>
              <nav className={tabStyles.tabRow}>
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={[
                      tabStyles.tabRowButton,
                      activeTab === tab.key ? tabStyles.tabRowButtonActive : tabStyles.tabRowButtonInactive,
                      activeTab === tab.key && tab.lightenWhenActive ? tabStyles.tabRowButtonActiveLighten : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setActiveTab(tab.key)}
                    aria-pressed={activeTab === tab.key}
                    title={tab.label}
                    aria-label={tab.label}
                  >
                    {tab.emojiIcon ? (
                      <span className={tabStyles.tabIconEmoji}>{tab.emojiIcon}</span>
                    ) : tab.secondIcon ? (
                      <span className={tabStyles.tabIconComposite}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tab.secondIcon} alt="" className={`${tabStyles.tabIcon} ${tabStyles.tabIconBack}`} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tab.icon} alt="" className={`${tabStyles.tabIcon} ${tabStyles.tabIconFront}`} />
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tab.icon} alt="" className={tabStyles.tabIcon} />
                    )}
                  </button>
                ))}
              </nav>

              <button type="button" className={tabStyles.closeButton} onClick={onClose} title="Close" aria-label="Close">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/character/exit.webp" alt="" className={tabStyles.closeArrowIcon} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={tabStyles.sheet}>
        {deleteError && <p className={styles.submitError}>{deleteError}</p>}

        <h1 className={tabStyles.name}>
          {showCamp ? `${character.firstName}'s Camp` : `${character.firstName} ${character.lastName}`}
        </h1>

        <div className={showCamp || activeTab === "inventory" || activeTab === "crafting" ? tabStyles.mainColumn : `${tabStyles.mainColumn} ${tabStyles.mainColumnPadded}`}>
          {showCamp ? (
            <CampView
              character={character}
              onPlayerDataUpdated={onPlayerDataUpdated}
              onExitCamp={() => setShowCamp(false)}
            />
          ) : (
            <>
          {activeTab === "stats" && (
            <StatsTab
              character={character}
              onEditPortrait={() => setEditingPortrait(true)}
              onOpenBirthsign={() => {
                setBirthsignFlipped(false);
                setShowBirthsignPopup(true);
              }}
              onPlayerDataUpdated={onPlayerDataUpdated}
            />
          )}
          {activeTab === "body" && (
            <BodyTab character={character} onPlayerDataUpdated={onPlayerDataUpdated} onOpenCamp={() => setShowCamp(true)} />
          )}
          {activeTab === "crafting" && (
            <InventoryTab
              character={character}
              playerResourceBalances={playerResourceBalances}
              playerTools={playerTools}
              playerItemBalances={playerItemBalances}
              playerItems={playerItems}
              onPlayerDataUpdated={onPlayerDataUpdated}
              openCraftingSectionByDefault={openCraftingSectionByDefault}
              section="crafting"
            />
          )}
          {activeTab === "adventure" && (
            <AdventureTab character={character} onPlayerDataUpdated={onPlayerDataUpdated} />
          )}
          {activeTab === "inventory" && (
            <InventoryTab
              character={character}
              playerResourceBalances={playerResourceBalances}
              playerTools={playerTools}
              playerItemBalances={playerItemBalances}
              playerItems={playerItems}
              onPlayerDataUpdated={onPlayerDataUpdated}
              section="vault"
            />
          )}
            </>
          )}
        </div>
      </div>

      {!showCamp && activeTab === "stats" && isScrolledToEnd && (
        <button
          type="button"
          className={tabStyles.deleteButton}
          onClick={handleDeleteClick}
          disabled={isDeleting}
          title={isDeleting ? "Deleting…" : "Delete Character"}
          aria-label={isDeleting ? "Deleting…" : "Delete Character"}
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
                  setIsPortraitReady(value.ready);
                }}
              />
            </div>
          </div>
          {portraitError && <p className={styles.submitError}>{portraitError}</p>}
          <button
            type="button"
            className={`${styles.navButton} ${styles.continue}`}
            onClick={handleSavePortrait}
            disabled={isSavingPortrait || !isPortraitReady}
          >
            {isSavingPortrait ? "Saving…" : isPortraitReady ? "Save" : "Loading image…"}
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
