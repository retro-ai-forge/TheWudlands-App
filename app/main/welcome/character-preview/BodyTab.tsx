import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// No equipped-item/gear-slot model exists on the backend yet - these are
// purely a visual layout for where equipped gear will render once that
// exists. Every slot shows as empty for now.
// Overlaid directly on the portrait: head/chest/legs down the left edge,
// back/side down the right edge. The right-edge slot below Back used to be
// labeled "Girdle" too - renamed to "Side" now that Girdle itself moved
// below the portrait, between the two hand slots.
const OVERLAY_SLOTS = [
  { label: "Head", position: styles.equipSlotHead },
  { label: "Neck", position: styles.equipSlotNeck },
  { label: "Chest", position: styles.equipSlotChest },
  { label: "Legs", position: styles.equipSlotLegs },
  { label: "Back", position: styles.equipSlotBack },
  { label: "Side", position: styles.equipSlotGirdle },
];
// Sit below the portrait instead, side by side - a hand holding something
// doesn't read well as a small badge pinned to the image itself. Girdle
// (the belt) sits centered between them.
const HAND_SLOTS = ["Left Hand", "Girdle", "Right Hand"];
// A second row below that, same size/gap/centering (reuses .handSlotRow).
const RING_SLOTS = ["Left Ring", "Right Ring"];

/** Body page: the full character frame the player defined, with equipment slots overlaid on it. */
export function BodyTab({ character }: { character: SlotCharacterSummary }) {
  // .frameBox's CSS aspect-ratio (2/3) is only a fallback for portraits
  // saved before portraitFrameArea carried its own aspectRatio - once that
  // field is present, it's this character's own saved frame shape and
  // takes over via inline style, since the CSS default is only ever an
  // approximation (the editor's frame can render at a slightly different
  // ratio than its nominal one depending on the viewport it was framed on).
  const frameAspectRatio = character.portraitFrameArea?.aspectRatio;

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

            {OVERLAY_SLOTS.map(({ label, position }) => (
              <div className={`${styles.equipSlotOverlay} ${position}`} key={label}>
                <span className={styles.equipSlotLabel}>{label}</span>
                <span className={styles.equipSlotEmpty}>Empty</span>
              </div>
            ))}
          </div>

          <div className={styles.handSlotRow}>
            {HAND_SLOTS.map((label) => (
              <div className={styles.equipSlot} key={label}>
                <span className={styles.equipSlotLabel}>{label}</span>
                <span className={styles.equipSlotEmpty}>Empty</span>
              </div>
            ))}
          </div>

          <div className={styles.handSlotRow}>
            {RING_SLOTS.map((label) => (
              <div className={styles.equipSlot} key={label}>
                <span className={styles.equipSlotLabel}>{label}</span>
                <span className={styles.equipSlotEmpty}>Empty</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
