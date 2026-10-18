"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "../soul-creation/SoulCreation.module.css";
import tabStyles from "./CharacterTabs.module.css";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { PortraitEditor, type PortraitEditorValue } from "../PortraitEditor";
import { BIRTHSIGNS } from "@/app/lib/characterOptions";
import { StatsTab } from "./StatsTab";
import { BodyTab } from "./BodyTab";
import { StoriesTab, REST_LOCATIONS } from "./StoriesTab";
import { VaultTab, type ItemInstance, type RawPlayerData } from "./VaultTab";
import { HomeView } from "./HomeView";
import { TabErrorBoundary } from "./TabErrorBoundary";

export type TabKey = "stats" | "body" | "home" | "vault" | "stories";

const ICON_BASE = "/images/character/char-preview-";

// Stable module-level fallbacks — avoids creating new object references on
// every render, which would bust useMemo/useEffect dependency caches in child
// components that receive these as props.
const EMPTY_VAULT: { items: ItemInstance[]; itemBalances: Record<string, number> } = { items: [], itemBalances: {} };
const EMPTY_HOME_BALANCES: Record<string, number> = {};
const EMPTY_HOME: { items: ItemInstance[]; itemBalances: Record<string, number> } = { items: [], itemBalances: {} };

const TABS: { key: TabKey; label: string; icon: string; secondIcon?: string; emojiIcon?: string; lightenWhenActive?: boolean }[] = [
  { key: "stats", label: "Stats", icon: `${ICON_BASE}stats.png` },
  { key: "body", label: "Body & Soul", icon: `${ICON_BASE}body.png`, secondIcon: `${ICON_BASE}soul.png`, lightenWhenActive: true },
  { key: "home", label: "Home", icon: "/images/character/camp.png" },
  { key: "vault", label: "Vault", icon: "/images/character/vault.png" },
  { key: "stories", label: "Stories", icon: `${ICON_BASE}adventure.png`, lightenWhenActive: true },
];

