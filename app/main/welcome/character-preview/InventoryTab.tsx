import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// Resource/tool ids are catalog keys (e.g. "iron_ore") - no per-id
// display-name lookup is wired to this page yet, so ids are just formatted
// for reading.
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

// Ids owned (quantity > 0) across one or more stackable pools, deduplicated -
// used to build the recipe viewer's "?tools=" / "?blueprints=" ownership
// lists, which only care whether something is owned at all, not how many.
function ownedIds(...pools: Record<string, number>[]): string[] {
  const ids = new Set<string>();
  for (const pool of pools) {
    for (const [id, qty] of Object.entries(pool)) {
      if (qty > 0) ids.add(id);
    }
  }
  return [...ids];
}

/** Exchange page: this character's own vault next to the player's shared vault. */
export function InventoryTab({
  character,
  playerResourceBalances,
  playerTools,
  playerToolStarter,
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
  playerToolStarter: Record<string, number>;
}) {
  // Blueprints are soulbound to the character (never move to the player's
  // shared pool), so both the regular and starter lists always count as
  // "known" for the recipe viewer's missing-blueprint check.
  const knownBlueprints = [...character.blueprints, ...character.blueprintStarter];
  // A tool counts as available whether it's still sitting in the player's
  // shared pool or already checked out onto this character - both mean the
  // character can use it.
  const ownedTools = ownedIds(playerTools, playerToolStarter, character.tools, character.toolStarter);

  return (
    <div className={styles.panel}>
      <div className={styles.inventoryLayout}>
        <div className={styles.inventoryColumn}>
          <div className={styles.inventoryColumnHeading}>{character.firstName}&apos;s Vault</div>
          <ResourceList balances={character.resourceBalances} emptyLabel="No materials carried." />
          {Object.keys(character.tools).length > 0 && (
            <div className={styles.inventoryRow}>
              <span>Tools Held</span>
              <span>{ownedIds(character.tools).map(formatResourceLabel).join(", ")}</span>
            </div>
          )}
          {Object.keys(character.toolStarter).length > 0 && (
            <div className={styles.inventoryRow}>
              <span>Starter Tools Held</span>
              <span>{ownedIds(character.toolStarter).map(formatResourceLabel).join(", ")}</span>
            </div>
          )}
        </div>

        <div className={styles.inventoryColumn}>
          <div className={styles.inventoryColumnHeading}>Shared Vault</div>
          <ResourceList balances={playerResourceBalances} emptyLabel="Nothing in the shared vault." />
          {ownedTools.length > 0 && (
            <div className={styles.inventoryRow}>
              <span>Tools Owned</span>
              <span>{ownedTools.map(formatResourceLabel).join(", ")}</span>
            </div>
          )}
        </div>
      </div>
      <p className={styles.placeholderNote}>
        Moving items between vaults isn&apos;t wired up yet - this shows both sides for now.
      </p>
      <a
        href={`/craft/recipe-viewer.html?inv=${encodeURIComponent(
          JSON.stringify(character.resourceBalances)
        )}&tools=${encodeURIComponent(JSON.stringify(ownedTools))}&blueprints=${encodeURIComponent(
          JSON.stringify(knownBlueprints)
        )}&return=${encodeURIComponent(`/?character=${character.id}&tab=inventory`)}`}
        className={styles.recipeViewerLink}
      >
        Browse Crafting Recipes
      </a>
    </div>
  );
}
