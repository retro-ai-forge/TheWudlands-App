import { useEffect, useState } from "react";
import styles from "./CharacterTabs.module.css";
import { ItemGrid, type BlueprintTierInfo, type RawPlayerData } from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

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
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
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

  // Checked by familyId, not by "Back"/"Side" in slotRef - see BodyTab.tsx's
  // identical check for why (other families can occupy those slot names too).
  const hasBackpackEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && instance.familyId === "backpack"
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

  return (
    <div className={styles.panel}>
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
      />
      <div className={styles.campfireStage} style={{ height: CAMPFIRE_AREA_PX }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/character/camp.png" alt="" className={styles.campfireStageIcon} />
      </div>
    </div>
  );
}