// Opened by clicking an active soul slot's character. Five subpages - Stats
// (attributes + face), Body (equipment slots + soul equipment),
// Home (this character's home items), Vault (the player's shared vault),
// and Stories (addon selection) - reached by tapping one of TABS' icons,
// laid out in a row above the character's name; the current one is
// highlighted, the rest greyed out. Close sits fixed top-right, always
// visible regardless of which page is showing. Delete only shows on Stats,
// fixed bottom-left.
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
  /** Called with the fresh roster/vault/pool after a resource/tool transfer on the Vault tab. */
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** Which page to open on - e.g. restoring from a link that sent the player
   * away to a full page (like the recipe viewer) and back. */
  initialTab?: TabKey;
  /** Passed straight through to VaultTab - opens its character crafting
   * section right away, for a soul slot click that came in with an active
   * timer showing. */
  openCraftingSectionByDefault?: boolean;
}) {
  const { setHidden: setHeaderHidden } = useHeaderVisibility();
  const inAdventure = character.availability.inAdventure;
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // Opened via the home button on the Body tab (see BodyTab.tsx's
  // onOpenHome) - replaces the normal per-tab content below the name
  // heading rather than being its own TABS entry, and (like the Vault
  // tab) suspends .wizard's own vertical scroll so only its item grid
  // scrolls, horizontally. Cleared by switching to any of the 5 real tabs.
  const [showHome, setShowHome] = useState(false);
  const [resting, setResting] = useState(character.availability.resting ?? false);
  const [restLocation, setRestLocation] = useState<string>(character.availability.restLocation ?? REST_LOCATIONS[0]);

  useEffect(() => {
    if (inAdventure && !resting && activeTab === "home") {
      setActiveTab("stories");
    }
    if (inAdventure && (activeTab === "vault")) {
      setActiveTab("stories");
    }
    if (!inAdventure) {
      setResting(false);
      setCampData(null);
      if (activeTab === "home" || activeTab === "vault") {
        setActiveTab("stories");
      }
      setShowHome(false);
    }
  }, [inAdventure, resting]);

  // Lazy-loaded supplemental data — fetched on demand the first time the
  // relevant tab is opened; null means not yet loaded.
  const [homeData, setHomeData] = useState<{ items: ItemInstance[]; itemBalances: Record<string, number> } | null>(null);
  const [campData, setCampData] = useState<{ items: ItemInstance[]; itemBalances: Record<string, number> } | null>(null);
  const [vaultData, setVaultData] = useState<{ items: ItemInstance[]; itemBalances: Record<string, number> } | null>(null);

  // Trigger home fetch the first time the home view becomes visible.
  // When resting + home tab, load camp data instead.
  useEffect(() => {
    const needsHome = showHome || (activeTab === "home" && !resting);
    if (!needsHome || homeData !== null) return;
    fetch(`/api/auth/me/characters/${character.id}/home`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHomeData(data ?? EMPTY_HOME))
      .catch(() => setHomeData(EMPTY_HOME));
  }, [showHome, activeTab, homeData, character.id, resting]);

  // Trigger camp fetch when resting and home tab is active.
  useEffect(() => {
    if (!(activeTab === "home" && resting) || campData !== null) return;
    fetch(`/api/auth/me/characters/${character.id}/camp`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCampData(data ?? EMPTY_HOME))
      .catch(() => setCampData(EMPTY_HOME));
  }, [activeTab, resting, campData, character.id]);

  // Trigger vault fetch the first time the vault tab is opened.
  useEffect(() => {
    if (activeTab !== "vault" || vaultData !== null) return;
    fetch("/api/auth/me/vault", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setVaultData(data ?? { items: [], itemBalances: {} }))
      .catch(() => setVaultData({ items: [], itemBalances: {} }));
  }, [activeTab, vaultData]);

  const handlePlayerDataUpdated = useCallback((data: RawPlayerData) => {
    setVaultData(null);
    setHomeData(null);
    setCampData(null);
    onPlayerDataUpdated?.(data);
  }, [onPlayerDataUpdated]);

  // Merge lazily-loaded data back into the character prop so child tabs
  // see the real data without needing their own fetches.
  const augmentedCharacter: SlotCharacterSummary = {
    ...character,
    vault: vaultData ?? character.vault ?? EMPTY_VAULT,
    gear: {
      ...character.gear,
      items: [
        ...character.gear.items.filter((i) => i.location !== "home" && i.location !== "camp"),
        ...(homeData?.items ?? []),
        ...(campData?.items ?? []),
      ],
      itemBalances: {
        ...character.gear.itemBalances,
        home: homeData?.itemBalances ?? character.gear.itemBalances?.home ?? EMPTY_HOME_BALANCES,
        camp: campData?.itemBalances ?? character.gear.itemBalances?.camp ?? EMPTY_HOME_BALANCES,
      },
    },
  };
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

  // Snap to the top before the browser paints whenever switching to a
  // tab whose content fills the viewport (vault/home) — useLayoutEffect
  // ensures the scroll reset happens before the first paint so there's no
  // visible flash of the old scroll position.
  useLayoutEffect(() => {
    if (showHome || activeTab === "home" || activeTab === "vault") {
      wizardScrollRef.current?.scrollTo(0, 0);
    }
  }, [activeTab, showHome]);

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

  async function handleConfirmDelete() {
    if (isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
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
        showHome || activeTab === "home" || activeTab === "vault" ? "" : styles.wizardScrollable
      }`}
      ref={wizardScrollRef}
      onScroll={checkScrolledToEnd}
    >
      {!showHome && (
        <div className={tabStyles.topBar} data-role="character-preview-topbar">
          <div className={tabStyles.topBarBackground}>
            <div className={tabStyles.topBarRow}>
              <nav className={tabStyles.tabRow}>
                {TABS.map((tab) => {
                  const locked = (tab.key === "vault" && inAdventure) || (tab.key === "home" && inAdventure && !resting);
                  const icon = tab.key === "home" && inAdventure ? "/images/character/camp-inadventure.png" : tab.icon;
                  return (
                  <button
                    key={tab.key}
                    type="button"
                    className={[
                      tabStyles.tabRowButton,
                      activeTab === tab.key ? tabStyles.tabRowButtonActive : tabStyles.tabRowButtonInactive,
                      activeTab === tab.key && tab.lightenWhenActive ? tabStyles.tabRowButtonActiveLighten : "",
                      locked ? tabStyles.tabRowButtonLocked : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => !locked && setActiveTab(tab.key)}
                    aria-pressed={activeTab === tab.key}
                    aria-disabled={locked || undefined}
                    title={locked ? `${tab.label} (unavailable during adventure)` : tab.label}
                    aria-label={tab.label}
                  >
                    {tab.emojiIcon ? (
                      <span className={tabStyles.tabIconEmoji}>{tab.emojiIcon}</span>
                    ) : tab.secondIcon ? (
                      <span className={tabStyles.tabIconComposite}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tab.secondIcon} alt="" className={`${tabStyles.tabIcon} ${tabStyles.tabIconBack}`} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={icon} alt="" className={`${tabStyles.tabIcon} ${tabStyles.tabIconFront}`} />
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" className={tabStyles.tabIcon} />
                    )}
                  </button>
                  );
                })}
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

        <div className={tabStyles.nameRow}>
          <h1 className={tabStyles.name}>
            {showHome ? `${character.firstName}'s Home` : activeTab === "home" && resting ? `Resting in ${restLocation.charAt(0).toUpperCase() + restLocation.slice(1)}` : activeTab === "home" ? `${character.firstName}'s Home` : activeTab === "vault" ? "Vault" : `${character.firstName} ${character.lastName}`}
          </h1>
        </div>

        <div className={showHome || activeTab === "home" || activeTab === "vault" ? tabStyles.mainColumn : `${tabStyles.mainColumn} ${tabStyles.mainColumnPadded}`}>
          {showHome ? (
            <HomeView
              character={augmentedCharacter}
              onPlayerDataUpdated={handlePlayerDataUpdated}
              onExitHome={() => setShowHome(false)}
            />
          ) : (
            <>
          {activeTab === "stats" && (
            <StatsTab
              character={augmentedCharacter}
              onEditPortrait={() => setEditingPortrait(true)}
              onOpenBirthsign={() => {
                setBirthsignFlipped(false);
                setShowBirthsignPopup(true);
              }}
              onPlayerDataUpdated={handlePlayerDataUpdated}
              playerResourceBalances={playerResourceBalances}
              playerTools={playerTools}
              playerItemBalances={playerItemBalances}
              playerItems={playerItems}
            />
          )}
          {activeTab === "body" && (
            <BodyTab character={augmentedCharacter} onPlayerDataUpdated={handlePlayerDataUpdated} onOpenHome={inAdventure ? undefined : () => setShowHome(true)} resting={resting} />
          )}
          {activeTab === "vault" && (
            <TabErrorBoundary>
              <VaultTab
                character={augmentedCharacter}
                playerResourceBalances={augmentedCharacter.vault.itemBalances}
                playerTools={augmentedCharacter.vault.itemBalances}
                playerItemBalances={augmentedCharacter.vault.itemBalances}
                playerItems={augmentedCharacter.vault.items}
                onPlayerDataUpdated={handlePlayerDataUpdated}
                section="vault"
              />
            </TabErrorBoundary>
          )}
          {activeTab === "stories" && (
            <StoriesTab
              character={augmentedCharacter}
              onPlayerDataUpdated={handlePlayerDataUpdated}
              resting={resting}
              onRestingChange={setResting}
              restLocation={restLocation}
              onRestLocationChange={setRestLocation}
            />
          )}
          {activeTab === "home" && !resting && (
            <HomeView
              character={augmentedCharacter}
              onPlayerDataUpdated={handlePlayerDataUpdated}
              onExitHome={() => setActiveTab("body")}
              footerVisible
            />
          )}
          {activeTab === "home" && resting && (
            <HomeView
              character={augmentedCharacter}
              onPlayerDataUpdated={handlePlayerDataUpdated}
              onExitHome={() => setActiveTab("body")}
              footerVisible
              storageType="camp"
            />
          )}
            </>
          )}
        </div>
      </div>

      {!showHome && activeTab === "stats" && isScrolledToEnd && (
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
