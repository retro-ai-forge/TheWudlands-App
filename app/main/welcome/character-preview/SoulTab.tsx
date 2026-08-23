import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// Soul and slot artwork hasn't been provided yet - this is a layout
// placeholder, ready to receive real images and equip logic later.
const SOUL_SLOTS = ["Sigil", "Ember", "Ward", "Rune", "Echo", "Vow"];

export function SoulTab({ character }: { character: SlotCharacterSummary }) {
  return (
    <div className={styles.panel}>
      <div className={styles.soulLayout}>
        <div className={styles.soulOrb}>Soul art coming soon</div>

        <div className={styles.soulSlotGrid}>
          {SOUL_SLOTS.map((label) => (
            <div className={styles.equipSlot} key={label}>
              <span className={styles.equipSlotLabel}>{label}</span>
              <span className={styles.equipSlotEmpty}>Empty</span>
            </div>
          ))}
        </div>
      </div>
      <p className={styles.placeholderNote}>
        {character.firstName}&apos;s soul equipment will appear here once soul and slot artwork is ready.
      </p>
    </div>
  );
}
