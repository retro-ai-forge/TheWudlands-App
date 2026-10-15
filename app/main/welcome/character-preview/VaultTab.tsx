import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import type { ItemInstance } from "../SoulSlotGrid";
export type { ItemInstance } from "../SoulSlotGrid";
import { getResourceCatalog, getToolCatalog, getItemCatalog } from "./catalogCache";

export type BlueprintTierInfo = Record<
  string,
  {
    tier: number;
    familyId: string;
    kind: string;
    name?: string;
    qualityMax?: number | null;
    armorClass?: number | null;
    /** Per-tier art path (item-catalog only) - "" when this family/tier has no dedicated art yet. */
    icon?: string;
    /** Family-level stack size (item-catalog only) - 1 means never stacked, so the grid hides its owned-count badge. */
    stackSize?: number;
    /** Per-tier flavor text (item-catalog only) - "" when this family/tier has no dedicated text yet. */
    description?: string;
    /** Family-level backpack slot-cost bucket (item-catalog only), e.g. "tiny"/"light"/"medium". */
    sizeClass?: string;
    /** Family-level - alternative full slot-groups valid for one equip action (item-catalog only), e.g. [["Left Hand"],["Right Hand"]] for a sword or [["Left Hand","Right Hand"],["Mount"]] for a portable station. Non-empty only for needsItemDefinition:true families. */
    equipSlots?: string[][];
    /** Family-level (item-catalog only) - whether a move-to-backpack action applies at all. */
    backpackable?: boolean;
    /** Family-level (item-catalog only) - raw materials this family grants a foraging/gathering bonus for, e.g. ["ore","stone","crystal"] for a pickaxe. */
    gatheringBonuses?: string[];
    /** Per-tier (item-catalog only) - slot capacity of a backpack/saddlepack/cart tier, 0 for anything else. */
    capacitySlots?: number;
    /** Per-tier (item-catalog only) - mount/companion carry capacity (slot-weight limit), 0 otherwise. */
    carryCapacity?: number;
    /** Per-tier creature size (Medium/Heavy/Huge/Colossal) for mounts, empty otherwise. */
    size?: string;
  }
>;
export type ResourceTierInfo = Record<
  string,
  { tier: number; family: string; category: "raw" | "processed"; name?: string; icon?: string }
>;

// The raw shape returned by /me/characters and every check-in/check-out
// transfer endpoint (backend.players.Player.to_dict()) - enough to refresh
// the whole roster after a transfer. The vault is now per-character and
// lives inside each SlotCharacterSummary as character.vault.
export type RawPlayerData = {
  characters: SlotCharacterSummary[];
};

// GET /me/characters/{characterId}/salvage-preview/{itemId} (backend.
// recycling.RawMaterialRecovery (module name), camelCased by auth_routes.py's
// SalvagePreviewResponse) - what salvaging would hand back, one entry per
// recoverable raw material family. Exported so CampView.tsx's own
// ChopBlockPopup (the chopping block's bulk-salvage popup, which gets the
// SAME per-material breakdown per row from GET .../camp/salvage-preview)
// can reuse this exact shape instead of redeclaring a parallel one.
export type SalvageYield = { base: number; skill: number; tool: number; charm: number; total: number };
export type SalvageRecoveredLine = {
  familyId: string;
  id: string;
  name: string;
  tier: number;
  category: "raw" | "processed";
  qty: number;
};
export type SalvageMaterial = {
  rawFamilyId: string;
  rawName: string;
  totalUnits: number;
  yieldBreakdown: SalvageYield;
  recoveredUnits: number;
  recovered: SalvageRecoveredLine[];
};
/** An item instance's quality state as the salvage endpoints report it -
 * balance items (no instance) are always "new". */
export type SalvageCondition = "new" | "used" | "damaged";
type SalvagePreview = { materials: SalvageMaterial[]; condition?: SalvageCondition };

/** A worn instance&apos;s salvage penalty - mirrors backend.recycling.
 * CONDITION_PENALTY (used -20pp, damaged -50pp, floored at 0). Display
 * only: recoveredUnits already has it applied server-side. */
const SALVAGE_CONDITION_PENALTY: Partial<Record<SalvageCondition, { percent: number; label: string }>> = {
  used: { percent: 20, label: "used" },
  damaged: { percent: 50, label: "dam" },
};

/** One raw material's yield formula, e.g. "25 + 0 skill + 5 tool + 0 charm
 * -20% used = 24%" - the condition penalty sits inside the same formula
 * (left out entirely for a "new" item) and the result is the effective
 * percent. Shared by every salvage view (single item, camp, containers). */
export function SalvageFormulaLine({ breakdown, condition }: { breakdown: SalvageYield; condition?: SalvageCondition }) {
  const penalty = condition ? SALVAGE_CONDITION_PENALTY[condition] : undefined;
  const effective = penalty ? Math.max(breakdown.total - penalty.percent, 0) : breakdown.total;
  return (
    <p className={styles.salvageFormulaLine}>
      {breakdown.base} + {breakdown.skill} skill +{" "}
      <span className={breakdown.tool === 0 ? styles.salvageFormulaZero : undefined}>{breakdown.tool} tool</span> +{" "}
      {breakdown.charm} charm{" "}
      {penalty && (
        <>
          <span className={styles.salvageFormulaPenalty}>
            -{penalty.percent}% {penalty.label}
          </span>{" "}
        </>
      )}
      = {effective}%
    </p>
  );
}

const TRANSFER_AMOUNTS = [1, 2, 5, 10, 20, 50] as const;
// Tools' own quantity row keeps the full TRANSFER_AMOUNTS (drawing from a
// shared pool that can hold hundreds of units), but every resource/
// processed-material move (Party's Resources' own row, and a single
// packed/camped resource's popup - see ResourcePopup) drops 50 - at
// typical backpack/camp quantities it's rarely reachable anyway, and the
// shorter row reads cleaner.
// Raw/processed materials and stackable itemBalances rows alike - a
// genuine resource/itemBalance row always pairs with a destinationIcon
// (see TransferButtons' own comment), so the ∞ button is redundant there
// and gets swapped for a plain "40" instead (a full raw-material backpack
// slot's worth - see the README's own Stacking Limits table), rather than
// showing two buttons that both mean "move everything".
const RAW_RESOURCE_AMOUNTS = [1, 5, 10, 50] as const;

// Backpack/camp stack sizes for raw vs processed materials (see backend.
// items_catalog.RAW_STACK_SIZE/PROCESSED_STACK_SIZE, sourced from
// item-size-classes.json - the same 40/20 the "40" button above and
// RAW_RESOURCE_AMOUNTS' own comment already reference) - used to split a
// resource's owned quantity into one grid tile per backpack slot it
// actually occupies (see ItemGrid/ResourceTiles' own expandedResourceIds),
// the same principle an itemBalance's own per-family stackSize already
// gets (see ItemGrid's own expandedIds).
const RAW_STACK_SIZE = 40;
const PROCESSED_STACK_SIZE = 20;

const SLOT_COST_BY_SIZE: Record<string, number> = {
  tiny: 1, light: 1, medium: 2, heavy: 4, xLarge: 16,
};

export function stripStackSuffix(key: string): string {
  const hash = key.lastIndexOf("#");
  return hash === -1 ? key : key.slice(0, hash);
}

export function selectionWeight(
  selectedIds: Set<string>,
  tierInfo: BlueprintTierInfo,
  balances: Record<string, number>,
  lookupIds?: Record<string, string>,
  resourceBalances?: Record<string, number>,
  resourceTierInfo?: ResourceTierInfo,
): number {
  let total = 0;
  for (const raw of selectedIds) {
    if (raw.startsWith("res:")) {
      total += 1;
    } else {
      const id = stripStackSuffix(raw);
      const info = tierInfo[lookupIds?.[id] ?? id];
      const slotCost = SLOT_COST_BY_SIZE[info?.sizeClass ?? "tiny"] ?? 1;
      const isInstance = lookupIds?.[id] !== undefined;
      if (isInstance) {
        total += slotCost;
      } else {
        const stackSize = Math.max(1, info?.stackSize ?? 1);
        const qty = balances[id] ?? 0;
        const hash = raw.lastIndexOf("#");
        const tileIdx = hash === -1 ? 0 : parseInt(raw.slice(hash + 1), 10);
        const itemsInTile = Math.max(0, Math.min(stackSize, qty - tileIdx * stackSize));
        const sizeClass = info?.sizeClass ?? "tiny";
        total += sizeClass === "tiny"
          ? (itemsInTile > 0 ? slotCost : 0)
          : itemsInTile * slotCost;
      }
    }
  }
  return total;
}

/** The row of quick-transfer quantity buttons revealed under a clicked resource/tool row. */
function TransferButtons({
  owned,
  pending,
  onPick,
  destinationIcon,
  destinationLabel = "Backpack",
  amounts = TRANSFER_AMOUNTS,
  showInfinity = true,
  showHalf = false,
}: {
  owned: number;
  pending: boolean;
  onPick: (amount: number) => void;
  destinationIcon?: string;
  destinationLabel?: string;
  amounts?: readonly number[];
  showInfinity?: boolean;
  showHalf?: boolean;
}) {
  return (
    <div className={styles.transferButtons}>
      {amounts.map((amount) => (
        <button
          key={amount}
          type="button"
          className={styles.transferButton}
          disabled={pending || amount > owned}
          onClick={(e) => {
            e.stopPropagation();
            onPick(amount);
          }}
        >
          {amount}
        </button>
      ))}
      {showHalf && (
        <button
          type="button"
          className={styles.transferButton}
          disabled={pending || owned < 2}
          onClick={(e) => {
            e.stopPropagation();
            onPick(Math.floor(owned / 2));
          }}
        >
          ½
        </button>
      )}
      {showInfinity && (
        <button
          type="button"
          className={styles.transferButton}
          disabled={pending || owned <= 0}
          onClick={(e) => {
            e.stopPropagation();
            onPick(owned);
          }}
        >
          <span className={styles.itemPopupInfinityGlyph}>∞</span>
        </button>
      )}
      {destinationIcon && (
        <button
          type="button"
          aria-label={destinationLabel}
          title={destinationLabel}
          className={styles.transferDestinationIcon}
          style={{ backgroundImage: `url(${destinationIcon})` }}
          disabled={pending || owned <= 0}
          onClick={(e) => {
            e.stopPropagation();
            onPick(owned);
          }}
        />
      )}
    </div>
  );
}

