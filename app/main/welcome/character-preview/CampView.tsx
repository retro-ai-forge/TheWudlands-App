import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./CharacterTabs.module.css";
import {
  BACKPACK_ACTION_ICON,
  ChopBlockPopup,
  HoldActionPopup,
  ItemGrid,
  SADDLEPACK_ACTION_ICON,
  VAULT_ACTION_ICON,
  computeBackpackContents,
  computeSaddlepackContents,
  computeCartContents,
  postJson,
  selectionWeight,
  stripStackSuffix,
  type BlueprintTierInfo,
  type RawPlayerData,
  type ResourceTierInfo,
} from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { useSound } from "../../SoundProvider";

const CAMP_ITEMS_SOUND = "/sounds/campfire_west_wolf.mp3";
// Ambient loop while camp is empty (hasCampItems false) - swapped in for
// CAMP_ITEMS_SOUND above, same loop/mute/cleanup behavior either way
// (see the shared useEffect below), just a quieter night-wind backdrop
// instead of the crackling campfire.
const CAMP_EMPTY_SOUND = "/sounds/camp_night_wind.mp3";

// How long the ambient loop takes to fade to silence before actually
// pausing - covers every way the effect below tears an in-flight loop
// down (hasCampItems flipping, muting, or leaving camp outright), so none
// of them cut the sound off mid-note.
const CAMP_AMBIENT_FADE_MS = 600;
const CAMP_AMBIENT_FADE_STEPS = 12;

function fadeOutAudio(audio: HTMLAudioElement) {
  const startVolume = audio.volume;
  const stepMs = CAMP_AMBIENT_FADE_MS / CAMP_AMBIENT_FADE_STEPS;
  let step = 0;
  const interval = setInterval(() => {
    step += 1;
    if (step >= CAMP_AMBIENT_FADE_STEPS) {
      clearInterval(interval);
      audio.pause();
      return;
    }
    audio.volume = startVolume * (1 - step / CAMP_AMBIENT_FADE_STEPS);
  }, stepMs);
}

// A fixed placeholder height for the campfire art at the bottom of the
// screen - reserved out of ItemGrid's own fill-to-bottom measurement (see
// its reserveBottomPx prop) so the two never fight over the same space.
// camp.png stands in for a real campfire gif until one exists (see
// BodyTab.tsx's own camp button, which opens this view) - same icon, just
// shown much larger here as the screen's own centerpiece instead of a
// small button.
const CAMPFIRE_AREA_PX = 220;

/** Opened by clicking the camp button on the Body tab - this character's
 * own gear.itemBalances.camp (finished goods owned but not yet packed into
 * a backpack/saddlepack) plus any gear.items instances sitting at
 * location:"camp" (e.g. dropped there by unequip_item mid-adventure),
 * styled like the Inventory tab's Vault grid, with a campfire centerpiece
 * filling the lower part of the screen below it. */
