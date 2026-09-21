import { Fragment, useEffect, useState } from "react";
import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import {
  FALLBACK_ITEM_ICON,
  ItemDetailPopup,
  computeBackpackContents,
  getTierIndicator,
  itemGridTierBadgeClass,
  qualityBarColor,
  qualityState,
  type BlueprintTierInfo,
  type RawPlayerData,
  type ResourceTierInfo,
} from "./InventoryTab";
import type { ItemInstance, SlotCharacterSummary } from "../SoulSlotGrid";
import { InAdventureToggle } from "./InAdventureToggle";
import { CHAKRA_SLOTS, activeChakraCount } from "./SoulTab";

// Overlaid directly on the portrait: head/chest/legs down the left edge,
// back/side down the right edge. The right-edge slot below Back used to be
// labeled "Girdle" too - renamed to "Side" now that Girdle itself moved
// below the portrait, between the two hand slots.
const OVERLAY_SLOTS = [
  { label: "Head", position: styles.equipSlotHead },
  { label: "Neck", position: styles.equipSlotNeck },
  { label: "Chest", position: styles.equipSlotChest },
  { label: "Legs", position: styles.equipSlotLegs },
  { label: "Cloak", position: styles.equipSlotCloak },
  { label: "Back", position: styles.equipSlotBack },
  { label: "Side", position: styles.equipSlotGirdle },
];
// Sit below the portrait instead, side by side - a hand holding something
// doesn't read well as a small badge pinned to the image itself. Two fixed
// rows, not one wrapping row: Left Hand/Girdle/Right Hand up top (Girdle
// smaller than its neighbors and hung below their baseline - see
// .equipSlotGirdleOffset), Left Ring/Right Ring on their own line below.
const HAND_GIRDLE_SLOTS = ["Left Hand", "Girdle", "Right Hand"];
const RING_SLOTS = ["Left Ring", "Right Ring"];
// Below everything else, at full portrait size rather than a small badge -
// these are large enough to actually show a companion/mount's own portrait
// once that art exists, capped at the same max size as the character's own
// portrait (see .largeEquipSlot).
const COMPANION_MOUNT_SLOTS = ["Companion", "Mount"];

// Visual-only for now - just the four corner squares and their labels, on
// the "Mount" box specifically (not "Companion"), same overlapping-corner
// idea as OVERLAY_SLOTS above but for a square box instead of a tall
// portrait, so one per corner instead of stacked down each edge. Mhead
// (bridle) and Mbagpack (saddlepack) already have real families in
// item-inventory-properties.json; Marmor and Msaddle don't yet - none of
// the four are wired to equippedInSlot/EquipSlotIcon/click-to-open here,
// only real squares + names, until that catalog data exists.
const MOUNT_SUB_SLOTS: { lines: string[]; position: string }[] = [
  { lines: ["Head"], position: styles.mountSubSlotHead },
  { lines: ["Saddle"], position: styles.mountSubSlotSaddle },
  { lines: ["Armor"], position: styles.mountSubSlotArmor },
  { lines: ["Saddle", "Packs"], position: styles.mountSubSlotBags },
];

// Same visual-only treatment as MOUNT_SUB_SLOTS above, but on the
// "Companion" box - just the one, left-middle, labeled "Charm". "Ccharm"
// (C- prefix for Companion, mirroring Mhead/Mbagpack/Marmor/Msaddle's M-
// prefix for Mount) is the intended future family/slot key once real
// catalog data exists for it - not wired to anything yet, same as the
// mount's four.
const COMPANION_SUB_SLOTS: { lines: string[]; position: string }[] = [
  { lines: ["Charm"], position: styles.companionSubSlotCharm },
];

// The item instance (if any) currently equipped into `slot` - at most one,
// since equip_item blocks a slot already occupied by another instance.
function equippedInSlot(items: ItemInstance[], slot: string): ItemInstance | undefined {
  return items.find((item) => item.location === "body" && item.slotRef.includes(slot));
}

/** One slot's own icon, filling the whole slot box - only rendered when
 * something's actually equipped there (see the slot label's own comment
 * for why an empty slot shows no icon at all). */
