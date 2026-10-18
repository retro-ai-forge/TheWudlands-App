import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./CharacterTabs.module.css";
import {
  BACKPACK_ACTION_ICON,
  CART_ACTION_ICON,
  ChopBlockPopup,
  HoldActionPopup,
  ItemGrid,
  SADDLEPACK_ACTION_ICON,
  VAULT_ACTION_ICON,
  computeBackpackContents,
  computeSaddlepackContents,
  computeCartContents,
  getKindIcon,
  getTierIndicator,
  postJson,
  selectionWeight,
  stripStackSuffix,
  type BlueprintTierInfo,
  type RawPlayerData,
  type ResourceTierInfo,
} from "./VaultTab";
import { getItemCatalog, getResourceCatalog, getToolCatalog } from "./catalogCache";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { useSound } from "../../SoundProvider";

const HOME_ITEMS_SOUND = "/sounds/campfire_west_wolf.mp3";
// Ambient loop while home is empty (hasHomeItems false) - swapped in for
// HOME_ITEMS_SOUND above, same loop/mute/cleanup behavior either way
// (see the shared useEffect below), just a quieter night-wind backdrop
// instead of the crackling campfire.
const HOME_EMPTY_SOUND = "/sounds/camp_night_wind.mp3";

// How long the ambient loop takes to fade to silence before actually
// pausing - covers every way the effect below tears an in-flight loop
// down (hasHomeItems flipping, muting, or leaving home outright), so none
// of them cut the sound off mid-note.
const HOME_AMBIENT_FADE_MS = 600;
const HOME_AMBIENT_FADE_STEPS = 12;

function fadeOutAudio(audio: HTMLAudioElement) {
  const startVolume = audio.volume;
  const stepMs = HOME_AMBIENT_FADE_MS / HOME_AMBIENT_FADE_STEPS;
  let step = 0;
  const interval = setInterval(() => {
    step += 1;
    if (step >= HOME_AMBIENT_FADE_STEPS) {
      clearInterval(interval);
      audio.pause();
      return;
    }
    audio.volume = startVolume * (1 - step / HOME_AMBIENT_FADE_STEPS);
  }, stepMs);
}

// Stable empty fallback — keeps useMemo([homeInstances, homeBalances])
// caching intact when home data hasn't loaded yet.
const EMPTY_HOME: Record<string, number> = {};

// A fixed placeholder height for the campfire art at the bottom of the
// screen - reserved out of ItemGrid's own fill-to-bottom measurement (see
// its reserveBottomPx prop) so the two never fight over the same space.
// camp.png stands in for a real campfire gif until one exists (see
// BodyTab.tsx's own home button, which opens this view) - same icon, just
// shown much larger here as the screen's own centerpiece instead of a
// small button.
const CAMPFIRE_AREA_PX = 175;

/** Opened by clicking the home button on the Body tab - this character's
 * own gear.itemBalances.home (finished goods owned but not yet packed into
 * a backpack/saddlepack) plus any gear.items instances sitting at
 * location:"home" (e.g. dropped there by unequip_item mid-adventure),
 * styled like the Vault tab's item grid, with a campfire centerpiece
 * filling the lower part of the screen below it. */
