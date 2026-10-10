import { Fragment, useEffect, useState } from "react";
import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import {
  ItemDetailPopup,
  ItemIcon,
  computeBackpackContents,
  computeSaddlepackContents,
  computeCartContents,
  getTierIndicator,
  qualityBarColor,
  qualityState,
  type BlueprintTierInfo,
  type RawPlayerData,
  type ResourceTierInfo,
} from "./InventoryTab";
import type { ItemInstance, SlotCharacterSummary } from "../SoulSlotGrid";
import { CHAKRA_SLOTS, activeChakraCount } from "./SoulTab";
import { RACE_GROUP_RIDER_WEIGHT } from "@/app/lib/characterOptions";

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

type SubSlot = { lines: string[]; position: string; slotKey: string };

const MOUNT_SUB_SLOTS: SubSlot[] = [
  { lines: ["Bridle"], position: styles.mountSubSlotHead, slotKey: "Bridle" },
  { lines: ["Saddle"], position: styles.mountSubSlotSaddle, slotKey: "Saddle" },
  { lines: ["Barding"], position: styles.mountSubSlotArmor, slotKey: "Barding" },
  { lines: ["Saddle", "pack"], position: styles.mountSubSlotBags, slotKey: "Saddlepack" },
  { lines: ["Hitch"], position: styles.mountSubSlotCart, slotKey: "Hitch" },
];

