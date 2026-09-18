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
 * a backpack/saddlepack), styled like the Inventory tab's Vault grid, with
 * a campfire centerpiece filling the lower part of the screen below it. */
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
            twoHanded: boolean;
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
              twoHanded: item.twoHanded,
              gatheringBonuses: item.gatheringBonuses,
            };
          }
          setItemCatalogTierInfo(map);
        }
      )
      .catch(() => setItemCatalogTierInfo({}));
  }, []);

  const hasBackpackEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && (instance.slotRef.includes("Back") || instance.slotRef.includes("Side"))
  );

  const campBalances = character.gear.itemBalances.camp;
  const campIds = Object.keys(campBalances).filter((id) => campBalances[id] > 0);

  return (
    <div className={styles.panel}>
      <ItemGrid
        ids={campIds}
        emptyLabel="Nothing sitting at camp right now."
        tierInfo={itemCatalogTierInfo}
        balances={campBalances}
        source="character"
        hasBackpackEquipped={hasBackpackEquipped}
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
