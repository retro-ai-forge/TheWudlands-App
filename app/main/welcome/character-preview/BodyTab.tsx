import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// No equipped-item/gear-slot model exists on the backend yet - these are
// purely a visual layout for where equipped gear will render once that
// exists. Every slot shows as empty for now.
const EQUIP_SLOTS = ["Head", "Chest", "Legs", "Main Hand", "Off Hand", "Accessory"];

/** Body page: the full character frame the player defined, plus equipment slots. */
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

        <div className={styles.slotGrid}>
          {EQUIP_SLOTS.map((label) => (
            <div className={styles.equipSlot} key={label}>
              <span className={styles.equipSlotLabel}>{label}</span>
              <span className={styles.equipSlotEmpty}>Empty</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