const COMPANION_SUB_SLOTS: SubSlot[] = [
  { lines: ["Charm"], position: "", slotKey: "Charm" },
  { lines: ["Rune"], position: "", slotKey: "Rune" },
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
  iconOverride,
}: {
  instance: ItemInstance;
  catalog: BlueprintTierInfo;
  /** Flips the icon horizontally - a two-handed item's "Left Hand" half
   * mirrors the same art shown normally in "Right Hand", rather than
   * needing a second, hand-drawn left-hand asset per family. */
  mirrored?: boolean;
  iconOverride?: string;
}) {
  const entry = catalog[instance.itemId];
  // Same condition/damaged treatment as the Vault/Camp grid's ItemGrid
  // tiles (see qualityState/qualityBarColor there) - an equipped instance
  // is just as much a "real" item instance as a backpacked/camped one, so
  // it should wear down visibly here too, not only once unequipped.
  const qualityFraction =
    entry?.qualityMax != null && instance.quality != null
      ? Math.max(0, Math.min(1, entry.qualityMax > 0 ? instance.quality / (entry.qualityMax * (2 ** (entry.tier - 1))) : 1))
      : null;
  const isDamaged = qualityFraction !== null && qualityState(qualityFraction) === "damaged";
  return (
    <div className={isDamaged ? `${styles.equipSlotIconWrap} ${styles.equipSlotIconWrapDamaged}` : styles.equipSlotIconWrap}>
      <ItemIcon
        icon={iconOverride ?? entry?.icon}
        alt={entry?.name ?? instance.familyId}
        className={styles.equipSlotIcon}
        style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
      />
      {!!entry?.tier && (
        <span className={styles.itemGridTierBadge}>
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
  // same salvage/destroy view when a slot is clicked.
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
            armorClass: number | null;
            icon: string;
            stackSize: number;
            description: string;
            sizeClass: string;
            size: string;
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
              size: item.size,
              equipSlots: item.equipSlots,
              backpackable: item.backpackable,
              gatheringBonuses: item.gatheringBonuses,
              capacitySlots: item.capacitySlots,
              carryCapacity: item.carryCapacity,
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
  // salvage/destroy(-from-character)/unequip popup InventoryTab.tsx's new
  // "Items" accordion uses (source:"character"), scoped to whatever's worn
  // right here rather than this character's whole backpack.
  const [selectedInstance, setSelectedInstance] = useState<ItemInstance | null>(null);
  const [carryPopup, setCarryPopup] = useState<"body" | "mount" | null>(null);

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
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "saddlepack"
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

  const {
    ids: saddlepackIds,
    balances: saddlepackCombined,
    lookupIds: saddlepackLookupIds,
    instanceQuality: saddlepackInstanceQuality,
    resourceBalances: saddlepackResourceBalances,
  } = computeSaddlepackContents(character);

  const {
    ids: cartIds,
    balances: cartCombined,
    lookupIds: cartLookupIds,
    instanceQuality: cartInstanceQuality,
    resourceBalances: cartResourceBalances,
  } = computeCartContents(character);

  // Same emptiness check as CampView's own hasCampItems - lets the camp
  // button carry a small dropped.png badge (see below) so the player can
  // tell camp holds something without having to open it first. Has to
  // check gear.resources.camp too, not just items/itemBalances - a
  // backpack-full salvage drop (see backend._salvage_resource_updates) or
  // an explicit "move to camp" can leave camp holding ONLY raw/processed
  // materials, with no item/itemBalance row at all.
  const hasCampItems =
    character.gear.items.some((instance) => instance.location === "camp") ||
    Object.values(character.gear.itemBalances.camp).some((amount) => amount > 0) ||
    Object.values(character.gear.resources.camp).some((amount) => amount > 0);

  const hasCartItems =
    cartIds.length > 0 ||
    Object.values(cartResourceBalances).some((qty) => qty > 0);

  const cartFilledIcon = (instance: ItemInstance): string | undefined => {
    if (!hasCartItems || instance.familyId !== "cart") return undefined;
    const icon = catalog[instance.itemId]?.icon;
    if (!icon) return undefined;
    return icon.replace("/cart_t", "/cart_filled_t");
  };

  const renderLargeSlot = (label: string) => {
    const instance = equippedInSlot(character.gear.items, label);

    if (label === "Mount") {
      const renderMountSubSlot = (slotKey: string, extraClass?: string) => {
        const sub = MOUNT_SUB_SLOTS.find((s) => s.slotKey === slotKey)!;
        const subInst = equippedInSlot(character.gear.items, slotKey);
        return (
          <div
            key={slotKey}
            className={extraClass ?? styles.mountColumnSlot}
            role={subInst ? "button" : undefined}
            tabIndex={subInst ? 0 : undefined}
            onClick={subInst ? (e) => { e.stopPropagation(); setSelectedInstance(subInst); } : undefined}
          >
            {subInst ? (
              <EquipSlotIcon instance={subInst} catalog={catalog} iconOverride={cartFilledIcon(subInst)} />
            ) : (
              <span className={styles.mountSubSlotLabel}>
                {sub.lines.map((line, i) => (
                  <Fragment key={line}>
                    {i > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </span>
            )}
          </div>
        );
      };

      return (
        <div className={`${styles.mountWrapper} ${styles.mountLargeSlot}`} key="Mount">
          {instance && (
            <span className={styles.slotName}>
              {catalog[instance.itemId]?.name ?? instance.familyId}
            </span>
          )}
          <div className={styles.mountAssembly}>
            <div
              className={styles.largeEquipSlot}
              role={instance ? "button" : undefined}
              tabIndex={instance ? 0 : undefined}
              onClick={instance ? () => setSelectedInstance(instance) : undefined}
            >
              {instance ? (
                <EquipSlotIcon instance={instance} catalog={catalog} />
              ) : (
                <span className={styles.equipSlotLabel}>Mount</span>
              )}
            </div>
            <div className={styles.mountColumnRight}>
              {renderMountSubSlot("Saddlepack")}
              {renderMountSubSlot("Barding")}
            </div>
          </div>
          <div className={styles.mountBottomRow}>
            {renderMountSubSlot("Bridle", styles.mountBottomSlot)}
            {renderMountSubSlot("Saddle", styles.mountBottomSlot)}
            {renderMountSubSlot("Hitch", styles.mountBottomSlot)}
          </div>
        </div>
      );
    }

    // Companion — portrait + right column (Charm + Rune)
    return (
      <div className={`${styles.companionWrapper} ${styles.companionLargeSlot}`} key={label}>
        {instance && (
          <span className={styles.slotName}>
            {catalog[instance.itemId]?.name ?? instance.familyId}
          </span>
        )}
        <div className={styles.companionAssembly}>
          <div
            className={styles.largeEquipSlot}
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
          <div className={styles.companionColumnRight}>
            {COMPANION_SUB_SLOTS.map((sub) => {
              const subInst = equippedInSlot(character.gear.items, sub.slotKey);
              return (
                <div
                  key={sub.slotKey}
                  className={styles.mountColumnSlot}
                  role={subInst ? "button" : undefined}
                  tabIndex={subInst ? 0 : undefined}
                  onClick={subInst ? (e) => { e.stopPropagation(); setSelectedInstance(subInst); } : undefined}
                >
                  {subInst ? (
                    <EquipSlotIcon instance={subInst} catalog={catalog} />
                  ) : (
                    <span className={styles.mountSubSlotLabel}>{sub.lines[0]}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.bodyLayout}>
        {!showSoul && renderLargeSlot("Companion")}
        <div className={`${styles.frameColumn} ${showSoul ? styles.frameColumnFlipped : ""}`}>
          <div className={styles.frameStage}>
            <div className={styles.flipContainer}>
              <div className={`${styles.flipInner} ${showSoul ? styles.flipInnerFlipped : ""}`}>
                <div
                  className={`${styles.frameBox} ${styles.flipFace}`}
                  style={frameAspectRatio ? { aspectRatio: frameAspectRatio } : undefined}
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
                  {character.portraitUrl && character.portraitUrl !== "empty" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={character.portraitUrl}
                      alt=""
                      className={`${styles.frameImage} ${styles.chakraPortraitBg}`}
                      style={character.portraitFrameArea ? getPortraitCropImgStyle(character.portraitFrameArea) : undefined}
                    />
                  )}
                  <div className={styles.chakraContentWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/character/chakra-page-active.png"
                      alt="Soul chakra"
                      className={styles.chakraOverlayImg}
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

            {!showSoul && (() => {
              const bodyUsed = character.gear.carryWeightUsed;
              const bodyCap = character.gear.carryWeightCapacity;
              const bodyRatio = bodyCap > 0 ? bodyUsed / bodyCap : 0;
              const bodyFillHeight = Math.min(90, (bodyRatio / 1.3) * 90);
              const bodyFillColor = bodyRatio > 1.3 ? "#c03030" : bodyRatio > 1 ? "#c8a020" : "#2a9a3a";

              const mountUsed = character.gear.mountCarryWeightUsed ?? 0;
              const mountCap = character.gear.mountCarryWeightCapacity ?? 0;
              const mountRatio = mountCap > 0 ? mountUsed / mountCap : 0;
              const mountFillHeight = mountCap > 0 ? Math.min(90, (mountRatio / 1.3) * 90) : 0;
              const mountFillColor = mountRatio > 1.3 ? "#c03030" : mountRatio > 1 ? "#c8a020" : "#2a9a3a";

              const backpackInst = character.gear.items.find(
                (i) => i.location === "body" && i.familyId === "backpack"
              );
              const backpackIcon = backpackInst ? catalog[backpackInst.itemId]?.icon : null;

              const mountFamilies = new Set(["steed_mount", "beast_mount", "exotic_mount", "aquatic_mount"]);
              const mountInst = character.gear.items.find(
                (i) => i.location === "body" && mountFamilies.has(i.familyId)
              );
              const mountIcon = mountInst ? catalog[mountInst.itemId]?.icon : null;

              const usePortrait = !backpackIcon && character.portraitUrl && character.portraitUrl !== "empty";
              const bodyIconSrc = backpackIcon ?? (usePortrait ? character.portraitUrl : "/images/character/char-preview-body.png");
              const bodyImgClass = backpackIcon ? styles.carryIconImg : styles.carryIconImgDark;

              return (
                <div className={styles.carryBarsWrap}>
                  <div className={usePortrait ? styles.carryIconFillPortrait : styles.carryIconFill} role="button" tabIndex={0} onClick={() => setCarryPopup("body")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bodyIconSrc} alt="" className={usePortrait ? styles.carryIconImgPortrait : bodyImgClass} />
                    <div className={styles.carryIconClip} style={{ height: `${bodyFillHeight}%` }}>
                      <div
                        className={styles.carryIconColor}
                        style={{
                          background: bodyFillColor,
                          ...(usePortrait ? { height: "clamp(3.6rem, 12vw, 5.1rem)" } : {
                            WebkitMaskImage: `url(${bodyIconSrc})`,
                            maskImage: `url(${bodyIconSrc})`,
                          }),
                        }}
                      />
                    </div>
                  </div>
                  {mountIcon && (
                    <div className={styles.carryIconFill} role="button" tabIndex={0} onClick={() => setCarryPopup("mount")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mountIcon} alt="" className={styles.carryIconImgDark} />
                      <div className={styles.carryIconClip} style={{ height: `${mountFillHeight}%` }}>
                        <div
                          className={styles.carryIconColor}
                          style={{
                            background: mountFillColor,
                            WebkitMaskImage: `url(${mountIcon})`,
                            maskImage: `url(${mountIcon})`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
              </div>
            )}
            {!showSoul && hasCampItems && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/images/character/dropped.png" alt="" className={styles.campButtonBadge} />
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
                        <EquipSlotIcon instance={instance} catalog={catalog} mirrored={mirrored} iconOverride={cartFilledIcon(instance)} />
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
        {!showSoul && renderLargeSlot("Mount")}
      </div>

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
          hasMountEquipped={character.gear.items.some((i) => i.location === "body" && i.slotRef?.includes("Mount"))}
          hasCompanionEquipped={character.gear.items.some((i) => i.location === "body" && i.slotRef?.includes("Companion"))}
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
          saddlepackPackedItems={{
            ids: saddlepackIds,
            tierInfo: catalog,
            balances: saddlepackCombined,
            lookupIds: saddlepackLookupIds,
            instanceQuality: saddlepackInstanceQuality,
            resourceBalances: saddlepackResourceBalances,
            resourceTierInfo,
          }}
          cartPackedItems={{
            ids: cartIds,
            tierInfo: catalog,
            balances: cartCombined,
            lookupIds: cartLookupIds,
            instanceQuality: cartInstanceQuality,
            resourceBalances: cartResourceBalances,
            resourceTierInfo,
          }}
          backpackSlotsUsed={character.gear.backpackSlotsUsed}
          backpackCapacity={character.gear.backpackCapacity}
          saddlepackSlotsUsed={character.gear.saddlepackSlotsUsed}
          saddlepackCapacity={character.gear.saddlepackCapacity}
          cartSlotsUsed={character.gear.cartSlotsUsed}
          cartCapacity={character.gear.cartCapacity}
          mountCarryWeightUsed={character.gear.mountCarryWeightUsed}
          mountCarryWeightCapacity={character.gear.mountCarryWeightCapacity}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedInstance(null)}
          iconOverride={cartFilledIcon(selectedInstance)}
        />
      )}

      {carryPopup && (() => {
        const mountFamilies = new Set(["steed_mount", "beast_mount", "exotic_mount", "aquatic_mount"]);
        if (carryPopup === "body") {
          const used = character.gear.carryWeightUsed;
          const cap = character.gear.carryWeightCapacity;
          const ratio = cap > 0 ? used / cap : 0;
          const bodyWeight = character.gear.bodyGearWeight ?? 0;
          const bpUsed = character.gear.backpackSlotsUsed;
          const bpCap = character.gear.backpackCapacity;
          const bpInst = character.gear.items.find(
            (i) => i.location === "body" && i.familyId === "backpack"
          );
          const bpInfo = bpInst ? catalog[bpInst.itemId] : null;
          const iconSrc = bpInfo?.icon ?? (character.portraitUrl && character.portraitUrl !== "empty" ? character.portraitUrl : "/images/character/char-preview-body.png");
          const tier = bpInfo?.tier ?? 0;
          const statusClass = ratio > 1.3 ? styles.carryPopupStatusRed : ratio > 1 ? styles.carryPopupStatusYellow : styles.carryPopupStatusGreen;
          const statusText = ratio > 1.3
            ? "Overloaded — salvage items or abandon"
            : ratio > 1
              ? "Encumbered — cannot run, jump, climb, swim"
              : "Light Weight";
          return (
            <div className={styles.carryPopupOverlay} onClick={() => setCarryPopup(null)}>
              <div className={styles.carryPopupCard}>
                {tier > 0 && (
                  <span className={styles.carryPopupTierBadge}>{getTierIndicator(tier)}</span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconSrc} alt="" className={bpInfo ? styles.carryPopupImg : styles.carryPopupImgLarge} />
                <h3 className={styles.carryPopupTitle}>Carry Weight</h3>
                <div className={styles.carryPopupRows}>
                  <div className={styles.carryPopupRow}>
                    <span>Total Weight</span><span className={statusClass}>{used}/{cap}</span>
                  </div>
                  <div className={styles.carryPopupRow}>
                    <span>Body</span><span>{bodyWeight}</span>
                  </div>
                  <div className={styles.carryPopupRow}>
                    <span>Backpack</span><span>{bpUsed}/{bpCap}</span>
                  </div>
                </div>
                <div className={styles.carryPopupDivider} />
                <p className={`${styles.carryPopupStatus} ${statusClass}`}>{statusText}</p>
              </div>
            </div>
          );
        }
        const used = character.gear.mountCarryWeightUsed ?? 0;
        const cap = character.gear.mountCarryWeightCapacity ?? 0;
        const ratio = cap > 0 ? used / cap : 0;
        const mountWeight = character.gear.mountGearWeight ?? 0;
        const spUsed = character.gear.saddlepackSlotsUsed;
        const spCap = character.gear.saddlepackCapacity;
        const mountInst = character.gear.items.find(
          (i) => i.location === "body" && mountFamilies.has(i.familyId)
        );
        const mountInfo = mountInst ? catalog[mountInst.itemId] : null;
        const iconSrc = mountInfo?.icon ?? "";
        const tier = mountInfo?.tier ?? 0;
        const statusClass = ratio > 1.3 ? styles.carryPopupStatusRed : ratio > 1 ? styles.carryPopupStatusYellow : styles.carryPopupStatusGreen;
        const statusText = ratio > 1.3
          ? "Overloaded — salvage items or abandon"
          : ratio > 1
            ? "Encumbered — cannot fly, climb, run"
            : "Light Weight";
        const riderWeight = RACE_GROUP_RIDER_WEIGHT[character.raceGroup] ?? 4;
        const totalRidingUsed = riderWeight + character.gear.carryWeightUsed + used;
        const totalRidingCap = cap;
        const ridingRatio = totalRidingCap > 0 ? totalRidingUsed / totalRidingCap : 0;
        const ridingClass = ridingRatio > 1.3 ? styles.carryPopupStatusRed : ridingRatio > 1 ? styles.carryPopupStatusYellow : styles.carryPopupStatusGreen;
        return (
          <div className={styles.carryPopupOverlay} onClick={() => setCarryPopup(null)}>
            <div className={styles.carryPopupCard}>
              {tier > 0 && (
                <span className={styles.carryPopupTierBadge}>{getTierIndicator(tier)}</span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconSrc} alt="" className={styles.carryPopupImgLarge} />
              <h3 className={styles.carryPopupTitle}>Mount Carry Weight</h3>
              <div className={styles.carryPopupRows}>
                <div className={styles.carryPopupRow}>
                  <span>Total Weight</span><span className={statusClass}>{used}/{cap}</span>
                </div>
                <div className={styles.carryPopupRow}>
                  <span>Mount</span><span>{mountWeight}</span>
                </div>
                <div className={styles.carryPopupRow}>
                  <span>Saddlepack</span><span>{spUsed}/{spCap}</span>
                </div>
              </div>
              <div className={styles.carryPopupDivider} />
              <p className={`${styles.carryPopupStatus} ${statusClass}`}>{statusText}</p>
              <div className={styles.carryPopupDivider} />
              {character.raceGroup === "Giants" && mountInfo?.size && !["Huge", "Colossal"].includes(mountInfo.size) ? (
                <p className={`${styles.carryPopupStatus} ${styles.carryPopupStatusRed}`}>Mount too small to ride</p>
              ) : (
                <div className={styles.carryPopupRows}>
                  <div className={styles.carryPopupRow}>
                    <span>Total Weight Riding</span><span className={ridingClass}>{totalRidingUsed}/{totalRidingCap}</span>
                  </div>
                  <div className={styles.carryPopupCalc}>
                    {riderWeight}{" + "}{character.gear.bodyGearWeight ?? 0}{" + "}{character.gear.backpackSlotsUsed}{" + "}{mountWeight}{" + "}{spUsed}
                  </div>
                  <div className={styles.carryPopupCalc}>
                    rider{" + "}body{" + "}back{" + "}mount{" + "}pack
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