// Fallback for ids with no catalog name wired up (currently just Tools) -
// mechanically formats the id itself for reading. The "blueprint_" prefix
// is dropped since whichever list a blueprint id shows up in is already
// headed "Blueprints Known"/"Starter Blueprints Known".
export function formatResourceLabel(id: string): string {
  return id
    .replace(/^blueprint_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// "+5 Ore XP, +3 Wood XP, +16 Final XP" - the Craft button's own detail
// line, built from getCurrentSelectionXp's preview. Raw families are
// formatted the same mechanical way professions' resource-family caption
// already does (there's no per-family display-name catalog for these,
// just category ids like "ore"/"monster_part").
export function formatXpPreview(preview: { rawXp: Record<string, number>; finalXp: number } | null): string {
  if (!preview) return "";
  const parts = Object.entries(preview.rawXp).map(([family, xp]) => `+${xp} ${formatResourceLabel(family)} XP`);
  if (preview.finalXp > 0) parts.push(`+${preview.finalXp} Final XP`);
  return parts.join(", ");
}

// How long the "Finished: ..." result line stays visible (fading out) after
// a craft completes, before it's cleared entirely - matches the CSS fade
// animation's own duration (see .craftResultFading in CharacterTabs.module.css).
export const CRAFT_RESULT_FADE_MS = 8000;

// Resolves an active craft's {familyId, tier} to a display name - the same
// question backend.players._resolve_recipe_output answers server-side, but
// there's no single "recipe output" endpoint to ask, so this scans the two
// tier-info maps that between them cover every possible recipe output
// (resourceTierInfo: raw/processed materials; itemCatalogTierInfo: all 118
// item-inventory-properties.json families, instance-tracked or not) for the
// entry at that exact family+tier. Falls back to a mechanical label from
// the family id if somehow neither catalog has it yet (e.g. mid-fetch).
export function resolveOutputName(
  familyId: string,
  tier: number,
  resourceTierInfo: ResourceTierInfo,
  itemCatalogTierInfo: BlueprintTierInfo
): string {
  for (const info of Object.values(resourceTierInfo)) {
    if (info.family === familyId && info.tier === tier) return info.name ?? formatResourceLabel(familyId);
  }
  for (const info of Object.values(itemCatalogTierInfo)) {
    if (info.familyId === familyId && info.tier === tier) return info.name ?? formatResourceLabel(familyId);
  }
  return formatResourceLabel(familyId);
}

// Same "the headline already says Blueprint(s)" reasoning as
// formatResourceLabel's id-prefix strip, applied to a real catalog name
// (e.g. "Blueprint: Cotton Cloth" -> "Cotton Cloth").
function stripBlueprintPrefix(name: string): string {
  return name.replace(/^Blueprint:\s*/, "");
}

function getToolFamilyIcon(familyId: string): string {
  switch (familyId) {
    case "anvil": return "🔨";
    case "furnace": return "🔥";
    case "oven": return "🍞";
    case "loom": return "🧵";
    case "spinning_wheel": return "🌀";
    case "alchemy_stand": return "⚗️";
    case "mortar_and_pestle": return "🧂";
    case "tanning_rack": return "🪶";
    case "workbench": return "🪚";
    case "kiln": return "🏺";
    case "grinding_stone": return "💎";
    case "lapidary_bench": return "💍";
    case "smokehouse": return "🥩";
    case "scriptorium": return "📜";
    case "enchanters_table": return "✨";
    default: return "🔧";
  }
}

export function getKindIcon(kind: string): string {
  switch (kind) {
    case "tool":
      return "🔧";
    case "weapon":
      return "⚔️";
    case "armor":
      return "🥋";
    case "shield":
      return "🛡️";
    case "food":
      return "🍖";
    case "potion":
      return "🧪";
    case "adventuring_gear":
      return "🎒";
    case "essentials":
      return "📦";
    case "companion":
      return "🐾";
    case "mount":
      return "🐴";
    default:
      return "";
  }
}

export function getTierIndicator(tier: number): ReactNode {
  if (tier < 1 || tier > 6) return null;
  return <img src={`/icons/t${tier}.png`} alt={`T${tier}`} className={styles.tierIcon} draggable={false} />;
}


// Reads the real category from /resource-catalog (fetched into
// resourceTierInfo) rather than guessing from the id string - a
// resource's actual raw/processed split lives in
// resources_catalog.py/processed_catalog.py, and hand-maintaining a
// pattern list here just means every new processed material (carcass
// among them) silently shows up misclassified until someone notices.
// Defaults to "raw" only in the brief window before the catalog fetch
// resolves, or if it fails.
function isProcessedResource(id: string, tierInfo?: ResourceTierInfo): boolean {
  return tierInfo?.[id]?.category === "processed";
}

function getResourceIcon(id: string, tierInfo?: ResourceTierInfo): string {
  return isProcessedResource(id, tierInfo) ? "⚒️" : "🪨";
}

export function ResourceList({
  balances,
  emptyLabel,
  tierInfo,
  onTransfer,
  amounts = TRANSFER_AMOUNTS,
  showInfinity = true,
  destinationIcon,
  destinationUnavailableLabel,
}: {
  balances: Record<string, number>;
  emptyLabel: string;
  tierInfo?: ResourceTierInfo;
  /** When given, clicking a row reveals quick-transfer quantity buttons that call this with (id, amount). */
  onTransfer?: (id: string, amount: number) => Promise<boolean>;
  /** Quick-transfer quantity options - see TransferButtons' own comment on its identical prop. */
  amounts?: readonly number[];
  /** See TransferButtons' own identical prop - false for Party's Resources (a genuine raw/processed-materials row, always paired with destinationIcon), true (default) for anything else, e.g. the crafting-staging resources list, which has no destinationIcon of its own. */
  showInfinity?: boolean;
  /** When given, shown as a small static icon at the end of every expanded
   * row - purely a label for where onTransfer sends the material (e.g. a
   * backpack icon), not a separate clickable trigger of its own. */
  destinationIcon?: string;
  /** When given (alongside destinationIcon), replaces the whole quantity-
   * button row with this text instead of the buttons - e.g. "No backpack
   * equipped"/"Backpack full" when there's nowhere for onTransfer to
   * actually put anything right now, rather than letting every click fail
   * server-side. */
  destinationUnavailableLabel?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const entries = Object.entries(balances).filter(([, qty]) => qty > 0);
  if (entries.length === 0) {
    return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;
  }

  const handlePick = async (id: string, amount: number) => {
    if (!onTransfer) return;
    setExpandedId(null);
    setPendingId(id);
    await onTransfer(id, amount);
    setPendingId(null);
  };

  // Split into processed and raw, group each by family
  const groupByFamilyAndType = (items: Array<[string, number]>) => {
    const familyGroups: Record<string, Array<[string, number]>> = {};
    const highestTierByFamily: Record<string, number> = {};

    for (const [id, qty] of items) {
      const tierData = tierInfo?.[id];
      const tier = tierData?.tier ?? 0;
      const family = tierData?.family ?? id;

      if (!familyGroups[family]) familyGroups[family] = [];
      familyGroups[family].push([id, qty]);

      if (tier > (highestTierByFamily[family] ?? 0)) {
        highestTierByFamily[family] = tier;
      }
    }

    // Sort families by highest tier descending
    const sortedFamilies = Object.keys(familyGroups).sort((a, b) => {
      const tierA = highestTierByFamily[a] ?? 0;
      const tierB = highestTierByFamily[b] ?? 0;
      if (tierB !== tierA) return tierB - tierA;
      return a.localeCompare(b);
    });

    return { familyGroups, highestTierByFamily, sortedFamilies };
  };

  // Separate processed and raw
  const processedItems = entries.filter(([id]) => isProcessedResource(id, tierInfo));
  const rawItems = entries.filter(([id]) => !isProcessedResource(id, tierInfo));

  const processedData = groupByFamilyAndType(processedItems);
  const rawData = groupByFamilyAndType(rawItems);

  const renderGroup = (familyGroups: Record<string, Array<[string, number]>>, highestTierByFamily: Record<string, number>, sortedFamilies: string[]) => {
    return (
      <table className={styles.inventoryTable}>
        <tbody>
          {sortedFamilies.flatMap((family) => {
            const familyItems = familyGroups[family].sort((a, b) => {
              const tierA = tierInfo?.[a[0]]?.tier ?? 0;
              const tierB = tierInfo?.[b[0]]?.tier ?? 0;
              return tierB - tierA;
            });

            return familyItems.flatMap(([id, qty]) => {
              const icon = getResourceIcon(id, tierInfo);
              const tierData = tierInfo?.[id];
              const tier = tierData?.tier ?? 0;
              const isGreyed = tier > 0 && highestTierByFamily[family] > tier;
              const isExpanded = expandedId === id;
              const rows = [
                <tr
                  key={id}
                  onClick={onTransfer ? () => setExpandedId(isExpanded ? null : id) : undefined}
                  className={onTransfer ? styles.transferableRow : undefined}
                >
                  <td style={isGreyed ? { color: "#665b42" } : undefined}>{icon}</td>
                  <td><span className={styles.tierSymbol}>{getTierIndicator(tier)}</span></td>
                  <td style={isGreyed ? { color: "#665b42" } : undefined}>{tierData?.name ?? formatResourceLabel(id)}</td>
                  <td>{qty}</td>
                </tr>,
              ];
              if (isExpanded && onTransfer) {
                rows.push(
                  <tr key={`${id}-transfer`}>
                    <td colSpan={4}>
                      {destinationUnavailableLabel ? (
                        <p className={styles.transferUnavailable}>{destinationUnavailableLabel}</p>
                      ) : (
                        <TransferButtons
                          owned={qty}
                          pending={pendingId === id}
                          onPick={(amount) => handlePick(id, amount)}
                          amounts={amounts}
                          showInfinity={showInfinity}
                          destinationIcon={destinationIcon}
                        />
                      )}
                    </td>
                  </tr>
                );
              }
              return rows;
            });
          })}
        </tbody>
      </table>
    );
  };

  const hasProcessed = processedData.sortedFamilies.length > 0;
  const hasRaw = rawData.sortedFamilies.length > 0;

  return (
    <>
      {renderGroup(processedData.familyGroups, processedData.highestTierByFamily, processedData.sortedFamilies)}
      {hasProcessed && hasRaw && <div className={styles.resourceDivider} />}
      {renderGroup(rawData.familyGroups, rawData.highestTierByFamily, rawData.sortedFamilies)}
    </>
  );
}

export function IdList({
  ids,
  emptyLabel,
  tierInfo,
  sortByTier,
  textColor,
  fixedIcon,
  balances,
  onTransfer,
  transferableIds,
  quantityHiddenIds,
  lookupIds,
  dividerClassName,
}: {
  ids: string[];
  emptyLabel: string;
  /** When given, prefixes each entry with "T1: "/"T2: "/... tier numbers. */
  tierInfo?: BlueprintTierInfo;
  /** Sort by tier descending (highest first) - requires `tierInfo`. */
  sortByTier?: boolean;
  /** Optional text color for item labels. */
  textColor?: string;
  /** When given, used as every row's icon instead of looking one up from `tierInfo`'s kind - for lists (like Tools) that are homogeneous by construction. */
  fixedIcon?: string;
  /** When given, adds a quantity column (like ResourceList's) looked up per id - for stackable owned counts (e.g. Tools), unlike Blueprints which are just owned/not. */
  balances?: Record<string, number>;
  /** When given (alongside `balances`), clicking a row reveals quick-transfer quantity buttons that call this with (id, amount). */
  onTransfer?: (id: string, amount: number) => Promise<boolean>;
  /** When given, only ids in this set are actually transferable - the rest render as plain, non-clickable rows even though `onTransfer`/`balances` are set (e.g. a merged list where only some entries support the action). Omit to make every row transferable, as before. */
  transferableIds?: Set<string>;
  /** When given, these ids skip the quantity column entirely - for individually-tracked item instances (needsItemDefinition:true), which never stack, so a bare "1" reads as a strange, meaningless count rather than useful information. */
  quantityHiddenIds?: Set<string>;
  /** When given, row id -> the id `tierInfo` should actually be looked up by - for a list where each row is its own uniquely-keyed thing (e.g. one row per item instanceId) but several rows can share the same underlying catalog entry (itemId). Defaults to each row using its own id, as before. */
  lookupIds?: Record<string, string>;
  /** Divider style between the item/tool split (see below) - defaults to the gold .resourceDivider; Blueprints Known passes the blue .toolsResourceDivider to match its own blue text color. */
  dividerClassName?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (ids.length === 0) return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;

  const handlePick = async (id: string, amount: number) => {
    if (!onTransfer) return;
    setExpandedId(null);
    setPendingId(id);
    await onTransfer(id, amount);
    setPendingId(null);
  };

  // Find highest tier for each family, both to grey out lower tiers and to
  // order families themselves (highest-tier family first) - same ordering
  // ResourceList's groupByFamilyAndType uses, so a family's tiers (e.g.
  // Ash Loom then Pine Loom) stay grouped together rather than interleaved
  // with other families at the same tier.
  const highestTierByFamily: Record<string, number> = {};
  if (tierInfo) {
    for (const id of ids) {
      const info = tierInfo[lookupIds?.[id] ?? id];
      if (info) {
        const current = highestTierByFamily[info.familyId] ?? 0;
        highestTierByFamily[info.familyId] = Math.max(current, info.tier);
      }
    }
  }

  const familyOrder = Object.keys(highestTierByFamily).sort((a, b) => {
    const tierDiff = highestTierByFamily[b] - highestTierByFamily[a];
    return tierDiff !== 0 ? tierDiff : a.localeCompare(b);
  });
  const familyIndex: Record<string, number> = {};
  familyOrder.forEach((familyId, index) => { familyIndex[familyId] = index; });

  const sortedIds = sortByTier && tierInfo
    ? [...ids].sort((a, b) => {
        const infoA = tierInfo[lookupIds?.[a] ?? a];
        const infoB = tierInfo[lookupIds?.[b] ?? b];
        if (!infoA || !infoB) return 0;
        // Tools last
        const aIsTool = infoA.kind === "tool";
        const bIsTool = infoB.kind === "tool";
        if (aIsTool !== bIsTool) return aIsTool ? 1 : -1;
        // Group non-tools by kind (armor together, shield together, etc.)
        if (infoA.kind !== infoB.kind) return infoA.kind.localeCompare(infoB.kind);
        // Then group by family (highest-tier family first)
        const familyDiff = familyIndex[infoA.familyId] - familyIndex[infoB.familyId];
        if (familyDiff !== 0) return familyDiff;
        // Then by tier descending within the family (highest first)
        return infoB.tier - infoA.tier;
      })
    : ids;

  const canTransferList = Boolean(onTransfer && balances);
  const columnCount = balances ? 4 : 3;

  const renderRow = (id: string) => {
    const canTransfer = canTransferList && (!transferableIds || transferableIds.has(id));
    const info = tierInfo?.[lookupIds?.[id] ?? id];
    const isGreyed = info && highestTierByFamily[info.familyId] > info.tier;
    const icon = fixedIcon ?? (info?.kind ? getKindIcon(info.kind) : "");
    const isExpanded = expandedId === id;
    const owned = balances?.[id] ?? 0;
    const rows = [
      <tr
        key={id}
        onClick={canTransfer ? () => setExpandedId(isExpanded ? null : id) : undefined}
        className={canTransfer ? styles.transferableRow : undefined}
      >
        <td>{icon}</td>
        <td><span className={styles.tierSymbol}>{info?.tier ? getTierIndicator(info.tier) : null}</span></td>
        <td style={{
          textAlign: "left",
          color: "#d4c9a8",
          ...(isGreyed ? { color: "#665b42" } : {}),
          ...(textColor && !isGreyed ? { color: textColor } : {}),
        }}>
          {info?.name ? stripBlueprintPrefix(info.name) : formatResourceLabel(lookupIds?.[id] ?? id)}
        </td>
        {balances && (
          <td>{quantityHiddenIds?.has(id) ? "" : owned}</td>
        )}
      </tr>,
    ];
    if (isExpanded && canTransfer) {
      rows.push(
        <tr key={`${id}-transfer`}>
          <td colSpan={columnCount}>
            <TransferButtons
              owned={owned}
              pending={pendingId === id}
              onPick={(amount) => handlePick(id, amount)}
            />
          </td>
        </tr>
      );
    }
    return rows;
  };

  // Mixed lists (blueprints: items then tools) get split into two tables
  // with a divider, mirroring ResourceList's processed/raw split. A
  // homogeneous list (e.g. Tools, all one kind) just renders as one table.
  if (tierInfo) {
    const nonToolIds = sortedIds.filter((id) => tierInfo[lookupIds?.[id] ?? id]?.kind !== "tool");
    const toolIds = sortedIds.filter((id) => tierInfo[lookupIds?.[id] ?? id]?.kind === "tool");
    return (
      <>
        {nonToolIds.length > 0 && (
          <table className={styles.inventoryTable}><tbody>{nonToolIds.flatMap(renderRow)}</tbody></table>
        )}
        {nonToolIds.length > 0 && toolIds.length > 0 && (
          <div className={dividerClassName ?? styles.resourceDivider} />
        )}
        {toolIds.length > 0 && (
          <table className={styles.inventoryTable}><tbody>{toolIds.flatMap(renderRow)}</tbody></table>
        )}
      </>
    );
  }

  return (
    <table className={styles.inventoryTable}>
      <tbody>{sortedIds.flatMap(renderRow)}</tbody>
    </table>
  );
}

// No dedicated art yet for every item family - most still fall back to
// this generic placeholder (matches item-inventory-properties.json's own
// former family-level default before per-tier art started landing there).
// Exported so BodyTab's equip-slot icons fall back to the exact same
// placeholder instead of duplicating the path.
export const FALLBACK_ITEM_ICON = "/images/items/xxx.png";

/** Every icon-rendering spot (ItemGrid's tile, BodyTab's equip slot,
 * ItemDetailPopup's larger image) shares this: a family with no real art
 * yet (icon missing, or still FALLBACK_ITEM_ICON's own generic image)
 * shows a dark "art coming soon" placeholder with a spinning loading ring
 * instead of that generic picture, rather than every call site
 * duplicating the same check.
 *
 * The ring is a real SVG (viewBox-centered `<circle>`), not a CSS
 * border-trick div - a border-trick ring's usual centering technique
 * (`top/left: 50%` + a negative percentage `margin` to pull it back by
 * half its own size) is a known CSS quirk: percentage margins - even
 * margin-TOP/BOTTOM - always resolve against the containing block's
 * WIDTH, never its height, so it only happens to look centered in a
 * perfectly square box and drifts everywhere else (confirmed live in
 * both the equip slots and the grid tiles). A `<circle>` centered on its
 * own viewBox has no such quirk - it's centered by construction,
 * regardless of the box's aspect ratio. Its `stroke-width` is also in
 * SVG user units, which scale automatically with however large the
 * `<svg>` itself renders (no separate per-context override needed the
 * way a CSS border-width, which can't use a percentage at all, would
 * require - see the equip slots' own much larger range of sizes). */
export function ItemIcon({
  icon,
  alt,
  className,
  style,
}: {
  icon?: string | null;
  alt: string;
  className: string;
  style?: React.CSSProperties;
}) {
  if (!icon || icon === FALLBACK_ITEM_ICON) {
    return (
      <div role="img" aria-label={alt} className={`${className} ${styles.itemIconLoading}`} style={style}>
        <svg viewBox="0 0 32 32" className={styles.itemIconLoadingSpinner} aria-hidden="true">
          <circle cx="16" cy="16" r="12" className={styles.itemIconLoadingTrack} />
          <circle cx="16" cy="16" r="12" className={styles.itemIconLoadingArc} />
        </svg>
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{ ...style, backgroundImage: `url(${icon})` }}
    />
  );
}

// Matches .itemGridCell's own width/height in CharacterTabs.module.css -
// kept in sync by hand (CSS modules give no clean way to read a class's
// computed size before layout). Used only as ItemGrid's height floor
// before its own measurement effect has run, and again as a lower bound
// afterward so a very cramped viewport still shows at least one full row
// instead of clipping it.
const ITEM_TILE_PX = 100;

// A native horizontal scrollbar's own rough thickness - the icon grid's
// scroll container is deliberately let run this much further down than
// it strictly needs to (see ItemGrid's measure()), so the scrollbar track
// itself lands underneath the page's fixed bottom bar (already stacked
// above it, z-index 5) and is visually covered by it, rather than sitting
// in a visible gap right above it. Doesn't add an extra icon row - the
// grid's own row tracks are still whole 64px multiples; this slack is
// just blank space below the last row.
const SCROLLBAR_OVERLAP_PX = 18;

// Matches .packedItemsRow's own CSS `gap: 0.35rem` - PackedItemsRow's own
// row-count math needs this in px to convert a target pixel budget into a
// whole number of tile rows.
const PACKED_ROW_GAP_PX = 5.6;

// Small breathing room the backpack popup's own card - and its packed
// item matrix - leave above the fixed footer bar, so the footer always
// stays fully visible below the popup (no vertical scroll; the card's
// own max-height and the matrix's own row count both target this same
// footer-aware ceiling).
const CARD_FOOTER_MARGIN_PX = 8;

// For the backpack item popup (see PackedItemsRow's measure() below):
// rows are maximised first; the icon keeps a steady CONTAINER_ICON_PX
// (the same size an empty container shows - see .backpackPopupCard >
// .itemPopupImg in CharacterTabs.module.css) and only shrinks below it
// once the rows need that space, capped at the card's own client width
// (the icon is square, so it never overflows sideways).
// ICON_MIN_VISIBLE_PX is the floor below which the icon is hidden
// entirely rather than rendered as a tiny unrecognisable sliver.
const CONTAINER_ICON_PX = 140;
const ICON_MIN_VISIBLE_PX = 48;


function SpecialTileScroll({ children }: { children: (gridHeight: number) => React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState<number>(ITEM_TILE_PX);
  useEffect(() => {
    const measure = () => {
      const el = scrollRef.current;
      if (!el || el.offsetParent === null) return;
      const footer = document.querySelector('[data-role="character-preview-topbar"]');
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      const available =
        window.innerHeight - el.getBoundingClientRect().top - footerHeight - 16 + SCROLLBAR_OVERLAP_PX;
      setGridHeight(Math.max(ITEM_TILE_PX, available));
    };
    measure();
    window.addEventListener("resize", measure);
    const el = scrollRef.current;
    let ro: ResizeObserver | undefined;
    if (el) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);
  return (
    <div ref={scrollRef} className={styles.itemGridScroll} style={{ height: gridHeight }}>
      {children(gridHeight)}
    </div>
  );
}

/** The Party's Vault tab's Items view - a horizontally-scrollable row of
 * 100x100 icon tiles (tier badge upper-left, owned-count badge lower-
 * right) replacing the old name/tier/quantity table. No name column and
 * no New/Used/Broken condition label - the icon alone identifies the
 * item, and quality/condition isn't shown here anymore. */
export function ItemGrid({
  ids,
  emptyLabel,
  tierInfo,
  balances,
  lookupIds,
  instanceQuality,
  instanceLocations,
  nonMovableIds,
  source = "vault",
  hasBackpackEquipped,
  hasSaddlepackEquipped,
  hasMountEquipped = false,
  hasCompanionEquipped = false,
  hasCartEquipped = false,
  inAdventure = false,
  characterId,
  characterFirstName,
  onPlayerDataUpdated,
  reserveBottomPx = 0,
  hideScrollbar = false,
  packedItems,
  saddlepackPackedItems,
  cartPackedItems,
  backpackSlotsUsed,
  backpackCapacity,
  saddlepackSlotsUsed,
  saddlepackCapacity,
  cartSlotsUsed,
  cartCapacity,
  mountCarryWeightUsed,
  mountCarryWeightCapacity,
  resourceBalances,
  resourceTierInfo,
  resourceDestinations,
  iconOverrides,
  selectMode,
  selectBusy,
  selectedIds,
  onLongPressItem,
  onToggleSelectItem,
  onLongPressResource,
  onToggleSelectResource,
  skipResourceStackSplit = false,
  resourceUrlPrefix,
}: {
  ids: string[];
  emptyLabel: string;
  tierInfo: BlueprintTierInfo;
  balances: Record<string, number>;
  /** When given, row id -> the id `tierInfo` should actually be looked up by - see IdList's identical prop. */
  lookupIds?: Record<string, string>;
  /** Row id (instanceId) -> that specific instance's current quality, for rows lookupIds resolves to a real item instance. */
  instanceQuality?: Record<string, number | null>;
  /** Row id (instanceId) -> "backpack" | "body" | "camp" - source:"character" only, decides whether the popup offers Unequip or Equip(+Check-in-to-vault) ("backpack" and "camp" both get the equip view - see check_in_item_instance/equip_item, which treat the two the same). Unused for source:"vault" (every pool row is location:"pool" by definition). */
  instanceLocations?: Record<string, "backpack" | "body" | "camp">;
  /** Row ids with no working move-to-backpack/equip path yet (ammo living in resources, not items/itemBalances) - the popup shows info only, no action buttons, for these. */
  nonMovableIds?: Set<string>;
  /** "vault" (default): rows live in the player's shared pool - the popup's move actions are equip-from-pool/move-to-backpack, salvage/destroy target the shared vault. "character": rows are this character's own backpack/body items or itemBalances - the popup's move actions are Unequip(-to-vault)/Move-to-backpack for a worn row, Equip/Check-in-to-vault for a backpacked one; salvage/destroy target this character's own holdings instead. */
  source?: "vault" | "character";
  /** Whether this character currently has a backpack worn - greys out the popup's "Move to backpack" button instead of letting the click fail server-side with "No backpack equipped". */
  hasBackpackEquipped: boolean;
  /** Whether this character's mount currently has a saddlepack worn - hides the popup's "Move to saddlepack" button entirely when false (see ItemDetailPopup's identical prop). */
  hasSaddlepackEquipped: boolean;
  hasMountEquipped?: boolean;
  hasCompanionEquipped?: boolean;
  hasCartEquipped?: boolean;
  /** source:"character" only - hides the popup's "Check in to vault" button while true, since there's no path back to the shared vault mid-adventure (see ItemDetailPopup's identical prop). */
  inAdventure?: boolean;
  characterId: string;
  /** source:"vault" only - passed straight through to ItemDetailPopup's identical prop. */
  characterFirstName?: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** Extra px subtracted off the fill-to-bottom height measurement below,
   * for a caller (CampView's campfire) that reserves its own fixed-height
   * region below this grid instead of letting it fill all the way down to
   * the footer bar the way the plain Vault tab usage does. */
  reserveBottomPx?: number;
  /** Hides the scroll container's own horizontal scrollbar track (still
   * scrolls via drag/touch/trackpad, just no visible bar) - off by
   * default so the Vault tab's own usage is unaffected; CampView opts in. */
  hideScrollbar?: boolean;
  /** source:"character" only - passed straight through to every tile's
   * own ItemDetailPopup (see its identical props) so a family:"backpack"
   * row - worn (BodyTab doesn't use ItemGrid) or sitting unequipped in
   * camp (CampView does) - can show what's packed inside/how full it is.
   * Character-level (see computeBackpackContents), so the SAME values
   * apply no matter which row/instance was actually clicked - CampView
   * computes this once per render and hands it to every tile alike. */
  packedItems?: {
    ids: string[];
    tierInfo: BlueprintTierInfo;
    balances: Record<string, number>;
    lookupIds: Record<string, string>;
    instanceQuality: Record<string, number | null>;
    resourceBalances: Record<string, number>;
    resourceTierInfo: ResourceTierInfo;
  };
  saddlepackPackedItems?: {
    ids: string[];
    tierInfo: BlueprintTierInfo;
    balances: Record<string, number>;
    lookupIds: Record<string, string>;
    instanceQuality: Record<string, number | null>;
    resourceBalances: Record<string, number>;
    resourceTierInfo: ResourceTierInfo;
  };
  cartPackedItems?: {
    ids: string[];
    tierInfo: BlueprintTierInfo;
    balances: Record<string, number>;
    lookupIds: Record<string, string>;
    instanceQuality: Record<string, number | null>;
    resourceBalances: Record<string, number>;
    resourceTierInfo: ResourceTierInfo;
  };
  backpackSlotsUsed?: number;
  backpackCapacity?: number;
  saddlepackSlotsUsed?: number;
  saddlepackCapacity?: number;
  cartSlotsUsed?: number;
  cartCapacity?: number;
  mountCarryWeightUsed?: number;
  mountCarryWeightCapacity?: number;
  /** Raw/processed materials sitting loose at this same location (e.g.
   * CampView's own gear.itemBalances.camp) - rendered as their own tiles
   * (see ResourceTiles) INSIDE this same wrapping grid, alongside the
   * item/itemBalance tiles above, rather than in a separate horizontally-
   * scrolling row of their own (they used to get one - see CampView's own
   * history - but that read as a second, disconnected section instead of
   * "everything sitting here", which is what this grid is for). Omitted
   * entirely (no tiles, no popup) for a caller with nothing of this kind
   * to show, e.g. the plain Vault tab's own ItemGrid usage. */
  resourceBalances?: Record<string, number>;
  resourceTierInfo?: ResourceTierInfo;
  /** Passed straight through to the ResourcePopup opened by clicking one of
   * this grid's own resource tiles - see ResourcePopup's identical prop
   * for why this varies by caller (a camp resource can reach both backpack
   * and vault; a packed one only ever reaches one of the two). */
  resourceDestinations?: ResourcePopupDestination[];
  iconOverrides?: Record<string, string>;
  selectMode?: boolean;
  selectBusy?: boolean;
  selectedIds?: Set<string>;
  onLongPressItem?: (id: string) => void;
  onToggleSelectItem?: (id: string) => void;
  onLongPressResource?: (id: string) => void;
  onToggleSelectResource?: (id: string) => void;
  skipResourceStackSplit?: boolean;
  resourceUrlPrefix?: (id: string) => string;
}) {
  // How tall the scroll container is allowed to be, measured against the
  // real remaining viewport space below it rather than a guessed vh
  // percentage - this is what lets the grid below (grid-template-rows:
  // repeat(auto-fill, 64px)) compute how many full rows actually fit
  // on screen right now. Re-measured on mount and on resize (a rotated
  // phone or a resized browser window changes how much space is left).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState<number>(ITEM_TILE_PX);
  useEffect(() => {
    const measure = () => {
      const el = scrollRef.current;
      if (!el || el.offsetParent === null) return;
      const footer = document.querySelector('[data-role="character-preview-topbar"]');
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      const available =
        window.innerHeight - el.getBoundingClientRect().top - footerHeight - 16 + SCROLLBAR_OVERLAP_PX - reserveBottomPx;
      setGridHeight(Math.max(ITEM_TILE_PX, available));
    };
    // Defer the initial measure to the next animation frame so that any
    // parent-level scroll-to-top effects (CharacterPreview scrolls the wizard
    // back to 0 when switching tabs) finish before we read getBoundingClientRect.
    // React flushes child effects before parent effects, so calling measure()
    // synchronously here would read a stale scroll offset and produce a tiny
    // available height, collapsing the grid to a single row.
    const rafId = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    const el = scrollRef.current;
    let ro: ResizeObserver | undefined;
    if (el) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [reserveBottomPx]);

  // The clicked tile's own row id (not its lookupIds-resolved concrete id -
  // the detail popup needs the SAME id back to re-read `balances`/`name`
  // for whichever exact row was clicked).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // How many units the SPECIFIC tile just clicked represents (see
  // expandedIds below) - a family split across several tiles (18 oil at
  // stackSize 10 is a "10" tile and an "8" tile) now opens the popup
  // scoped to just that one tile's own amount, not the family's full
  // total, so "Owned: X" and every quantity button/move-all in there only
  // ever act on what's actually sitting in the slot the player clicked.
  const [selectedTileCap, setSelectedTileCap] = useState<number>(0);
  // Same idea, for a resource tile (see below) - a separate id/popup since
  // a resource opens ResourcePopup, not ItemDetailPopup.
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  // Same idea as selectedTileCap above, for a resource tile.
  const [selectedResourceTileCap, setSelectedResourceTileCap] = useState<number>(0);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const startLongPress = useCallback(
    (id: string, isResource: boolean, e: React.PointerEvent) => {
      longPressFiredRef.current = false;
      if (selectMode) return;
      longPressStartPos.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        longPressTimerRef.current = null;
        if (isResource) onLongPressResource?.(id);
        else onLongPressItem?.(id);
      }, 500);
    },
    [selectMode, onLongPressItem, onLongPressResource]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressStartPos.current || !longPressTimerRef.current) return;
      const dx = e.clientX - longPressStartPos.current.x;
      const dy = e.clientY - longPressStartPos.current.y;
      if (dx * dx + dy * dy > 100) cancelLongPress();
    },
    [cancelLongPress]
  );

  const resourceIds = resourceBalances && resourceTierInfo ? sortResourceIds(resourceBalances, resourceTierInfo) : [];

  // Do NOT early-return here — scrollRef must always be in the DOM so the
  // measure effect can read getBoundingClientRect() before items arrive.
  // The empty label renders inside the container instead.

  // Same "one tile per backpack slot actually occupied" split as
  // expandedIds above, for raw/processed resources - stack size comes
  // from the family's own category (RAW_STACK_SIZE/PROCESSED_STACK_SIZE),
  // not a per-family field the way itemBalances has one, since every raw
  // family shares one stack size and every processed family shares the
  // other (see backend.items_catalog).
  const expandedResourceIds: { key: string; id: string; displayCount: number; tileCap: number }[] = [];
  for (const id of resourceIds) {
    const qty = resourceBalances?.[id] ?? 0;
    if (skipResourceStackSplit) {
      expandedResourceIds.push({ key: `${id}#0`, id, displayCount: qty, tileCap: qty });
    } else {
      const category = resourceTierInfo?.[id]?.category;
      const stackSize = category === "raw" ? RAW_STACK_SIZE : PROCESSED_STACK_SIZE;
      let remaining = qty;
      let i = 0;
      while (remaining > 0) {
        const inThisStack = Math.min(stackSize, remaining);
        expandedResourceIds.push({ key: `${id}#${i}`, id, displayCount: inThisStack, tileCap: inThisStack });
        remaining -= inThisStack;
        i += 1;
      }
    }
  }

  const idsExcludingResources = resourceTierInfo ? ids.filter((id) => !resourceTierInfo[lookupIds?.[id] ?? id]) : ids;
  const kindSortOrder: Record<string, number> = {
    weapon: 0, armor: 1, shield: 2, tool: 3, food: 4,
    potion: 5, adventuring_gear: 6, essentials: 7, companion: 8, mount: 9,
  };
  const sortedIds = [...idsExcludingResources].sort((a, b) => {
    const infoA = tierInfo[lookupIds?.[a] ?? a];
    const infoB = tierInfo[lookupIds?.[b] ?? b];
    const tierDiff = (infoA?.tier ?? 0) - (infoB?.tier ?? 0);
    if (tierDiff !== 0) return tierDiff;
    const kindA = kindSortOrder[infoA?.kind ?? ""] ?? 99;
    const kindB = kindSortOrder[infoB?.kind ?? ""] ?? 99;
    if (kindA !== kindB) return kindA - kindB;
    const acA = infoA?.armorClass ?? 0;
    const acB = infoB?.armorClass ?? 0;
    if (acA !== acB) return acA - acB;
    return (infoA?.familyId ?? "").localeCompare(infoB?.familyId ?? "");
  });

  // A flat itemBalance row is split into one grid tile PER BACKPACK SLOT
  // it actually occupies (see backend.items_catalog.backpack_slots_used's
  // own ceil(qty/stackSize) math) instead of one shared tile for the whole
  // balance - a family with no real stack (stackSize <= 1 - whetstone,
  // bedroll, crowbar, ...) gets one tile per owned unit, no count badge on
  // any of them (each already reads as exactly one); a family that DOES
  // batch (stackSize > 1 - oil, arrows, potions, ...) gets ceil(owned /
  // stackSize) tiles, each capped at stackSize and showing ITS OWN count,
  // not the family's full total - 18 oil at stackSize 10 is 2 tiles (10,
  // then 8), matching the 2 backpack slots it actually uses, not 1 tile
  // claiming "18" the way a single slot never could. A real item instance
  // (lookupIds resolves) is already its own row, one tile each, untouched
  // by this. The synthetic per-tile `key` is ONLY for React's own list
  // identity - every other use below (click, tierInfo lookups) still
  // reads the real `id`, so every tile of the same family opens the exact
  // same popup showing the whole family's balance the way it used to,
  // NOT anymore now that selectedTileCap exists (see below) - `id` is
  // still what tierInfo/name/icon are looked up by, but the popup's own
  // "owned" quantity is now this specific tile's own `tileCap`, not the
  // family's raw total. `displayCount` (null for an instance or a
  // stackSize<=1 unit tile) is what the count badge actually shows;
  // `tileCap` (always a real number - 1 for those same null-badge cases)
  // is what clicking this exact tile scopes the popup to.
  const expandedIds: { key: string; id: string; displayCount: number | null; tileCap: number }[] = [];
  for (const id of sortedIds) {
    const info = tierInfo[lookupIds?.[id] ?? id];
    const isInstance = lookupIds?.[id] !== undefined;
    const stackSize = info?.stackSize ?? 1;
    const owned = balances[id] ?? 0;
    if (isInstance) {
      expandedIds.push({ key: id, id, displayCount: null, tileCap: 1 });
    } else if (stackSize <= 1) {
      for (let i = 0; i < owned; i++) {
        expandedIds.push({ key: `${id}#${i}`, id, displayCount: null, tileCap: 1 });
      }
    } else {
      let remaining = owned;
      let i = 0;
      while (remaining > 0) {
        const inThisStack = Math.min(stackSize, remaining);
        expandedIds.push({ key: `${id}#${i}`, id, displayCount: inThisStack, tileCap: inThisStack });
        remaining -= inThisStack;
        i += 1;
      }
    }
  }

  let scrollClass = hideScrollbar ? `${styles.itemGridScroll} ${styles.itemGridScrollNoBar}` : styles.itemGridScroll;
  if (selectBusy) scrollClass += ` ${styles.itemGridScrollBusy}`;

  return (
    <div
      ref={scrollRef}
      className={scrollClass}
      style={{ height: gridHeight }}
    >
      {expandedIds.length === 0 && expandedResourceIds.length === 0 ? (
        <p className={styles.inventoryEmpty}>{emptyLabel}</p>
      ) : null}
      <div className={expandedIds.length + expandedResourceIds.length <= Math.floor(gridHeight / ITEM_TILE_PX) ? styles.itemGridRow : styles.itemGrid}>
        {expandedIds.map(({ key, id, displayCount, tileCap }) => {
          const info = tierInfo[lookupIds?.[id] ?? id];
          const name = info?.name ? stripBlueprintPrefix(info.name) : formatResourceLabel(lookupIds?.[id] ?? id);
          // Only a real item instance carries a quality (isInstance rows -
          // same condition ItemDetailPopup uses for its "Quality: X/Y"
          // line) - a stackable balance row has no such concept, so it
          // gets no bar at all rather than a misleading full-green one.
          const currentQuality = instanceQuality?.[id];
          const qualityFraction =
            lookupIds?.[id] !== undefined && info?.qualityMax != null && currentQuality != null
              ? Math.max(0, Math.min(1, info.qualityMax > 0 ? currentQuality / (info.qualityMax * (2 ** (info.tier - 1))) : 1))
              : null;
          // Same cutoff as the quality bar's own red band (qualityState) -
          // a damaged instance gets a red-tinted tile background too, not
          // just the thin bar along its bottom edge, so it reads at a
          // glance in a full grid instead of needing a close look at one
          // 5px sliver.
          const isDamaged = qualityFraction !== null && qualityState(qualityFraction) === "damaged";
          const isSelected = selectMode && selectedIds?.has(key);
          let cellClass = styles.itemGridCell;
          if (isDamaged) cellClass += ` ${styles.itemGridCellDamaged}`;
          if (isSelected) cellClass += ` ${styles.itemGridCellSelected}`;
          return (
            <button
              key={key}
              type="button"
              className={cellClass}
              title={name}
              onClick={() => {
                if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                if (selectMode) { onToggleSelectItem?.(key); return; }
                setSelectedId(id);
                setSelectedTileCap(tileCap);
              }}
              onPointerDown={(e) => startLongPress(key, false, e)}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerMove={handlePointerMove}
              onContextMenu={(e) => e.preventDefault()}
            >
              <ItemIcon icon={iconOverrides?.[lookupIds?.[id] ?? id] ?? info?.icon} alt={name} className={styles.itemGridImg} />
              {!!info?.tier && (
                <span className={styles.itemGridTierBadge}>
                  {getTierIndicator(info.tier)}
                </span>
              )}
              {displayCount !== null && displayCount > 1 && <span className={styles.itemGridCountBadge}>{displayCount}</span>}
              {isSelected && <span className={styles.itemGridCheckmark}>&#x2713;</span>}
              {qualityFraction !== null && (
                <div
                  className={styles.itemGridQualityBar}
                  style={{ backgroundColor: qualityBarColor(qualityFraction) }}
                />
              )}
            </button>
          );
        })}
        {expandedResourceIds.map(({ key, id, displayCount, tileCap }) => {
          const info = resourceTierInfo?.[id];
          const fullName = info?.name ?? formatResourceLabel(id);
          const label = fullName.split(" ").pop() ?? fullName;
          const resKey = `res:${key}`;
          const isResSelected = selectMode && selectedIds?.has(resKey);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.itemGridCell}${isResSelected ? ` ${styles.itemGridCellSelected}` : ""}`}
              title={fullName}
              onClick={() => {
                if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                if (selectMode) { onToggleSelectResource?.(key); return; }
                setSelectedResourceId(id);
                setSelectedResourceTileCap(tileCap);
              }}
              onPointerDown={(e) => startLongPress(key, true, e)}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerMove={handlePointerMove}
              onContextMenu={(e) => e.preventDefault()}
            >
              {info?.icon ? (
                <ItemIcon icon={info.icon} alt={fullName} className={styles.itemGridImg} />
              ) : (
                <span className={styles.itemGridResourceLabel}>{label}</span>
              )}
              {!!info?.tier && (
                <span className={styles.itemGridTierBadge}>
                  {getTierIndicator(info.tier)}
                </span>
              )}
              {displayCount > 1 && <span className={styles.itemGridCountBadge}>{displayCount}</span>}
              {isResSelected && <span className={styles.itemGridCheckmark}>&#x2713;</span>}
            </button>
          );
        })}
      </div>
      {selectedResourceId && resourceTierInfo && (
        <ResourcePopup
          resourceId={selectedResourceId}
          tierInfo={resourceTierInfo}
          owned={selectedResourceTileCap}
          characterId={characterId}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedResourceId(null)}
          destinations={resourceDestinations ?? []}
          urlPrefix={resourceUrlPrefix?.(selectedResourceId)}
        />
      )}
      {selectedId && (
        <ItemDetailPopup
          info={tierInfo[lookupIds?.[selectedId] ?? selectedId]}
          fallbackName={formatResourceLabel(lookupIds?.[selectedId] ?? selectedId)}
          owned={selectedTileCap}
          isInstance={lookupIds?.[selectedId] !== undefined}
          movable={!nonMovableIds?.has(selectedId)}
          quality={instanceQuality?.[selectedId] ?? null}
          moveId={selectedId}
          location={instanceLocations?.[selectedId]}
          source={source}
          hasBackpackEquipped={hasBackpackEquipped}
          hasSaddlepackEquipped={hasSaddlepackEquipped}
          hasMountEquipped={hasMountEquipped}
          hasCompanionEquipped={hasCompanionEquipped}
          inAdventure={inAdventure}
          duplicateContainer={(() => {
            const fam = tierInfo[lookupIds?.[selectedId] ?? selectedId]?.familyId;
            if (!fam) return false;
            if (fam === "backpack" && hasBackpackEquipped) return true;
            if (fam === "saddlepack" && hasSaddlepackEquipped) return true;
            if (fam === "cart" && hasCartEquipped) return true;
            return false;
          })()}
          characterId={characterId}
          characterFirstName={characterFirstName}
          packedItems={packedItems}
          saddlepackPackedItems={saddlepackPackedItems}
          cartPackedItems={cartPackedItems}
          backpackSlotsUsed={backpackSlotsUsed}
          backpackCapacity={backpackCapacity}
          saddlepackSlotsUsed={saddlepackSlotsUsed}
          saddlepackCapacity={saddlepackCapacity}
          cartSlotsUsed={cartSlotsUsed}
          cartCapacity={cartCapacity}
          mountCarryWeightUsed={mountCarryWeightUsed}
          mountCarryWeightCapacity={mountCarryWeightCapacity}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedId(null)}
          iconOverride={iconOverrides?.[lookupIds?.[selectedId] ?? selectedId]}
        />
      )}
    </div>
  );
}

// The item popup's own move-destination icons - one per carry location an
// item can end up in. Swapped in place of the old generic footer-tab icon
// (char-preview-inventory.png) previously reused here for "backpack".
// Exported so CampView's own camp-resources popup (ResourcePopup) can
// build the same "Backpack"/"Vault" destinations without a second copy of
// these paths.
export const BACKPACK_ACTION_ICON = "/images/character/backpack.png";
export const SADDLEPACK_ACTION_ICON = "/images/character/saddlebags.png";
export const VAULT_ACTION_ICON = "/images/character/vault.png";
const CAMP_ACTION_ICON = "/images/character/camp.png";
export const CART_ACTION_ICON = "/images/items/cart_t1.png";


// No dedicated hand icon asset exists - a plain emoji glyph fits the same
// convention every other icon in this file already uses (getKindIcon's
// ⚔️/🛡️/🥋, getTierIndicator's SVG tier icons), no image needed. No "Left"/"Right"
// text at all - the glyph alone flipped horizontally (scaleX(-1), matching
// BodyTab.tsx's own EquipSlotIcon mirroring) for "Right Hand" is what tells
// the two apart, read as a mirrored pair rather than two identical icons.
function formatSlotLabel(slot: string): ReactNode {
  if (!/\bHand\b/.test(slot)) return slot;
  const isRight = slot.startsWith("Right");
  return <span style={isRight ? { display: "inline-block", transform: "scaleX(-1)" } : undefined}>✋</span>;
}

/** Exported so CampView.tsx's own bulk camp actions (HoldActionPopup's
 * onConfirm) can share the exact same fetch/error-shape handling. */
export type PostJsonResult =
  | { ok: true; data: RawPlayerData }
  | { ok: false; detail: string | null };

export async function postJson(url: string, body?: object): Promise<PostJsonResult> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().then((b) => b?.detail ?? null).catch(() => null);
    return { ok: false, detail };
  }
  return { ok: true, data: await res.json() };
}

const DESTROY_HOLD_MS = 1000;

// The fill's own solid color at hold-progress `t` (0-1) - gold deepening
// through the app's own red (#c0453a) to blood red right as the hold
// completes, matching .tabRowButtonActive's gold glow (#e6b85c) at the
// start. A live color swap on one growing bar, not a fixed gradient image
// revealed underneath it - see the render below.
function destroyFillColor(t: number): string {
  const GOLD: [number, number, number] = [230, 184, 92];
  const RED: [number, number, number] = [192, 69, 58];
  const BLOOD_RED: [number, number, number] = [107, 0, 0];
  const clamped = Math.min(1, Math.max(0, t));
  const [from, to, localT] =
    clamped <= 0.55 ? [GOLD, RED, clamped / 0.55] : [RED, BLOOD_RED, (clamped - 0.55) / 0.45];
  const [r, g, b] = from.map((c, i) => Math.round(c + (to[i] - c) * localT));
  return `rgb(${r}, ${g}, ${b})`;
}

// The salvage hold bar's own fill (see ItemDetailPopup's runSalvage) - same
// gold start as destroyFillColor, but deepening into the app's own
// "healthy/recovered" green (QUALITY_STATE_COLORS.new, rgb(90, 156, 74))
// instead of red, so a beneficial action never reads as a warning.
function salvageFillColor(t: number): string {
  const GOLD: [number, number, number] = [230, 184, 92];
  const GREEN: [number, number, number] = [90, 156, 74];
  const clamped = Math.min(1, Math.max(0, t));
  const [r, g, b] = GOLD.map((c, i) => Math.round(c + (GREEN[i] - c) * clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

/** A standalone hold-to-confirm popup - "Burn All"/"Move all to backpack"
 * on the camp page (see CampView.tsx's campfire_lit.png/dropped.png).
 * Reuses ItemDetailPopup's exact hold-bar visual language (label +
 * progress track/fill + icon, same DESTROY_HOLD_MS duration) rather than
 * a second copy of that mechanic - just standalone instead of nested
 * inside one item's own salvage/destroy view, and the icon is an actual
 * image (the same one that opened this popup) instead of an emoji. */
export function HoldActionPopup({
  headline,
  children,
  overlayClassName,
  cardClassName,
  iconClassName,
  label,
  subtitle,
  icon,
  tone,
  disabled = false,
  onConfirm,
  onPlayerDataUpdated,
  onClose,
}: {
  headline: string;
  /** Extra content between the headline and the hold bar - e.g. the
   * chopping block's own scrollable checklist of what's about to be
   * salvaged (see CampView.tsx's ChopBlockPopup). Scrolls internally
   * inside its own flex-grown wrapper if it's tall enough to need to
   * (see the children wrapper's own inline flex styling below) - the
   * hold bar/icon below it always stays on screen either way, never
   * pushed off by a long list. */
  children?: ReactNode;
  /** Extra class appended to .itemPopupOverlay - CampView's own
   * ChopBlockPopup passes .chopBlockOverlay to shrink the usual top/
   * bottom screen margin, since its own scrollable checklist benefits
   * from using as much of the viewport as possible. */
  overlayClassName?: string;
  /** Extra class appended to .itemPopupCard - paired with
   * overlayClassName above (CampView's own .chopBlockCard raises the
   * card's own max-height to match the shrunk overlay margin). */
  cardClassName?: string;
  /** Extra class appended to .holdActionIcon - CampView's own
   * ChopBlockPopup passes .chopBlockIcon to size the chopping block
   * icon down from the other two popups' shared default. */
  iconClassName?: string;
  /** The hold bar's own label, e.g. "Hold to cast things into flames". */
  label: string;
  /** Short helper text shown between the progress bar and the icon. */
  subtitle?: string;
  /** Image shown inside the hold bar - CampView passes the same
   * campfire_lit.png/dropped.png icon the player just clicked. Sized to
   * fill the same width as the progress bar above it (see
   * .holdActionIcon) - a real icon reads better big here than a small
   * one would, unlike .destroyIcon's own single-glyph emoji. */
  icon: string;
  /** "destroy": red-deepening fill (destroyFillColor), shown on a
   * permanent, unrecoverable action. "salvage": gold-to-green fill
   * (salvageFillColor), shown on a beneficial one. */
  tone: "destroy" | "salvage" | "move";
  /** Prevents starting the hold at all (e.g. the chopping block's own
   * checklist hasn't loaded yet, or nothing on it is checked) - the icon
   * stays visible but dimmed, same as ItemDetailPopup's own disabled
   * buttons elsewhere, rather than hiding it outright. */
  disabled?: boolean;
  /** Fires once the hold completes - same PostJsonResult shape postJson
   * returns, so the caller can just wrap its own fetch in that helper. */
  onConfirm: () => Promise<PostJsonResult>;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const reset = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setProgress(0);
  };
  useEffect(() => reset, []);

  const run = async () => {
    setPending(true);
    const result = await onConfirm();
    if (!result.ok) {
      setPending(false);
      setError(
        tone === "destroy"
          ? "Couldn't burn that."
          : tone === "move"
            ? "Nothing to move."
            : "Couldn't salvage that.",
      );
      reset();
      return;
    }
    onPlayerDataUpdated?.(result.data);
    onClose();
  };

  const tick = (startedAt: number) => {
    const next = Math.min(1, (performance.now() - startedAt) / DESTROY_HOLD_MS);
    setProgress(next);
    if (next >= 1) {
      run();
      return;
    }
    rafRef.current = requestAnimationFrame(() => tick(startedAt));
  };

  const startHold = () => {
    if (pending || disabled) return;
    setError(null);
    const startedAt = performance.now();
    rafRef.current = requestAnimationFrame(() => tick(startedAt));
  };
  const cancelHold = () => {
    if (pending) return;
    reset();
  };

  // Unlike ItemDetailPopup's own destroy/salvage bar (where the whole
  // .destroySection - label, track, and icon together - is the hold
  // target), only the icon itself starts/holds the fill here - a plain
  // click anywhere else on the card, including the label/track, dismisses
  // the popup instead.
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest(`.${styles.holdActionIcon}`)) return;
    onClose();
  };

  return (
    <div
      className={overlayClassName ? `${styles.itemPopupOverlay} ${overlayClassName}` : styles.itemPopupOverlay}
      onClick={handleClick}
    >
      <div
        className={
          cardClassName
            ? `${styles.itemPopupCard} ${styles.salvageDestroyCard} ${cardClassName}`
            : `${styles.itemPopupCard} ${styles.salvageDestroyCard}`
        }
      >
        <h3 className={styles.itemPopupName}>{headline}</h3>
        {/* stopPropagation, not another handleClick exemption - `children`
            can hold arbitrary interactive content (ChopBlockPopup's own
            checkbox list), so a click anywhere in there - checking a box,
            selecting text, whatever - should just do its own thing rather
            than bubbling up and being treated as a dismiss click. flex
            column + flex:1/min-height:0 so whichever of children's own
            elements wants to grow and scroll (ChopBlockPopup's own
            .chopBlockList) actually can, within whatever room
            .itemPopupCard's own max-height leaves once the headline/hold
            bar/error above and below it are accounted for. */}
        {children && (
          <div
            style={{ width: "100%", display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        )}
        <div className={styles.destroySection}>
          <p className={styles.destroyLabel}>{label}</p>
          <div className={styles.destroyProgressTrack}>
            <div
              className={styles.destroyProgressFill}
              style={{
                width: `${progress * 100}%`,
                backgroundColor: tone === "destroy" ? destroyFillColor(progress) : salvageFillColor(progress),
              }}
            />
          </div>
          {subtitle && <p className={styles.destroyLabel} style={{ fontSize: "0.7rem", marginTop: "0.2rem", color: "#d4a060" }}>{subtitle}</p>}
          <div
            role="button"
            tabIndex={0}
            title={label}
            aria-label={label}
            className={[
              styles.holdActionIcon,
              iconClassName,
              disabled ? styles.holdActionIconDisabled : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ backgroundImage: `url(${icon})` }}
            onPointerDown={(e) => {
              e.preventDefault();
              startHold();
            }}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        {error && <p className={styles.destroyError}>{error}</p>}
      </div>
    </div>
  );
}

export type ChopBlockRow = {
  id: string;
  kind: "instance" | "balance";
  name: string;
  tier: number;
  owned: number;
  materials: SalvageMaterial[];
  preselected?: boolean;
  condition?: SalvageCondition;
};

export function flattenChopBlockMaterials(materials: SalvageMaterial[]): { id: string; name: string; qty: number }[] {
  const merged = new Map<string, { id: string; name: string; qty: number }>();
  for (const material of materials) {
    for (const line of material.recovered) {
      const existing = merged.get(line.id);
      if (existing) existing.qty += line.qty;
      else merged.set(line.id, { id: line.id, name: line.name, qty: line.qty });
    }
  }
  return [...merged.values()];
}

export function ChopBlockPopup({
  characterId,
  onPlayerDataUpdated,
  onClose,
  preSelectedIds,
  preSelectedAmounts,
  source = "camp",
}: {
  characterId: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
  preSelectedIds?: Set<string>;
  preSelectedAmounts?: Map<string, number>;
  source?: "camp" | "vault";
}) {
  const [rows, setRows] = useState<ChopBlockRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let url = `/api/auth/me/characters/${characterId}/${source}/salvage-preview`;
    const params: string[] = [];
    if (preSelectedIds && preSelectedIds.size > 0) {
      params.push(`selected=${[...preSelectedIds].join(",")}`);
    }
    if (preSelectedAmounts && preSelectedAmounts.size > 0) {
      params.push(`amounts=${[...preSelectedAmounts].map(([id, n]) => `${id}:${n}`).join(",")}`);
    }
    if (params.length > 0) url += `?${params.join("&")}`;
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: ChopBlockRow[] } | null) => {
        if (cancelled) return;
        const loaded = data?.rows ?? [];
        setRows(loaded);
        if (preSelectedIds) {
          setSelected(new Set(loaded.map((row) => row.id)));
        } else {
          setSelected(new Set(loaded.filter((row) => row.preselected !== false).map((row) => row.id)));
        }
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, source]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grandTotal = flattenChopBlockMaterials(
    (rows ?? []).filter((row) => selected.has(row.id)).flatMap((row) => row.materials)
  );

  const emptyLabel = source === "vault" ? "Nothing in the vault can be salvaged right now." : "Nothing in camp can be salvaged right now.";

  return (
    <HoldActionPopup
      headline="Salvage All"
      overlayClassName={styles.chopBlockOverlay}
      cardClassName={styles.chopBlockCard}
      iconClassName={styles.chopBlockIcon}
      label="Hold to unmake"
      icon="/images/character/chopping_block.png"
      tone="salvage"
      disabled={rows === null || selected.size === 0}
      onConfirm={() => {
        const amounts: Record<string, number> = {};
        if (preSelectedAmounts) {
          for (const id of selected) {
            const cap = preSelectedAmounts.get(id);
            if (cap !== undefined) amounts[id] = cap;
          }
        }
        return postJson(`/api/auth/me/characters/${characterId}/${source}/salvage-all`, {
          selected: [...selected],
          ...(Object.keys(amounts).length > 0 ? { amounts } : {}),
        });
      }}
      onPlayerDataUpdated={onPlayerDataUpdated}
      onClose={onClose}
    >
      {rows === null ? (
        <p className={styles.salvageResultText}>Checking what can be salvaged…</p>
      ) : rows.length === 0 ? (
        <p className={styles.salvageResultText}>{emptyLabel}</p>
      ) : (
        <>
          <div className={styles.chopBlockList}>
            <div className={`${styles.salvageDestroyDivider} ${styles.salvageDestroyDividerTight}`} />
            <p className={styles.salvageFinalLine}>
              Salvaged: {grandTotal.length > 0 ? grandTotal.map((line) => `${line.qty}× ${line.name}`).join(", ") : "nothing"}
            </p>
            <div className={`${styles.salvageDestroyDivider} ${styles.salvageDestroyDividerSpaced}`} />
            {rows.map((row) => (
              <div key={row.id} className={styles.chopBlockRow}>
                <label className={styles.chopBlockRowHeader}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  <span className={styles.chopBlockRowName}>
                    {row.name}
                    {row.owned > 1 ? ` x${row.owned}` : ""}
                  </span>
                </label>
                <div className={styles.salvageMaterialsList}>
                  {row.materials.map((material) => (
                    <div key={material.rawFamilyId} className={styles.salvageMaterialRow}>
                      <p className={styles.salvageMaterialHeader}>
                        <span>{material.rawName}</span>
                        <span className={`${styles.salvageMaterialAmounts} ${material.recoveredUnits === 0 ? styles.salvageAmountZero : selected.has(row.id) ? styles.salvageAmountPositive : styles.salvageAmountMuted}`}>
                          {material.recoveredUnits}/{material.totalUnits}
                        </span>
                      </p>
                      <SalvageFormulaLine breakdown={material.yieldBreakdown} condition={row.condition} />
                    </div>
                  ))}
                  <p className={selected.has(row.id) ? styles.salvageFinalLine : styles.salvageFinalLineMuted}>
                    Salvaged:{" "}
                    {flattenChopBlockMaterials(row.materials)
                      .map((line) => `${line.qty}× ${line.name}`)
                      .join(", ") || "nothing"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </HoldActionPopup>
  );
}

// The three discrete condition brackets a quality fraction (current/max)
// falls into - fixed steps, not a smooth blend. The same cutoffs drive
// salvage yield server-side (backend.recycling.quality_state/
// CONDITION_PENALTY: new 0, used -20pp, damaged -50pp).
/** Exported so BodyTab.tsx's equip slots can apply the exact same
 * damaged-tile treatment ItemGrid uses below, rather than duplicating the
 * 10%/50% cutoffs. */
export type QualityState = "new" | "used" | "damaged";

export function qualityState(f: number): QualityState {
  if (f > 0.5) return "new"; // 51-100%
  if (f > 0.1) return "used"; // 11-50%
  return "damaged"; // 1-10% (and 0)
}

const QUALITY_STATE_COLORS: Record<QualityState, string> = {
  new: "rgb(64, 158, 37)",
  used: "rgb(200, 136, 57)",
  damaged: "rgb(168, 29, 16)",
};

// The quality bar's own color at fraction `f` (current/max, 0-1) - one of
// the three fixed QUALITY_STATE_COLORS, never blended between them.
export function qualityBarColor(f: number): string {
  return QUALITY_STATE_COLORS[qualityState(Math.max(0, Math.min(1, f)))];
}

// How long a failed move/equip's message replaces the description text
// before reverting - long enough to read, short enough not to feel stuck.
const ITEM_POPUP_FLASH_MS = 3000;

// "No backpack equipped" / "Backpack is full" / "No saddlepack equipped"
// (see backend.players.check_out_item_instance/unequip_item/
// load_item_balance_to_backpack/check_out_item_balance_to_backpack/
// move_camp_resource_to_backpack) get their own specific wording; anything
// else falls back to a generic message. Shared between ItemDetailPopup and
// ResourcePopup so a failed move reads the same regardless of which one it
// happened in.
function transferFailureMessage(detail: string | null): string {
  if (!detail || typeof detail !== "string") return "Couldn't move that.";
  if (detail === "No backpack equipped") return "No backpack found, equip one.";
  if (detail === "Backpack is full") return "Backpack full - remove items first.";
  if (detail === "No saddlepack equipped") return "No saddlepack found, equip one.";
  if (detail === "Saddlepack is full") return "Saddlepack full - remove items first.";
  if (detail.startsWith("You already have a ")) return detail;
  if (detail === "Equip a mount first") return detail;
  if (detail === "Equip a companion first") return detail;
  if (detail === "Stackable items cannot be equipped") return detail;
  if (detail === "No matching instance on that character, or slot(s) occupied") return "Slot already occupied.";
  if (detail === "Character is out on an adventure - no reaching the shared vault") {
    return "Out on an adventure - the shared vault isn't reachable.";
  }
  return "Couldn't move that.";
}

/** What's actually packed into a character's backpack storage - flat
 * gear.itemBalances.backpack rows plus individually-tracked gear.items
 * instances at location:"backpack", combined the same way CampView's own
 * campCombined merges the "camp" equivalents. Character-level (backpack
 * storage isn't tied to which specific backpack instance is worn - see
 * Character.gear's own docstring), so BodyTab (the worn backpack's own
 * popup) and CampView (a camp-located backpack's popup) both call this
 * the same way to feed ItemDetailPopup's packedItems/backpackSlotsUsed/
 * backpackCapacity props. Doesn't include tierInfo - each caller already
 * has its own independently-fetched item-catalog map to pair with this.
 * resourceBalances is the gear.itemBalances.backpack bucket (raw/
 * processed materials checked out straight from Party's Resources - see
 * VaultTab's transferToBackpack) - kept apart from `balances` rather
 * than merged in since resources use their own id space/tier lookup
 * (resourceTierInfo, not itemCatalogTierInfo) and render as a plain list,
 * not image tiles (see PackedResourcesList). */
type ContainerContents = {
  ids: string[];
  balances: Record<string, number>;
  lookupIds: Record<string, string>;
  instanceQuality: Record<string, number | null>;
  resourceBalances: Record<string, number>;
};

type ContainerCharacterGear = {
  gear: {
    items: ItemInstance[];
    itemBalances: { backpack: Record<string, number>; saddlepack: Record<string, number>; cart: Record<string, number>; camp: Record<string, number> };
  };
};

function computeContainerContents(
  character: ContainerCharacterGear,
  location: "backpack" | "saddlepack" | "cart"
): ContainerContents {
  const itemBalances = character.gear.itemBalances[location];
  const instances = character.gear.items.filter((instance) => instance.location === location);
  const lookupIds: Record<string, string> = {};
  const instanceRowBalances: Record<string, number> = {};
  const instanceQuality: Record<string, number | null> = {};
  for (const instance of instances) {
    lookupIds[instance.instanceId] = instance.itemId;
    instanceRowBalances[instance.instanceId] = 1;
    instanceQuality[instance.instanceId] = instance.quality;
  }
  const balances: Record<string, number> = { ...itemBalances, ...instanceRowBalances };
  const ids = Object.keys(balances).filter((id) => balances[id] > 0);
  return { ids, balances, lookupIds, instanceQuality, resourceBalances: character.gear.itemBalances[location] };
}

export function computeBackpackContents(character: ContainerCharacterGear): ContainerContents {
  return computeContainerContents(character, "backpack");
}

export function computeSaddlepackContents(character: ContainerCharacterGear): ContainerContents {
  return computeContainerContents(character, "saddlepack");
}

export function computeCartContents(character: ContainerCharacterGear): ContainerContents {
  return computeContainerContents(character, "cart");
}

// Highest tier first, same ordering PackedItemsRow's own item tiles use.
function sortResourceIds(balances: Record<string, number>, tierInfo: ResourceTierInfo): string[] {
  return Object.keys(balances)
    .filter((id) => (balances[id] ?? 0) > 0 && !!tierInfo[id])
    .sort((a, b) => (tierInfo[b]?.tier ?? 0) - (tierInfo[a]?.tier ?? 0));
}

/** One .itemGridCell tile per owned resource id, for embedding alongside
 * (PackedItemsRow) or instead of (CampView's own camp-resources strip)
 * item tiles in the same horizontally-scrolling row. Resources have no
 * catalog icon (they're raw/processed materials, not items - see
 * ResourceList's own getResourceIcon, which falls back to a plain emoji
 * for the exact same reason), so each tile shows a short text label
 * instead of .itemGridImg - just the last word of the resource's own name
 * (e.g. "Oak Wood" -> "Wood"), since the tier badge already disambiguates
 * which tier within that family this is. Clicking a tile hands its id to
 * `onSelect`, which the caller uses to open a ResourcePopup. */
export function ResourceTiles({
  balances,
  tierInfo,
  onSelect,
}: {
  balances: Record<string, number>;
  tierInfo: ResourceTierInfo;
  /** `tileCap` is how many units the SPECIFIC tile clicked represents (see
   * ItemGrid's identical expandedResourceIds) - the caller opens its own
   * ResourcePopup scoped to that amount, not the family's full balance. */
  onSelect: (id: string, tileCap: number) => void;
}) {
  // Same "one tile per backpack slot actually occupied" split as
  // ItemGrid's own expandedResourceIds - see its comment for why stack
  // size comes from category (RAW_STACK_SIZE/PROCESSED_STACK_SIZE), not a
  // per-family field.
  const expandedResourceIds: { key: string; id: string; displayCount: number; tileCap: number }[] = [];
  for (const id of sortResourceIds(balances, tierInfo)) {
    const category = tierInfo[id]?.category;
    const stackSize = category === "raw" ? RAW_STACK_SIZE : PROCESSED_STACK_SIZE;
    let remaining = balances[id] ?? 0;
    let i = 0;
    while (remaining > 0) {
      const inThisStack = Math.min(stackSize, remaining);
      expandedResourceIds.push({ key: `${id}#${i}`, id, displayCount: inThisStack, tileCap: inThisStack });
      remaining -= inThisStack;
      i += 1;
    }
  }
  return (
    <>
      {expandedResourceIds.map(({ key, id, displayCount, tileCap }) => {
        const info = tierInfo[id];
        const fullName = info?.name ?? formatResourceLabel(id);
        const label = fullName.split(" ").pop() ?? fullName;
        return (
          <button
            key={key}
            type="button"
            className={styles.itemGridCell}
            title={fullName}
            onClick={() => onSelect(id, tileCap)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* See ItemGrid's identical branch - most resource families
                fall back to a name-on-black tile, but a handful (oil,
                arrow, bolt) carry real icon art. */}
            {info?.icon ? (
              <ItemIcon icon={info.icon} alt={fullName} className={styles.itemGridImg} />
            ) : (
              <span className={styles.itemGridResourceLabel}>{label}</span>
            )}
            {!!info?.tier && (
              <span className={styles.itemGridTierBadge}>
                {getTierIndicator(info.tier)}
              </span>
            )}
            {displayCount > 1 && <span className={styles.itemGridCountBadge}>{displayCount}</span>}
          </button>
        );
      })}
    </>
  );
}

/** Single-row, horizontally-scrolling strip of tiles - what a worn
 * backpack's own popup shows packed inside it (see ItemDetailPopup's
 * packedItems prop). Same 100px tile/icon/tier-badge/count-badge/
 * quality-bar-and-damaged-tint look as ItemGrid's own tiles (deliberately
 * duplicated rather than shared - ItemGrid's own tiles measure/fill the
 * whole remaining viewport height, which makes no sense embedded in a
 * popup card's own fixed-size row). Clicking a tile opens a SECOND
 * ItemDetailPopup on top, for that one packed item - its own overlay
 * closes just itself (back to this backpack's popup, not both at once)
 * on an outside click or a successful move, the same way any other
 * popup already closes itself - see ItemDetailPopup's own handleClick. */
function PackedItemsRow({
  ids,
  tierInfo,
  balances,
  lookupIds,
  instanceQuality,
  resourceBalances,
  resourceTierInfo,
  hasBackpackEquipped,
  hasSaddlepackEquipped,
  hasMountEquipped = false,
  hasCompanionEquipped = false,
  cartCapacity,
  cartSlotsUsed,
  inAdventure,
  characterId,
  onPlayerDataUpdated,
  location = "backpack",
}: {
  ids: string[];
  tierInfo: BlueprintTierInfo;
  balances: Record<string, number>;
  lookupIds: Record<string, string>;
  instanceQuality: Record<string, number | null>;
  /** gear.itemBalances.backpack - raw/processed materials checked out from
   * Party's Resources (see VaultTab's transferToBackpack). Rendered
   * as a plain ResourceList below the item tiles instead of joining
   * `ids`/`balances` above - resources have no image icon and use their
   * own tier lookup (resourceTierInfo), so they don't fit the tile grid's
   * id-and-BlueprintTierInfo shape. View-only for now, no onTransfer -
   * there's no "unload" endpoint back out of a backpack straight to
   * Party's Resources yet. */
  resourceBalances: Record<string, number>;
  resourceTierInfo: ResourceTierInfo;
  hasBackpackEquipped: boolean;
  hasSaddlepackEquipped: boolean;
  hasMountEquipped?: boolean;
  hasCompanionEquipped?: boolean;
  cartCapacity?: number;
  cartSlotsUsed?: number;
  inAdventure: boolean;
  characterId: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  location?: "backpack" | "saddlepack" | "cart";
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // See ItemGrid's identical selectedTileCap comment - which specific
  // tile's own quantity (not the family's full total) the popup should
  // scope its "Owned"/quantity-buttons/move-all to.
  const [selectedTileCap, setSelectedTileCap] = useState<number>(0);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  // Same idea, for a resource tile (see ResourceTiles' own tileCap).
  const [selectedResourceTileCap, setSelectedResourceTileCap] = useState<number>(0);

  // How many full tile rows fit between the matrix's own top (wherever
  // the popup's layout puts it - icon/name/tier badge above vary in
  // height) and the fixed footer bar, which must stay visible below the
  // whole popup (not just not-clip the matrix - the backpack card itself
  // is capped there too, see the card.style.maxHeight write below; no
  // scrolling either way, so everything has to actually fit).
  //
  // Probes ONCE at 1 row to measure "belowMatrix" - the space
  // description/gathering/meta/the movable-buttons block below the
  // matrix actually need - rather than iteratively re-probing at each
  // candidate row count: that space is driven entirely by THOSE
  // siblings, not by the matrix's own height, so it's the same number
  // regardless of how many rows the matrix ends up with, and measuring
  // it once avoids any risk of a large intermediate guess distorting the
  // reading (e.g. via flex-shrink on some OTHER element if the guess
  // temporarily overflows). Rounds DOWN so a row that would only be
  // partially visible is never shown - one fewer full row instead of a
  // cut-off one. useLayoutEffect (not useEffect) so this resolves before
  // the browser ever paints the 1-row probe state.
  const packedRowsRef = useRef<HTMLDivElement>(null);
  const [packedRows, setPackedRows] = useState<number>(2);
  useLayoutEffect(() => {
    const measure = () => {
      const el = packedRowsRef.current;
      if (!el) return;
      const card = el.closest(`.${styles.itemPopupCard}`) as HTMLElement | null;
      if (!card) return;

      const footer = document.querySelector('[data-role="character-preview-topbar"]');
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      const ceiling = window.innerHeight - footerHeight - CARD_FOOTER_MARGIN_PX;

      // Backpack popup: rows are maximised first; icon fills the rest.
      // Non-backpack popup: original fixed-icon measurement.
      const iconEl = card.classList.contains(styles.backpackPopupCard)
        ? (card.querySelector(`.${styles.itemPopupImg}`) as HTMLElement | null)
        : null;

      if (iconEl) {
        // Collapse icon so the probe measures only fixed overhead.
        iconEl.style.height = "0";
      }

      el.style.gridTemplateRows = `repeat(1, ${ITEM_TILE_PX}px)`;
      const probeBottom = el.getBoundingClientRect().bottom;

      if (iconEl) {
        // Space below matrix occupied by fixed content (description, meta,
        // buttons, bottom padding) - excludes position:fixed/absolute
        // children (nested item popups opened from inside the backpack).
        const cardStyle = getComputedStyle(card);
        const cardGap = parseFloat(cardStyle.gap) || PACKED_ROW_GAP_PX;
        const cardPaddingBottom = parseFloat(cardStyle.paddingBottom);
        const matrixIdx = Array.from(card.children).indexOf(el);
        const belowMatrix = Array.from(card.children)
          .slice(matrixIdx + 1)
          .filter((s) => {
            const pos = getComputedStyle(s as HTMLElement).position;
            return pos !== "fixed" && pos !== "absolute";
          })
          .reduce(
            (sum, s) => sum + cardGap + (s as HTMLElement).getBoundingClientRect().height,
            cardPaddingBottom
          );

        // rowBudget = room available for extra rows + icon (above the 1-row
        // probe that's already positioned at probeBottom).
        const rowBudget = ceiling - probeBottom - belowMatrix;

        // Fixed 3 items per column; extra items add new columns that scroll
        // horizontally. Never allocate more rows than tiles exist.
        const tileCount = el.children.length;
        const maxNeededRows = Math.min(3, Math.max(1, tileCount));
        const extraRows = Math.max(0, Math.floor(rowBudget / (ITEM_TILE_PX + PACKED_ROW_GAP_PX)));
        const rows = Math.min(1 + extraRows, maxNeededRows);
        el.style.gridTemplateRows = `repeat(${rows}, ${ITEM_TILE_PX}px)`;
        setPackedRows(rows);

        // Icon (priority 2) stays at CONTAINER_ICON_PX - same as the empty
        // popup - and only shrinks once the rows leave less room than
        // that, capped at the card's own client width so the square icon
        // never overflows sideways. Hidden entirely when too small to read
        // as art.
        const actualExtraRows = rows - 1;
        const matrixExtraHeight = actualExtraRows * (ITEM_TILE_PX + PACKED_ROW_GAP_PX);
        const iconSize = Math.max(0, Math.min(CONTAINER_ICON_PX, card.clientWidth, rowBudget - matrixExtraHeight));
        if (iconSize < ICON_MIN_VISIBLE_PX) {
          iconEl.style.display = "none";
          // Cogwheel button is position:absolute; top:0.5rem; height:~2rem -
          // without the icon the headline starts flush with the card top and
          // overlaps it. Add a spacer so the headline clears the button.
          const prevPadTop = parseFloat(getComputedStyle(card).paddingTop);
          card.style.paddingTop = "2.5rem";
          const newPadTop = parseFloat(getComputedStyle(card).paddingTop);
          const netExtra = Math.max(0, newPadTop - prevPadTop - cardGap);
          if (netExtra > 0) {
            const shrunk = Math.max(1, rows - Math.ceil(netExtra / (ITEM_TILE_PX + PACKED_ROW_GAP_PX)));
            el.style.gridTemplateRows = `repeat(${shrunk}, ${ITEM_TILE_PX}px)`;
            setPackedRows(shrunk);
          }
        } else {
          iconEl.style.display = "";
          iconEl.style.width = `${iconSize}px`;
          iconEl.style.height = `${iconSize}px`;
          card.style.paddingTop = "";
        }
      } else {
        // Original logic: icon is fixed by CSS; measure how many rows fit
        // between matrix top and footer with the space below the matrix.
        const tileCount = el.children.length;
        const maxNeededRows = Math.max(1, tileCount);
        const matrixTop = el.getBoundingClientRect().top;
        const belowMatrix = card.getBoundingClientRect().bottom - probeBottom;
        const matrixBudget = ceiling - matrixTop - belowMatrix;
        const rows = Math.min(maxNeededRows, Math.max(1, Math.floor((matrixBudget + PACKED_ROW_GAP_PX) / (ITEM_TILE_PX + PACKED_ROW_GAP_PX))));
        el.style.gridTemplateRows = `repeat(${rows}, ${ITEM_TILE_PX}px)`;
        setPackedRows(rows);
      }

      const naturalBottom = card.scrollHeight + card.getBoundingClientRect().top;
      if (naturalBottom > ceiling) {
        card.style.maxHeight = `${Math.max(0, ceiling - card.getBoundingClientRect().top)}px`;
      } else {
        card.style.maxHeight = "";
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const sortedResourceIds = sortResourceIds(resourceBalances, resourceTierInfo);
  if (ids.length === 0 && sortedResourceIds.length === 0) {
    return <p className={styles.packedItemsEmpty}>Nothing packed in it yet.</p>;
  }
  const sortedIds = [...ids].sort((a, b) => {
    const infoA = tierInfo[lookupIds[a] ?? a];
    const infoB = tierInfo[lookupIds[b] ?? b];
    return (infoB?.tier ?? 0) - (infoA?.tier ?? 0);
  });
  // See ItemGrid's identical expandedIds comment - one tile per backpack
  // slot a flat itemBalance row actually occupies (one per unit at
  // stackSize<=1, no count; up to stackSize per tile otherwise, each
  // showing its OWN count, not the family's full total).
  const expandedIds: { key: string; id: string; displayCount: number | null; tileCap: number }[] = [];
  for (const id of sortedIds) {
    const info = tierInfo[lookupIds[id] ?? id];
    const isInstance = lookupIds[id] !== undefined;
    const stackSize = info?.stackSize ?? 1;
    const owned = balances[id] ?? 0;
    if (isInstance) {
      expandedIds.push({ key: id, id, displayCount: null, tileCap: 1 });
    } else if (stackSize <= 1) {
      for (let i = 0; i < owned; i++) {
        expandedIds.push({ key: `${id}#${i}`, id, displayCount: null, tileCap: 1 });
      }
    } else {
      let remaining = owned;
      let i = 0;
      while (remaining > 0) {
        const inThisStack = Math.min(stackSize, remaining);
        expandedIds.push({ key: `${id}#${i}`, id, displayCount: inThisStack, tileCap: inThisStack });
        remaining -= inThisStack;
        i += 1;
      }
    }
  }
  return (
    <>
      {(ids.length > 0 || sortedResourceIds.length > 0) && (
      <div
        ref={packedRowsRef}
        className={styles.packedItemsRow}
        style={{ gridTemplateRows: `repeat(${packedRows}, ${ITEM_TILE_PX}px)` }}
      >
        {expandedIds.map(({ key, id, displayCount, tileCap }) => {
          const info = tierInfo[lookupIds[id] ?? id];
          const name = info?.name ? stripBlueprintPrefix(info.name) : formatResourceLabel(lookupIds[id] ?? id);
          const currentQuality = instanceQuality[id];
          const qualityFraction =
            lookupIds[id] !== undefined && info?.qualityMax != null && currentQuality != null
              ? Math.max(0, Math.min(1, info.qualityMax > 0 ? currentQuality / (info.qualityMax * (2 ** (info.tier - 1))) : 1))
              : null;
          const isDamaged = qualityFraction !== null && qualityState(qualityFraction) === "damaged";
          return (
            <button
              key={key}
              type="button"
              className={isDamaged ? `${styles.itemGridCell} ${styles.itemGridCellDamaged}` : styles.itemGridCell}
              title={name}
              onClick={() => {
                setSelectedId(id);
                setSelectedTileCap(tileCap);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <ItemIcon icon={info?.icon} alt={name} className={styles.itemGridImg} />
              {!!info?.tier && (
                <span className={styles.itemGridTierBadge}>
                  {getTierIndicator(info.tier)}
                </span>
              )}
              {displayCount !== null && displayCount > 1 && <span className={styles.itemGridCountBadge}>{displayCount}</span>}
              {qualityFraction !== null && (
                <div
                  className={styles.itemGridQualityBar}
                  style={{ backgroundColor: qualityBarColor(qualityFraction) }}
                />
              )}
            </button>
          );
        })}
        <ResourceTiles
          balances={resourceBalances}
          tierInfo={resourceTierInfo}
          onSelect={(id, tileCap) => {
            setSelectedResourceId(id);
            setSelectedResourceTileCap(tileCap);
          }}
        />
      </div>
      )}
      {selectedResourceId && (
        <ResourcePopup
          resourceId={selectedResourceId}
          tierInfo={resourceTierInfo}
          owned={selectedResourceTileCap}
          characterId={characterId}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedResourceId(null)}
          destinations={
            location === "cart"
              ? [
                  ...(inAdventure
                    ? [{ key: "camp", icon: CAMP_ACTION_ICON, label: "Camp", endpoint: "cart-to-camp" }]
                    : [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "cart-to-vault" }]),
                ]
              : location === "saddlepack"
              ? [
                  ...(inAdventure
                    ? [{ key: "camp", icon: CAMP_ACTION_ICON, label: "Camp", endpoint: "saddlepack-to-camp" }]
                    : [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "unload-saddlepack" }]),
                  ...(hasBackpackEquipped
                    ? [{ key: "backpack", icon: BACKPACK_ACTION_ICON, label: "Backpack", endpoint: "saddlepack-to-backpack" }]
                    : [{ key: "backpack", icon: BACKPACK_ACTION_ICON, label: "No backpack equipped", endpoint: "saddlepack-to-backpack" }]),
                ]
              : [
                  ...(inAdventure
                    ? [{ key: "camp", icon: CAMP_ACTION_ICON, label: "Camp", endpoint: "unstow" }]
                    : [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "unload-backpack" }]),
                  ...(hasSaddlepackEquipped
                    ? [{ key: "saddlepack", icon: SADDLEPACK_ACTION_ICON, label: "Saddlepack", endpoint: "backpack-to-saddlepack" }]
                    : []),
                ]
          }
        />
      )}
      {selectedId && (
        <ItemDetailPopup
          info={tierInfo[lookupIds[selectedId] ?? selectedId]}
          fallbackName={formatResourceLabel(lookupIds[selectedId] ?? selectedId)}
          owned={selectedTileCap}
          isInstance={lookupIds[selectedId] !== undefined}
          movable
          quality={instanceQuality[selectedId] ?? null}
          moveId={selectedId}
          location={location}
          source="character"
          hasBackpackEquipped={hasBackpackEquipped}
          hasSaddlepackEquipped={hasSaddlepackEquipped}
          hasMountEquipped={hasMountEquipped}
          hasCompanionEquipped={hasCompanionEquipped}
          cartCapacity={cartCapacity}
          cartSlotsUsed={cartSlotsUsed}
          inAdventure={inAdventure}
          characterId={characterId}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

/** One quantity-picker row's target for ResourcePopup below - endpoint is
 * the last path segment under .../resources/{resourceId}/... */
export type ResourcePopupDestination = { key: string; icon: string; label: string; endpoint: string };

/** Opened by clicking a packed/camped resource tile (see PackedItemsRow and
 * CampView's own resource strip) - a deliberately stripped-down sibling of
 * ItemDetailPopup: no cogwheel/salvage-destroy view (raw/processed
 * materials have no recipe of their own to salvage - they're what
 * salvaging something else already hands back), just a tier/name header
 * and one quantity-picker row (same as Party's Resources' own) per
 * available move destination. A backpack resource only ever has ONE
 * reachable destination at a time (vault OR camp, whichever inAdventure
 * allows - see PackedItemsRow's own call), while a camp resource can have
 * BOTH at once (backpack if equipped, vault if not inAdventure - see
 * CampView's own call) - `destinations` covers either shape without the
 * component needing to know which popup it's in. */
export function ResourcePopup({
  resourceId,
  tierInfo,
  owned,
  characterId,
  onPlayerDataUpdated,
  onClose,
  destinations,
  urlPrefix,
}: {
  resourceId: string;
  tierInfo: ResourceTierInfo;
  owned: number;
  characterId: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
  destinations: ResourcePopupDestination[];
  urlPrefix?: string;
}) {
  const [pending, setPending] = useState(false);
  // Same failed-move flash as ItemDetailPopup's own (see
  // transferFailureMessage) - e.g. "Backpack full - remove items first."
  // when a camp->backpack move can't fit, instead of just silently
  // re-enabling the row with no explanation.
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);
  const info = tierInfo[resourceId];
  const name = info?.name ?? formatResourceLabel(resourceId);

  const handlePick = async (endpoint: string, amount: number) => {
    setPending(true);
    setFlashMessage(null);
    const result = await postJson(
      `${urlPrefix ?? `/api/auth/me/characters/${characterId}/resources/${resourceId}`}/${endpoint}`,
      { amount }
    );
    if (result.ok) {
      onPlayerDataUpdated?.(result.data);
      onClose();
      return;
    }
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashMessage(transferFailureMessage(result.detail));
    flashTimeoutRef.current = setTimeout(() => setFlashMessage(null), ITEM_POPUP_FLASH_MS);
    setPending(false);
  };

  // Same stopPropagation reasoning as ItemDetailPopup's own handleClick -
  // this popup opens nested inside a backpack/camp's own ItemDetailPopup
  // (via PackedItemsRow/CampView), so an unguarded click here would bubble
  // up and close that one too.
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest("button")) return;
    onClose();
  };

  return (
    <div className={styles.itemPopupOverlay} onClick={handleClick}>
      <div className={styles.itemPopupCard}>
        {!!info?.tier && (
          <span className={styles.itemPopupTierBadge}>
            {getTierIndicator(info.tier)}
          </span>
        )}
        {/* Most resource families have no per-unit art and stay text-only
            (see ItemGrid's own resource tiles) - a handful (oil, arrow,
            bolt) carry real icon art and get the same treatment
            ItemDetailPopup gives a real item. */}
        {info?.icon && <ItemIcon icon={info.icon} alt={name} className={styles.itemPopupImg} />}
        <h3 className={styles.itemPopupName}>{owned} {name}</h3>
        {flashMessage && (
          <p className={`${styles.itemPopupDescription} ${styles.itemPopupFlash}`}>{flashMessage}</p>
        )}
        {destinations.map((dest) => (
          <TransferButtons
            key={dest.key}
            owned={owned}
            pending={pending}
            onPick={(amount) => handlePick(dest.endpoint, amount)}
            destinationIcon={dest.icon}
            destinationLabel={dest.label}
            amounts={RAW_RESOURCE_AMOUNTS}
            showHalf
            showInfinity={false}
          />
        ))}
      </div>
    </div>
  );
}


export function ItemDetailPopup({
  info,
  fallbackName,
  owned,
  isInstance,
  movable,
  quality,
  moveId,
  location,
  source = "vault",
  hasBackpackEquipped,
  hasSaddlepackEquipped,
  hasMountEquipped = false,
  hasCompanionEquipped = false,
  inAdventure = false,
  duplicateContainer = false,
  currentSlots,
  characterId,
  characterFirstName,
  packedItems,
  saddlepackPackedItems,
  cartPackedItems,
  backpackSlotsUsed,
  backpackCapacity,
  saddlepackSlotsUsed,
  saddlepackCapacity,
  cartSlotsUsed,
  cartCapacity,
  mountCarryWeightUsed,
  mountCarryWeightCapacity,
  onPlayerDataUpdated,
  onClose,
  iconOverride,
}: {
  info: BlueprintTierInfo[string] | undefined;
  fallbackName: string;
  /** How many of this id the shared pool currently holds - 1 for an item instance row. */
  owned: number;
  /** Whether `moveId` is a real item-instance id (character.items[].instanceId) rather than a flat itemBalances/resources concrete id. */
  isInstance: boolean;
  /** False for ammo (arrow/bolt/oil) - no working move-to-backpack path exists yet, so no action buttons show. */
  movable: boolean;
  /** This exact instance's current quality (isInstance rows only) - paired with info.qualityMax for the "Quality: current/max" line. */
  quality: number | null;
  /** The row id itself - an instanceId (isInstance) or a concrete itemBalances/resource id. */
  moveId: string;
  /** source:"character" instance rows only - "backpack", "camp", "saddlepack", "cart", or "body" - decides which move actions are offered. */
  location?: "backpack" | "body" | "camp" | "saddlepack" | "cart";
  /** "vault" (default): `moveId` lives in the player's shared pool. "character": `moveId` is this character's own (backpack/body instance, or itemBalances row) - see ItemGrid's identical prop for what changes. */
  source?: "vault" | "character";
  /** Whether this character currently has a backpack worn - greys out any "Move to backpack" button instead of letting the click fail server-side with "No backpack equipped". */
  hasBackpackEquipped: boolean;
  /** Whether this character's mount currently has a saddlepack worn (see items_catalog.has_saddlepack_equipped) - any "Move to saddlepack" button is hidden entirely (not just greyed) when false, since there's no mount slot to blame the way a missing backpack gets a "No backpack equipped" message. */
  hasSaddlepackEquipped: boolean;
  hasMountEquipped?: boolean;
  hasCompanionEquipped?: boolean;
  /** location:"body" rows only - whether this character currently counts as out on an adventure (Character.availability.inAdventure). Picks the automatic-unequip icon: camp while true, the shared vault while false - see backend.players.unequip_item. */
  inAdventure?: boolean;
  duplicateContainer?: boolean;
  /** location:"body" rows only - the slot(s) this instance currently occupies (its own slotRef) - used to exclude that same group from the reslot button list below (equipToSlots), since re-clicking your own current slot(s) would be a no-op. */
  currentSlots?: string[];
  characterId: string;
  /** source:"vault" only - named in the "on the road" notice that replaces the whole action row while inAdventure is true. */
  characterFirstName?: string;
  /** A family:"backpack" instance only (worn, or sitting unequipped in
   * camp - see BodyTab/CampView's own packedItems) - this character's own
   * gear.items (location:"backpack") plus gear.itemBalances.backpack, in
   * the same {ids, tierInfo, balances, lookupIds, instanceQuality} shape
   * ItemGrid itself takes. Renders as a horizontally-scrolling row of
   * what's actually packed in the character's backpack storage, between
   * the name and description - character-level storage, not tied to
   * which specific backpack instance's popup happens to be open (see
   * Character.gear's own docstring). Omitted for any other row, or a
   * backpack instance sitting in the shared vault pool (no character
   * context to read packed contents from there). */
  packedItems?: {
    ids: string[];
    tierInfo: BlueprintTierInfo;
    balances: Record<string, number>;
    lookupIds: Record<string, string>;
    instanceQuality: Record<string, number | null>;
    resourceBalances: Record<string, number>;
    resourceTierInfo: ResourceTierInfo;
  };
  saddlepackPackedItems?: {
    ids: string[];
    tierInfo: BlueprintTierInfo;
    balances: Record<string, number>;
    lookupIds: Record<string, string>;
    instanceQuality: Record<string, number | null>;
    resourceBalances: Record<string, number>;
    resourceTierInfo: ResourceTierInfo;
  };
  cartPackedItems?: {
    ids: string[];
    tierInfo: BlueprintTierInfo;
    balances: Record<string, number>;
    lookupIds: Record<string, string>;
    instanceQuality: Record<string, number | null>;
    resourceBalances: Record<string, number>;
    resourceTierInfo: ResourceTierInfo;
  };
  backpackSlotsUsed?: number;
  backpackCapacity?: number;
  saddlepackSlotsUsed?: number;
  saddlepackCapacity?: number;
  cartSlotsUsed?: number;
  cartCapacity?: number;
  mountCarryWeightUsed?: number;
  mountCarryWeightCapacity?: number;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
  iconOverride?: string;
}) {
  const stackSize = info?.stackSize ?? 1;
  const name = info?.name ? stripBlueprintPrefix(info.name) : fallbackName;
  const displayName = stackSize > 1 ? `${owned} ${name}` : name;

  const [pending, setPending] = useState(false);
  // Replaces the description text for ITEM_POPUP_FLASH_MS after a failed
  // move/equip, then reverts on its own - see the render below, which
  // prefers this over info.description whenever it's set.
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  const fail = (detail: string | null) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashMessage(transferFailureMessage(detail));
    flashTimeoutRef.current = setTimeout(() => setFlashMessage(null), ITEM_POPUP_FLASH_MS);
    setPending(false);
  };

  const finish = (result: PostJsonResult) => {
    if (!result.ok) return fail(result.detail);
    onPlayerDataUpdated?.(result.data);
    onClose();
  };

  // `amount` is only meaningful for a stackable itemBalance row (isInstance
  // rows are always exactly one unit) - a TransferButtons row's own onPick
  // (see this popup's stackSize > 1 render below) fires this straight away
  // with the clicked amount, no separate select-then-confirm step.
  //
  // A single all-or-nothing backend call (check-out-backpack), not the old
  // check-out-then-load-backpack pair - that chain moved the vault
  // -> camp hop first (always uncapped) and only THEN checked capacity for
  // camp -> backpack, so a full backpack left the item stranded in camp
  // instead of the backpack the player actually asked for, with no way
  // back to the vault in one click. Dropping into camp on a full backpack
  // is deliberately ONLY something salvaging does, never a normal move -
  // see backend.players.check_out_item_balance_to_backpack.
  const moveToCamp = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    if (isInstance) {
      return finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/vault-to-camp`));
    }
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/vault-to-camp`, {
        amount,
      })
    );
  };

  // Each equipSlots entry is already one full alternative slot-group (e.g.
  // both hands together for a two-handed item, or a single named slot for
  // an ordinary one) - one button per group, matching what equip_item
  // itself will accept.
  const MOUNT_SUB_SLOTS = new Set(["Bridle", "Saddle", "Barding", "Saddlepack", "Hitch"]);
  const COMPANION_SUB_SLOTS = new Set(["Charm", "Rune"]);
  const slotGroups: string[][] = (info?.equipSlots?.length ? info.equipSlots : []).filter((group) => {
    if (!hasMountEquipped && group.some((s) => MOUNT_SUB_SLOTS.has(s))) return false;
    if (!hasCompanionEquipped && group.some((s) => COMPANION_SUB_SLOTS.has(s))) return false;
    return true;
  });

  // location:"body" rows only - every OTHER group this family could be
  // equipped into, for the reslot buttons below (swap hands, move a dagger
  // to its Girdle slot, ...). Excludes whichever group matches this
  // instance's own currentSlots - clicking your own current slot(s) would
  // be a no-op, so it's left off the list entirely rather than shown
  // disabled.
  const sameSlotGroup = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  const otherSlotGroups = currentSlots ? slotGroups.filter((group) => !sameSlotGroup(group, currentSlots)) : slotGroups;

  const stowToBackpack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/camp-to-backpack`));
  };

  const stowToCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/backpack-to-camp`));
  };

  const stowToVault = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/to-vault`));
  };

  const stowToSaddlepackFromCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/camp-to-saddlepack`));
  };

  const stowToCartFromCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/camp-to-cart`));
  };

  const stowToCartFromBackpack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/backpack-to-cart`));
  };

  const stowToCartFromSaddlepack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/saddlepack-to-cart`));
  };

  const stowToSaddlepack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/backpack-to-saddlepack`));
  };

  const saddlepackToBackpack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/saddlepack-to-backpack`));
  };

  const saddlepackToCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/saddlepack-to-camp`));
  };

  const cartToCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/cart-to-camp`));
  };

  const cartToBackpack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/cart-to-backpack`));
  };

  const cartToSaddlepack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/cart-to-saddlepack`));
  };

  // source:"character", NOT isInstance, location:"camp" only (a flat
  // gear.itemBalances.camp row, e.g. crafted goods like potions/food, or
  // ammo living in resources instead - see nonMovableIds) - camp -> this
  // same character's backpack, `amount` units at a time (one TransferButtons
  // row's own onPick - see this popup's itemBalances render block below).
  // The itemBalances equivalent of stowToBackpack above - same backend.
  // players.load_item_balance_to_backpack endpoint the Vault tab's own
  // moveToBackpack already uses for a non-instance row.
  const stowBalanceToBackpack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/camp-to-backpack`, {
        amount,
      })
    );
  };

  const stowBalanceToVault = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/to-vault`, {
        amount,
        location: "camp",
      })
    );
  };

  const unloadBalanceToCamp = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/backpack-to-camp`, {
        amount,
      })
    );
  };

  const stowBalanceToSaddlepack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/camp-to-saddlepack`, {
        amount,
      })
    );
  };

  const unloadBalanceFromSaddlepack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/saddlepack-to-camp`, {
        amount,
      })
    );
  };

  const moveBalanceBackpackToSaddlepack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/backpack-to-saddlepack`, {
        amount,
      })
    );
  };

  const moveBalanceSaddlepackToBackpack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/saddlepack-to-backpack`, {
        amount,
      })
    );
  };

  const stowBalanceToCart = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/camp-to-cart`, {
        amount,
      })
    );
  };

  const moveBalanceBackpackToCart = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/backpack-to-cart`, {
        amount,
      })
    );
  };

  const moveBalanceSaddlepackToCart = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/saddlepack-to-cart`, {
        amount,
      })
    );
  };

  const unloadBalanceFromCart = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/cart-to-camp`, {
        amount,
      })
    );
  };
  const moveBalanceCartToBackpack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/cart-to-backpack`, {
        amount,
      })
    );
  };
  const moveBalanceCartToSaddlepack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/cart-to-saddlepack`, {
        amount,
      })
    );
  };

  // source:"character", location:"body" rows' explicit destination icons
  const unequipToBackpack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/unequip`, { destination: "backpack" })
    );
  };
  const unequipToSaddlepack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/unequip`, { destination: "saddlepack" })
    );
  };
  const unequipToCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/unequip`, { destination: "camp" })
    );
  };
  const unequipToCart = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/unequip`, { destination: "cart" })
    );
  };

  // source:"character" rows only - equip into `slots`, from wherever this
  // instance currently is: backpack/camp/saddlepack -> body (the missing
  // other half of the unequip* actions above, without which a
  // character-owned item that's ever moved off the body had no way back
  // onto it except a manual database fix), OR body -> body (reslotting an
  // already-equipped instance into a DIFFERENT one of its own family's
  // equip_slots groups - swap hands, move a dagger to its Girdle slot,
  // ... - see backend.players.equip_item's reslot note and the
  // otherSlotGroups render guard below).
  const equipToSlots = async (slots: string[], amount?: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/equip`, { slots, ...(amount != null ? { amount } : {}), ...(location ? { location } : {}) }));
  };

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    onClose();
  };
  // A worn/camped backpack's own popup packs its own double-row scrollable
  // item matrix (PackedItemsRow) in the middle - taller than a plain
  // item's icon/description/meta stack, so it gets its own near-zero top
  // gap and relaxed max-height (even past the fixed footer - see
  // .backpackPopupOverlay/.backpackPopupCard) instead of the generic
  // popup's usual headroom, which would force it to scroll far sooner
  // than it has to.
  const isBackpack = info?.familyId === "backpack";
  const isSaddlepack = info?.familyId === "saddlepack";
  const isCart = info?.familyId === "cart";
  const isContainer = isBackpack || isSaddlepack || isCart;
  const activePackedItems = isCart ? cartPackedItems : isSaddlepack ? saddlepackPackedItems : packedItems;
  const containerTitle = name;

  const [confirmMove, setConfirmMove] = useState<{ label: string; action: () => void } | null>(null);

  return (
    <div
      className={`${styles.itemPopupOverlay} ${isContainer ? styles.backpackPopupOverlay : ""}`}
      onClick={handleClick}
    >
      <div
        className={`${styles.itemPopupCard} ${isContainer ? styles.backpackPopupCard : ""}`}
      >
          <>
            {!!info?.tier && (
              <span className={styles.itemPopupTierBadge}>
                {getTierIndicator(info.tier)}
              </span>
            )}
            {/* background-image div, not a real <img> - see ItemGrid's tile
                icon for why (mobile's native "save/share image" long-press
                menu targets the <img> tag itself). */}
            <ItemIcon icon={iconOverride ?? info?.icon} alt={name} className={styles.itemPopupImg} />
            <h3 className={styles.itemPopupName}>{isContainer ? containerTitle : displayName}</h3>
            {isContainer && activePackedItems && (
              <PackedItemsRow
                {...activePackedItems}
                hasBackpackEquipped={hasBackpackEquipped}
                hasSaddlepackEquipped={hasSaddlepackEquipped}
                hasMountEquipped={hasMountEquipped}
                hasCompanionEquipped={hasCompanionEquipped}
                cartCapacity={cartCapacity}
                cartSlotsUsed={cartSlotsUsed}
                inAdventure={inAdventure}
                characterId={characterId}
                onPlayerDataUpdated={onPlayerDataUpdated}
                location={isCart ? "cart" : isSaddlepack ? "saddlepack" : "backpack"}
              />
            )}
            <p className={`${styles.itemPopupDescription} ${flashMessage ? styles.itemPopupFlash : ""}`}>
              {flashMessage ?? (info?.description || "dummy")}
            </p>
            {!!info?.gatheringBonuses?.length && (
              <p className={styles.itemPopupGathering}>
                Helps gather: {info.gatheringBonuses.map(formatResourceLabel).join(", ")}
              </p>
            )}
            {!!info?.equipSlots?.length && (
              <p className={styles.itemPopupGathering}>
                Slot{info.equipSlots[0].length > 1 ? "s" : ""}: {info.equipSlots.map((g) => g.join(" + ")).join(" / ")}
              </p>
            )}
            <div className={styles.itemPopupMeta}>
              <span>Size: {info?.sizeClass ?? "tiny"}</span>
              {info?.armorClass != null && info.armorClass > 0 && (() => {
                const maxAC = info.armorClass * (info.tier ?? 1);
                if (!isInstance || quality == null || info.qualityMax == null || info.qualityMax <= 0) {
                  return <span>AC: {maxAC}</span>;
                }
                const qf = Math.max(0, Math.min(1, quality / (info.qualityMax * (2 ** (info.tier - 1)))));
                const cond = qualityState(qf);
                const reduction = cond === "damaged" ? 0.5 : cond === "used" ? 0.2 : 0;
                const currentAC = Math.max(0, Math.floor(maxAC * (1 - reduction)));
                return <span>AC: {currentAC}/{maxAC}</span>;
              })()}
              {isInstance && info?.qualityMax != null && (
                <span>{info.kind === "mount" || info.kind === "companion" ? "HP" : "Quality"}: {quality ?? 0}/{info.qualityMax * (2 ** (info.tier - 1))}</span>
              )}
              {info?.familyId === "backpack" && backpackSlotsUsed != null && backpackCapacity != null && (
                <span>Filled: {backpackSlotsUsed}/{backpackCapacity}</span>
              )}
              {info?.familyId === "saddlepack" && saddlepackSlotsUsed != null && saddlepackCapacity != null && (
                <span>Filled: {saddlepackSlotsUsed}/{saddlepackCapacity}</span>
              )}
              {info?.familyId === "cart" && cartSlotsUsed != null && cartCapacity != null && (
                <span>Filled: {cartSlotsUsed}/{cartCapacity}</span>
              )}
              {source !== "vault" && info?.kind === "mount" && info?.carryCapacity != null && info.carryCapacity > 0 && mountCarryWeightUsed != null && (
                <span>Carry: {mountCarryWeightUsed}/{info.carryCapacity}</span>
              )}
              {/* A container sitting in the shared vault holds nothing - its
                  contents only ever live on the character who has it
                  equipped (gear.itemBalances.<location>) - so
                  it's always empty against its own tier capacity. */}
              {source === "vault" && (info?.familyId === "backpack" || info?.familyId === "saddlepack" || info?.familyId === "cart") && info.capacitySlots != null && (
                <span>Filled: 0/{info.capacitySlots}</span>
              )}
              {source === "vault" && info?.kind === "mount" && info?.carryCapacity != null && info.carryCapacity > 0 && (
                <span>Carry: 0/{info.carryCapacity}</span>
              )}
            </div>
            {movable && source === "vault" && duplicateContainer && (
              <p className={styles.itemPopupAwayNotice}>Already equipped</p>
            )}
            {movable && source === "vault" && !duplicateContainer && (
              inAdventure ? (
                <p className={styles.itemPopupAwayNotice}>
                  {characterFirstName ? `${characterFirstName} is on the road` : "On the road"}
                </p>
              ) : (stackSize > 1 || (!isInstance && owned > 1)) ? (
                <TransferButtons
                  owned={owned}
                  pending={pending}
                  onPick={moveToCamp}
                  destinationIcon={CAMP_ACTION_ICON}
                  destinationLabel="Camp"
                  amounts={RAW_RESOURCE_AMOUNTS}
                  showHalf
                  showInfinity={false}
                />
              ) : (
                <div className={styles.itemPopupActions}>
                  <button
                    type="button"
                    className={styles.itemPopupBackpackButton}
                    disabled={pending}
                    onClick={() => moveToCamp(1)}
                    aria-label="Move to camp"
                    title="Move to camp"
                  >
                    <div
                      role="img"
                      aria-label="Camp"
                      className={styles.itemPopupBackpackIcon}
                      style={{ backgroundImage: `url(${CAMP_ACTION_ICON})` }}
                    />
                  </button>
                </div>
              )
            )}
            {movable && source === "character" && isInstance && location === "body" && (
              (isContainer || info?.familyId?.endsWith("_mount") || info?.familyId?.endsWith("_companion")) ? (
                <div className={styles.itemPopupActions}>
                  {isContainer && otherSlotGroups.map((slots) => (
                    <button
                      key={slots.join("+")}
                      type="button"
                      className={styles.itemPopupActionButton}
                      disabled={pending}
                      onClick={() => equipToSlots(slots)}
                    >
                      {slots.map((slot, i) => (
                        <Fragment key={slot}>
                          {i > 0 && " + "}
                          {formatSlotLabel(slot)}
                        </Fragment>
                      ))}
                    </button>
                  ))}
                  {!inAdventure && (
                    <button
                      type="button"
                      className={styles.itemPopupBackpackButton}
                      disabled={pending}
                      onClick={isContainer
                        ? () => setConfirmMove({ label: "Camp", action: unequipToCamp })
                        : unequipToCamp}
                      aria-label="Move to camp"
                      title="Move to camp"
                    >
                      <div role="img" aria-label="Camp" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CAMP_ACTION_ICON})` }} />
                    </button>
                  )}
                </div>
              ) : (
                <div className={styles.itemPopupActions}>
                  {otherSlotGroups.map((slots) => (
                    <button
                      key={slots.join("+")}
                      type="button"
                      className={styles.itemPopupActionButton}
                      disabled={pending}
                      onClick={() => equipToSlots(slots)}
                    >
                      {slots.map((slot, i) => (
                        <Fragment key={slot}>
                          {i > 0 && " + "}
                          {formatSlotLabel(slot)}
                        </Fragment>
                      ))}
                    </button>
                  ))}
                  {info?.backpackable && hasBackpackEquipped && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending} onClick={unequipToBackpack} aria-label="Move to backpack" title="Move to backpack">
                      <div role="img" aria-label="Backpack" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }} />
                    </button>
                  )}
                  {info?.backpackable && hasSaddlepackEquipped && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending} onClick={unequipToSaddlepack} aria-label="Move to saddlepack" title="Move to saddlepack">
                      <div role="img" aria-label="Saddlepack" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }} />
                    </button>
                  )}
                  {(cartCapacity ?? 0) > 0 && !isContainer && !info?.familyId?.endsWith("_mount") && !info?.familyId?.endsWith("_companion") && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending} onClick={unequipToCart} aria-label="Move to cart" title="Move to cart">
                      <div role="img" aria-label="Cart" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CART_ACTION_ICON})` }} />
                    </button>
                  )}
                  {!inAdventure && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending} onClick={unequipToCamp} aria-label="Move to camp" title="Move to camp">
                      <div role="img" aria-label="Camp" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CAMP_ACTION_ICON})` }} />
                    </button>
                  )}
                </div>
              )
            )}
            {movable && source === "character" && isInstance && location !== "body" && (
              <div className={styles.itemPopupActions}>
                {slotGroups.map((slots) => (
                  <button
                    key={slots.join("+")}
                    type="button"
                    className={styles.itemPopupActionButton}
                    disabled={pending}
                    onClick={() => equipToSlots(slots)}
                  >
                    {slots.map((slot, i) => (
                      <Fragment key={slot}>
                        {i > 0 && " + "}
                        {formatSlotLabel(slot)}
                      </Fragment>
                    ))}
                  </button>
                ))}
                {!inAdventure && location !== "camp" && (
                  <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                    onClick={location === "backpack" ? stowToCamp : location === "saddlepack" ? saddlepackToCamp : cartToCamp}
                    aria-label="Move to camp" title="Move to camp">
                    <div role="img" aria-label="Camp" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CAMP_ACTION_ICON})` }} />
                  </button>
                )}
                {location !== "backpack" && info?.backpackable && hasBackpackEquipped && (
                  <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                    onClick={location === "camp" ? stowToBackpack : location === "saddlepack" ? saddlepackToBackpack : cartToBackpack}
                    aria-label="Move to backpack" title="Move to backpack">
                    <div role="img" aria-label="Backpack" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }} />
                  </button>
                )}
                {location !== "saddlepack" && info?.backpackable && hasSaddlepackEquipped && (
                  <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                    onClick={location === "camp" ? stowToSaddlepackFromCamp : location === "backpack" ? stowToSaddlepack : cartToSaddlepack}
                    aria-label="Move to saddlepack" title="Move to saddlepack">
                    <div role="img" aria-label="Saddlepack" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }} />
                  </button>
                )}
                {location !== "cart" && (cartCapacity ?? 0) > 0 && !isContainer && !info?.familyId?.endsWith("_mount") && !info?.familyId?.endsWith("_companion") && (
                  <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                    onClick={location === "camp" ? stowToCartFromCamp : location === "backpack" ? stowToCartFromBackpack : stowToCartFromSaddlepack}
                    aria-label="Move to cart" title="Move to cart">
                    <div role="img" aria-label="Cart" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CART_ACTION_ICON})` }} />
                  </button>
                )}
                {!inAdventure && location === "camp" && (
                  <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                    onClick={stowToVault}
                    aria-label="Move to vault" title="Move to vault">
                    <div role="img" aria-label="Vault" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${VAULT_ACTION_ICON})` }} />
                  </button>
                )}
              </div>
            )}
            {movable && source === "character" && !isInstance && (location === "camp" || location === "backpack" || location === "saddlepack" || location === "cart") && (
              stackSize > 1 ? (
                <>
                  {!!slotGroups.length && (
                    <div className={styles.itemPopupActions}>
                      {slotGroups.map((slots) => (
                        <button
                          key={slots.join("+")}
                          type="button"
                          className={styles.itemPopupActionButton}
                          disabled={pending}
                          onClick={() => equipToSlots(slots, owned)}
                        >
                          {slots.map((slot, i) => (
                            <Fragment key={slot}>
                              {i > 0 && " + "}
                              {formatSlotLabel(slot)}
                            </Fragment>
                          ))}
                        </button>
                      ))}
                    </div>
                  )}
                  {!inAdventure && location !== "camp" && (
                    <TransferButtons owned={owned} pending={pending}
                      onPick={location === "backpack" ? unloadBalanceToCamp : location === "saddlepack" ? unloadBalanceFromSaddlepack : unloadBalanceFromCart}
                      destinationIcon={CAMP_ACTION_ICON} destinationLabel="Camp" amounts={RAW_RESOURCE_AMOUNTS} showHalf showInfinity={false} />
                  )}
                  {location !== "backpack" && hasBackpackEquipped && (
                    <TransferButtons owned={owned} pending={pending}
                      onPick={location === "camp" ? stowBalanceToBackpack : location === "saddlepack" ? moveBalanceSaddlepackToBackpack : moveBalanceCartToBackpack}
                      destinationIcon={BACKPACK_ACTION_ICON} destinationLabel="Backpack" amounts={RAW_RESOURCE_AMOUNTS} showHalf showInfinity={false} />
                  )}
                  {location !== "saddlepack" && hasSaddlepackEquipped && (
                    <TransferButtons owned={owned} pending={pending}
                      onPick={location === "camp" ? stowBalanceToSaddlepack : location === "backpack" ? moveBalanceBackpackToSaddlepack : moveBalanceCartToSaddlepack}
                      destinationIcon={SADDLEPACK_ACTION_ICON} destinationLabel="Saddlepack" amounts={RAW_RESOURCE_AMOUNTS} showHalf showInfinity={false} />
                  )}
                  {location !== "cart" && (cartCapacity ?? 0) > 0 && !isContainer && !info?.familyId?.endsWith("_mount") && !info?.familyId?.endsWith("_companion") && (
                    <TransferButtons owned={owned} pending={pending}
                      onPick={location === "camp" ? stowBalanceToCart : location === "backpack" ? moveBalanceBackpackToCart : moveBalanceSaddlepackToCart}
                      destinationIcon={CART_ACTION_ICON} destinationLabel="Cart" amounts={RAW_RESOURCE_AMOUNTS} showHalf showInfinity={false} />
                  )}
                  {!inAdventure && location === "camp" && (
                    <TransferButtons owned={owned} pending={pending}
                      onPick={stowBalanceToVault}
                      destinationIcon={VAULT_ACTION_ICON} destinationLabel="Vault" amounts={RAW_RESOURCE_AMOUNTS} showHalf showInfinity={false} />
                  )}
                </>
              ) : (
                <div className={styles.itemPopupActions}>
                  {slotGroups.map((slots) => (
                    <button
                      key={slots.join("+")}
                      type="button"
                      className={styles.itemPopupActionButton}
                      disabled={pending}
                      onClick={() => equipToSlots(slots)}
                    >
                      {slots.map((slot, i) => (
                        <Fragment key={slot}>
                          {i > 0 && " + "}
                          {formatSlotLabel(slot)}
                        </Fragment>
                      ))}
                    </button>
                  ))}
                  {!inAdventure && location !== "camp" && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                      onClick={() => (location === "backpack" ? unloadBalanceToCamp : location === "saddlepack" ? unloadBalanceFromSaddlepack : unloadBalanceFromCart)(1)}
                      aria-label="Move to camp" title="Move to camp">
                      <div role="img" aria-label="Camp" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CAMP_ACTION_ICON})` }} />
                    </button>
                  )}
                  {location !== "backpack" && hasBackpackEquipped && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                      onClick={() => (location === "camp" ? stowBalanceToBackpack : location === "saddlepack" ? moveBalanceSaddlepackToBackpack : moveBalanceCartToBackpack)(1)}
                      aria-label="Move to backpack" title="Move to backpack">
                      <div role="img" aria-label="Backpack" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }} />
                    </button>
                  )}
                  {location !== "saddlepack" && hasSaddlepackEquipped && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                      onClick={() => (location === "camp" ? stowBalanceToSaddlepack : location === "backpack" ? moveBalanceBackpackToSaddlepack : moveBalanceCartToSaddlepack)(1)}
                      aria-label="Move to saddlepack" title="Move to saddlepack">
                      <div role="img" aria-label="Saddlepack" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }} />
                    </button>
                  )}
                  {location !== "cart" && (cartCapacity ?? 0) > 0 && !isContainer && !info?.familyId?.endsWith("_mount") && !info?.familyId?.endsWith("_companion") && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                      onClick={() => (location === "camp" ? stowBalanceToCart : location === "backpack" ? moveBalanceBackpackToCart : moveBalanceSaddlepackToCart)(1)}
                      aria-label="Move to cart" title="Move to cart">
                      <div role="img" aria-label="Cart" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${CART_ACTION_ICON})` }} />
                    </button>
                  )}
                  {!inAdventure && location === "camp" && (
                    <button type="button" className={styles.itemPopupBackpackButton} disabled={pending}
                      onClick={() => stowBalanceToVault(1)}
                      aria-label="Move to vault" title="Move to vault">
                      <div role="img" aria-label="Vault" className={styles.itemPopupBackpackIcon} style={{ backgroundImage: `url(${VAULT_ACTION_ICON})` }} />
                    </button>
                  )}
                </div>
              )
            )}
          </>
        {confirmMove && (
          <div className={styles.containerMoveConfirm} onClick={(e) => e.stopPropagation()}>
            <p className={styles.containerMoveConfirmText}>
              Move all to {confirmMove.label} and unpack everything?
            </p>
            <div className={styles.containerMoveConfirmButtons}>
              <button
                type="button"
                className={`${styles.itemPopupActionButton} ${styles.containerMoveCancel}`}
                onClick={() => setConfirmMove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.itemPopupActionButton} ${styles.containerMoveGo}`}
                disabled={pending}
                onClick={() => { setConfirmMove(null); confirmMove.action(); }}
              >
                Move
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Ids owned (quantity > 0) across one or more stackable pools, deduplicated -
// used to build the recipe viewer's "?tools=" / "?blueprints=" ownership
// lists, which only care whether something is owned at all, not how many.
export function ownedIds(...pools: Record<string, number>[]): string[] {
  const ids = new Set<string>();
  for (const pool of pools) {
    for (const [id, qty] of Object.entries(pool)) {
      if (qty > 0) ids.add(id);
    }
  }
  return [...ids];
}

