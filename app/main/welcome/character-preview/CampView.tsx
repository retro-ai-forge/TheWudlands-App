import { useEffect, useState } from "react";
import styles from "./CharacterTabs.module.css";
import {
  BACKPACK_ACTION_ICON,
  ItemGrid,
  ResourcePopup,
  ResourceTiles,
  VAULT_ACTION_ICON,
  computeBackpackContents,
  type BlueprintTierInfo,
  type RawPlayerData,
  type ResourceTierInfo,
} from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { useSound } from "../../SoundProvider";

const CAMP_ITEMS_SOUND = "/sounds/west_wolf_Campfire.mp3";

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

  // Which camp-located resource tile's own popup is open, if any (see
  // ResourceTiles/ResourcePopup below).
  const [selectedCampResourceId, setSelectedCampResourceId] = useState<string | null>(null);

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
            icon: string;
            stackSize: number;
            description: string;
            sizeClass: string;
            equipSlots: string[][];
            backpackable: boolean;
            gatheringBonuses: string[];
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
              icon: item.icon,
              stackSize: item.stackSize,
              description: item.description,
              sizeClass: item.sizeClass,
              equipSlots: item.equipSlots,
              backpackable: item.backpackable,
              gatheringBonuses: item.gatheringBonuses,
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
    (instance) => instance.location === "body" && instance.familyId === "saddlepack"
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
  const campInstanceLookupIds: Record<string, string> = {};
  const campInstanceRowBalances: Record<string, number> = {};
  const campInstanceQuality: Record<string, number | null> = {};
  // Every row shown here - instance or flat-balance alike - is at
  // location:"camp" by construction (this whole view only ever reads
  // items/itemBalances.camp), so ItemDetailPopup's location-gated action
  // buttons (e.g. "Move to backpack") work the same regardless of which
  // kind of row was clicked. Balance ids are filled in below alongside
  // campCombined, once both id sets are known.
  const campLocations: Record<string, "camp"> = {};
  for (const instance of campInstances) {
    campInstanceLookupIds[instance.instanceId] = instance.itemId;
    campInstanceRowBalances[instance.instanceId] = 1;
    campInstanceQuality[instance.instanceId] = instance.quality;
    campLocations[instance.instanceId] = "camp";
  }
  const campCombined: Record<string, number> = { ...campBalances, ...campInstanceRowBalances };
  const campIds = Object.keys(campCombined).filter((id) => campCombined[id] > 0);
  for (const id of Object.keys(campBalances)) {
    campLocations[id] = "camp";
  }

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

  // Tracks hasCampItems live, not just at open - starts playing the
  // moment camp actually has something (opening camp with items already
  // in it, or the first item landing while already standing here), and
  // the cleanup below pauses it the moment that stops being true (the
  // last item leaving camp, same trigger dropped.png/campfire_lit.png
  // already react to - or CampView unmounting outright, i.e. leaving
  // camp). Only re-runs when hasCampItems/muted actually flip, not on
  // every render where quantities change but camp is still non-empty -
  // useEffect's own dependency comparison already skips re-firing when
  // hasCampItems stays the same boolean across renders.
  useEffect(() => {
    if (!hasCampItems || muted) return;
    const audio = new Audio(CAMP_ITEMS_SOUND);
    audio.loop = true;
    audio.play().catch(() => {
      // Autoplay can still be blocked without a preceding user gesture in
      // some browsers - opening camp is itself a click, so this should
      // normally succeed, but fail silently either way rather than an
      // unhandled promise rejection.
    });
    return () => {
      audio.pause();
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

  return (
    <div className={styles.panel}>
      {hasCampResources && (
        <div className={styles.packedItemsRow}>
          <ResourceTiles
            balances={campResourceBalances}
            tierInfo={resourceTierInfo}
            onSelect={setSelectedCampResourceId}
          />
        </div>
      )}
      {selectedCampResourceId && (
        <ResourcePopup
          resourceId={selectedCampResourceId}
          tierInfo={resourceTierInfo}
          owned={campResourceBalances[selectedCampResourceId] ?? 0}
          characterId={character.id}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedCampResourceId(null)}
          destinations={[
            ...(hasBackpackEquipped
              ? [{ key: "backpack", icon: BACKPACK_ACTION_ICON, label: "Backpack", endpoint: "stow" }]
              : []),
            ...(!character.availability.inAdventure
              ? [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "check-in-camp" }]
              : []),
          ]}
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
        inAdventure={character.availability.inAdventure}
        characterId={character.id}
        onPlayerDataUpdated={onPlayerDataUpdated}
        reserveBottomPx={CAMPFIRE_AREA_PX}
        hideScrollbar
        packedItems={packedItems}
        backpackSlotsUsed={character.gear.backpackSlotsUsed}
        backpackCapacity={character.gear.backpackCapacity}
      />
      <div className={styles.campfireStage} style={{ height: CAMPFIRE_AREA_PX }}>
        {/* Fire's position/size are relative to THIS group (i.e. to the
            tent itself - see .campfireStageFireIcon), not to .campfireStage's
            own corner, so moving/resizing the tent carries the fire along
            with it instead of the two drifting apart. */}
        <div className={styles.campTentGroup}>
          {/* Lit/unlit toggle, same idea as dropped.png below (though this
              one never disappears, just swaps art) - lit whenever camp
              actually holds something, unlit when hasCampItems is false. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hasCampItems ? "/images/character/campfire_lit.png" : "/images/character/campfire_unlit.png"}
            alt=""
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
        </div>
        {hasCampItems && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/images/character/dropped.png" alt="" className={styles.campDroppedIcon} />
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