export function HomeView({
  character,
  onPlayerDataUpdated,
  onExitHome,
  footerVisible = false,
  storageType = "home",
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** The lower-right exit.webp button's own handler - takes the player
   * back to the Body tab. CharacterPreview.tsx hides its own fixed
   * footer bar (tab row + its own exit.webp close button) while this
   * view is open, so this is the only way out of it once opened. */
  onExitHome: () => void;
  footerVisible?: boolean;
  storageType?: "home" | "rest";
}) {
  const { muted } = useSound();

  const [footerBottomPx, setFooterBottomPx] = useState(0);
  useEffect(() => {
    if (!footerVisible) return;
    const measure = () => {
      const footer = document.querySelector('[data-role="character-preview-topbar"]');
      setFooterBottomPx(footer ? footer.getBoundingClientRect().height : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [footerVisible]);

  // Which home-wide bulk action popup is open, if any - the lit campfire
  // opens "burn" (HoldActionPopup's own Burn All), the dropped-items icon
  // opens "moveAll" (Move all to backpack), the chopping block opens
  // "chop" (ChopBlockPopup's own bulk salvage). The fire/dropped icons
  // aren't clickable at all unless hasHomeItems (see their own render
  // guards below); the chopping block is always clickable (its own
  // preview list is simply empty when there's nothing recyclable), so
  // there's nothing to gate here beyond which of the three was clicked.
  const [homeAction, setHomeAction] = useState<"burn" | "moveAll" | "chop" | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [homeActionBusy, setHomeActionBusy] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [showSalvagePopup, setShowSalvagePopup] = useState(false);

  const [homeKindFilter, setHomeKindFilter] = useState<string[]>([]);
  const [homeTierFilter, setHomeTierFilter] = useState<number[]>([]);
  const [homeSpecialFilter, setHomeSpecialFilter] = useState<"tools" | "resources" | null>(null);
  const toggleHomeKindFilter = (kind: string) => {
    setHomeSpecialFilter(null);
    setHomeKindFilter((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  };
  const toggleHomeTierFilter = (tier: number) =>
    setHomeTierFilter((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  const toggleHomeSpecialFilter = (mode: "tools" | "resources") => {
    setHomeKindFilter([]);
    setHomeSpecialFilter((prev) => (prev === mode ? null : mode));
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelectItem = useCallback((key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectResource = useCallback((key: string) => {
    const rk = `res:${key}`;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rk)) next.delete(rk);
      else next.add(rk);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const enterSelectModeResource = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([`res:${id}`]));
  }, []);

  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});
  const [toolTierInfo, setToolTierInfo] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    getItemCatalog().then(setItemCatalogTierInfo).catch(() => setItemCatalogTierInfo({}));
    getToolCatalog().then(setToolTierInfo).catch(() => setToolTierInfo({}));
  }, []);
  const mergedCatalogTierInfo = useMemo<BlueprintTierInfo>(
    () => ({ ...itemCatalogTierInfo, ...toolTierInfo }),
    [itemCatalogTierInfo, toolTierInfo]
  );

  // Shared cached catalog - for showing packed raw/processed materials in a home backpack popup.
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});
  useEffect(() => {
    getResourceCatalog().then(setResourceTierInfo).catch(() => setResourceTierInfo({}));
  }, []);

  // Checked by familyId, not by "Back"/"Side" in slotRef - see BodyTab.tsx's
  // identical check for why (other families can occupy those slot names
  // too). Also counts a home-located backpack, not just a worn one - see
  // BodyTab's identical check for why.
  const hasBackpackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "home") && instance.familyId === "backpack"
  );
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "home") && instance.familyId === "saddlepack"
  );

  // Camp holds two different kinds of things, same split as the Vault
  // tab's own combining logic (see VaultTab.tsx's playerItemsCombined):
  // flat-count crafted goods (gear.itemBalances.home) and individually-
  // tracked item instances sitting at location:"home" - e.g. whatever
  // unequip_item just dropped here because this character is out on an
  // adventure. Without folding the instances in too, anything unequipped
  // mid-adventure would be correctly stored but never show up here.
  const homeBalances = (storageType === "rest" ? character.gear.itemBalances.rest : character.gear.itemBalances.home) ?? EMPTY_HOME;
  const homeInstances = character.gear.items.filter((instance) => instance.location === storageType);

  const { homeInstanceLookupIds, homeInstanceQuality, homeLocations, homeCombined, homeIds } = useMemo(() => {
    const lookupIds: Record<string, string> = {};
    const rowBalances: Record<string, number> = {};
    const quality: Record<string, number | null> = {};
    const locations: Record<string, "home" | "rest"> = {};
    for (const instance of homeInstances) {
      lookupIds[instance.instanceId] = instance.itemId;
      rowBalances[instance.instanceId] = 1;
      quality[instance.instanceId] = instance.quality;
      locations[instance.instanceId] = storageType;
    }
    const combined: Record<string, number> = { ...homeBalances, ...rowBalances };
    const ids = Object.keys(combined).filter((id) => combined[id] > 0);
    for (const id of Object.keys(homeBalances)) {
      locations[id] = storageType;
    }
    return {
      homeInstanceLookupIds: lookupIds,
      homeInstanceQuality: quality,
      homeLocations: locations,
      homeCombined: combined,
      homeIds: ids,
    };
  }, [homeInstances, homeBalances, storageType]);

  // Raw/processed materials sitting loose at home - e.g. the backpack-full
  // fallback of check_out_resource_to_backpack, or an explicit "move to
  // home" out of the backpack (see ResourcePopup's own "home" destination).
  const homeResourceBalances = (storageType === "rest" ? character.gear.itemBalances.rest : character.gear.itemBalances.home) ?? EMPTY_HOME;
  const hasHomeResources = Object.values(homeResourceBalances).some((qty) => qty > 0);

  // dropped.png (lower-left flavor icon), the campfire lit/unlit swap, the
  // tent's own dimming, and the ambient sound below all treat home as
  // "active" the moment it holds EITHER kind of thing sitting here -
  // itemBalances/instances (homeIds) or raw/processed materials
  // (homeResourceBalances) - not just the former. Same emptiness check the
  // grid's own emptyLabel falls back to for homeIds specifically, so that
  // and this stay in agreement (both react live to the last thing leaving
  // home, or to opening an already-empty home).
  const hasHomeItems = homeIds.length > 0 || hasHomeResources;

  // Tracks hasHomeItems live, not just at open - one ambient loop or the
  // other is always playing (HOME_ITEMS_SOUND with something here,
  // HOME_EMPTY_SOUND's night wind otherwise), switching the moment
  // hasHomeItems itself flips (the last item leaving home, or the first
  // one landing while already standing here - same trigger dropped.png/
  // campfire_lit.png already react to), same trigger HomeView unmounting
  // outright (leaving home) already stops it on too. Only re-runs when
  // hasHomeItems/muted actually flip, not on every render where
  // quantities change but home's emptiness doesn't - useEffect's own
  // dependency comparison already skips re-firing when hasHomeItems
  // stays the same boolean across renders.
  useEffect(() => {
    if (muted) return;
    const audio = new Audio(hasHomeItems ? HOME_ITEMS_SOUND : HOME_EMPTY_SOUND);
    audio.loop = true;
    // The night-wind loop reads as a lot more present than the campfire
    // one at the same volume - toned down on its own rather than
    // touching HOME_ITEMS_SOUND's own level.
    if (!hasHomeItems) audio.volume = 0.5;
    audio.play().catch(() => {
      // Autoplay can still be blocked without a preceding user gesture in
      // some browsers - opening home is itself a click, so this should
      // normally succeed, but fail silently either way rather than an
      // unhandled promise rejection.
    });
    return () => {
      fadeOutAudio(audio);
    };
  }, [hasHomeItems, muted]);

  // A family:"backpack" instance sitting unequipped in home (e.g. this
  // character unequipped it here, still holding whatever was packed in it
  // - see Character.gear's own docstring on why storage is character-
  // level, not tied to a specific instance) can be opened the same way
  // the worn one can on the Body tab - see ItemGrid's identical props.
  const packedItems = {
    tierInfo: mergedCatalogTierInfo,
    resourceTierInfo,
    ...computeBackpackContents(character),
  };

  const saddlepackPackedItems = {
    tierInfo: mergedCatalogTierInfo,
    resourceTierInfo,
    ...computeSaddlepackContents(character),
  };

  const cartContents = computeCartContents(character);
  const cartPackedItems = {
    tierInfo: mergedCatalogTierInfo,
    resourceTierInfo,
    ...cartContents,
  };

  const hasCartItems =
    cartContents.ids.length > 0 ||
    Object.values(cartContents.resourceBalances).some((qty) => qty > 0);

  const cartIconOverrides: Record<string, string> = {};
  if (hasCartItems) {
    for (const instance of homeInstances) {
      if (instance.familyId === "cart") {
        const icon = mergedCatalogTierInfo[instance.itemId]?.icon;
        if (icon) cartIconOverrides[instance.itemId] = icon.replace("/cart_t", "/cart_filled_t");
      }
    }
  }

  const selectionHasContainer = useMemo(() => {
    if (selectedIds.size === 0) return false;
    const blockedFamilies = new Set(["backpack", "saddlepack", "cart"]);
    const isBlocked = (fam: string) =>
      blockedFamilies.has(fam) || fam.endsWith("_mount") || fam.endsWith("_companion");
    for (const id of selectedIds) {
      if (homeInstanceLookupIds[id] !== undefined) {
        const inst = homeInstances.find((i) => i.instanceId === id);
        if (inst && isBlocked(inst.familyId)) return true;
      } else {
        const baseId = id.replace(/#\d+$/, "").replace(/^res:/, "");
        const info = mergedCatalogTierInfo[baseId];
        if (info && isBlocked(info.familyId)) return true;
      }
    }
    return false;
  }, [selectedIds, homeInstanceLookupIds, homeInstances, mergedCatalogTierInfo]);

  const batchMoveHome = useCallback(
    async (destination: "vault" | "backpack" | "saddlepack" | "cart") => {
      if (batchBusy || selectedIds.size === 0) return;
      setBatchBusy(true);
      const instanceIds: string[] = [];
      const balanceTotals = new Map<string, number>();
      for (const raw of selectedIds) {
        if (raw.startsWith("res:")) {
          const stripped = raw.slice(4);
          const resId = stripStackSuffix(stripped);
          if (!resourceTierInfo[resId]) continue;
          const qty = homeResourceBalances[resId] ?? 0;
          if (qty > 0) balanceTotals.set(resId, (balanceTotals.get(resId) ?? 0) + qty);
        } else if (homeInstanceLookupIds[stripStackSuffix(raw)] !== undefined) {
          const key = stripStackSuffix(raw);
          if (!balanceTotals.has(key)) instanceIds.push(key);
        } else {
          const id = stripStackSuffix(raw);
          const info = mergedCatalogTierInfo[id];
          const stackSize = Math.max(1, info?.stackSize ?? 1);
          const qty = homeCombined[id] ?? 0;
          const hash = raw.lastIndexOf("#");
          const tileIdx = hash === -1 ? 0 : parseInt(raw.slice(hash + 1), 10);
          const itemsInTile = Math.max(0, Math.min(stackSize, qty - tileIdx * stackSize));
          if (itemsInTile > 0) balanceTotals.set(id, (balanceTotals.get(id) ?? 0) + itemsInTile);
        }
      }
      const balances = Array.from(balanceTotals, ([id, amount]) => ({ id, amount }));
      const r = await postJson(
        `/api/auth/me/characters/${character.id}/${storageType}/bulk-move`,
        { destination, instanceIds, balances }
      );
      if (r.ok) onPlayerDataUpdated?.(r.data);
      setBatchBusy(false);
      exitSelectMode();
    },
    [batchBusy, selectedIds, homeResourceBalances, homeInstanceLookupIds, homeCombined, mergedCatalogTierInfo, resourceTierInfo, character.id, onPlayerDataUpdated, exitSelectMode]
  );

  const batchDestroyHome = useCallback(async () => {
    if (batchBusy || selectedIds.size === 0) return;
    setBatchBusy(true);
    let lastResult: RawPlayerData | null = null;
    const instancesSeen = new Set<string>();
    const balanceTotals = new Map<string, number>();
    for (const raw of selectedIds) {
      if (raw.startsWith("res:")) {
        const resId = stripStackSuffix(raw.slice(4));
        if (!resourceTierInfo[resId]) continue;
        const qty = homeResourceBalances[resId] ?? 0;
        if (qty > 0) balanceTotals.set(resId, (balanceTotals.get(resId) ?? 0) + qty);
        continue;
      }
      const id = stripStackSuffix(raw);
      const isInstance = homeInstanceLookupIds[id] !== undefined;
      if (isInstance) {
        instancesSeen.add(id);
      } else {
        const info = mergedCatalogTierInfo[id];
        const stackSize = Math.max(1, info?.stackSize ?? 1);
        const qty = homeCombined[id] ?? 0;
        const hash = raw.lastIndexOf("#");
        const tileIdx = hash === -1 ? 0 : parseInt(raw.slice(hash + 1), 10);
        const itemsInTile = Math.max(0, Math.min(stackSize, qty - tileIdx * stackSize));
        if (itemsInTile > 0) balanceTotals.set(id, (balanceTotals.get(id) ?? 0) + itemsInTile);
      }
    }
    for (const id of instancesSeen) {
      const r = await postJson(
        `/api/auth/me/characters/${character.id}/items/${id}/destroy-from-character`
      );
      if (r.ok) lastResult = r.data;
    }
    for (const [id, amount] of balanceTotals) {
      const r = await postJson(
        `/api/auth/me/characters/${character.id}/item-balances/${id}/destroy-from-character`,
        { amount }
      );
      if (r.ok) lastResult = r.data;
    }
    if (lastResult) onPlayerDataUpdated?.(lastResult);
    setBatchBusy(false);
    exitSelectMode();
  }, [batchBusy, selectedIds, homeInstanceLookupIds, homeCombined, homeResourceBalances, resourceTierInfo, mergedCatalogTierInfo, character.id, onPlayerDataUpdated, exitSelectMode]);

  return (
    <div className={styles.panel} onContextMenu={(e) => e.preventDefault()}>
      {selectMode && (
        <div className={styles.selectionBar}>
          <div className={styles.selectionBarActions}>
            {hasBackpackEquipped && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to backpack"
                disabled={batchBusy || selectedIds.size === 0 || selectionHasContainer}
                onClick={() => batchMoveHome("backpack")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }} />
              </button>
            )}
            {hasSaddlepackEquipped && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to saddlepack"
                disabled={batchBusy || selectedIds.size === 0 || selectionHasContainer}
                onClick={() => batchMoveHome("saddlepack")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }} />
              </button>
            )}
            {character.gear.cartCapacity > 0 && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to cart"
                disabled={batchBusy || selectedIds.size === 0 || selectionHasContainer}
                onClick={() => batchMoveHome("cart")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${CART_ACTION_ICON})` }} />
              </button>
            )}
            {!character.availability.inAdventure && storageType !== "rest" && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to vault"
                disabled={batchBusy || selectedIds.size === 0}
                onClick={() => batchMoveHome("vault")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${VAULT_ACTION_ICON})` }} />
              </button>
            )}
            <div className={styles.selectionBarGap} />
            <button
              type="button"
              className={styles.selectionBarBtn}
              title="Salvage selected"
              disabled={batchBusy || selectedIds.size === 0}
              onClick={() => setShowSalvagePopup(true)}
            >
              <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(/images/character/chopping_block.png)` }} />
            </button>
          </div>
          <span className={styles.selectionBarWeight}>
            W: {selectionWeight(selectedIds, mergedCatalogTierInfo, homeCombined, homeInstanceLookupIds, homeResourceBalances, resourceTierInfo)}
          </span>
          <button
            type="button"
            className={`${styles.selectionBarBtn} ${styles.selectionBarClose}`}
            title="Select all"
            onClick={() => {
              const specialKinds = new Set(["tool", "raw_resource", "processed"]);
              const hasKF = homeKindFilter.length > 0;
              const hasTF = homeTierFilter.length > 0;
              const noFilter = !hasKF && !hasTF && !homeSpecialFilter;
              const visibleIds = homeSpecialFilter === "tools"
                ? homeIds.filter((id) => {
                    const info = mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id];
                    if (!info || info.kind !== "tool") return false;
                    return !hasTF || (info.tier !== undefined && homeTierFilter.includes(info.tier));
                  })
                : homeSpecialFilter === "resources"
                ? []
                : noFilter
                ? homeIds.filter((id) => {
                    const kind = mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id]?.kind;
                    return !kind || !specialKinds.has(kind);
                  })
                : homeIds.filter((id) => {
                    const info = mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id];
                    if (hasKF && (!info?.kind || !homeKindFilter.includes(info.kind))) return false;
                    if (hasTF && (!info?.tier || !homeTierFilter.includes(info.tier))) return false;
                    return true;
                  });
              const all = new Set<string>();
              for (const id of visibleIds) {
                const isInstance = homeInstanceLookupIds[id] !== undefined;
                if (isInstance) {
                  all.add(id);
                } else {
                  all.add(`${id}#0`);
                }
              }
              if (homeSpecialFilter === "resources") {
                const resBalances = hasTF
                  ? Object.fromEntries(Object.entries(homeResourceBalances).filter(([id]) => {
                      const t = resourceTierInfo[id]?.tier;
                      return t !== undefined && homeTierFilter.includes(t);
                    }))
                  : homeResourceBalances;
                for (const resId of Object.keys(resBalances)) {
                  const qty = resBalances[resId] ?? 0;
                  if (qty <= 0 || !resourceTierInfo[resId]) continue;
                  all.add(`res:${resId}#0`);
                }
              }
              setSelectedIds(all);
            }}
          >
            A
          </button>
          <button
            type="button"
            className={`${styles.selectionBarBtn} ${styles.selectionBarClose}`}
            title="Cancel selection"
            onClick={exitSelectMode}
          >
            &#x2715;
          </button>
        </div>
      )}
      {confirmDestroy && (
        <div className={styles.confirmDestroyOverlay} onClick={() => setConfirmDestroy(false)}>
          <div className={styles.confirmDestroyCard} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmDestroyText}>
              Destroy {selectedIds.size} selected?
            </p>
            <div className={styles.confirmDestroyButtons}>
              <button
                type="button"
                className={styles.confirmDestroyCancel}
                onClick={() => setConfirmDestroy(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDestroyConfirm}
                onClick={() => { setConfirmDestroy(false); batchDestroyHome(); }}
              >
                Destroy
              </button>
            </div>
          </div>
        </div>
      )}
      {showSalvagePopup && (
        <ChopBlockPopup
          characterId={character.id}
          onPlayerDataUpdated={(data) => { onPlayerDataUpdated?.(data); exitSelectMode(); }}
          onClose={() => setShowSalvagePopup(false)}
          preSelectedIds={new Set([...selectedIds].filter((k) => !k.startsWith("res:")).map(stripStackSuffix))}
          source={storageType}
        />
      )}
      {(batchBusy || homeActionBusy) && (
        <div className={styles.batchLoadingOverlay}>
          <div className={styles.batchSpinner} />
        </div>
      )}
      {(() => {
        const kindOrder = ["weapon", "armor", "shield", "food", "potion", "adventuring_gear", "essentials", "companion", "mount"];
        const specialKinds = new Set(["tool", "raw_resource", "processed"]);
        const kindsInCamp = new Set(
          homeIds
            .map((id) => mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id]?.kind)
            .filter((k): k is string => !!k && !specialKinds.has(k))
        );
        const hasTools = homeIds.some((id) => mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id]?.kind === "tool");
        const hasResources = Object.values(homeResourceBalances).some((qty) => qty > 0);
        const hasKindFilter = homeKindFilter.length > 0;
        const hasTierFilter = homeTierFilter.length > 0;
        const allActive = !hasKindFilter && !hasTierFilter && !homeSpecialFilter;
        const filteredIds = allActive
          ? homeIds.filter((id) => {
              const kind = mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id]?.kind;
              return !kind || !specialKinds.has(kind);
            })
          : homeSpecialFilter === "tools"
            ? homeIds.filter((id) => {
                const info = mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id];
                if (!info || info.kind !== "tool") return false;
                return !hasTierFilter || (info.tier !== undefined && homeTierFilter.includes(info.tier));
              })
            : homeSpecialFilter === "resources"
            ? []
            : homeIds.filter((id) => {
                const info = mergedCatalogTierInfo[homeInstanceLookupIds[id] ?? id];
                if (hasKindFilter && (!info?.kind || !homeKindFilter.includes(info.kind))) return false;
                if (hasTierFilter && (!info?.tier || !homeTierFilter.includes(info.tier))) return false;
                return true;
              });
        const showResources = homeSpecialFilter === "resources";
        const filteredResourceBalances = !showResources
          ? EMPTY_HOME
          : hasTierFilter
            ? Object.fromEntries(Object.entries(homeResourceBalances).filter(([id, qty]) => {
                if (qty <= 0) return false;
                const t = resourceTierInfo[id]?.tier;
                return t !== undefined && homeTierFilter.includes(t);
              }))
            : homeResourceBalances;
        return (
          <>
            {(homeIds.length > 0 || hasHomeResources) && !selectMode && (
              <div className={styles.vaultFilterBar}>
                <div className={styles.vaultFilterGroup}>
                  <button
                    type="button"
                    className={`${styles.vaultFilterBtn} ${allActive ? styles.vaultFilterBtnActive : ""}`}
                    onClick={() => { setHomeKindFilter([]); setHomeTierFilter([]); setHomeSpecialFilter(null); }}
                    title="All"
                  >A</button>
                  {[1, 2, 3, 4, 5, 6].map((tier) => (
                    <button
                      key={`t${tier}`}
                      type="button"
                      className={`${styles.vaultFilterBtn} ${styles[`vaultFilterT${tier}` as keyof typeof styles] ?? ""} ${homeTierFilter.includes(tier) ? styles.vaultFilterBtnActive : ""}`}
                      onClick={() => toggleHomeTierFilter(tier)}
                      title={`Tier ${tier}`}
                    ><span>{getTierIndicator(tier)}</span></button>
                  ))}
                  <button
                    type="button"
                    className={`${styles.vaultFilterBtn} ${styles.vaultFilterBtnTools} ${homeSpecialFilter === "tools" ? styles.vaultFilterBtnActive : ""}`}
                    onClick={() => toggleHomeSpecialFilter("tools")}
                    title="Tools"
                    style={!hasTools ? { opacity: 0.3 } : undefined}
                  >🔧</button>
                  <button
                    type="button"
                    className={`${styles.vaultFilterBtn} ${styles.vaultFilterBtnResources} ${homeSpecialFilter === "resources" ? styles.vaultFilterBtnActive : ""}`}
                    onClick={() => toggleHomeSpecialFilter("resources")}
                    title="Resources"
                    style={!hasResources ? { opacity: 0.3 } : undefined}
                  >🪨</button>
                </div>
                {kindOrder.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`${styles.vaultFilterBtn} ${homeKindFilter.includes(kind) ? styles.vaultFilterBtnActive : ""}`}
                    onClick={() => toggleHomeKindFilter(kind)}
                    title={kind.replace(/_/g, " ")}
                    style={!kindsInCamp.has(kind) ? { opacity: 0.3 } : undefined}
                  >{getKindIcon(kind)}</button>
                ))}
              </div>
            )}
            <ItemGrid
              ids={filteredIds}
              emptyLabel={allActive ? (storageType === "rest" ? "Nothing stashed here yet." : "Nothing sitting at home right now.") : "No items match."}
              tierInfo={mergedCatalogTierInfo}
              balances={homeCombined}
              lookupIds={homeInstanceLookupIds}
              instanceQuality={homeInstanceQuality}
              instanceLocations={homeLocations}
              source="character"
              hasBackpackEquipped={hasBackpackEquipped}
              hasSaddlepackEquipped={hasSaddlepackEquipped}
              hasMountEquipped={character.gear.items.some((i) => i.location === "body" && i.slotRef?.includes("Mount"))}
              hasCompanionEquipped={character.gear.items.some((i) => i.location === "body" && i.slotRef?.includes("Companion"))}
              inAdventure={character.availability.inAdventure}
              characterId={character.id}
              onPlayerDataUpdated={onPlayerDataUpdated}
              reserveBottomPx={CAMPFIRE_AREA_PX}
              hideScrollbar
              packedItems={packedItems}
              saddlepackPackedItems={saddlepackPackedItems}
              cartPackedItems={cartPackedItems}
              backpackSlotsUsed={character.gear.backpackSlotsUsed}
              backpackCapacity={character.gear.backpackCapacity}
              saddlepackSlotsUsed={character.gear.saddlepackSlotsUsed}
              saddlepackCapacity={character.gear.saddlepackCapacity}
              cartSlotsUsed={character.gear.cartSlotsUsed}
              cartCapacity={character.gear.cartCapacity}
              mountCarryWeightUsed={character.gear.mountCarryWeightUsed}
              mountCarryWeightCapacity={character.gear.mountCarryWeightCapacity}
              resourceBalances={showResources ? filteredResourceBalances : EMPTY_HOME}
              resourceTierInfo={resourceTierInfo}
              resourceUrlPrefix={(id) => `/api/auth/me/characters/${character.id}/item-balances/${id}`}
              resourceDestinations={[
                ...(hasBackpackEquipped
                  ? [{ key: "backpack", icon: BACKPACK_ACTION_ICON, label: "Backpack", endpoint: `${storageType}-to-backpack` }]
                  : []),
                ...(!character.availability.inAdventure && storageType !== "rest"
                  ? [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "to-vault" }]
                  : []),
              ]}
              storageType={storageType}
              iconOverrides={Object.keys(cartIconOverrides).length > 0 ? cartIconOverrides : undefined}
              selectMode={selectMode}
              selectBusy={batchBusy}
              selectedIds={selectedIds}
              onLongPressItem={enterSelectMode}
              onToggleSelectItem={toggleSelectItem}
              onLongPressResource={enterSelectModeResource}
              onToggleSelectResource={toggleSelectResource}
              skipResourceStackSplit
              skipItemStackSplit
            />
          </>
        );
      })()}
      <div className={styles.campfireStage} style={{ height: CAMPFIRE_AREA_PX, bottom: footerVisible ? Math.max(0, footerBottomPx - 8) : 0 }}>
        {/* Fire's position/size are relative to THIS group (i.e. to the
            tent itself - see .campfireStageFireIcon), not to .campfireStage's
            own corner, so moving/resizing the tent carries the fire along
            with it instead of the two drifting apart. */}
        <div className={styles.homeTentGroup}>
          {/* Lit/unlit toggle, same idea as dropped.png below (though this
              one never disappears, just swaps art) - lit whenever home
              actually holds something, unlit when hasHomeItems is false.
              Only the lit state is clickable (opens the "Burn All" popup) -
              nothing to burn while it's unlit, so that version stays
              purely decorative (see .campfireStageFireIconLit's own
              pointer-events:auto, the base rule keeps pointer-events:none). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hasHomeItems ? "/images/character/campfire_lit.png" : "/images/character/campfire_unlit.png"}
            alt=""
            role={hasHomeItems ? "button" : undefined}
            tabIndex={hasHomeItems ? 0 : undefined}
            title={hasHomeItems ? "Burn everything in home" : undefined}
            aria-label={hasHomeItems ? "Burn everything in home" : undefined}
            onClick={hasHomeItems ? () => { exitSelectMode(); setHomeAction("burn"); } : undefined}
            onKeyDown={
              hasHomeItems
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") { exitSelectMode(); setHomeAction("burn"); }
                  }
                : undefined
            }
            className={
              hasHomeItems
                ? `${styles.campfireStageFireIcon} ${styles.campfireStageFireIconLit}`
                : `${styles.campfireStageFireIcon} ${styles.campfireStageFireIconUnlit}`
            }
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/camp.png"
            alt=""
            className={
              hasHomeItems
                ? styles.campfireStageIcon
                : `${styles.campfireStageIcon} ${styles.campfireStageIconEmpty}`
            }
          />
          {/* Bound to the tent group itself (like .campfireStageFireIcon
              above), not the screen edge - sits right of the tent, easing
              only a little further out on wider screens instead of
              tracking the actual viewport edge. Opens ChopBlockPopup's
              own bulk-salvage popup - only clickable while hasHomeItems,
              same gating as campfire_lit.png/campfire_unlit.png above
              (nothing to salvage with an empty home, so it stays purely
              decorative then, dimmed the same way the tent itself does
              via .campfireStageIconEmpty). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/chopping_block.png"
            alt=""
            role={hasHomeItems ? "button" : undefined}
            tabIndex={hasHomeItems ? 0 : undefined}
            title={hasHomeItems ? "Salvage everything in home" : undefined}
            aria-label={hasHomeItems ? "Salvage everything in home" : undefined}
            onClick={hasHomeItems ? () => { exitSelectMode(); setHomeAction("chop"); } : undefined}
            onKeyDown={
              hasHomeItems
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") { exitSelectMode(); setHomeAction("chop"); }
                  }
                : undefined
            }
            className={
              hasHomeItems
                ? styles.homeChoppingBlockIcon
                : `${styles.homeChoppingBlockIcon} ${styles.homeChoppingBlockIconEmpty}`
            }
          />
        </div>
        {hasHomeItems && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/character/dropped.png"
            alt=""
            role="button"
            tabIndex={0}
            title="Pack everything up"
            aria-label="Pack everything up"
            onClick={() => { exitSelectMode(); setHomeAction("moveAll"); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { exitSelectMode(); setHomeAction("moveAll"); }
            }}
            className={styles.homeDroppedIcon}
          />
        )}
        {homeAction === "burn" && (
          <HoldActionPopup
            headline="Burn All"
            iconClassName={styles.burnAllIcon}
            label="Hold to cast things into flames"
            icon="/images/character/campfire_lit.png"
            tone="destroy"
            characterId={character.id}
            onConfirm={async () => { setHomeActionBusy(true); const r = await postJson(`/api/auth/me/characters/${character.id}/${storageType}/burn-all`); if (!r.ok) setHomeActionBusy(false); return r; }}
            onPlayerDataUpdated={(data) => { setHomeActionBusy(false); onPlayerDataUpdated?.(data); }}
            onClose={() => { setHomeActionBusy(false); setHomeAction(null); }}
          />
        )}
        {homeAction === "moveAll" && (
          <HoldActionPopup
            headline="Store all"
            label="Hold to START PACKING UP"
            subtitle="Fills cart first, then saddlepack, then backpack"
            icon="/images/character/dropped.png"
            tone="move"
            characterId={character.id}
            onConfirm={async () => { setHomeActionBusy(true); const r = await postJson(`/api/auth/me/characters/${character.id}/${storageType}/move-all-to-bags`); if (!r.ok) setHomeActionBusy(false); return r; }}
            onPlayerDataUpdated={(data) => { setHomeActionBusy(false); onPlayerDataUpdated?.(data); }}
            onClose={() => { setHomeActionBusy(false); setHomeAction(null); }}
          />
        )}
        {homeAction === "chop" && (
          <ChopBlockPopup
            characterId={character.id}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setHomeAction(null)}
            source={storageType}
          />
        )}
        <button
          type="button"
          className={styles.homeExitButton}
          title="Back to Body"
          aria-label="Back to Body"
          onClick={onExitHome}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/character/exit.webp" alt="" className={styles.homeExitIcon} />
        </button>
      </div>
    </div>
  );
}

// ChopBlockRow, flattenChopBlockMaterials, and ChopBlockPopup are now
// imported from VaultTab.tsx (shared with the vault's own salvage).

