import { useEffect, useState } from "react";
import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import { FALLBACK_ITEM_ICON } from "./InventoryTab";
import type { ItemInstance, SlotCharacterSummary } from "../SoulSlotGrid";

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
// doesn't read well as a small badge pinned to the image itself. Girdle
// (the belt) sits centered between them, and each Hand sits directly beside
// its matching Ring. One row in the markup; .handSlotRow's own flex-wrap
// breaks it onto two lines (Hand+Ring, Hand+Ring) on narrow screens and
// keeps all 5 on one line once there's room.
const HAND_RING_SLOTS = ["Left Hand", "Left Ring", "Girdle", "Right Ring", "Right Hand"];
// Below everything else, at full portrait size rather than a small badge -
// these are large enough to actually show a companion/mount's own portrait
// once that art exists, capped at the same max size as the character's own
// portrait (see .largeEquipSlot).
const COMPANION_MOUNT_SLOTS = ["Companion", "Mount"];

// Only the fields BodyTab's own icons need - id -> name/icon, from the same
// /api/auth/item-catalog endpoint InventoryTab.tsx uses for its Vault grid.
type ItemCatalogEntry = { id: string; name: string; icon: string };

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
  catalog: Record<string, ItemCatalogEntry>;
  /** Flips the icon horizontally - a two-handed item's "Left Hand" half
   * mirrors the same art shown normally in "Right Hand", rather than
   * needing a second, hand-drawn left-hand asset per family. */
  mirrored?: boolean;
}) {
  const entry = catalog[instance.itemId];
  return (
    <div
      role="img"
      aria-label={entry?.name ?? instance.familyId}
      className={styles.equipSlotIcon}
      style={{
        backgroundImage: `url(${entry?.icon || FALLBACK_ITEM_ICON})`,
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

/** Body page: the full character frame the player defined, with equipment slots overlaid on it. */
export function BodyTab({ character }: { character: SlotCharacterSummary }) {
  // .frameBox's CSS aspect-ratio (2/3) is only a fallback for portraits
  // saved before portraitFrameArea carried its own aspectRatio - once that
  // field is present, it's this character's own saved frame shape and
  // takes over via inline style, since the CSS default is only ever an
  // approximation (the editor's frame can render at a slightly different
  // ratio than its nominal one depending on the viewport it was framed on).
  const frameAspectRatio = character.portraitFrameArea?.aspectRatio;

  // Family name/icon lookup for whatever's equipped - fetched once, the
  // same catalog InventoryTab's Vault grid uses, just a much smaller slice
  // of it (id -> name/icon only).
  const [catalog, setCatalog] = useState<Record<string, ItemCatalogEntry>>({});
  useEffect(() => {
    fetch("/api/auth/item-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ItemCatalogEntry[]) => {
        const map: Record<string, ItemCatalogEntry> = {};
        for (const item of data) map[item.id] = item;
        setCatalog(map);
      })
      .catch(() => setCatalog({}));
  }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.bodyLayout}>
        <div className={styles.frameColumn}>
          <div className={styles.frameStage}>
            <div className={styles.frameBox} style={frameAspectRatio ? { aspectRatio: frameAspectRatio } : undefined}>
              {character.portraitUrl ? (
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

            {OVERLAY_SLOTS.map(({ label, position }) => {
              const instance = equippedInSlot(character.items, label);
              return (
                <div className={`${styles.equipSlotOverlay} ${position}`} key={label}>
                  {instance ? (
                    <EquipSlotIcon instance={instance} catalog={catalog} />
                  ) : (
                    <span className={styles.equipSlotLabel}>{label}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.handSlotRow}>
            {HAND_RING_SLOTS.map((label) => {
              const instance = equippedInSlot(character.items, label);
              // A two-handed item's slotRef holds both hands at once (see
              // equip_item) - Right Hand always shows the normal icon, Left
              // Hand mirrors it only when it's the SAME instance spanning
              // both, not an independent one-handed item held there alone.
              const mirrored = label === "Left Hand" && !!instance && instance.slotRef.includes("Right Hand");
              return (
                <div className={styles.equipSlot} key={label}>
                  {instance ? (
                    <EquipSlotIcon instance={instance} catalog={catalog} mirrored={mirrored} />
                  ) : (
                    <span className={styles.equipSlotLabel}>{label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.companionMountRow}>
        {COMPANION_MOUNT_SLOTS.map((label) => {
          const instance = equippedInSlot(character.items, label);
          return (
            <div className={styles.largeEquipSlot} key={label}>
              {instance ? (
                <EquipSlotIcon instance={instance} catalog={catalog} />
              ) : (
                <span className={styles.equipSlotLabel}>{label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
