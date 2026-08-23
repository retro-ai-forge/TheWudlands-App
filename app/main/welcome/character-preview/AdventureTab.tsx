import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

export function AdventureTab({ character }: { character: SlotCharacterSummary }) {
  return (
    <div className={styles.panel}>
      <p className={styles.placeholderNote}>
        Adventures {character.firstName} can enter will be listed here once addon selection
        is wired up to the character sheet.
      </p>
    </div>
  );
}