function EquipSlotIcon({
  instance,
  catalog,
  mirrored,
}: {
  instance: ItemInstance;
  catalog: BlueprintTierInfo;
  /** Flips the icon horizontally - a two-handed item's "Left Hand" half
   * mirrors the same art shown normally in "Right Hand", rather than
   * needing a second, hand-drawn left-hand asset per family. */
  mirrored?: boolean;
}) {
  const entry = catalog[instance.itemId];
  // Same condition/damaged treatment as the Vault/Camp grid's ItemGrid
  // tiles (see qualityState/qualityBarColor there) - an equipped instance
  // is just as much a "real" item instance as a backpacked/camped one, so
  // it should wear down visibly here too, not only once unequipped.
  const qualityFraction =
    entry?.qualityMax != null && instance.quality != null
      ? Math.max(0, Math.min(1, entry.qualityMax > 0 ? instance.quality / entry.qualityMax : 1))
      : null;
  const isDamaged = qualityFraction !== null && qualityState(qualityFraction) === "damaged";
  return (
    <div className={isDamaged ? `${styles.equipSlotIconWrap} ${styles.equipSlotIconWrapDamaged}` : styles.equipSlotIconWrap}>
      <div
        role="img"
        aria-label={entry?.name ?? instance.familyId}
        className={styles.equipSlotIcon}
        style={{
          backgroundImage: `url(${entry?.icon || FALLBACK_ITEM_ICON})`,
          transform: mirrored ? "scaleX(-1)" : undefined,
        }}
      />
      {!!entry?.tier && (
        <span className={`${styles.itemGridTierBadge} ${itemGridTierBadgeClass(entry.tier)}`}>
          {getTierIndicator(entry.tier)}
        </span>
      )}
      {qualityFraction !== null && (
        <div
          className={styles.equipSlotQualityBar}
          style={{ backgroundColor: qualityBarColor(qualityFraction) }}
        />
      )}
    </div>
  );
}