/** Exchange page: this character's own crafting stock next to the party's shared stock. */
export function VaultTab({
  character,
  playerResourceBalances,
  playerTools,
  playerItemBalances,
  playerItems,
  onPlayerDataUpdated,
  section,
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
  /** Flat-count crafted goods in the player's shared vault (potions, food, misc trinkets - never equipped, never degrade). */
  playerItemBalances: Record<string, number>;
  /** Individually-tracked crafted items in the player's shared vault (weapons, armor, shields, ...), each its own instance with its own quality. */
  playerItems: ItemInstance[];
  /** Called with the fresh roster/vault/pool after a successful check-in/check-out transfer. */
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** Opens the character's own Crafting accordion section right away - set
   * when the player got here by clicking a soul slot that showed an active
   * crafting timer, so they land straight on what they came to check. */
  openCraftingSectionByDefault?: boolean;
  /** Which section to display - "crafting" for blueprints/recipe viewer/character crafting stock,
   * "vault" for the shared item grid. Controlled by the parent's footer tab. */
  section: "crafting" | "vault";
}) {
  // Resource tier info: id -> tier (for displaying tier indicators on resources)
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});

  // Tool tier info: id -> tier/family (for displaying tier indicators on tools)
  const [toolTierInfo, setToolTierInfo] = useState<BlueprintTierInfo>({});

  // Tier/family info for every concrete id belonging to an
  // item-inventory-properties.json family (all 118) - gives the Items grid
  // real tier/family sorting the same way blueprints/resources/tools
  // already get. Ammo (arrow/bolt/oil) crafts straight into itemBalances
  // like any other item now, so there's no separate resources-reclassifying
  // step needed here anymore.
  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getResourceCatalog().then(setResourceTierInfo).catch(() => setResourceTierInfo({})),
      getToolCatalog().then(setToolTierInfo).catch(() => setToolTierInfo({})),
      getItemCatalog().then(setItemCatalogTierInfo).catch(() => setItemCatalogTierInfo({})),
    ]).then(() => setCatalogsLoaded(true));
  }, []);

  const mergedCatalogTierInfo = useMemo<BlueprintTierInfo>(
    () => ({ ...itemCatalogTierInfo, ...toolTierInfo }),
    [itemCatalogTierInfo, toolTierInfo]
  );

  // Top-level accordion within the Vault tab (Blueprints Known/this
  // character's own Crafting stock/the party's shared Tools/the party's
  // shared Resources) - any number can be open at once, toggled
  const [vaultKindFilter, setVaultKindFilter] = useState<string[]>([]);
  const [vaultTierFilter, setVaultTierFilter] = useState<number[]>([]);
  const [vaultSpecialFilter, setVaultSpecialFilter] = useState<"tools" | "resources" | null>(null);
  const toggleKindFilter = (kind: string) => {
    setVaultSpecialFilter(null);
    setVaultKindFilter((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  };
  const toggleTierFilter = (tier: number) =>
    setVaultTierFilter((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  const toggleSpecialFilter = (mode: "tools" | "resources") => {
    setVaultKindFilter([]);
    setVaultSpecialFilter((prev) => (prev === mode ? null : mode));
  };

  const [vaultSelectMode, setVaultSelectMode] = useState(false);
  const [vaultSelectedIds, setVaultSelectedIds] = useState<Set<string>>(new Set());
  const [vaultBatchBusy, setVaultBatchBusy] = useState(false);
  const [vaultConfirmDestroy, setVaultConfirmDestroy] = useState(false);

  const exitVaultSelectMode = useCallback(() => {
    setVaultSelectMode(false);
    setVaultSelectedIds(new Set());
  }, []);

  const toggleVaultSelectItem = useCallback((id: string) => {
    setVaultSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterVaultSelectMode = useCallback((id: string) => {
    setVaultSelectMode(true);
    setVaultSelectedIds(new Set([id]));
  }, []);

  const enterVaultSelectResource = useCallback((key: string) => {
    setVaultSelectMode(true);
    setVaultSelectedIds(new Set([`res:${key}`]));
  }, []);

  const toggleVaultSelectResource = useCallback((key: string) => {
    const resKey = `res:${key}`;
    setVaultSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resKey)) next.delete(resKey);
      else next.add(resKey);
      return next;
    });
  }, []);

  // Crafted-item instances in the player's shared vault - one row PER
  // PHYSICAL INSTANCE, not aggregated by concrete id: each one has its own
  // quality and its own instanceId, so two Iron Battle Axes at different
  // wear levels are two separate rows, not one row with a count of 2.
  // instanceId is the row's own id (unique); lookupIds maps it back to the
  // concrete itemId for name/tier/kind lookups in tierInfo, which is keyed
  // by itemId, not instanceId.
  const { playerItemLookupIds, playerItemRowQuality, playerItemsCombined } = useMemo(() => {
    const lookupIds: Record<string, string> = {};
    const rowBalances: Record<string, number> = {};
    const rowQuality: Record<string, number | null> = {};
    for (const instance of playerItems) {
      lookupIds[instance.instanceId] = instance.itemId;
      rowBalances[instance.instanceId] = 1;
      rowQuality[instance.instanceId] = instance.quality;
    }
    const combined: Record<string, number> = { ...playerItemBalances, ...playerTools, ...rowBalances };
    return { playerItemLookupIds: lookupIds, playerItemRowQuality: rowQuality, playerItemsCombined: combined };
  }, [playerItems, playerItemBalances, playerTools]);

  // Whether this character currently has a physical backpack worn -
  // mirrors backend.items_catalog.has_backpack_available - also counts a
  // camp-located backpack, not just a worn one (unequip_item's "camp"
  // destination never empties its storage bucket, so it's still a real
  // place to add more into). Checked by familyId, not by "Back"/"Side" in
  // slotRef - bolt_girdle/quiver/ladder also list "Side" as one of their
  // OWN alternative equip_slots groups, so an equipped bolt_girdle sitting
  // in "Side" must not count as a backpack. "Move to backpack" only makes
  // sense with one available, so both the vault and character item popups
  // grey that button out otherwise instead of letting the click fail
  // server-side with "No backpack equipped".
  const hasBackpackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "backpack"
  );
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "saddlepack"
  );
  const hasMountEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && instance.slotRef?.includes("Mount")
  );
  const hasCompanionEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && instance.slotRef?.includes("Companion")
  );

  const hasCartInBodyOrCamp = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "cart"
  );

  const vaultSelectionHasDuplicateContainer = useMemo(() => {
    if (vaultSelectedIds.size === 0) return false;
    const existing: Record<string, boolean> = {
      backpack: hasBackpackEquipped,
      saddlepack: hasSaddlepackEquipped,
      cart: hasCartInBodyOrCamp,
    };
    for (const id of vaultSelectedIds) {
      const baseId = stripStackSuffix(id);
      let fam: string | undefined;
      if (playerItemLookupIds[baseId] !== undefined) {
        fam = playerItems.find((i) => i.instanceId === baseId)?.familyId;
      } else {
        fam = mergedCatalogTierInfo[baseId]?.familyId;
      }
      if (fam && existing[fam]) return true;
    }
    return false;
  }, [vaultSelectedIds, playerItemLookupIds, playerItems, mergedCatalogTierInfo, hasBackpackEquipped, hasSaddlepackEquipped, hasCartInBodyOrCamp]);


  const batchMoveVault = useCallback(
    async (destination: "backpack" | "saddlepack" | "cart" | "camp") => {
      if (vaultBatchBusy || vaultSelectedIds.size === 0) return;
      setVaultBatchBusy(true);
      const instanceIds: string[] = [];
      const balanceTotals = new Map<string, number>();
      for (const raw of vaultSelectedIds) {
        const isRes = raw.startsWith("res:");
        const stripped = isRes ? raw.slice(4) : raw;
        const id = stripStackSuffix(stripped);
        if (isRes) {
          const qty = playerResourceBalances[id] ?? 0;
          if (qty > 0) balanceTotals.set(id, (balanceTotals.get(id) ?? 0) + qty);
        } else if (playerItemLookupIds[id] !== undefined) {
          if (!balanceTotals.has(id)) instanceIds.push(id);
        } else {
          const info = mergedCatalogTierInfo[id];
          const stackSize = Math.max(1, info?.stackSize ?? 1);
          const qty = playerItemsCombined[id] ?? 0;
          const hash = stripped.lastIndexOf("#");
          const tileIdx = hash === -1 ? 0 : parseInt(stripped.slice(hash + 1), 10);
          const itemsInTile = Math.max(0, Math.min(stackSize, qty - tileIdx * stackSize));
          if (itemsInTile > 0) balanceTotals.set(id, (balanceTotals.get(id) ?? 0) + itemsInTile);
        }
      }
      const balances = Array.from(balanceTotals, ([id, amount]) => ({ id, amount }));
      const r = await postJson(
        `/api/auth/me/characters/${character.id}/vault/bulk-move`,
        { destination, instanceIds, balances }
      );
      if (r.ok) onPlayerDataUpdated?.(r.data);
      setVaultBatchBusy(false);
      exitVaultSelectMode();
    },
    [vaultBatchBusy, vaultSelectedIds, playerItemLookupIds, playerItemsCombined, playerResourceBalances, mergedCatalogTierInfo, character.id, onPlayerDataUpdated, exitVaultSelectMode]
  );

  const batchDestroyVault = useCallback(async () => {
    if (vaultBatchBusy || vaultSelectedIds.size === 0) return;
    setVaultBatchBusy(true);
    let lastResult: RawPlayerData | null = null;
    const instancesSeen = new Set<string>();
    const balanceTotals = new Map<string, number>();
    for (const raw of vaultSelectedIds) {
      const isRes = raw.startsWith("res:");
      const stripped = isRes ? raw.slice(4) : raw;
      const id = stripStackSuffix(stripped);
      if (isRes) {
        const qty = playerResourceBalances[id] ?? 0;
        if (qty > 0) balanceTotals.set(id, (balanceTotals.get(id) ?? 0) + qty);
      } else if (playerItemLookupIds[id] !== undefined) {
        instancesSeen.add(id);
      } else {
        const info = mergedCatalogTierInfo[id];
        const stackSize = Math.max(1, info?.stackSize ?? 1);
        const qty = playerItemsCombined[id] ?? 0;
        const hash = stripped.lastIndexOf("#");
        const tileIdx = hash === -1 ? 0 : parseInt(stripped.slice(hash + 1), 10);
        const itemsInTile = Math.max(0, Math.min(stackSize, qty - tileIdx * stackSize));
        if (itemsInTile > 0) balanceTotals.set(id, (balanceTotals.get(id) ?? 0) + itemsInTile);
      }
    }
    for (const id of instancesSeen) {
      const r = await postJson(`/api/auth/me/characters/${character.id}/items/${id}/destroy`);
      if (r.ok) lastResult = r.data;
    }
    for (const [id, amount] of balanceTotals) {
      const r = await postJson(
        `/api/auth/me/characters/${character.id}/item-balances/${id}/destroy`,
        { amount }
      );
      if (r.ok) lastResult = r.data;
    }
    if (lastResult) onPlayerDataUpdated?.(lastResult);
    setVaultBatchBusy(false);
    exitVaultSelectMode();
  }, [vaultBatchBusy, vaultSelectedIds, playerItemLookupIds, playerItemsCombined, playerResourceBalances, mergedCatalogTierInfo, character.id, onPlayerDataUpdated, exitVaultSelectMode]);

  return (
    <div className={`${styles.panel}${section === "vault" ? ` ${styles.panelNoScroll}` : ""}`} onContextMenu={(e) => e.preventDefault()}>
      {section === "crafting" && (
        <p className={styles.inventoryEmpty}>Tools and resources moved to the vault tab.</p>
      )}

      {section === "vault" && !catalogsLoaded && (
        <p className={styles.inventoryEmpty}>Loading vault&hellip;</p>
      )}

      {section === "vault" && catalogsLoaded && (() => {
        const allVaultIds = Object.keys(playerItemsCombined).filter((id) => playerItemsCombined[id] > 0);
        // "tool", "raw_resource", "processed" have dedicated special-filter buttons — exclude from kind chips
        const kindOrder = ["weapon", "armor", "shield", "food", "potion", "adventuring_gear", "essentials", "companion", "mount"];
        const _specialKinds = new Set(["tool", "raw_resource", "processed"]);
        const kindsInVault = new Set(
          allVaultIds
            .map((id) => mergedCatalogTierInfo[playerItemLookupIds[id] ?? id]?.kind)
            .filter((k): k is string => !!k && !_specialKinds.has(k))
        );
        const hasTools = allVaultIds.some((id) => mergedCatalogTierInfo[playerItemLookupIds[id] ?? id]?.kind === "tool");
        const hasResources = Object.values(playerResourceBalances).some((qty) => qty > 0);
        const hasKindFilter = vaultKindFilter.length > 0;
        const hasTierFilter = vaultTierFilter.length > 0;
        const allActive = !hasKindFilter && !hasTierFilter && !vaultSpecialFilter;
        const matchesKind = (info: BlueprintTierInfo[string] | undefined): boolean => {
          if (!info) return false;
          return !!(info.kind && vaultKindFilter.includes(info.kind));
        };
        const filteredIds = vaultSpecialFilter === "tools"
          ? allVaultIds.filter((id) => {
              const info = mergedCatalogTierInfo[playerItemLookupIds[id] ?? id];
              if (info?.kind !== "tool") return false;
              if (hasTierFilter && (!info.tier || !vaultTierFilter.includes(info.tier))) return false;
              return true;
            })
          : vaultSpecialFilter === "resources"
          ? []
          : allActive
          ? allVaultIds.filter((id) => {
              const kind = mergedCatalogTierInfo[playerItemLookupIds[id] ?? id]?.kind;
              return !kind || !_specialKinds.has(kind);
            })
          : allVaultIds.filter((id) => {
              const info = mergedCatalogTierInfo[playerItemLookupIds[id] ?? id];
              if (hasKindFilter && !matchesKind(info)) return false;
              if (hasTierFilter && (!info?.tier || !vaultTierFilter.includes(info.tier))) return false;
              return true;
            });
        const vaultResourceBalances = vaultSpecialFilter === "resources"
          ? (hasTierFilter
            ? Object.fromEntries(Object.entries(playerResourceBalances).filter(([id]) => {
                const t = resourceTierInfo[id]?.tier;
                return t !== undefined && vaultTierFilter.includes(t);
              }))
            : playerResourceBalances)
          : undefined;
        const vaultResourceTierInfo = vaultSpecialFilter === "resources" ? resourceTierInfo : undefined;
        return (
          <>
            {allVaultIds.length > 0 && (
              vaultSelectMode ? (
                <div className={styles.selectionBar}>
                  <div className={styles.selectionBarActions}>
                    {!character.availability.inAdventure && (
                      <button
                        type="button"
                        className={styles.selectionBarBtn}
                        title="Move to camp"
                        disabled={vaultBatchBusy || vaultSelectedIds.size === 0 || vaultSelectionHasDuplicateContainer}
                        onClick={() => batchMoveVault("camp")}
                      >
                        <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(${CAMP_ACTION_ICON})` }} />
                      </button>
                    )}
                    <div className={styles.selectionBarGap} />
                    <button
                      type="button"
                      className={styles.selectionBarBtn}
                      title="Destroy selected"
                      disabled={vaultBatchBusy || vaultSelectedIds.size === 0}
                      onClick={() => setVaultConfirmDestroy(true)}
                    >
                      <div className={styles.selectionBarIcon} style={{ backgroundImage: `url(/images/character/campfire_lit.png)` }} />
                    </button>
                  </div>
                  <span className={styles.selectionBarWeight}>
                    W: {selectionWeight(vaultSelectedIds, mergedCatalogTierInfo, playerItemsCombined, playerItemLookupIds)}
                  </span>
                  <button
                    type="button"
                    className={`${styles.selectionBarBtn} ${styles.selectionBarClose}`}
                    title="Select all"
                    onClick={() => {
                      const all = new Set<string>();
                      for (const id of filteredIds) {
                        if ((playerItemsCombined[id] ?? 0) <= 0) continue;
                        const isInstance = playerItemLookupIds[id] !== undefined;
                        if (isInstance) {
                          all.add(id);
                        } else {
                          const info = mergedCatalogTierInfo[id];
                          const stackSize = info?.stackSize ?? 1;
                          const owned = playerItemsCombined[id] ?? 0;
                          if (stackSize <= 1) {
                            for (let i = 0; i < owned; i++) all.add(`${id}#${i}`);
                          } else {
                            let remaining = owned;
                            let i = 0;
                            while (remaining > 0) {
                              all.add(`${id}#${i}`);
                              remaining -= Math.min(stackSize, remaining);
                              i++;
                            }
                          }
                        }
                      }
                      if (vaultResourceBalances) {
                        for (const resId of Object.keys(vaultResourceBalances)) {
                          const qty = vaultResourceBalances[resId] ?? 0;
                          if (qty <= 0 || !resourceTierInfo[resId]) continue;
                          all.add(`res:${resId}#0`);
                        }
                      }
                      setVaultSelectedIds(all);
                    }}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    className={`${styles.selectionBarBtn} ${styles.selectionBarClose}`}
                    title="Cancel selection"
                    onClick={exitVaultSelectMode}
                  >
                    &#x2715;
                  </button>
                </div>
              ) : (
                <div className={styles.vaultFilterBar}>
                  <div className={styles.vaultFilterGroup}>
                    <button
                      type="button"
                      className={`${styles.vaultFilterBtn} ${allActive ? styles.vaultFilterBtnActive : ""}`}
                      onClick={() => { setVaultKindFilter([]); setVaultTierFilter([]); setVaultSpecialFilter(null); }}
                      title="All"
                    >A</button>
                    {[1, 2, 3, 4, 5, 6].map((tier) => (
                      <button
                        key={`t${tier}`}
                        type="button"
                        className={`${styles.vaultFilterBtn} ${styles[`vaultFilterT${tier}` as keyof typeof styles] ?? ""} ${vaultTierFilter.includes(tier) ? styles.vaultFilterBtnActive : ""}`}
                        onClick={() => toggleTierFilter(tier)}
                        title={`Tier ${tier}`}
                      ><span>{getTierIndicator(tier)}</span></button>
                    ))}
                    <button
                      type="button"
                      className={`${styles.vaultFilterBtn} ${styles.vaultFilterBtnTools} ${vaultSpecialFilter === "tools" ? styles.vaultFilterBtnActive : ""}`}
                      onClick={() => toggleSpecialFilter("tools")}
                      title="Tools"
                      style={!hasTools ? { opacity: 0.3 } : undefined}
                    >🔧</button>
                    <button
                      type="button"
                      className={`${styles.vaultFilterBtn} ${styles.vaultFilterBtnResources} ${vaultSpecialFilter === "resources" ? styles.vaultFilterBtnActive : ""}`}
                      onClick={() => toggleSpecialFilter("resources")}
                      title="Resources"
                      style={!hasResources ? { opacity: 0.3 } : undefined}
                    >🪨</button>
                  </div>
                  {kindOrder.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`${styles.vaultFilterBtn} ${vaultKindFilter.includes(kind) ? styles.vaultFilterBtnActive : ""}`}
                      onClick={() => toggleKindFilter(kind)}
                      title={kind.replace(/_/g, " ")}
                      style={!kindsInVault.has(kind) ? { opacity: 0.3 } : undefined}
                    >{getKindIcon(kind)}</button>
                  ))}
                </div>
              )
            )}
            {vaultConfirmDestroy && (
              <div className={styles.confirmDestroyOverlay} onClick={() => setVaultConfirmDestroy(false)}>
                <div className={styles.confirmDestroyCard} onClick={(e) => e.stopPropagation()}>
                  <p className={styles.confirmDestroyText}>
                    Destroy {vaultSelectedIds.size} selected?
                  </p>
                  <div className={styles.confirmDestroyButtons}>
                    <button
                      type="button"
                      className={styles.confirmDestroyCancel}
                      onClick={() => setVaultConfirmDestroy(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.confirmDestroyConfirm}
                      onClick={() => { setVaultConfirmDestroy(false); batchDestroyVault(); }}
                    >
                      Destroy
                    </button>
                  </div>
                </div>
              </div>
            )}
            {vaultBatchBusy && (
              <div className={styles.batchLoadingOverlay}>
                <div className={styles.batchSpinner} />
              </div>
            )}
            <ItemGrid
              ids={filteredIds}
              emptyLabel={vaultSpecialFilter === "tools" ? "No tools owned." : vaultSpecialFilter === "resources" ? "No resources owned." : allActive ? "Shared Vault empty." : "No items match."}
              tierInfo={mergedCatalogTierInfo}
              balances={playerItemsCombined}
              lookupIds={playerItemLookupIds}
              instanceQuality={playerItemRowQuality}
              source="vault"
              hasBackpackEquipped={hasBackpackEquipped}
              hasSaddlepackEquipped={hasSaddlepackEquipped}
              hasMountEquipped={hasMountEquipped}
              hasCompanionEquipped={hasCompanionEquipped}
              hasCartEquipped={hasCartInBodyOrCamp}
              inAdventure={character.availability.inAdventure}
              characterId={character.id}
              characterFirstName={character.firstName}
              cartSlotsUsed={character.gear.cartSlotsUsed}
              cartCapacity={character.gear.cartCapacity}
              onPlayerDataUpdated={onPlayerDataUpdated}
              selectMode={vaultSelectMode}
              selectBusy={vaultBatchBusy}
              selectedIds={vaultSelectedIds}
              onLongPressItem={enterVaultSelectMode}
              onToggleSelectItem={toggleVaultSelectItem}
              resourceBalances={vaultResourceBalances}
              resourceTierInfo={vaultResourceTierInfo}
              resourceUrlPrefix={(id) => `/api/auth/me/characters/${character.id}/item-balances/${id}`}
              resourceDestinations={character.availability.inAdventure ? [] : [
                { key: "camp", icon: CAMP_ACTION_ICON, label: "Camp", endpoint: "vault-to-camp" },
              ]}
              onLongPressResource={enterVaultSelectResource}
              onToggleSelectResource={toggleVaultSelectResource}
              skipResourceStackSplit
            />
          </>
        );
      })()}
    </div>
  );
}
