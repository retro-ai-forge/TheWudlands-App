import styles from "./CharacterTabs.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRemainingCompactLong, useCraftCountdown } from "../craftTimer";
import type { SlotCharacterSummary } from "../types";
import {
  IdList,
  ResourceList,
  ItemDetailPopup,
  ownedIds,
  resolveOutputName,
  formatResourceLabel,
  formatXpPreview,
  CRAFT_RESULT_FADE_MS,
} from "./VaultTab";
import type { BlueprintTierInfo, ResourceTierInfo, RawPlayerData } from "./VaultTab";
import { getResourceCatalog, getToolCatalog, getItemCatalog } from "./catalogCache";

const CRAFT_COUNTS = [1, 2, 3, 4, 5, 10, 20, 25, 50] as const;

// Crafting works from the character's active storage (home, or camp while
// resting on an adventure) plus whatever it carries - never the vault
// (backend.players._craft_storage_type / CRAFT_HELD_LOCATIONS).
const CARRIED_BUCKETS = ["backpack", "saddlepack", "cart"] as const;
const CARRIED_ITEM_LOCATIONS = ["body", "backpack", "saddlepack", "cart"];

type RecipeViewerWindow = Window & {
  getCurrentSelection?: () => { familyId: string; tier: number } | null;
  isCurrentSelectionCraftable?: (count?: number) => boolean;
  getCurrentSelectionXp?: (count?: number) => { rawXp: Record<string, number>; finalXp: number } | null;
  getCurrentSelectionDuration?: (count?: number) => number | null;
  getCurrentSelectionHigherTierUse?: (count?: number) => HigherTierUse[];
};

/** A higher-tier material a craft would use in place of the selected tier. */
type HigherTierUse = { id: string; name: string; tier: number; qty: number };

export type CraftResult = { name: string; count: number };

/** Collects a craft as soon as its timer runs out, wherever the player is in
 * the character view (not only on the crafting page), and remembers what
 * came out for a short while so the crafting page can show "Finished: …". */