/** Body page: the full character frame the player defined, with equipment slots overlaid on it. */
export function BodyTab({
  character,
  onPlayerDataUpdated,
  onOpenCamp,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onOpenCamp?: () => void;
}) {
  // .frameBox's CSS aspect-ratio (2/3) is only a fallback for portraits
  // saved before portraitFrameArea carried its own aspectRatio - once that
  // field is present, it's this character's own saved frame shape and
  // takes over via inline style, since the CSS default is only ever an
  // approximation (the editor's frame can render at a slightly different
  // ratio than its nominal one depending on the viewport it was framed on).
  const frameAspectRatio = character.portraitFrameArea?.aspectRatio;

  // Family name/icon lookup for whatever's equipped - fetched once, the
  // same full catalog shape InventoryTab.tsx's own itemCatalogTierInfo
  // uses (not just name/icon), since ItemDetailPopup's "info" prop needs
  // the whole thing (equipSlots, qualityMax, description, ...) to open the
  // same recycle/destroy view when a slot is clicked.
  const [catalog, setCatalog] = useState<BlueprintTierInfo>({});
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
          setCatalog(map);
        }
      )
      .catch(() => setCatalog({}));
  }, []);

  // Same resource-catalog fetch InventoryTab.tsx already does independently
  // for its own resourceTierInfo - needed here too now that a worn
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

  // The clicked slot's own equipped instance, if any - opens the same
  // recycle/destroy(-from-character)/unequip popup InventoryTab.tsx's new
  // "Items" accordion uses (source:"character"), scoped to whatever's worn
  // right here rather than this character's whole backpack.
  const [selectedInstance, setSelectedInstance] = useState<ItemInstance | null>(null);

  const [showSoul, setShowSoul] = useState(false);
  const [litSlots, setLitSlots] = useState<Set<number>>(new Set());
  const toggleLit = (n: number) => setLitSlots((prev) => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  const activeCount = activeChakraCount(character.attr);

  // Mirrors InventoryTab.tsx's identical check (and backend.items_catalog.
  // has_backpack_available) - greys out the popup's "Move to backpack"
  // button when there's no "backpack" family to pack into, instead of
  // letting the click fail server-side. A backpack still counts once
  // unequipped to camp, not just worn - unequip_item's "camp" destination
  // never empties its storage bucket, so it's still a real place to add
  // more into (see backend.players.unequip_item's own docstring). Checked
  // by familyId, not by "Back"/"Side" in slotRef - bolt_girdle/quiver/
  // ladder also list "Side" as one of their OWN alternative equip_slots
  // groups, so an equipped bolt_girdle sitting in "Side" must not count
  // as a backpack.
  const hasBackpackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "backpack"
  );
  // Mirrors backend.items_catalog.has_saddlepack_equipped - hides (rather
  // than greys) the popup's "Move to saddlepack" button when false.
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && instance.familyId === "saddlepack"
  );

  // What's actually packed into whichever backpack is worn - handed to
  // ItemDetailPopup only for a worn family:"backpack" instance's own
  // popup (see its packedItems prop) so it can show a peek inside.
  const {
    ids: backpackIds,
    balances: backpackCombined,
    lookupIds: backpackLookupIds,
    instanceQuality: backpackInstanceQuality,
    resourceBalances: backpackResourceBalances,
  } = computeBackpackContents(character);

  // Same emptiness check as CampView's own hasCampItems - lets the camp
  // button carry a small dropped.png badge (see below) so the player can
  // tell camp holds something without having to open it first. Has to
  // check gear.resources.camp too, not just items/itemBalances - a
  // backpack-full recycle drop (see backend._recycle_resource_updates) or
  // an explicit "move to camp" can leave camp holding ONLY raw/processed
  // materials, with no item/itemBalance row at all.
  const hasCampItems =
    character.gear.items.some((instance) => instance.location === "camp") ||
    Object.values(character.gear.itemBalances.camp).some((amount) => amount > 0) ||
    Object.values(character.gear.resources.camp).some((amount) => amount > 0);

  return (
    <div className={styles.panel}>
      <InAdventureToggle character={character} onPlayerDataUpdated={onPlayerDataUpdated} />
      <div className={styles.bodyLayout}>
        <div className={`${styles.frameColumn} ${showSoul ? styles.frameColumnFlipped : ""}`}>
          <div className={styles.frameStage}>
            <div className={styles.flipContainer}>
              <div className={`${styles.flipInner} ${showSoul ? styles.flipInnerFlipped : ""}`}>
                <div
                  className={`${styles.frameBox} ${styles.flipFace}`}
                  style={!showSoul && frameAspectRatio ? { aspectRatio: frameAspectRatio } : undefined}
                  onClick={() => setShowSoul(true)}
                >
                  {character.portraitUrl && character.portraitUrl !== "empty" ? (
                    character.portraitFrameArea ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={character.portraitUrl}
                        alt={character.firstName}
                        style={getPortraitCropImgStyle(character.portraitFrameArea)}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={character.portraitUrl}
                        alt={character.firstName}
                        className={styles.frameImage}
                      />
                    )
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/images/character/char_placeholder_silhouette.png"
                      alt=""
                      className={styles.frameImage}
                    />
                  )}
                </div>
                <div
                  className={`${styles.frameBox} ${styles.flipFace} ${styles.flipBack}`}
                  onClick={() => setShowSoul(false)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/character/chakra-page-active.jpg"
                    alt="Soul chakra"
                    className={styles.frameImage}
                  />
                  {CHAKRA_SLOTS.map(({ number, label: slotLabel, top, left }) => {
                    if (number > activeCount) return null;
                    return (
                      <button
                        type="button"
                        key={number}
                        className={`${styles.soulChakraSlot} ${litSlots.has(number) ? styles.soulChakraSlotLit : ""}`}
                        style={{ top: `${top}%`, left: `${left}%` }}
                        title={`${number}. ${slotLabel}`}
                        onClick={(e) => { e.stopPropagation(); toggleLit(number); }}
                      >
                        <span className={styles.equipSlotEmpty}>Empty</span>
                      </button>
                    );
                  })}
                  {CHAKRA_SLOTS.filter(({ number }) => number > activeCount).map(({ number, label: slotLabel, top, left }) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={number}
                      src="/images/character/chakra-inactive.png"
                      alt={`${slotLabel} (inactive)`}
                      title={`${number}. ${slotLabel} (inactive)`}
                      className={styles.soulChakraInactiveImage}
                      style={{ top: `${top}%`, left: `${left}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {!showSoul && OVERLAY_SLOTS.map(({ label, position }) => {
              const instance = equippedInSlot(character.gear.items, label);
              return (
                <div
                  className={`${styles.equipSlotOverlay} ${position}`}
                  key={label}
                  role={instance ? "button" : undefined}
                  tabIndex={instance ? 0 : undefined}
                  onClick={instance ? () => setSelectedInstance(instance) : undefined}
                >
                  {instance ? (
                    <EquipSlotIcon instance={instance} catalog={catalog} />
                  ) : (
                    <span className={styles.equipSlotLabel}>{label}</span>
                  )}
                </div>
              );
            })}

            {!showSoul && (
              <div className={styles.campButtonWrap}>
                <button
                  type="button"
                  className={styles.campButton}
                  title={hasCampItems ? "Camp (items waiting)" : "Camp"}
                  aria-label={hasCampItems ? "Camp (items waiting)" : "Camp"}
                  onClick={onOpenCamp}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/character/camp.png" alt="" className={styles.campButtonIcon} />
                </button>
                {hasCampItems && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/images/character/dropped.png" alt="" className={styles.campButtonBadge} />
                )}
              </div>
            )}
          </div>

          {!showSoul && (
            <>
              <div className={styles.handSlotRow}>
                {HAND_GIRDLE_SLOTS.map((label) => {
                  const instance = equippedInSlot(character.gear.items, label);
                  const mirrored = label === "Left Hand" && !!instance && instance.slotRef.includes("Right Hand");
                  return (
                    <div
                      className={label === "Girdle" ? `${styles.equipSlot} ${styles.equipSlotGirdleOffset}` : styles.equipSlot}
                      key={label}
                      role={instance ? "button" : undefined}
                      tabIndex={instance ? 0 : undefined}
                      onClick={instance ? () => setSelectedInstance(instance) : undefined}
                    >
                      {instance ? (
                        <EquipSlotIcon instance={instance} catalog={catalog} mirrored={mirrored} />
                      ) : (
                        <span className={styles.equipSlotLabel}>{label}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={styles.ringSlotRow}>
                {RING_SLOTS.map((label) => {
                  const instance = equippedInSlot(character.gear.items, label);
                  return (
                    <div
                      className={styles.equipSlot}
                      key={label}
                      role={instance ? "button" : undefined}
                      tabIndex={instance ? 0 : undefined}
                      onClick={instance ? () => setSelectedInstance(instance) : undefined}
                    >
                      {instance ? (
                        <EquipSlotIcon instance={instance} catalog={catalog} />
                      ) : (
                        <span className={styles.equipSlotLabel}>{label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {!showSoul && (
        <div className={styles.companionMountRow}>
          {COMPANION_MOUNT_SLOTS.map((label) => {
            const instance = equippedInSlot(character.gear.items, label);
            return (
              <div
                className={styles.largeEquipSlot}
                key={label}
                role={instance ? "button" : undefined}
                tabIndex={instance ? 0 : undefined}
                onClick={instance ? () => setSelectedInstance(instance) : undefined}
              >
                {instance ? (
                  <EquipSlotIcon instance={instance} catalog={catalog} />
                ) : (
                  <span className={styles.equipSlotLabel}>{label}</span>
                )}
                {(label === "Mount" ? MOUNT_SUB_SLOTS : label === "Companion" ? COMPANION_SUB_SLOTS : []).map((sub) => (
                  <div key={sub.lines.join(" ")} className={`${styles.mountSubSlot} ${sub.position}`}>
                    <span className={styles.mountSubSlotLabel}>
                      {sub.lines.map((line, i) => (
                        <Fragment key={line}>
                          {i > 0 && <br />}
                          {line}
                        </Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {selectedInstance && (
        <ItemDetailPopup
          info={catalog[selectedInstance.itemId]}
          fallbackName={selectedInstance.familyId}
          owned={1}
          isInstance
          movable
          quality={selectedInstance.quality}
          moveId={selectedInstance.instanceId}
          catalogId={selectedInstance.itemId}
          location="body"
          source="character"
          hasBackpackEquipped={hasBackpackEquipped}
          hasSaddlepackEquipped={hasSaddlepackEquipped}
          inAdventure={character.availability.inAdventure}
          currentSlots={selectedInstance.slotRef}
          characterId={character.id}
          packedItems={{
            ids: backpackIds,
            tierInfo: catalog,
            balances: backpackCombined,
            lookupIds: backpackLookupIds,
            instanceQuality: backpackInstanceQuality,
            resourceBalances: backpackResourceBalances,
            resourceTierInfo,
          }}
          backpackSlotsUsed={character.gear.backpackSlotsUsed}
          backpackCapacity={character.gear.backpackCapacity}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedInstance(null)}
        />
      )}
    </div>
  );
}