export function CampView({
  character,
  onPlayerDataUpdated,
  onExitCamp,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** The lower-right exit.webp button's own handler - takes the player
   * back to the Body tab. CharacterPreview.tsx hides its own fixed
   * footer bar (tab row + its own exit.webp close button) while this
   * view is open, so this is the only way out of it once opened. */
  onExitCamp: () => void;
}) {
  const { muted } = useSound();

  // Which camp-wide bulk action popup is open, if any - the lit campfire
  // opens "burn" (HoldActionPopup's own Burn All), the dropped-items icon
  // opens "moveAll" (Move all to backpack), the chopping block opens
  // "chop" (ChopBlockPopup's own bulk salvage). The fire/dropped icons
  // aren't clickable at all unless hasCampItems (see their own render
  // guards below); the chopping block is always clickable (its own
  // preview list is simply empty when there's nothing recyclable), so
  // there's nothing to gate here beyond which of the three was clicked.
  const [campAction, setCampAction] = useState<"burn" | "moveAll" | "chop" | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [showSalvagePopup, setShowSalvagePopup] = useState(false);

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

  // Same item-catalog fetch BodyTab.tsx/InventoryTab.tsx each already do
  // independently for their own tierInfo - no shared ancestor state to
  // lift this into without a larger prop-threading change.
  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    fetch("/api/auth/item-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (
          data: Array<{
            id: string;
            name: string;
            familyId: string;
            tier: number;
            kind: string[];
            qualityMax: number | null;
            armorClass: number | null;
            icon: string;
            stackSize: number;
            description: string;
            sizeClass: string;
            equipSlots: string[][];
            backpackable: boolean;
            gatheringBonuses: string[];
            capacitySlots: number;
            carryCapacity: number;
          }>
        ) => {
          const map: BlueprintTierInfo = {};
          for (const item of data) {
            map[item.id] = {
              tier: item.tier,
              familyId: item.familyId,
              kind: item.kind[0] ?? "",
              name: item.name,
              qualityMax: item.qualityMax,
              armorClass: item.armorClass,
              icon: item.icon,
              stackSize: item.stackSize,
              description: item.description,
              sizeClass: item.sizeClass,
              equipSlots: item.equipSlots,
              backpackable: item.backpackable,
              gatheringBonuses: item.gatheringBonuses,
              capacitySlots: item.capacitySlots,
              carryCapacity: item.carryCapacity,
            };
          }
          setItemCatalogTierInfo(map);
        }
      )
      .catch(() => setItemCatalogTierInfo({}));
  }, []);

  // Same resource-catalog fetch InventoryTab.tsx already does independently
  // for its own resourceTierInfo - needed here too now that a camp-located
  // backpack's popup can show packed raw/processed materials (see
  // packedItems below), not just packed items.
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});
  useEffect(() => {
    fetch("/api/auth/resource-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (
          data: Array<{
            id: string;
            name: string;
            familyId: string;
            tier: number;
            resourceFamily: string;
            category: "raw" | "processed";
          }>
        ) => {
          const map: ResourceTierInfo = {};
          for (const item of data) {
            map[item.id] = { tier: item.tier, family: item.resourceFamily, category: item.category, name: item.name };
          }
          setResourceTierInfo(map);
        }
      )
      .catch(() => setResourceTierInfo({}));
  }, []);

  // Checked by familyId, not by "Back"/"Side" in slotRef - see BodyTab.tsx's
  // identical check for why (other families can occupy those slot names
  // too). Also counts a camp-located backpack, not just a worn one - see
  // BodyTab's identical check for why.
  const hasBackpackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "backpack"
  );
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "saddlepack"
  );

  // Camp holds two different kinds of things, same split as the Vault
  // tab's own combining logic (see InventoryTab.tsx's playerItemsCombined):
  // flat-count crafted goods (gear.itemBalances.camp) and individually-
  // tracked item instances sitting at location:"camp" - e.g. whatever
  // unequip_item just dropped here because this character is out on an
  // adventure. Without folding the instances in too, anything unequipped
  // mid-adventure would be correctly stored but never show up here.
  const campBalances = character.gear.itemBalances.camp;
  const campInstances = character.gear.items.filter((instance) => instance.location === "camp");

  const { campInstanceLookupIds, campInstanceQuality, campLocations, campCombined, campIds } = useMemo(() => {
    const lookupIds: Record<string, string> = {};
    const rowBalances: Record<string, number> = {};
    const quality: Record<string, number | null> = {};
    const locations: Record<string, "camp"> = {};
    for (const instance of campInstances) {
      lookupIds[instance.instanceId] = instance.itemId;
      rowBalances[instance.instanceId] = 1;
      quality[instance.instanceId] = instance.quality;
      locations[instance.instanceId] = "camp";
    }
    const combined: Record<string, number> = { ...campBalances, ...rowBalances };
    const ids = Object.keys(combined).filter((id) => combined[id] > 0);
    for (const id of Object.keys(campBalances)) {
      locations[id] = "camp";
    }
    return {
      campInstanceLookupIds: lookupIds,
      campInstanceQuality: quality,
      campLocations: locations,
      campCombined: combined,
      campIds: ids,
    };
  }, [campInstances, campBalances]);

  // Raw/processed materials sitting loose at camp - e.g. the backpack-full
  // fallback of check_out_resource_to_backpack, or an explicit "move to
  // camp" out of the backpack (see ResourcePopup's own "camp" destination).
  const campResourceBalances = character.gear.resources.camp;
  const hasCampResources = Object.values(campResourceBalances).some((qty) => qty > 0);

  // dropped.png (lower-left flavor icon), the campfire lit/unlit swap, the
  // tent's own dimming, and the ambient sound below all treat camp as
  // "active" the moment it holds EITHER kind of thing sitting here -
  // itemBalances/instances (campIds) or raw/processed materials
  // (campResourceBalances) - not just the former. Same emptiness check the
  // grid's own emptyLabel falls back to for campIds specifically, so that
  // and this stay in agreement (both react live to the last thing leaving
  // camp, or to opening an already-empty camp).
  const hasCampItems = campIds.length > 0 || hasCampResources;

  // Tracks hasCampItems live, not just at open - one ambient loop or the
  // other is always playing (CAMP_ITEMS_SOUND with something here,
  // CAMP_EMPTY_SOUND's night wind otherwise), switching the moment
  // hasCampItems itself flips (the last item leaving camp, or the first
  // one landing while already standing here - same trigger dropped.png/
  // campfire_lit.png already react to), same trigger CampView unmounting
  // outright (leaving camp) already stops it on too. Only re-runs when
  // hasCampItems/muted actually flip, not on every render where
  // quantities change but camp's emptiness doesn't - useEffect's own
  // dependency comparison already skips re-firing when hasCampItems
  // stays the same boolean across renders.
  useEffect(() => {
    if (muted) return;
    const audio = new Audio(hasCampItems ? CAMP_ITEMS_SOUND : CAMP_EMPTY_SOUND);
    audio.loop = true;
    // The night-wind loop reads as a lot more present than the campfire
    // one at the same volume - toned down on its own rather than
    // touching CAMP_ITEMS_SOUND's own level.
    if (!hasCampItems) audio.volume = 0.5;
    audio.play().catch(() => {
      // Autoplay can still be blocked without a preceding user gesture in
      // some browsers - opening camp is itself a click, so this should
      // normally succeed, but fail silently either way rather than an
      // unhandled promise rejection.
    });
    return () => {
      fadeOutAudio(audio);
    };
  }, [hasCampItems, muted]);

  // A family:"backpack" instance sitting unequipped in camp (e.g. this
  // character unequipped it here, still holding whatever was packed in it
  // - see Character.gear's own docstring on why storage is character-
  // level, not tied to a specific instance) can be opened the same way
  // the worn one can on the Body tab - see ItemGrid's identical props.
  const packedItems = {
    tierInfo: itemCatalogTierInfo,
    resourceTierInfo,
    ...computeBackpackContents(character),
  };

  const saddlepackPackedItems = {
    tierInfo: itemCatalogTierInfo,
    resourceTierInfo,
    ...computeSaddlepackContents(character),
  };

  const cartContents = computeCartContents(character);
  const cartPackedItems = {
    tierInfo: itemCatalogTierInfo,
    resourceTierInfo,
    ...cartContents,
  };

  const hasCartItems =
    cartContents.ids.length > 0 ||
    Object.values(cartContents.resourceBalances).some((qty) => qty > 0);

  const cartIconOverrides: Record<string, string> = {};
  if (hasCartItems) {
    for (const instance of campInstances) {
      if (instance.familyId === "cart") {
        const icon = itemCatalogTierInfo[instance.itemId]?.icon;
        if (icon) cartIconOverrides[instance.itemId] = icon.replace("/cart_t", "/cart_filled_t");
      }
    }
  }

  const batchMoveCamp = useCallback(
    async (destination: "vault" | "backpack" | "saddlepack") => {
      if (batchBusy || selectedIds.size === 0) return;
      setBatchBusy(true);
      const instanceIds: string[] = [];
      const balances: { id: string; amount: number }[] = [];
      const resources: { id: string; amount: number }[] = [];
      const seen = new Set<string>();
      for (const raw of selectedIds) {
        const key = raw.startsWith("res:") ? raw : stripStackSuffix(raw);
        if (seen.has(key)) continue;
        seen.add(key);
        if (key.startsWith("res:")) {
          const resId = stripStackSuffix(key.slice(4));
          const amount = campResourceBalances[resId] ?? 0;
          if (amount > 0) resources.push({ id: resId, amount });
        } else if (campInstanceLookupIds[key] !== undefined) {
          instanceIds.push(key);
        } else {
          const amount = campCombined[key] ?? 0;
          if (amount > 0) balances.push({ id: key, amount });
        }
      }
      const r = await postJson(
        `/api/auth/me/characters/${character.id}/camp/bulk-move`,
        { destination, instanceIds, balances, resources }
      );
      if (r.ok) onPlayerDataUpdated?.(r.data);
      setBatchBusy(false);
      exitSelectMode();
    },
    [batchBusy, selectedIds, campResourceBalances, campInstanceLookupIds, campCombined, character.id, onPlayerDataUpdated, exitSelectMode]
  );

  const batchDestroyCamp = useCallback(async () => {
    if (batchBusy || selectedIds.size === 0) return;
    setBatchBusy(true);
    let lastResult: RawPlayerData | null = null;
    const seen = new Set<string>();
    for (const raw of selectedIds) {
      if (raw.startsWith("res:")) continue;
      const key = stripStackSuffix(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      const isInstance = campInstanceLookupIds[key] !== undefined;
      if (isInstance) {
        const r = await postJson(
          `/api/auth/me/characters/${character.id}/items/${key}/destroy-from-character`
        );
        if (r.ok) lastResult = r.data;
      } else {
        const amount = campCombined[key] ?? 0;
        if (amount <= 0) continue;
        const r = await postJson(
          `/api/auth/me/characters/${character.id}/item-balances/${key}/destroy-from-character`,
          { amount }
        );
        if (r.ok) lastResult = r.data;
      }
    }
    if (lastResult) onPlayerDataUpdated?.(lastResult);
    setBatchBusy(false);
    exitSelectMode();
  }, [batchBusy, selectedIds, campInstanceLookupIds, campCombined, character.id, onPlayerDataUpdated, exitSelectMode]);

  return (
    <div className={styles.panel}>
      {selectMode && (
        <div className={styles.selectionBar}>
          <div className={styles.selectionBarActions}>
            {!character.availability.inAdventure && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to vault"
                disabled={batchBusy || selectedIds.size === 0}
                onClick={() => batchMoveCamp("vault")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${VAULT_ACTION_ICON})` }} />
              </button>
            )}
            {hasBackpackEquipped && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to backpack"
                disabled={batchBusy || selectedIds.size === 0}
                onClick={() => batchMoveCamp("backpack")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }} />
              </button>
            )}
            {hasSaddlepackEquipped && (
              <button
                type="button"
                className={styles.selectionBarBtn}
                title="Move to saddlepack"
                disabled={batchBusy || selectedIds.size === 0}
                onClick={() => batchMoveCamp("saddlepack")}
              >
                <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }} />
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
            <button
              type="button"
              className={styles.selectionBarBtn}
              title="Destroy selected"
              disabled={batchBusy || selectedIds.size === 0}
              onClick={() => setConfirmDestroy(true)}
            >
              <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(/images/character/campfire_lit.png)` }} />
            </button>
          </div>
          <span className={styles.selectionBarWeight}>
            Weight: {selectionWeight(selectedIds, itemCatalogTierInfo, campCombined, campInstanceLookupIds, campResourceBalances, resourceTierInfo)}
          </span>
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
                onClick={() => { setConfirmDestroy(false); batchDestroyCamp(); }}
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
        />
      )}
      <ItemGrid
        ids={campIds}
        emptyLabel="Nothing sitting at camp right now."
        tierInfo={itemCatalogTierInfo}
        balances={campCombined}
        lookupIds={campInstanceLookupIds}
        instanceQuality={campInstanceQuality}
        instanceLocations={campLocations}
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
        resourceBalances={campResourceBalances}
        resourceTierInfo={resourceTierInfo}
        resourceDestinations={[
          ...(hasBackpackEquipped
            ? [{ key: "backpack", icon: BACKPACK_ACTION_ICON, label: "Backpack", endpoint: "stow" }]
            : []),
          ...(!character.availability.inAdventure
            ? [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "check-in-camp" }]
            : []),
        ]}
        iconOverrides={Object.keys(cartIconOverrides).length > 0 ? cartIconOverrides : undefined}
        selectMode={selectMode}
        selectBusy={batchBusy}
        selectedIds={selectedIds}
        onLongPressItem={enterSelectMode}
        onToggleSelectItem={toggleSelectItem}
        onLongPressResource={enterSelectModeResource}
        onToggleSelectResource={toggleSelectResource}
      />
      <div className={styles.campfireStage} style={{ height: CAMPFIRE_AREA_PX }}>
        {/* Fire's position/size are relative to THIS group (i.e. to the
            tent itself - see .campfireStageFireIcon), not to .campfireStage's
            own corner, so moving/resizing the tent carries the fire along
            with it instead of the two drifting apart. */}
        <div className={styles.campTentGroup}>
          {/* Lit/unlit toggle, same idea as dropped.png below (though this
              one never disappears, just swaps art) - lit whenever camp
              actually holds something, unlit when hasCampItems is false.
              Only the lit state is clickable (opens the "Burn All" popup) -
              nothing to burn while it's unlit, so that version stays
              purely decorative (see .campfireStageFireIconLit's own
              pointer-events:auto, the base rule keeps pointer-events:none). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hasCampItems ? "/images/character/campfire_lit.png" : "/images/character/campfire_unlit.png"}
            alt=""
            role={hasCampItems ? "button" : undefined}
            tabIndex={hasCampItems ? 0 : undefined}
            title={hasCampItems ? "Burn everything in camp" : undefined}
            aria-label={hasCampItems ? "Burn everything in camp" : undefined}
            onClick={hasCampItems ? () => setCampAction("burn") : undefined}
            onKeyDown={
              hasCampItems
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") setCampAction("burn");
                  }
                : undefined
            }
            className={
              hasCampItems
                ? `${styles.campfireStageFireIcon} ${styles.campfireStageFireIconLit}`
                : `${styles.campfireStageFireIcon} ${styles.campfireStageFireIconUnlit}`
            }
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/camp.png"
            alt=""
            className={
              hasCampItems
                ? styles.campfireStageIcon
                : `${styles.campfireStageIcon} ${styles.campfireStageIconEmpty}`
            }
          />
          {/* Bound to the tent group itself (like .campfireStageFireIcon
              above), not the screen edge - sits right of the tent, easing
              only a little further out on wider screens instead of
              tracking the actual viewport edge. Opens ChopBlockPopup's
              own bulk-salvage popup - only clickable while hasCampItems,
              same gating as campfire_lit.png/campfire_unlit.png above
              (nothing to salvage with an empty camp, so it stays purely
              decorative then, dimmed the same way the tent itself does
              via .campfireStageIconEmpty). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/chopping_block.png"
            alt=""
            role={hasCampItems ? "button" : undefined}
            tabIndex={hasCampItems ? 0 : undefined}
            title={hasCampItems ? "Salvage everything in camp" : undefined}
            aria-label={hasCampItems ? "Salvage everything in camp" : undefined}
            onClick={hasCampItems ? () => setCampAction("chop") : undefined}
            onKeyDown={
              hasCampItems
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") setCampAction("chop");
                  }
                : undefined
            }
            className={
              hasCampItems
                ? styles.campChoppingBlockIcon
                : `${styles.campChoppingBlockIcon} ${styles.campChoppingBlockIconEmpty}`
            }
          />
        </div>
        {hasCampItems && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/character/dropped.png"
            alt=""
            role="button"
            tabIndex={0}
            title="Pack everything up"
            aria-label="Pack everything up"
            onClick={() => setCampAction("moveAll")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setCampAction("moveAll");
            }}
            className={styles.campDroppedIcon}
          />
        )}
        {campAction === "burn" && (
          <HoldActionPopup
            headline="Burn All"
            iconClassName={styles.burnAllIcon}
            label="Hold to cast things into flames"
            icon="/images/character/campfire_lit.png"
            tone="destroy"
            onConfirm={() => postJson(`/api/auth/me/characters/${character.id}/camp/burn-all`)}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setCampAction(null)}
          />
        )}
        {campAction === "moveAll" && (
          <HoldActionPopup
            headline="Store all"
            label="Hold to START PACKING UP"
            subtitle="Fills cart first, then saddlepack, then backpack"
            icon="/images/character/dropped.png"
            tone="move"
            onConfirm={() => postJson(`/api/auth/me/characters/${character.id}/camp/move-all-to-bags`)}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setCampAction(null)}
          />
        )}
        {campAction === "chop" && (
          <ChopBlockPopup
            characterId={character.id}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setCampAction(null)}
          />
        )}
        <button
          type="button"
          className={styles.campExitButton}
          title="Back to Body"
          aria-label="Back to Body"
          onClick={onExitCamp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/character/exit.webp" alt="" className={styles.campExitIcon} />
        </button>
      </div>
    </div>
  );
}

// ChopBlockRow, flattenChopBlockMaterials, and ChopBlockPopup are now
// imported from InventoryTab.tsx (shared with the vault's own salvage).

