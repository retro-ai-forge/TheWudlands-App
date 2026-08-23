import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// Resource ids are catalog keys (e.g. "iron_ore") - no per-id display-name
// lookup is wired to this page yet, so ids are just formatted for reading.
function formatResourceLabel(id: string): string {
  return id
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ResourceList({
  balances,
  emptyLabel,
}: {
  balances: Record<string, number>;
  emptyLabel: string;
}) {
  const entries = Object.entries(balances).filter(([, qty]) => qty > 0);
  if (entries.length === 0) {
    return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;
  }
  return (
    <>
      {entries.map(([id, qty]) => (
        <div className={styles.inventoryRow} key={id}>
          <span>{formatResourceLabel(id)}</span>
          <span>{qty}</span>
        </div>
      ))}
    </>
  );
}

/** Exchange page: this character's own vault next to the player's shared vault. */
export function InventoryTab({
  character,
  playerResourceBalances,
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.inventoryLayout}>
        <div className={styles.inventoryColumn}>
          <div className={styles.inventoryColumnHeading}>{character.firstName}&apos;s Vault</div>
          <ResourceList balances={character.resourceBalances} emptyLabel="No materials carried." />
          {character.tools.length > 0 && (
            <div className={styles.inventoryRow}>
              <span>Tools</span>
              <span>{character.tools.map(formatResourceLabel).join(", ")}</span>
            </div>
          )}
        </div>

        <div className={styles.inventoryColumn}>
          <div className={styles.inventoryColumnHeading}>Shared Vault</div>
          <ResourceList balances={playerResourceBalances} emptyLabel="Nothing in the shared vault." />
        </div>
      </div>
      <p className={styles.placeholderNote}>
        Moving items between vaults isn&apos;t wired up yet - this shows both sides for now.
      </p>
    </div>
  );
}
