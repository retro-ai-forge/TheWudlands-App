import styles from "./CharacterTabs.module.css";
import type { RawPlayerData } from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

export function AdventureTab({
  character,
  onPlayerDataUpdated,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
  return (
    <div className={styles.panel}>
      <p className={styles.placeholderNote}>
        Adventures {character.firstName} can enter will be listed here once addon selection
        is wired up to the character sheet.
      </p>
    </div>
  );
}