export function useCraftAutoFinish(
  character: SlotCharacterSummary,
  onPlayerDataUpdated?: (data: RawPlayerData) => void
): { lastCraftResult: CraftResult | null; clearLastCraftResult: () => void } {
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});
  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    getResourceCatalog().then(setResourceTierInfo).catch(() => setResourceTierInfo({}));
    getItemCatalog().then(setItemCatalogTierInfo).catch(() => setItemCatalogTierInfo({}));
  }, []);

  const [finishing, setFinishing] = useState(false);
  const [lastCraftResult, setLastCraftResult] = useState<CraftResult | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
  }, []);

  const clearLastCraftResult = useCallback(() => {
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    setLastCraftResult(null);
  }, []);

  const finishCraft = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/craft/finish`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        const active = character.crafting.activeCraft;
        if (active) {
          setLastCraftResult({
            name: resolveOutputName(active.familyId, active.tier, resourceTierInfo, itemCatalogTierInfo),
            count: active.count,
          });
          if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
          fadeTimeoutRef.current = setTimeout(() => setLastCraftResult(null), CRAFT_RESULT_FADE_MS);
        }
        onPlayerDataUpdated?.(data);
      }
    } catch {
      // Next tick's countdown effect will retry.
    } finally {
      setFinishing(false);
    }
  };

  const remainingSeconds = useCraftCountdown(character.crafting.activeCraft?.readyAt);
  useEffect(() => {
    if (remainingSeconds === 0) finishCraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds === 0]);

  return { lastCraftResult, clearLastCraftResult };
}

/** The crafting page, opened from the workbench in the home camp: what's
 * being crafted right now (timer, tools and materials in use), the Craft
 * button with its count matrix, and the recipe viewer to pick from. */
export function CraftingView({
  character,
  onPlayerDataUpdated,
  storageType,
  lastCraftResult,
  onCraftStarted,
  onExit,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** The storage crafting works from: home, or camp while resting on an adventure. */
  storageType: "home" | "camp";
  /** From useCraftAutoFinish - the craft that just came out, for a few seconds. */
  lastCraftResult: CraftResult | null;
  /** A new craft started - the previous "Finished" line should go. */
  onCraftStarted?: () => void;
  onExit: () => void;
}) {
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});
  const [toolTierInfo, setToolTierInfo] = useState<BlueprintTierInfo>({});
  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    getResourceCatalog().then(setResourceTierInfo).catch(() => setResourceTierInfo({}));
    getToolCatalog().then(setToolTierInfo).catch(() => setToolTierInfo({}));
    getItemCatalog().then(setItemCatalogTierInfo).catch(() => setItemCatalogTierInfo({}));
  }, []);

  const inAdventure = character.availability.inAdventure;
  // On the road (not resting) there's nowhere to craft.
  const onTheRoad = inAdventure && !character.availability.resting;
  const remainingSeconds = useCraftCountdown(character.crafting.activeCraft?.readyAt);

  const transfer = async (
    kind: "itemBalances" | "resources" | "tools",
    id: string,
    amount: number
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/${kind}/${id}/check-in`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) return false;
      const data: RawPlayerData = await res.json();
      onPlayerDataUpdated?.(data);
      return true;
    } catch {
      return false;
    }
  };

  const knownBlueprints = useMemo(() => character.blueprints ?? [], [character.blueprints]);

  // Stacked stock: the active storage plus the carried bags.
  const stockBalances = useMemo(() => {
    const balances = character.gear.itemBalances;
    const out: Record<string, number> = { ...(balances?.[storageType] ?? {}) };
    for (const bucket of CARRIED_BUCKETS) {
      for (const [id, qty] of Object.entries(balances?.[bucket] ?? {})) {
        out[id] = (out[id] ?? 0) + qty;
      }
    }
    return out;
  }, [character.gear.itemBalances, storageType]);

  // Item instances usable for crafting: in the active storage, worn or carried.
  const stockInstances = useMemo(
    () =>
      character.gear.items.filter(
        (instance) => instance.location === storageType || CARRIED_ITEM_LOCATIONS.includes(instance.location)
      ),
    [character.gear.items, storageType]
  );

  const ownedTools = useMemo(
    () => [...ownedIds(stockBalances), ...stockInstances.map((instance) => instance.itemId)],
    [stockBalances, stockInstances]
  );

  const borrowedToolIds: string[] = [];
  const borrowedToolCounts: Record<string, number> = {};
  for (const instance of character.gear.items) {
    if (instance.location === "crafting") {
      if (!(instance.itemId in borrowedToolCounts)) borrowedToolIds.push(instance.itemId);
      borrowedToolCounts[instance.itemId] = (borrowedToolCounts[instance.itemId] ?? 0) + 1;
    }
  }

  // Owned count per item id (stacks plus instances) for the item popup.
  const ownedCounts = useMemo(() => {
    const counts: Record<string, number> = { ...stockBalances };
    for (const instance of stockInstances) counts[instance.itemId] = (counts[instance.itemId] ?? 0) + 1;
    return counts;
  }, [stockBalances, stockInstances]);

  // --- Recipe viewer (embedded page) ---

  const [recipeViewerHeight, setRecipeViewerHeight] = useState(600);
  const recipeViewerRef = useRef<HTMLIFrameElement>(null);
  const [recipeViewerLoaded, setRecipeViewerLoaded] = useState(false);
  const getRecipeViewerWindow = () =>
    recipeViewerRef.current?.contentWindow as RecipeViewerWindow | null | undefined;

  const [craftCount, setCraftCount] = useState<number>(1);
  const [craftableCounts, setCraftableCounts] = useState<Record<number, boolean>>({});
  const [craftXpPreview, setCraftXpPreview] = useState<{ rawXp: Record<string, number>; finalXp: number } | null>(null);
  const [craftDurationPreview, setCraftDurationPreview] = useState<number | null>(null);

  useEffect(() => {
    const check = () => {
      const win = getRecipeViewerWindow();
      const next: Record<number, boolean> = {};
      for (const count of CRAFT_COUNTS) {
        next[count] = win?.isCurrentSelectionCraftable?.(count) ?? false;
      }
      setCraftableCounts(next);
      setCraftXpPreview(win?.getCurrentSelectionXp?.(craftCount) ?? null);
      setCraftDurationPreview(win?.getCurrentSelectionDuration?.(craftCount) ?? null);
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [stockBalances, ownedTools, knownBlueprints, craftCount]);

  useEffect(() => {
    if (!recipeViewerLoaded) return;
    recipeViewerRef.current?.contentWindow?.postMessage(
      {
        type: "recipe-viewer:update",
        inv: stockBalances,
        itemBalances: stockBalances,
        tools: ownedTools,
        vaultTools: [],
        blueprints: knownBlueprints,
      },
      window.location.origin
    );
  }, [recipeViewerLoaded, stockBalances, ownedTools, knownBlueprints]);

  const [recipePopupItemId, setRecipePopupItemId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "recipe-viewer:show-item" && typeof e.data.itemId === "string") {
        setRecipePopupItemId(e.data.itemId);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // --- Craft ---

  const canCraft = craftableCounts[craftCount] ?? false;
  const [crafting, setCrafting] = useState(false);
  const [craftError, setCraftError] = useState<string | null>(null);
  const [activeOpen, setActiveOpen] = useState(true);
  // Higher-tier materials the craft would use - asked about before starting.
  const [higherTierConfirm, setHigherTierConfirm] = useState<HigherTierUse[] | null>(null);

  // Craft button: if the craft would use higher-tier materials in place of
  // the selected tier, ask first; otherwise start right away.
  const requestCraft = () => {
    const higher = getRecipeViewerWindow()?.getCurrentSelectionHigherTierUse?.(craftCount) ?? [];
    if (higher.length > 0) {
      setHigherTierConfirm(higher);
      return;
    }
    startCraft();
  };

  const startCraft = async () => {
    const win = getRecipeViewerWindow();
    const selection = win?.getCurrentSelection?.();
    if (!selection) {
      setCraftError("Pick a recipe in the viewer first.");
      return;
    }
    if (!(win?.isCurrentSelectionCraftable?.(craftCount) ?? false)) {
      setCraftError("Couldn't craft that - check ingredients, tool, and blueprint.");
      return;
    }
    setCrafting(true);
    setCraftError(null);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/craft/${selection.familyId}/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selection.tier, count: craftCount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCraftError(body?.detail ?? "Couldn't craft that - check ingredients, tool, and blueprint.");
        return;
      }
      const data: RawPlayerData = await res.json();
      onCraftStarted?.();
      onPlayerDataUpdated?.(data);
    } catch {
      setCraftError("Couldn't reach the server.");
    } finally {
      setCrafting(false);
    }
  };

  // Everything set aside for the running craft sits in one pool
  // (crafting.itemBalances): split it into tools (anvil, furnace, ...) and
  // materials, so each shows once, in its own list.
  const staged = character.crafting.itemBalances;
  const stagedToolIds = ownedIds(staged).filter((id) => !!toolTierInfo[id]);
  const stagedMaterials = Object.fromEntries(Object.entries(staged).filter(([id]) => !toolTierInfo[id]));
  const hasCraftingStorage = ownedIds(staged).length > 0 || borrowedToolIds.length > 0;

  return (
    <div className={styles.panel}>
      <div className={styles.craftPage}>
        {/* --- What's being crafted right now --- */}
        {(remainingSeconds !== null || lastCraftResult !== null || hasCraftingStorage) && (
          <div className={`${styles.accordionItem} ${styles.accordionItemWide}`}>
            <button className={styles.accordionHeader} onClick={() => setActiveOpen(!activeOpen)}>
              <span>
                At the workbench
                {remainingSeconds !== null && (
                  <span className={styles.craftTimer}> {formatRemainingCompactLong(remainingSeconds)}</span>
                )}
              </span>
              <span className={styles.accordionChevron}>{activeOpen ? "▴" : "▾"}</span>
            </button>
            {activeOpen && (
              <div className={styles.accordionBody}>
                {stagedToolIds.length > 0 && (
                  <IdList
                    ids={stagedToolIds}
                    emptyLabel=""
                    tierInfo={toolTierInfo}
                    sortByTier
                    fixedIcon="🔧"
                    balances={staged}
                    onTransfer={remainingSeconds === null ? (id, amount) => transfer("itemBalances", id, amount) : undefined}
                    textColor="#7eb8ff"
                  />
                )}
                {borrowedToolIds.length > 0 && (
                  <IdList
                    ids={borrowedToolIds}
                    emptyLabel=""
                    tierInfo={itemCatalogTierInfo}
                    sortByTier
                    fixedIcon="🔧"
                    balances={borrowedToolCounts}
                    quantityHiddenIds={new Set(borrowedToolIds)}
                    textColor="#7eb8ff"
                  />
                )}
                {(stagedToolIds.length > 0 || borrowedToolIds.length > 0) && (
                  <div className={styles.toolsResourceDivider} />
                )}
                <ResourceList
                  balances={stagedMaterials}
                  emptyLabel="No materials used."
                  tierInfo={resourceTierInfo}
                  onTransfer={remainingSeconds === null ? (id, amount) => transfer("itemBalances", id, amount) : undefined}
                />
                {remainingSeconds !== null && character.crafting.activeCraft && (
                  <>
                    <div className={styles.craftOutputDivider} />
                    <p className={styles.craftOutputLine}>
                      Crafting {character.crafting.activeCraft.count}x{" "}
                      {resolveOutputName(
                        character.crafting.activeCraft.familyId,
                        character.crafting.activeCraft.tier,
                        resourceTierInfo,
                        itemCatalogTierInfo
                      )}
                    </p>
                  </>
                )}
                {!character.crafting.activeCraft && lastCraftResult && (
                  <>
                    <div className={styles.craftOutputDivider} />
                    <p className={`${styles.craftOutputLine} ${styles.craftResultFading}`}>
                      Finished: {lastCraftResult.count}x {lastCraftResult.name}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- Craft button + count matrix --- */}
        <div className={styles.craftRow}>
          <div className={styles.craftControlsRow}>
            <div className={styles.craftButtonColumn}>
              <button
                className={
                  !onTheRoad && canCraft && remainingSeconds === null
                    ? `${styles.craftButton} ${styles.craftButtonReady}`
                    : styles.craftButton
                }
                onClick={requestCraft}
                disabled={crafting || !canCraft || remainingSeconds !== null || onTheRoad}
                title={
                  onTheRoad
                    ? `${character.firstName} is on the road.`
                    : canCraft && remainingSeconds === null
                    ? "Selected recipe can be crafted right now"
                    : undefined
                }
              >
                {remainingSeconds !== null ? (
                  <span className={styles.craftTimer}>Crafting… {formatRemainingCompactLong(remainingSeconds)}</span>
                ) : crafting ? (
                  "Crafting…"
                ) : canCraft ? (
                  <>
                    Craft
                    <span className={styles.craftButtonDetail}>
                      {craftDurationPreview !== null && formatRemainingCompactLong(craftDurationPreview)}
                      {craftXpPreview && formatXpPreview(craftXpPreview) && `, ${formatXpPreview(craftXpPreview)}`}
                    </span>
                  </>
                ) : (
                  "Craft"
                )}
              </button>
              {onTheRoad ? (
                <span className={styles.craftUnavailable}>{character.firstName} is on the road.</span>
              ) : (
                craftError && <span className={styles.craftError}>{craftError}</span>
              )}
            </div>
            <div className={styles.craftCountRow} role="radiogroup" aria-label="How many to craft">
              {CRAFT_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={craftCount === count}
                  className={[styles.craftCountButton, craftCount === count ? styles.craftCountButtonActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={crafting || remainingSeconds !== null || !(craftableCounts[count] ?? false)}
                  onClick={() => setCraftCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* --- Recipe viewer --- */}
        <iframe
          ref={recipeViewerRef}
          src="/craft/recipe-viewer.html?embedded=1&filters=1"
          title="Crafting Recipe Viewer"
          className={styles.recipeViewerFrame}
          style={{ height: recipeViewerHeight, overflow: "hidden" }}
          scrolling="no"
          onLoad={() => {
            const doc = recipeViewerRef.current?.contentWindow?.document;
            if (!doc?.body) return;
            setRecipeViewerHeight(doc.body.scrollHeight);
            const observer = new ResizeObserver(() => {
              setRecipeViewerHeight(doc.body.scrollHeight);
            });
            observer.observe(doc.body);
            setRecipeViewerLoaded(true);
          }}
        />
        {recipePopupItemId && itemCatalogTierInfo[recipePopupItemId] && (
          <ItemDetailPopup
            info={itemCatalogTierInfo[recipePopupItemId]}
            fallbackName={formatResourceLabel(recipePopupItemId)}
            owned={ownedCounts[recipePopupItemId] ?? 0}
            isInstance={false}
            movable={false}
            quality={null}
            ownedConditions={stockInstances
              .filter((instance) => instance.itemId === recipePopupItemId && instance.quality != null)
              .map((instance) => instance.quality as number)}
            moveId={recipePopupItemId}
            source="vault"
            hasBackpackEquipped={false}
            hasSaddlepackEquipped={false}
            characterId={character.id}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setRecipePopupItemId(null)}
          />
        )}
      </div>

      {higherTierConfirm && (
        <div className={styles.craftConfirmOverlay} onClick={() => setHigherTierConfirm(null)}>
          <div
            className={styles.craftConfirmCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="craftConfirmTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="craftConfirmTitle" className={styles.craftConfirmText}>
              Not enough at this tier. Use these higher-tier materials for this craft?
            </p>
            <ul className={styles.craftConfirmList}>
              {higherTierConfirm.map((use) => (
                <li key={use.id}>
                  <span className={styles.craftConfirmQty}>{use.qty}x</span> {use.name}{" "}
                  <span className={styles.craftConfirmTier}>T{use.tier}</span>
                </li>
              ))}
            </ul>
            <div className={styles.craftConfirmButtons}>
              <button
                type="button"
                className={styles.craftConfirmCraft}
                onClick={() => {
                  setHigherTierConfirm(null);
                  startCraft();
                }}
              >
                Craft
              </button>
              <button type="button" className={styles.craftConfirmCancel} onClick={() => setHigherTierConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.homeExitButton}
        title="Back"
        aria-label="Back"
        onClick={onExit}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/character/char-preview-close.png" alt="" className={styles.homeExitIcon} />
      </button>
    </div>
  );
}
