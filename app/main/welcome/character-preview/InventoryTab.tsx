import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./CharacterTabs.module.css";
import { formatRemainingCompactLong, useCraftCountdown } from "../craftTimer";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import type { ItemInstance } from "../SoulSlotGrid";
export type { ItemInstance } from "../SoulSlotGrid";
import { InAdventureToggle } from "./InAdventureToggle";

// GET /api/auth/blueprint-categories - lore/reference data (not
// player-specific), reused here purely to look up each known blueprint's own
// tier by id, since Character.blueprints is just a flat id list with no tier attached.
type BlueprintCategoryItem = { id: string; name: string; tier: number };
type BlueprintCategoryFamily = { familyId: string; kind: string; items: BlueprintCategoryItem[] };
type BlueprintCategoryEntry = { families: BlueprintCategoryFamily[] };
export type BlueprintTierInfo = Record<
  string,
  {
    tier: number;
    familyId: string;
    kind: string;
    name?: string;
    qualityMax?: number | null;
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
  }
>;
export type ResourceTierInfo = Record<
  string,
  { tier: number; family: string; category: "raw" | "processed"; name?: string }
>;

// The raw shape returned by /me/characters and every check-in/check-out
// transfer endpoint (backend.players.Player.to_dict()) - enough to refresh
// the whole roster plus the shared vault/tool pool after a transfer.
export type RawPlayerData = {
  characters: SlotCharacterSummary[];
  crafting: {
    tools: Record<string, number>;
    resources: Record<string, number>;
  };
  vault: {
    itemBalances: Record<string, number>;
    items: ItemInstance[];
  };
};

// GET /me/characters/{characterId}/recycle-preview/{itemId} (backend.
// recycling.RawMaterialRecovery, camelCased by auth_routes.py's
// RecyclePreviewResponse) - what recycling would hand back, one entry per
// recoverable raw material family.
type RecycleYield = { base: number; skill: number; tool: number; charm: number; total: number };
type RecycleRecoveredLine = {
  familyId: string;
  id: string;
  name: string;
  tier: number;
  category: "raw" | "processed";
  qty: number;
};
type RecycleMaterial = {
  rawFamilyId: string;
  rawName: string;
  totalUnits: number;
  yieldBreakdown: RecycleYield;
  recoveredUnits: number;
  recovered: RecycleRecoveredLine[];
};
type RecyclePreview = { materials: RecycleMaterial[] };

const TRANSFER_AMOUNTS = [1, 2, 5, 10, 20, 50] as const;
// Tools' own quantity row keeps the full TRANSFER_AMOUNTS (drawing from a
// shared pool that can hold hundreds of units), but every resource/
// processed-material move (Party's Resources' own row, and a single
// packed/camped resource's popup - see ResourcePopup) drops 50 - at
// typical backpack/camp quantities it's rarely reachable anyway, and the
// shorter row reads cleaner.
const RESOURCE_POPUP_TRANSFER_AMOUNTS = [1, 2, 5, 10, 20] as const;
// Raw/processed materials specifically (not itemBalances, which also
// reuse RESOURCE_POPUP_TRANSFER_AMOUNTS above) - a genuine resource row
// always pairs with a destinationIcon (see TransferButtons' own comment),
// so the ∞ button is redundant there and gets swapped for a plain "40"
// instead (a full raw-material backpack slot's worth - see the README's
// own Stacking Limits table), rather than showing two buttons that both
// mean "move everything".
const RAW_RESOURCE_AMOUNTS = [1, 2, 5, 10, 20, 40] as const;

/** The row of quick-transfer quantity buttons revealed under a clicked resource/tool row. */
function TransferButtons({
  owned,
  pending,
  onPick,
  destinationIcon,
  destinationLabel = "Backpack",
  amounts = TRANSFER_AMOUNTS,
  showInfinity = true,
}: {
  owned: number;
  pending: boolean;
  onPick: (amount: number) => void;
  /** When given, a small icon tacked on after the ∞ button (if shown),
   * showing where these amounts go (e.g. a backpack icon for a
   * check-out-to-backpack row). Clicking it is a second way to fire the
   * same "move everything" action as the ∞ button - a bigger, more
   * obvious target for the same owned-amount transfer. */
  destinationIcon?: string;
  /** Accessible label for destinationIcon - e.g. "Vault"/"Camp" for a
   * packed resource's move-out popup, whose destination varies by
   * inAdventure. Defaults to "Backpack", the original (and still most
   * common) destinationIcon usage. */
  destinationLabel?: string;
  /** The fixed-quantity buttons shown before the ∞ button - defaults to
   * the full TRANSFER_AMOUNTS; ResourcePopup/Party's Resources pass
   * RAW_RESOURCE_AMOUNTS instead (see its own comment), other callers
   * RESOURCE_POPUP_TRANSFER_AMOUNTS. */
  amounts?: readonly number[];
  /** False when destinationIcon is guaranteed present and already covers
   * "move everything" on its own (a genuine raw/processed resource row -
   * see RAW_RESOURCE_AMOUNTS's own comment) - showing both would just be
   * two buttons for the same action. True (the default) everywhere else,
   * including a row with no destinationIcon at all (∞ is then the only
   * way to move everything). */
  showInfinity?: boolean;
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
function formatResourceLabel(id: string): string {
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
function formatXpPreview(preview: { rawXp: Record<string, number>; finalXp: number } | null): string {
  if (!preview) return "";
  const parts = Object.entries(preview.rawXp).map(([family, xp]) => `+${xp} ${formatResourceLabel(family)} XP`);
  if (preview.finalXp > 0) parts.push(`+${preview.finalXp} Final XP`);
  return parts.join(", ");
}

// How long the "Finished: ..." result line stays visible (fading out) after
// a craft completes, before it's cleared entirely - matches the CSS fade
// animation's own duration (see .craftResultFading in CharacterTabs.module.css).
const CRAFT_RESULT_FADE_MS = 8000;

// Resolves an active craft's {familyId, tier} to a display name - the same
// question backend.players._resolve_recipe_output answers server-side, but
// there's no single "recipe output" endpoint to ask, so this scans the two
// tier-info maps that between them cover every possible recipe output
// (resourceTierInfo: raw/processed materials; itemCatalogTierInfo: all 118
// item-inventory-properties.json families, instance-tracked or not) for the
// entry at that exact family+tier. Falls back to a mechanical label from
// the family id if somehow neither catalog has it yet (e.g. mid-fetch).
function resolveOutputName(
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

function getKindIcon(kind: string): string {
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

export function getTierIndicator(tier: number): string {
  switch (tier) {
    case 1: return "○";
    case 2: return "●";
    case 3: return "◉";
    case 4: return "✦";
    case 5: return "✨";
    case 6: return "🌟";
    default: return "";
  }
}

function getTierSymbolClass(tier: number): string {
  switch (tier) {
    case 1: return styles.tierSymbolT1;
    case 2: return styles.tierSymbolT2;
    case 3: return styles.tierSymbolT3;
    case 4: return styles.tierSymbolT4;
    case 5: return styles.tierSymbolT5;
    case 6: return styles.tierSymbolT6;
    default: return styles.tierSymbol;
  }
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

function ResourceList({
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
              const tierDisplay = tier ? getTierIndicator(tier) : "";
              const isGreyed = tier > 0 && highestTierByFamily[family] > tier;
              const isExpanded = expandedId === id;
              const rows = [
                <tr
                  key={id}
                  onClick={onTransfer ? () => setExpandedId(isExpanded ? null : id) : undefined}
                  className={onTransfer ? styles.transferableRow : undefined}
                >
                  <td style={isGreyed ? { color: "#665b42" } : undefined}>{icon}</td>
                  <td><span className={tier > 0 ? getTierSymbolClass(tier) : styles.tierSymbol}>{tierDisplay}</span></td>
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

function IdList({
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
        // Items first, then tools
        if (infoA.kind !== infoB.kind) {
          const aIsTool = infoA.kind === "tool";
          return aIsTool ? 1 : -1; // Non-tools (items) first
        }
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
    const tierDisplay = info ? getTierIndicator(info.tier) : "";
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
        <td><span className={info?.tier ? getTierSymbolClass(info.tier) : styles.tierSymbol}>{tierDisplay}</span></td>
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
export const FALLBACK_ITEM_ICON = "/images/items/bat.png";

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

/** Exported so BodyTab.tsx's equip slots can show the same tier badge
 * ItemGrid's tiles do, rather than duplicating the per-tier class/symbol
 * mapping. */
export function itemGridTierBadgeClass(tier: number): string {
  switch (tier) {
    case 1: return styles.itemGridTierT1;
    case 2: return styles.itemGridTierT2;
    case 3: return styles.itemGridTierT3;
    case 4: return styles.itemGridTierT4;
    case 5: return styles.itemGridTierT5;
    case 6: return styles.itemGridTierT6;
    default: return "";
  }
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
  inAdventure = false,
  characterId,
  characterFirstName,
  onPlayerDataUpdated,
  reserveBottomPx = 0,
  hideScrollbar = false,
  packedItems,
  backpackSlotsUsed,
  backpackCapacity,
  resourceBalances,
  resourceTierInfo,
  resourceDestinations,
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
  /** "vault" (default): rows live in the player's shared pool - the popup's move actions are equip-from-pool/move-to-backpack, recycle/destroy target the shared vault. "character": rows are this character's own backpack/body items or itemBalances - the popup's move actions are Unequip(-to-vault)/Move-to-backpack for a worn row, Equip/Check-in-to-vault for a backpacked one; recycle/destroy target this character's own holdings instead. */
  source?: "vault" | "character";
  /** Whether this character currently has a backpack worn - greys out the popup's "Move to backpack" button instead of letting the click fail server-side with "No backpack equipped". */
  hasBackpackEquipped: boolean;
  /** Whether this character's mount currently has a saddlepack worn - hides the popup's "Move to saddlepack" button entirely when false (see ItemDetailPopup's identical prop). */
  hasSaddlepackEquipped: boolean;
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
  backpackSlotsUsed?: number;
  backpackCapacity?: number;
  /** Raw/processed materials sitting loose at this same location (e.g.
   * CampView's own gear.resources.camp) - rendered as their own tiles
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
      if (!el) return;
      // The page's own fixed bottom icon bar (see CharacterTabs.module.css's
      // .topBar, position: fixed; bottom: 0) sits on top of whatever's
      // scrolled underneath it - window.innerHeight alone doesn't know
      // about it, so a row of icons could otherwise land partly hidden
      // behind it. Measured live (rather than a hardcoded guess) since its
      // own height already flexes with viewport width (.tabIcon's clamp()
      // sizing). Falls back to 0, not a guessed reserve, when it's not in
      // the DOM - CharacterPreview.tsx now genuinely removes it while
      // CampView is open (its own exit.webp replaces it there), so "not
      // found" means "there's really nothing to reserve space for", not
      // "measure this before it's mounted yet".
      const footer = document.querySelector('[data-role="character-preview-topbar"]');
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      const available =
        window.innerHeight - el.getBoundingClientRect().top - footerHeight - 16 + SCROLLBAR_OVERLAP_PX - reserveBottomPx;
      setGridHeight(Math.max(ITEM_TILE_PX, available));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [reserveBottomPx]);

  // The clicked tile's own row id (not its lookupIds-resolved concrete id -
  // the detail popup needs the SAME id back to re-read `balances`/`name`
  // for whichever exact row was clicked).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Same idea, for a resource tile (see below) - a separate id/popup since
  // a resource opens ResourcePopup, not ItemDetailPopup.
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const resourceIds = resourceBalances && resourceTierInfo ? sortResourceIds(resourceBalances, resourceTierInfo) : [];

  if (ids.length === 0 && resourceIds.length === 0) {
    return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;
  }

  const sortedIds = [...ids].sort((a, b) => {
    const infoA = tierInfo[lookupIds?.[a] ?? a];
    const infoB = tierInfo[lookupIds?.[b] ?? b];
    return (infoB?.tier ?? 0) - (infoA?.tier ?? 0);
  });

  return (
    <div
      ref={scrollRef}
      className={hideScrollbar ? `${styles.itemGridScroll} ${styles.itemGridScrollNoBar}` : styles.itemGridScroll}
      style={{ height: gridHeight }}
    >
      <div className={styles.itemGrid}>
        {sortedIds.map((id) => {
          const info = tierInfo[lookupIds?.[id] ?? id];
          const name = info?.name ? stripBlueprintPrefix(info.name) : formatResourceLabel(lookupIds?.[id] ?? id);
          // Only a family with a real stackSize > 1 (item-inventory-
          // properties.json) ever shows a count - a needsItemDefinition:true
          // instance is always exactly 1 of itself, so a bare "1" badge
          // would be noise rather than information.
          const showCount = (info?.stackSize ?? 1) > 1;
          // Only a real item instance carries a quality (isInstance rows -
          // same condition ItemDetailPopup uses for its "Quality: X/Y"
          // line) - a stackable balance row has no such concept, so it
          // gets no bar at all rather than a misleading full-green one.
          const currentQuality = instanceQuality?.[id];
          const qualityFraction =
            lookupIds?.[id] !== undefined && info?.qualityMax != null && currentQuality != null
              ? Math.max(0, Math.min(1, info.qualityMax > 0 ? currentQuality / info.qualityMax : 1))
              : null;
          // Same cutoff as the quality bar's own red band (qualityState) -
          // a damaged instance gets a red-tinted tile background too, not
          // just the thin bar along its bottom edge, so it reads at a
          // glance in a full grid instead of needing a close look at one
          // 5px sliver.
          const isDamaged = qualityFraction !== null && qualityState(qualityFraction) === "damaged";
          return (
            <button
              key={id}
              type="button"
              className={isDamaged ? `${styles.itemGridCell} ${styles.itemGridCellDamaged}` : styles.itemGridCell}
              title={name}
              onClick={() => setSelectedId(id)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* A background-image div, not a real <img> - mobile
                  Chrome/Safari's long-press "save/share image" menu is
                  tied to the <img> tag itself and fires from the browser's
                  own native gesture recognizer, ahead of anything a
                  contextmenu/touch-callout CSS override can catch. No tag
                  for it to recognize as an image sidesteps that instead of
                  fighting it per-browser. */}
              <div
                role="img"
                aria-label={name}
                className={styles.itemGridImg}
                style={{ backgroundImage: `url(${info?.icon || FALLBACK_ITEM_ICON})` }}
              />
              {!!info?.tier && (
                <span className={`${styles.itemGridTierBadge} ${itemGridTierBadgeClass(info.tier)}`}>
                  {getTierIndicator(info.tier)}
                </span>
              )}
              {showCount && <span className={styles.itemGridCountBadge}>{balances[id] ?? 0}</span>}
              {qualityFraction !== null && (
                <div
                  className={styles.itemGridQualityBar}
                  style={{ width: `${qualityFraction * 100}%`, backgroundColor: qualityBarColor(qualityFraction) }}
                />
              )}
            </button>
          );
        })}
        {resourceIds.map((id) => {
          const info = resourceTierInfo?.[id];
          const fullName = info?.name ?? formatResourceLabel(id);
          const label = fullName.split(" ").pop() ?? fullName;
          return (
            <button
              key={id}
              type="button"
              className={styles.itemGridCell}
              title={fullName}
              onClick={() => setSelectedResourceId(id)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className={styles.itemGridResourceLabel}>{label}</span>
              {!!info?.tier && (
                <span className={`${styles.itemGridTierBadge} ${itemGridTierBadgeClass(info.tier)}`}>
                  {getTierIndicator(info.tier)}
                </span>
              )}
              <span className={styles.itemGridCountBadge}>{resourceBalances?.[id] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {selectedResourceId && resourceTierInfo && (
        <ResourcePopup
          resourceId={selectedResourceId}
          tierInfo={resourceTierInfo}
          owned={resourceBalances?.[selectedResourceId] ?? 0}
          characterId={characterId}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedResourceId(null)}
          destinations={resourceDestinations ?? []}
        />
      )}
      {selectedId && (
        <ItemDetailPopup
          info={tierInfo[lookupIds?.[selectedId] ?? selectedId]}
          fallbackName={formatResourceLabel(lookupIds?.[selectedId] ?? selectedId)}
          owned={balances[selectedId] ?? 0}
          isInstance={lookupIds?.[selectedId] !== undefined}
          movable={!nonMovableIds?.has(selectedId)}
          quality={instanceQuality?.[selectedId] ?? null}
          moveId={selectedId}
          catalogId={lookupIds?.[selectedId] ?? selectedId}
          location={instanceLocations?.[selectedId]}
          source={source}
          hasBackpackEquipped={hasBackpackEquipped}
          hasSaddlepackEquipped={hasSaddlepackEquipped}
          inAdventure={inAdventure}
          characterId={characterId}
          characterFirstName={characterFirstName}
          packedItems={packedItems}
          backpackSlotsUsed={backpackSlotsUsed}
          backpackCapacity={backpackCapacity}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedId(null)}
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
const SADDLEPACK_ACTION_ICON = "/images/character/saddlebags.png";
export const VAULT_ACTION_ICON = "/images/character/vault.png";
const CAMP_ACTION_ICON = "/images/character/camp.png";

const QUANTITY_OPTIONS = [1, 2, 5, 10] as const;

// No dedicated hand icon asset exists - a plain emoji glyph fits the same
// convention every other icon in this file already uses (getKindIcon's
// ⚔️/🛡️/🥋, getTierIndicator's ○●◉✦✨🌟), no image needed. No "Left"/"Right"
// text at all - the glyph alone flipped horizontally (scaleX(-1), matching
// BodyTab.tsx's own EquipSlotIcon mirroring) for "Right Hand" is what tells
// the two apart, read as a mirrored pair rather than two identical icons.
function formatSlotLabel(slot: string): ReactNode {
  if (!/\bHand\b/.test(slot)) return slot;
  const isRight = slot.startsWith("Right");
  return <span style={isRight ? { display: "inline-block", transform: "scaleX(-1)" } : undefined}>✋</span>;
}

type PostJsonResult =
  | { ok: true; data: RawPlayerData }
  | { ok: false; detail: string | null };

async function postJson(url: string, body?: object): Promise<PostJsonResult> {
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

// How long the destroy control must be held before it actually fires -
// long enough that it can't be triggered by a stray tap, matching the
// weight of "for good" (see ItemDetailPopup's showDestroy view).
const DESTROY_HOLD_MS = 2000;

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

// The recycle hold bar's own fill (see ItemDetailPopup's runRecycle) - same
// gold start as destroyFillColor, but deepening into the app's own
// "healthy/recovered" green (QUALITY_STATE_COLORS.new, rgb(90, 156, 74))
// instead of red, so a beneficial action never reads as a warning.
function recycleFillColor(t: number): string {
  const GOLD: [number, number, number] = [230, 184, 92];
  const GREEN: [number, number, number] = [90, 156, 74];
  const clamped = Math.min(1, Math.max(0, t));
  const [r, g, b] = GOLD.map((c, i) => Math.round(c + (GREEN[i] - c) * clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

// The three discrete condition brackets a quality fraction (current/max)
// falls into - fixed steps, not a smooth blend, matching the dismantle
// mechanic's own three fixed material-yield brackets (100% new, 50% used,
// 10-0% damaged - see crafting-agent.md's "Dismantle mechanic" section)
// that this same state is meant to drive once recycle yield is wired up.
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
  new: "rgb(40, 99, 23)",
  used: "rgb(143, 97, 41)",
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
  if (detail === "No backpack equipped") return "No backpack found, equip one.";
  if (detail === "Backpack is full") return "Backpack full - remove items first.";
  if (detail === "No saddlepack equipped") return "No saddlepack found, equip one.";
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
 * resourceBalances is the separate gear.resources.backpack bucket (raw/
 * processed materials checked out straight from Party's Resources - see
 * InventoryTab's transferToBackpack) - kept apart from `balances` rather
 * than merged in since resources use their own id space/tier lookup
 * (resourceTierInfo, not itemCatalogTierInfo) and render as a plain list,
 * not image tiles (see PackedResourcesList). */
export function computeBackpackContents(character: {
  gear: {
    items: ItemInstance[];
    itemBalances: { backpack: Record<string, number> };
    resources: { backpack: Record<string, number> };
  };
}): {
  ids: string[];
  balances: Record<string, number>;
  lookupIds: Record<string, string>;
  instanceQuality: Record<string, number | null>;
  resourceBalances: Record<string, number>;
} {
  const backpackBalances = character.gear.itemBalances.backpack;
  const backpackInstances = character.gear.items.filter((instance) => instance.location === "backpack");
  const lookupIds: Record<string, string> = {};
  const instanceRowBalances: Record<string, number> = {};
  const instanceQuality: Record<string, number | null> = {};
  for (const instance of backpackInstances) {
    lookupIds[instance.instanceId] = instance.itemId;
    instanceRowBalances[instance.instanceId] = 1;
    instanceQuality[instance.instanceId] = instance.quality;
  }
  const balances: Record<string, number> = { ...backpackBalances, ...instanceRowBalances };
  const ids = Object.keys(balances).filter((id) => balances[id] > 0);
  return { ids, balances, lookupIds, instanceQuality, resourceBalances: character.gear.resources.backpack };
}

// Highest tier first, same ordering PackedItemsRow's own item tiles use.
function sortResourceIds(balances: Record<string, number>, tierInfo: ResourceTierInfo): string[] {
  return Object.keys(balances)
    .filter((id) => (balances[id] ?? 0) > 0)
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
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {sortResourceIds(balances, tierInfo).map((id) => {
        const info = tierInfo[id];
        const fullName = info?.name ?? formatResourceLabel(id);
        const label = fullName.split(" ").pop() ?? fullName;
        return (
          <button
            key={id}
            type="button"
            className={styles.itemGridCell}
            title={fullName}
            onClick={() => onSelect(id)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className={styles.itemGridResourceLabel}>{label}</span>
            {!!info?.tier && (
              <span className={`${styles.itemGridTierBadge} ${itemGridTierBadgeClass(info.tier)}`}>
                {getTierIndicator(info.tier)}
              </span>
            )}
            <span className={styles.itemGridCountBadge}>{balances[id] ?? 0}</span>
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
  inAdventure,
  characterId,
  onPlayerDataUpdated,
}: {
  ids: string[];
  tierInfo: BlueprintTierInfo;
  balances: Record<string, number>;
  lookupIds: Record<string, string>;
  instanceQuality: Record<string, number | null>;
  /** gear.resources.backpack - raw/processed materials checked out from
   * Party's Resources (see InventoryTab's transferToBackpack). Rendered
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
  inAdventure: boolean;
  characterId: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const sortedResourceIds = sortResourceIds(resourceBalances, resourceTierInfo);
  if (ids.length === 0 && sortedResourceIds.length === 0) {
    return <p className={styles.packedItemsEmpty}>Nothing packed in it yet.</p>;
  }
  const sortedIds = [...ids].sort((a, b) => {
    const infoA = tierInfo[lookupIds[a] ?? a];
    const infoB = tierInfo[lookupIds[b] ?? b];
    return (infoB?.tier ?? 0) - (infoA?.tier ?? 0);
  });
  return (
    <>
      {(ids.length > 0 || sortedResourceIds.length > 0) && (
      <div className={styles.packedItemsRow}>
        {sortedIds.map((id) => {
          const info = tierInfo[lookupIds[id] ?? id];
          const name = info?.name ? stripBlueprintPrefix(info.name) : formatResourceLabel(lookupIds[id] ?? id);
          const showCount = (info?.stackSize ?? 1) > 1;
          const currentQuality = instanceQuality[id];
          const qualityFraction =
            lookupIds[id] !== undefined && info?.qualityMax != null && currentQuality != null
              ? Math.max(0, Math.min(1, info.qualityMax > 0 ? currentQuality / info.qualityMax : 1))
              : null;
          const isDamaged = qualityFraction !== null && qualityState(qualityFraction) === "damaged";
          return (
            <button
              key={id}
              type="button"
              className={isDamaged ? `${styles.itemGridCell} ${styles.itemGridCellDamaged}` : styles.itemGridCell}
              title={name}
              onClick={() => setSelectedId(id)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div
                role="img"
                aria-label={name}
                className={styles.itemGridImg}
                style={{ backgroundImage: `url(${info?.icon || FALLBACK_ITEM_ICON})` }}
              />
              {!!info?.tier && (
                <span className={`${styles.itemGridTierBadge} ${itemGridTierBadgeClass(info.tier)}`}>
                  {getTierIndicator(info.tier)}
                </span>
              )}
              {showCount && <span className={styles.itemGridCountBadge}>{balances[id] ?? 0}</span>}
              {qualityFraction !== null && (
                <div
                  className={styles.itemGridQualityBar}
                  style={{ width: `${qualityFraction * 100}%`, backgroundColor: qualityBarColor(qualityFraction) }}
                />
              )}
            </button>
          );
        })}
        <ResourceTiles balances={resourceBalances} tierInfo={resourceTierInfo} onSelect={setSelectedResourceId} />
      </div>
      )}
      {selectedResourceId && (
        <ResourcePopup
          resourceId={selectedResourceId}
          tierInfo={resourceTierInfo}
          owned={resourceBalances[selectedResourceId] ?? 0}
          characterId={characterId}
          onPlayerDataUpdated={onPlayerDataUpdated}
          onClose={() => setSelectedResourceId(null)}
          destinations={
            inAdventure
              ? [{ key: "camp", icon: CAMP_ACTION_ICON, label: "Camp", endpoint: "unstow" }]
              : [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "unload-backpack" }]
          }
        />
      )}
      {selectedId && (
        <ItemDetailPopup
          info={tierInfo[lookupIds[selectedId] ?? selectedId]}
          fallbackName={formatResourceLabel(lookupIds[selectedId] ?? selectedId)}
          owned={balances[selectedId] ?? 0}
          isInstance={lookupIds[selectedId] !== undefined}
          movable
          quality={instanceQuality[selectedId] ?? null}
          moveId={selectedId}
          catalogId={lookupIds[selectedId] ?? selectedId}
          location="backpack"
          source="character"
          hasBackpackEquipped={hasBackpackEquipped}
          hasSaddlepackEquipped={hasSaddlepackEquipped}
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
 * the last path segment under .../resources/{resourceId}/..., e.g.
 * "unload-backpack" or "stow". */
export type ResourcePopupDestination = { key: string; icon: string; label: string; endpoint: string };

/** Opened by clicking a packed/camped resource tile (see PackedItemsRow and
 * CampView's own resource strip) - a deliberately stripped-down sibling of
 * ItemDetailPopup: no cogwheel/recycle-destroy view (raw/processed
 * materials have no recipe of their own to recycle - they're what
 * recycling something else already hands back), just a tier/name header
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
}: {
  resourceId: string;
  tierInfo: ResourceTierInfo;
  owned: number;
  characterId: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
  destinations: ResourcePopupDestination[];
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
      `/api/auth/me/characters/${characterId}/resources/${resourceId}/${endpoint}`,
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
          <span className={`${styles.itemPopupTierBadge} ${itemGridTierBadgeClass(info.tier)}`}>
            {getTierIndicator(info.tier)}
          </span>
        )}
        <h3 className={styles.itemPopupName}>{name}</h3>
        {flashMessage ? (
          <p className={`${styles.itemPopupDescription} ${styles.itemPopupFlash}`}>{flashMessage}</p>
        ) : (
          <div className={styles.itemPopupMeta}>
            <span>Owned: {owned}</span>
          </div>
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
            showInfinity={false}
          />
        ))}
      </div>
    </div>
  );
}

/** The popup opened by clicking an ItemGrid tile - icon/name/description/
 * sizeClass/stackMax/two-handed/quality, plus (when `movable`) a quantity
 * picker for a stackable balance and one button per destination: this
 * item's own equip slot(s), or a backpack icon when it's backpackable.
 * Each button moves it straight from the shared pool onto this character
 * in one click (check-out, then equip for a slot button).
 *
 * The cogwheel in the corner swaps this same card's content over to a
 * recycle/destroy view instead of opening a second popup (see
 * showDestroy) - a recycle preview up top (still a placeholder, no
 * dismantle endpoint exists yet) and a hold-to-confirm destroy control
 * below it. Holding that control for DESTROY_HOLD_MS fills a progress bar
 * above its flame icon and permanently deletes the item; releasing early
 * resets it with nothing destroyed. */
export function ItemDetailPopup({
  info,
  fallbackName,
  owned,
  isInstance,
  movable,
  quality,
  moveId,
  catalogId,
  location,
  source = "vault",
  hasBackpackEquipped,
  hasSaddlepackEquipped,
  inAdventure = false,
  currentSlots,
  characterId,
  characterFirstName,
  packedItems,
  backpackSlotsUsed,
  backpackCapacity,
  onPlayerDataUpdated,
  onClose,
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
  /** The concrete catalog id (item-catalog familyId+tier) this row resolves to - same id used to look up `info` itself (lookupIds?.[id] ?? id), needed separately here since GET .../recycle-preview/{itemId} takes a concrete id, never an instanceId. */
  catalogId: string;
  /** source:"character" instance rows only - "backpack", "camp", or "body" - decides whether the move actions offered are Equip/Check-in-to-vault (backpack/camp, treated the same) or Unequip (body). */
  location?: "backpack" | "body" | "camp";
  /** "vault" (default): `moveId` lives in the player's shared pool. "character": `moveId` is this character's own (backpack/body instance, or itemBalances row) - see ItemGrid's identical prop for what changes. */
  source?: "vault" | "character";
  /** Whether this character currently has a backpack worn - greys out any "Move to backpack" button instead of letting the click fail server-side with "No backpack equipped". */
  hasBackpackEquipped: boolean;
  /** Whether this character's mount currently has a saddlepack worn (see items_catalog.has_saddlepack_equipped) - any "Move to saddlepack" button is hidden entirely (not just greyed) when false, since there's no mount slot to blame the way a missing backpack gets a "No backpack equipped" message. */
  hasSaddlepackEquipped: boolean;
  /** location:"body" rows only - whether this character currently counts as out on an adventure (Character.availability.inAdventure). Picks the automatic-unequip icon: camp while true, the shared vault while false - see backend.players.unequip_item. */
  inAdventure?: boolean;
  /** location:"body" rows only - the slot(s) this instance currently occupies (its own slotRef) - used to exclude that same group from the reslot button list below (equipToSlots), since re-clicking your own current slot(s) would be a no-op. */
  currentSlots?: string[];
  characterId: string;
  /** source:"vault" only - named in the "In Storyline" notice that replaces the whole action row while inAdventure is true. */
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
  /** Same family:"backpack" rows as packedItems, same character-level
   * source (Character.gear.backpackSlotsUsed/backpackCapacity, computed
   * server-side by backend.items_catalog) - powers the "Filled: X/Y" meta
   * line below. Passed separately (not folded into packedItems) since
   * it's needed even when packedItems' own row would show nothing (e.g.
   * an empty but equipped backpack still has a real capacity to report). */
  backpackSlotsUsed?: number;
  backpackCapacity?: number;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
}) {
  const stackSize = info?.stackSize ?? 1;
  const name = info?.name ? stripBlueprintPrefix(info.name) : fallbackName;
  const displayName = stackSize > 1 ? `${owned} ${name}` : name;

  // Clicking the cogwheel swaps this same card's content over to the
  // recycle/destroy view instead of opening a second popup - toggling it
  // again (now an "info" glyph) swaps back.
  const [showDestroy, setShowDestroy] = useState(false);

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
  // is deliberately ONLY something recycling does, never a normal move -
  // see backend.players.check_out_item_balance_to_backpack.
  const moveToBackpack = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    if (isInstance) {
      return finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/check-out`));
    }
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/check-out-backpack`, {
        amount,
      })
    );
  };

  // Pool -> this character's saddlepack, one step - instance rows only (no
  // saddlepack equivalent of load-backpack exists for flat itemBalances
  // yet, so this button never shows for a balance row - see its render
  // guard below).
  const moveToSaddlepack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/check-out`, {
        destination: "saddlepack",
      })
    );
  };

  // Straight pool -> body, one call - never routes through the backpack
  // (see backend.players.equip_item_from_pool), unlike moveToBackpack
  // below which deliberately does.
  const equipFromPool = async (slots: string[]) => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/equip-from-pool`, { slots }));
  };

  // Each equipSlots entry is already one full alternative slot-group (e.g.
  // both hands together for a two-handed item, or a single named slot for
  // an ordinary one) - one button per group, matching what equip_item
  // itself will accept.
  const slotGroups: string[][] = isInstance && info?.equipSlots?.length ? info.equipSlots : [];

  // location:"body" rows only - every OTHER group this family could be
  // equipped into, for the reslot buttons below (swap hands, move a dagger
  // to its Girdle slot, ...). Excludes whichever group matches this
  // instance's own currentSlots - clicking your own current slot(s) would
  // be a no-op, so it's left off the list entirely rather than shown
  // disabled.
  const sameSlotGroup = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  const otherSlotGroups = currentSlots ? slotGroups.filter((group) => !sameSlotGroup(group, currentSlots)) : slotGroups;

  // source:"character", location:"backpack" rows only - straight to the
  // player's shared pool (check_in_item_instance only ever accepts a
  // backpacked/camped/saddlepacked instance, never an equipped one - see
  // unequip below for the equipped case, which posts to the same endpoint.
  const checkInToVault = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/check-in`));
  };

  // source:"character", location:"camp" rows only - straight to this same
  // character's backpack, staying off the shared pool entirely (unlike
  // checkInToVault above) - see backend.players.move_camp_item_to_backpack.
  // This is the only way a camped instance can reach the backpack while
  // inAdventure, since checkInToVault is hidden then and check-out (the
  // vault's own path to the backpack) is blocked mid-adventure server-side.
  const stowToBackpack = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/stow`));
  };

  // source:"character", location:"backpack" rows only - straight to this
  // same character's camp, staying off the shared pool entirely (the
  // reverse of stowToBackpack above) - see backend.players.
  // move_backpack_item_to_camp. This is the only way a backpacked
  // instance can reach camp while inAdventure, since checkInToVault is
  // unreachable then (there's no shared vault mid-adventure) and camp is
  // always its automatic fallback, same as an equipped item's own
  // unequip icon (see location:"body"'s automatic camp/vault icon above).
  const unstowToCamp = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/unstow`));
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
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/load-backpack`, {
        amount,
      })
    );
  };

  // source:"character", NOT isInstance, location:"camp" OR "backpack" -
  // straight to the shared pool from whichever bucket this row is actually
  // in, `amount` units at a time. The itemBalances equivalent of
  // checkInToVault above - a backpack row reaches the vault in this same
  // one direct hop now too (see backend.players.check_in_item_balance's
  // own `location` param), matching how a packed item INSTANCE already
  // could, rather than needing to stage through camp first.
  const checkInBalanceToVault = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/check-in`, {
        amount,
        location: location ?? "camp",
      })
    );
  };

  // source:"character", NOT isInstance, location:"backpack" only (a flat
  // gear.itemBalances.backpack row - see BodyTab's packedItems) - backpack
  // -> camp, `amount` units at a time, the reverse of
  // stowBalanceToBackpack above. Only offered while inAdventure (see this
  // popup's itemBalances render block below) - there's no shared vault to
  // reach mid-adventure, same reason an equipped instance's own unequip
  // icon falls back to camp then too.
  const unloadBalanceToCamp = async (amount: number) => {
    setPending(true);
    setFlashMessage(null);
    finish(
      await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/unload-backpack`, {
        amount,
      })
    );
  };

  // source:"character", location:"body" rows' automatic move icon (vault
  // or camp, picked by the popup's own render logic off `inAdventure`) -
  // backend.players.unequip_item makes the same choice server-side off
  // Character.availability.inAdventure when no explicit destination is
  // given, so this call needs no body at all.
  const unequip = async () => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/unequip`));
  };

  // source:"character", location:"body" rows' explicit "Move to
  // backpack"/"Move to saddlepack" icons - bypass the automatic vault/camp
  // choice above entirely, staying on this character regardless of
  // in_adventure. Both post the same endpoint as `unequip`, just with a
  // destination.
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

  // source:"character" rows only - equip into `slots`, from wherever this
  // instance currently is: backpack/camp/saddlepack -> body (the missing
  // other half of the unequip* actions above, without which a
  // character-owned item that's ever moved off the body had no way back
  // onto it except a manual database fix), OR body -> body (reslotting an
  // already-equipped instance into a DIFFERENT one of its own family's
  // equip_slots groups - swap hands, move a dagger to its Girdle slot,
  // ... - see backend.players.equip_item's reslot note and the
  // otherSlotGroups render guard below).
  const equipToSlots = async (slots: string[]) => {
    setPending(true);
    setFlashMessage(null);
    finish(await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/equip`, { slots }));
  };

  // --- Recycle/destroy view (swapped in over the info view above by the
  // cogwheel button, rather than a second popup - see showDestroy). ---
  const [destroyProgress, setDestroyProgress] = useState(0);
  const [destroying, setDestroying] = useState(false);
  const [destroyError, setDestroyError] = useState<string | null>(null);
  const [destroyQuantity, setDestroyQuantity] = useState(1);
  // Set by the "∞" option - destroys everything currently owned rather
  // than one of the fixed QUANTITY_OPTIONS amounts.
  const [destroyAll, setDestroyAll] = useState(false);
  const destroyRafRef = useRef<number | null>(null);

  const resetDestroyHold = () => {
    if (destroyRafRef.current !== null) cancelAnimationFrame(destroyRafRef.current);
    destroyRafRef.current = null;
    setDestroyProgress(0);
  };
  useEffect(() => resetDestroyHold, []);

  // How many units the hold below would act on - always 1 for an instance
  // (never stacked), otherwise whatever the quantity row above has picked.
  const recycleCount = isInstance ? 1 : destroyAll ? owned : destroyQuantity;

  // Fetched fresh from GET .../recycle-preview whenever this view is open
  // and count changes - fromVault must match whichever recycle action will
  // actually run below (see runRecycle): a vault row's full shared tool
  // pool counts toward the bonus, a character row's own carried-only tools
  // do not (see backend.players.preview_recycle).
  const [recyclePreview, setRecyclePreview] = useState<RecyclePreview | null>(null);
  const [recyclePreviewLoading, setRecyclePreviewLoading] = useState(false);

  useEffect(() => {
    if (!showDestroy || recycleCount <= 0) return;
    let cancelled = false;
    setRecyclePreviewLoading(true);
    fetch(
      `/api/auth/me/characters/${characterId}/recycle-preview/${catalogId}?count=${recycleCount}&fromVault=${
        source === "vault"
      }`,
      { credentials: "include" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RecyclePreview | null) => {
        if (!cancelled) setRecyclePreview(data);
      })
      .catch(() => {
        if (!cancelled) setRecyclePreview(null);
      })
      .finally(() => {
        if (!cancelled) setRecyclePreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDestroy, catalogId, characterId, recycleCount, source]);

  // Whether this item actually has anything to recycle (a known recipe) -
  // false for e.g. a starter item authored with no craft-recipes.json
  // entry, which hides the recycle bar entirely (destroy below is still
  // always available either way).
  const canRecycle = !!recyclePreview && recyclePreview.materials.length > 0;

  // Plain zero-recovery destroy - unconditional, always available, same
  // behavior as before recycling existed. Targets the shared vault
  // (source:"vault") or this character's own backpack/body/itemBalances
  // (source:"character" - see destroy_character_item_instance/_balance).
  const destroySuffix = source === "vault" ? "destroy" : "destroy-from-character";
  const runDestroy = async () => {
    setDestroying(true);
    const amount = destroyAll ? owned : destroyQuantity;
    const result = isInstance
      ? await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/${destroySuffix}`)
      : await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/${destroySuffix}`, {
          amount,
        });
    if (!result.ok) {
      setDestroying(false);
      setDestroyError("Couldn't destroy that.");
      resetDestroyHold();
      return;
    }
    onPlayerDataUpdated?.(result.data);
    onClose();
  };

  // --- Recycle hold - a separate action from destroy above, only shown
  // when canRecycle: credits the previewed materials to the shared vault
  // instead of giving up the item for nothing. Own progress/state so
  // holding one control never interferes with the other. ---
  const [recycleHoldProgress, setRecycleHoldProgress] = useState(0);
  const [recyclingItem, setRecyclingItem] = useState(false);
  const [recycleActionError, setRecycleActionError] = useState<string | null>(null);
  const recycleRafRef = useRef<number | null>(null);

  const resetRecycleHold = () => {
    if (recycleRafRef.current !== null) cancelAnimationFrame(recycleRafRef.current);
    recycleRafRef.current = null;
    setRecycleHoldProgress(0);
  };
  useEffect(() => resetRecycleHold, []);

  const recycleSuffix = source === "vault" ? "recycle-from-vault" : "recycle";
  const runRecycle = async () => {
    setRecyclingItem(true);
    const amount = destroyAll ? owned : destroyQuantity;
    // A flat itemBalances row carries no location of its own the way an
    // instance does (recycle_item_instance reads it straight off the
    // instance) - this popup already knows which of the character's two
    // buckets it opened on (backpack or camp), so it has to say so
    // explicitly or the backend can't tell where to deduct from.
    const result = isInstance
      ? await postJson(`/api/auth/me/characters/${characterId}/items/${moveId}/${recycleSuffix}`)
      : await postJson(`/api/auth/me/characters/${characterId}/item-balances/${moveId}/${recycleSuffix}`, {
          amount,
          ...(source === "character" ? { location: location ?? "camp" } : {}),
        });
    if (!result.ok) {
      setRecyclingItem(false);
      setRecycleActionError("Couldn't recycle that.");
      resetRecycleHold();
      return;
    }
    onPlayerDataUpdated?.(result.data);
    onClose();
  };

  const recycleTick = (startedAt: number) => {
    const next = Math.min(1, (performance.now() - startedAt) / DESTROY_HOLD_MS);
    setRecycleHoldProgress(next);
    if (next >= 1) {
      runRecycle();
      return;
    }
    recycleRafRef.current = requestAnimationFrame(() => recycleTick(startedAt));
  };

  const startRecycleHold = () => {
    if (recyclingItem) return;
    setRecycleActionError(null);
    const startedAt = performance.now();
    recycleRafRef.current = requestAnimationFrame(() => recycleTick(startedAt));
  };
  const cancelRecycleHold = () => {
    if (recyclingItem) return;
    resetRecycleHold();
  };

  const destroyTick = (startedAt: number) => {
    const next = Math.min(1, (performance.now() - startedAt) / DESTROY_HOLD_MS);
    setDestroyProgress(next);
    if (next >= 1) {
      runDestroy();
      return;
    }
    destroyRafRef.current = requestAnimationFrame(() => destroyTick(startedAt));
  };

  const startDestroyHold = () => {
    if (destroying) return;
    setDestroyError(null);
    const startedAt = performance.now();
    destroyRafRef.current = requestAnimationFrame(() => destroyTick(startedAt));
  };
  const cancelDestroyHold = () => {
    if (destroying) return;
    resetDestroyHold();
  };

  // Closes on a click anywhere - including inside the card itself (the
  // image, name, description, meta row) - except on a button or a hold
  // target (recycleHoldBar / destroySection - each covers its whole label +
  // progress bar + icon area now, not just the icon), so those controls get
  // their own clicks instead of just dismissing the popup. While showDestroy
  // is open, clicking anywhere else in that view (the recycle breakdown
  // text, ...) doesn't close the popup outright - it returns to the item
  // info view instead (there's no dedicated back button anymore), since
  // the whole recycle/destroy card is still "inside" this same item.
  //
  // stopPropagation matters here specifically for a packed item's own
  // nested popup (PackedItemsRow, opened from inside a worn/camped
  // backpack's own popup) - with no portal, that nested popup's whole
  // overlay/card tree renders as a literal DOM descendant of the
  // backpack's own overlay. Without this, ANY click here - a plain
  // dismiss click, or a button click whose async move later calls this
  // same popup's own onClose - still bubbles up into the backpack
  // popup's own overlay onClick too, closing that one right along with
  // it (all the way back to the Body/Camp page) instead of leaving it
  // open underneath, which is what should happen either way.
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    if (showDestroy) {
      if (target.closest(`.${styles.recycleHoldBar}`) || target.closest(`.${styles.destroySection}`)) return;
      setShowDestroy(false);
      return;
    }
    onClose();
  };
  return (
    <div className={styles.itemPopupOverlay} onClick={handleClick}>
      <div className={`${styles.itemPopupCard} ${showDestroy ? styles.recycleDestroyCard : ""}`}>
        {!showDestroy && (
          <button
            type="button"
            className={styles.itemPopupSettingsButton}
            onClick={() => setShowDestroy(true)}
            aria-label="Recycle or destroy this item"
            title="Recycle or destroy this item"
          >
            ⚙
          </button>
        )}
        {showDestroy ? (
          <>
            {recyclePreviewLoading ? (
              <div className={styles.recycleSection}>
                <p className={styles.recycleResultText}>Checking recycle yield…</p>
              </div>
            ) : canRecycle ? (
              <>
                <div
                  className={`${styles.destroySection} ${styles.recycleHoldBar}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startRecycleHold();
                  }}
                  onPointerUp={cancelRecycleHold}
                  onPointerLeave={cancelRecycleHold}
                  onPointerCancel={cancelRecycleHold}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <p className={styles.recycleLabel}>Hold to RECYCLE</p>
                  <div className={styles.destroyProgressTrack}>
                    <div
                      className={styles.destroyProgressFill}
                      style={{
                        width: `${recycleHoldProgress * 100}%`,
                        backgroundColor: recycleFillColor(recycleHoldProgress),
                      }}
                    />
                  </div>
                  <span className={styles.destroyIcon}>♻️</span>
                </div>
                {/* Outside .destroySection on purpose - only the bar above
                    should start the hold/fill, not the breakdown text
                    below it. Still exempted from handleClick's close-on-
                    click below, same as .destroySection, so reading it
                    doesn't dismiss the popup either. */}
                <div className={styles.recycleMaterialsList}>
                  {recyclePreview!.materials.map((material) => (
                    <div key={material.rawFamilyId} className={styles.recycleMaterialRow}>
                      <p className={styles.recycleMaterialHeader}>
                        <span>{material.rawName}</span>
                        <span className={styles.recycleMaterialAmounts}>
                          {material.recoveredUnits}/{material.totalUnits}
                        </span>
                      </p>
                      <p className={styles.recycleFormulaLine}>
                        {material.yieldBreakdown.base} + {material.yieldBreakdown.skill} skill +{" "}
                        <span className={material.yieldBreakdown.tool === 0 ? styles.recycleFormulaZero : undefined}>
                          {material.yieldBreakdown.tool} tool
                        </span>{" "}
                        + {material.yieldBreakdown.charm} charm = {material.yieldBreakdown.total}%
                      </p>
                    </div>
                  ))}
                  <p className={styles.recycleFinalLine}>
                    Recovered:{" "}
                    {recyclePreview!.materials
                      .flatMap((material) => material.recovered)
                      .map((line) => `${line.qty}× ${line.name}`)
                      .join(", ") || "nothing"}
                  </p>
                </div>
              </>
            ) : (
              <div className={styles.recycleSection}>
                <p className={styles.recycleResultText}>Nothing to recover from this item.</p>
              </div>
            )}
            {recycleActionError && <p className={styles.destroyError}>{recycleActionError}</p>}
            {!isInstance && stackSize > 1 && (
              <div className={styles.itemPopupActions} role="radiogroup" aria-label="How many to destroy">
                {QUANTITY_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={!destroyAll && destroyQuantity === n}
                    className={[
                      styles.craftCountButton,
                      styles.itemPopupQuantityButton,
                      !destroyAll && destroyQuantity === n ? styles.craftCountButtonActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={destroying || n > owned}
                    onClick={() => {
                      setDestroyAll(false);
                      setDestroyQuantity(n);
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={destroyAll}
                  className={[
                    styles.craftCountButton,
                    styles.itemPopupQuantityButton,
                    destroyAll ? styles.craftCountButtonActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={destroying || owned <= 0}
                  onClick={() => setDestroyAll(true)}
                  title="Destroy all"
                  aria-label="Destroy all"
                >
                  <span className={styles.itemPopupInfinityGlyph}>∞</span>
                </button>
              </div>
            )}
            <div className={styles.recycleDestroyDivider} />
            <div
              className={styles.destroySection}
              role="button"
              tabIndex={0}
              title="Hold to destroy"
              aria-label="Hold to destroy"
              onPointerDown={(e) => {
                e.preventDefault();
                startDestroyHold();
              }}
              onPointerUp={cancelDestroyHold}
              onPointerLeave={cancelDestroyHold}
              onPointerCancel={cancelDestroyHold}
              onContextMenu={(e) => e.preventDefault()}
            >
              <p className={styles.destroyLabel}>Hold to DESTROY</p>
              <div className={styles.destroyProgressTrack}>
                <div
                  className={styles.destroyProgressFill}
                  style={{
                    width: `${destroyProgress * 100}%`,
                    backgroundColor: destroyFillColor(destroyProgress),
                  }}
                />
              </div>
              <span className={styles.destroyIcon}>🔥</span>
            </div>
            {destroyError && <p className={styles.destroyError}>{destroyError}</p>}
          </>
        ) : (
          <>
            {!!info?.tier && (
              <span className={`${styles.itemPopupTierBadge} ${itemGridTierBadgeClass(info.tier)}`}>
                {getTierIndicator(info.tier)}
              </span>
            )}
            {/* background-image div, not a real <img> - see ItemGrid's tile
                icon for why (mobile's native "save/share image" long-press
                menu targets the <img> tag itself). */}
            <div
              role="img"
              aria-label={name}
              className={styles.itemPopupImg}
              style={{ backgroundImage: `url(${info?.icon || FALLBACK_ITEM_ICON})` }}
            />
            <h3 className={styles.itemPopupName}>{displayName}</h3>
            {info?.familyId === "backpack" && packedItems && (
              <PackedItemsRow
                {...packedItems}
                hasBackpackEquipped={hasBackpackEquipped}
                hasSaddlepackEquipped={hasSaddlepackEquipped}
                inAdventure={inAdventure}
                characterId={characterId}
                onPlayerDataUpdated={onPlayerDataUpdated}
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
            <div className={styles.itemPopupMeta}>
              <span>Size: {info?.sizeClass ?? "tiny"}</span>
              <span>StackMax: {stackSize}</span>
              {isInstance && info?.qualityMax != null && (
                <span>Quality: {quality ?? 0}/{info.qualityMax}</span>
              )}
              {info?.familyId === "backpack" && backpackSlotsUsed != null && backpackCapacity != null && (
                <span>Filled: {backpackSlotsUsed}/{backpackCapacity}</span>
              )}
            </div>
            {movable && source === "vault" && (
              inAdventure ? (
                // The shared vault isn't reachable at all mid-adventure
                // (see equip_item_from_pool/check_out_item_instance/
                // check_out_item_balance) - no buttons, no hasBackpackEquipped/
                // hasSaddlepackEquipped checks, just the status itself.
                <p className={styles.itemPopupAwayNotice}>
                  {characterFirstName ? `${characterFirstName} in Storyline` : "In Storyline"}
                </p>
              ) : (
                stackSize > 1 ? (
                  // A stackable itemBalance row - one TransferButtons row,
                  // same one-click-moves-it, icon-moves-all behavior as the
                  // resource popups (see ResourcePopup). No preselected
                  // amount to confirm afterwards: every number/∞/backpack
                  // click fires straight away.
                  info?.backpackable && (
                    hasBackpackEquipped ? (
                      <TransferButtons
                        owned={owned}
                        pending={pending}
                        onPick={moveToBackpack}
                        destinationIcon={BACKPACK_ACTION_ICON}
                        destinationLabel="Backpack"
                        amounts={RESOURCE_POPUP_TRANSFER_AMOUNTS}
                      />
                    ) : (
                      <p className={styles.transferUnavailable}>No backpack equipped</p>
                    )
                  )
                ) : (
                  <div className={styles.itemPopupActions}>
                    {slotGroups.map((slots) => (
                      <button
                        key={slots.join("+")}
                        type="button"
                        className={styles.itemPopupActionButton}
                        disabled={pending}
                        onClick={() => equipFromPool(slots)}
                      >
                        {slots.map((slot, i) => (
                          <Fragment key={slot}>
                            {i > 0 && " + "}
                            {formatSlotLabel(slot)}
                          </Fragment>
                        ))}
                      </button>
                    ))}
                    {info?.backpackable && (
                      <button
                        type="button"
                        className={styles.itemPopupBackpackButton}
                        disabled={pending || !hasBackpackEquipped}
                        onClick={() => moveToBackpack(1)}
                        aria-label="Move to backpack"
                        title={hasBackpackEquipped ? "Move to backpack" : "No backpack equipped"}
                      >
                        <div
                          role="img"
                          aria-label="Backpack"
                          className={styles.itemPopupBackpackIcon}
                          style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }}
                        />
                      </button>
                    )}
                    {/* Hidden outright (not greyed) when no saddlepack is
                        equipped - unlike the backpack icon above, there's no
                        "you could wear one" affordance to point at, so a
                        disabled button here would just be dead weight.
                        Instance rows only - see moveToSaddlepack. */}
                    {info?.backpackable && isInstance && hasSaddlepackEquipped && (
                      <button
                        type="button"
                        className={styles.itemPopupBackpackButton}
                        disabled={pending}
                        onClick={moveToSaddlepack}
                        aria-label="Move to saddlepack"
                        title="Move to saddlepack"
                      >
                        <div
                          role="img"
                          aria-label="Saddlepack"
                          className={styles.itemPopupBackpackIcon}
                          style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }}
                        />
                      </button>
                    )}
                  </div>
                )
              )
            )}
            {movable && source === "character" && isInstance && (
              <div className={styles.itemPopupActions}>
                {location === "body" ? (
                  <>
                    <button
                      type="button"
                      className={styles.itemPopupBackpackButton}
                      disabled={pending}
                      onClick={unequip}
                      aria-label={inAdventure ? "Move to camp" : "Move to vault"}
                      title={inAdventure ? "Move to camp" : "Move to the shared vault"}
                    >
                      <div
                        role="img"
                        aria-label={inAdventure ? "Camp" : "Vault"}
                        className={styles.itemPopupBackpackIcon}
                        style={{ backgroundImage: `url(${inAdventure ? CAMP_ACTION_ICON : VAULT_ACTION_ICON})` }}
                      />
                    </button>
                    {info?.backpackable && (
                      <button
                        type="button"
                        className={styles.itemPopupBackpackButton}
                        disabled={pending || !hasBackpackEquipped}
                        onClick={unequipToBackpack}
                        aria-label="Move to backpack"
                        title={hasBackpackEquipped ? "Move to backpack" : "No backpack equipped"}
                      >
                        <div
                          role="img"
                          aria-label="Backpack"
                          className={styles.itemPopupBackpackIcon}
                          style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }}
                        />
                      </button>
                    )}
                    {info?.backpackable && hasSaddlepackEquipped && (
                      <button
                        type="button"
                        className={styles.itemPopupBackpackButton}
                        disabled={pending}
                        onClick={unequipToSaddlepack}
                        aria-label="Move to saddlepack"
                        title="Move to saddlepack"
                      >
                        <div
                          role="img"
                          aria-label="Saddlepack"
                          className={styles.itemPopupBackpackIcon}
                          style={{ backgroundImage: `url(${SADDLEPACK_ACTION_ICON})` }}
                        />
                      </button>
                    )}
                    {/* Reslot, still equipped - e.g. swap hands, or move a
                        dagger from a hand to its Girdle slot. Same button
                        style/handler as the backpack/camp -> body equip
                        buttons below, since it's the exact same endpoint. */}
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
                  </>
                ) : (
                  <>
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
                    {/* location:"camp" only - the other half of unequip's
                        automatic camp drop (see the "body" branch's
                        automatic icon above). Camp is this character's own
                        overflow, not the shared vault, so this works
                        mid-adventure unlike checkInToVault below - see
                        backend.players.move_camp_item_to_backpack. Hidden
                        outright (not greyed) with no backpack equipped -
                        camp items are only ever checked one at a time, so
                        a dead button here is just noise, not a nudge. */}
                    {location === "camp" && info?.backpackable && hasBackpackEquipped && (
                      <button
                        type="button"
                        className={styles.itemPopupBackpackButton}
                        disabled={pending}
                        onClick={stowToBackpack}
                        aria-label="Move to backpack"
                        title="Move to backpack"
                      >
                        <div
                          role="img"
                          aria-label="Backpack"
                          className={styles.itemPopupBackpackIcon}
                          style={{ backgroundImage: `url(${BACKPACK_ACTION_ICON})` }}
                        />
                      </button>
                    )}
                    {/* location:"backpack" only - same automatic camp/
                        vault switch as the body branch's own unequip icon
                        above: while inAdventure, there's no shared vault
                        to reach at all, so this offers the ACTUAL
                        reachable move (camp - see unstowToCamp) instead of
                        a permanently-greyed vault button that can never
                        be clicked mid-adventure. location:"camp" items
                        don't get this - they're already in camp, so the
                        alternative destination there is the backpack
                        (see the button above), not camp again. */}
                    {location === "backpack" ? (
                      <button
                        type="button"
                        className={styles.itemPopupBackpackButton}
                        disabled={pending}
                        onClick={inAdventure ? unstowToCamp : checkInToVault}
                        aria-label={inAdventure ? "Move to camp" : "Check in to vault"}
                        title={inAdventure ? "Move to camp" : "Check in to vault"}
                      >
                        <div
                          role="img"
                          aria-label={inAdventure ? "Camp" : "Vault"}
                          className={styles.itemPopupBackpackIcon}
                          style={{ backgroundImage: `url(${inAdventure ? CAMP_ACTION_ICON : VAULT_ACTION_ICON})` }}
                        />
                      </button>
                    ) : (
                      // location:"camp" - no path back to the shared vault
                      // while out on an adventure (same reasoning as
                      // above), and camp has no OTHER camp to switch to,
                      // so this is hidden outright rather than shown
                      // greyed - a camp item's popup with nothing else to
                      // offer (no equip slots) would otherwise show one
                      // permanently-dead button.
                      !inAdventure && (
                        <button
                          type="button"
                          className={styles.itemPopupBackpackButton}
                          disabled={pending}
                          onClick={checkInToVault}
                          aria-label="Check in to vault"
                          title="Check in to vault"
                        >
                          <div
                            role="img"
                            aria-label="Vault"
                            className={styles.itemPopupBackpackIcon}
                            style={{ backgroundImage: `url(${VAULT_ACTION_ICON})` }}
                          />
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            )}
            {/* The itemBalances counterpart of the isInstance block above -
                a flat gear.itemBalances.camp/backpack row (crafted goods
                this character owns - see CampView/BodyTab's packedItems)
                has no instanceId, so it fails isInstance and would
                otherwise get zero action buttons here even though the
                backend already has a full camp<->backpack/vault transfer
                path for it (load_item_balance_to_backpack/
                check_in_item_balance/unload_item_balance_from_backpack),
                same as an item instance does. */}
            {movable && source === "character" && !isInstance && (location === "camp" || location === "backpack") && (
              // One TransferButtons row per available move destination -
              // same pattern as ResourcePopup (a camp row can have BOTH
              // backpack and vault at once; a backpack row only ever has
              // camp) - each row's own number/∞/destination-icon click
              // fires that amount immediately, no separate "Move" step.
              <>
                {location === "camp" ? (
                  <>
                    {hasBackpackEquipped && (
                      <TransferButtons
                        owned={owned}
                        pending={pending}
                        onPick={stowBalanceToBackpack}
                        destinationIcon={BACKPACK_ACTION_ICON}
                        destinationLabel="Backpack"
                        amounts={RESOURCE_POPUP_TRANSFER_AMOUNTS}
                      />
                    )}
                    {!inAdventure && (
                      <TransferButtons
                        owned={owned}
                        pending={pending}
                        onPick={checkInBalanceToVault}
                        destinationIcon={VAULT_ACTION_ICON}
                        destinationLabel="Vault"
                        amounts={RESOURCE_POPUP_TRANSFER_AMOUNTS}
                      />
                    )}
                  </>
                ) : (
                  // "backpack" - straight to the shared vault while not in
                  // adventure (no reason to stage through camp first), or
                  // camp while in adventure (no reaching the shared vault
                  // mid-adventure) - one destination at a time, same
                  // inAdventure-gated single-button choice an equipped
                  // instance's own unequip icon already makes.
                  <TransferButtons
                    owned={owned}
                    pending={pending}
                    onPick={inAdventure ? unloadBalanceToCamp : checkInBalanceToVault}
                    destinationIcon={inAdventure ? CAMP_ACTION_ICON : VAULT_ACTION_ICON}
                    destinationLabel={inAdventure ? "Camp" : "Vault"}
                    amounts={RESOURCE_POPUP_TRANSFER_AMOUNTS}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
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

/** Exchange page: this character's own crafting stock next to the party's shared stock. */
export function InventoryTab({
  character,
  playerResourceBalances,
  playerTools,
  playerItemBalances,
  playerItems,
  onPlayerDataUpdated,
  openCraftingSectionByDefault = false,
  onSubTabChange,
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
  /** Called whenever the Crafting/Vault sub-tab changes - lets the parent
   * suspend the page's own vertical scroll while Vault is showing, since
   * that tab's Items grid is meant to be the only scrollable thing on
   * screen (horizontally), never the page itself. */
  onSubTabChange?: (tab: "crafting" | "vault") => void;
}) {
  // Moves `amount` of a resource/tool from this character's own (temporary,
  // crafting-session-only) vault back into the player's shared vault.
  // check-out (shared -> character) no longer exists for resources/tools -
  // a character's own vault is populated exclusively by start_craft now,
  // never by a direct player-initiated transfer.
  const transfer = async (
    kind: "resources" | "tools",
    id: string,
    amount: number
  ): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/auth/me/characters/${character.id}/${kind}/${id}/check-in`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        }
      );
      if (!res.ok) return false;
      const data: RawPlayerData = await res.json();
      onPlayerDataUpdated?.(data);
      return true;
    } catch {
      return false;
    }
  };

  // Party's Resources -> this character's own backpack, straight from the
  // shared crafting stock (see backend.players.check_out_resource_to_
  // backpack) - the resource equivalent of moveToBackpack's checkOut step,
  // just direct instead of two calls since there's no character-level
  // resources vault to land in along the way anymore.
  const transferToBackpack = async (resourceId: string, amount: number): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/auth/me/characters/${character.id}/resources/${resourceId}/check-out-backpack`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        }
      );
      if (!res.ok) return false;
      const data: RawPlayerData = await res.json();
      onPlayerDataUpdated?.(data);
      return true;
    } catch {
      return false;
    }
  };

  // Fetched once - maps every blueprint id to its own tier and family info, so
  // the Blueprints Known lists below can show tier information etc.
  const [blueprintTierInfo, setBlueprintTierInfo] = useState<BlueprintTierInfo>({});

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

  useEffect(() => {
    fetch("/api/auth/blueprint-categories")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BlueprintCategoryEntry[]) => {
        const info: BlueprintTierInfo = {};
        for (const entry of data) {
          for (const family of entry.families) {
            for (const item of family.items) {
              info[item.id] = {
                tier: item.tier,
                familyId: family.familyId,
                kind: family.kind,
                name: item.name,
              };
            }
          }
        }
        setBlueprintTierInfo(info);
      })
      .catch(() => setBlueprintTierInfo({}));

    // Fetch resource tier information from the backend
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
          const tierMap: ResourceTierInfo = {};
          for (const item of data) {
            tierMap[item.id] = {
              tier: item.tier,
              family: item.resourceFamily,
              category: item.category,
              name: item.name,
            };
          }
          setResourceTierInfo(tierMap);
        }
      )
      .catch(() => setResourceTierInfo({}));

    // Fetch tool tier information from the backend
    fetch("/api/auth/tool-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ id: string; familyId: string; tier: number }>) => {
        const tierMap: BlueprintTierInfo = {};
        for (const item of data) {
          tierMap[item.id] = { tier: item.tier, familyId: item.familyId, kind: "tool" };
        }
        setToolTierInfo(tierMap);
      })
      .catch(() => setToolTierInfo({}));

    // Fetch the item catalog (all 118 item-inventory-properties.json
    // families' concrete ids) from the backend
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
            icon: string;
            stackSize: number;
            description: string;
            sizeClass: string;
            equipSlots: string[][];
            backpackable: boolean;
            gatheringBonuses: string[];
          }>
        ) => {
        const tierMap: BlueprintTierInfo = {};
        for (const item of data) {
          tierMap[item.id] = {
            tier: item.tier,
            familyId: item.familyId,
            kind: item.kind[0] ?? "",
            name: item.name,
            qualityMax: item.qualityMax,
            icon: item.icon,
            stackSize: item.stackSize,
            description: item.description,
            sizeClass: item.sizeClass,
            equipSlots: item.equipSlots,
            backpackable: item.backpackable,
            gatheringBonuses: item.gatheringBonuses,
          };
        }
        setItemCatalogTierInfo(tierMap);
      })
      .catch(() => {
        setItemCatalogTierInfo({});
      });
  }, []);

  // The Inventory page's own Crafting/Party's Vault split - a website-style
  // header tab strip directly under the character name (see .invSubTabRow),
  // replacing what used to be a third "Party's Vault" accordion section
  // alongside Blueprints Known/character Crafting. Vault content (Tools/
  // Resources/Items) now only renders while this tab is selected, instead
  // of always being present-but-collapsed in the accordion.
  const [activeSubTab, setActiveSubTab] = useState<"crafting" | "vault">(
    openCraftingSectionByDefault ? "crafting" : "vault",
  );
  useEffect(() => {
    onSubTabChange?.(activeSubTab);
  }, [activeSubTab, onSubTabChange]);

  // Top-level accordion within the Crafting tab (Blueprints Known/this
  // character's own Crafting stock/the party's shared Tools/the party's
  // shared Resources) - any number can be open at once, toggled
  // independently. The recipe viewer below is always visible, not part of
  // this fold. Only the party's crafted Items live under the separate
  // Vault tab (see activeSubTab) - Tools/Resources stay here since they're
  // what a craft actually draws on.
  const [openSections, setOpenSections] = useState<
    Set<"blueprints" | "character" | "partyTools" | "partyResources">
  >(() => (openCraftingSectionByDefault ? new Set(["character"]) : new Set()));
  const toggleSection = (id: "blueprints" | "character" | "partyTools" | "partyResources") =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Independent of the Crafting accordion above - folding the recipe viewer
  // has nothing to do with toggling between the character's and party's stock.
  const [recipeViewerOpen, setRecipeViewerOpen] = useState(false);

  // Blueprints are soulbound to the character (never move to the player's
  // shared pool), so this counts as "known" for the recipe viewer's
  // missing-blueprint check.
  const knownBlueprints = character.blueprints;
  // Flat-balance tools (anvil, furnace, ...) only ever come from the
  // player's shared vault now - the character vault is a temporary staging
  // area for an active craft (populated/drained by start/finish_craft), not
  // somewhere a player parks a tool ahead of time - so those are checked
  // against playerTools only, matching backend.players.start_craft's
  // check_character_flat_balance=False. Instance-tracked tool-weapons
  // (axe_stone, axe, dagger - needsItemDefinition:true families that double
  // as a recipe's tool) work the opposite way: backend._resolve_tool_for_craft
  // never transfers those, it only ever checks whether the character is
  // already physically holding one (backpack or equipped) - so those must
  // come from this character's own items, never the shared pool, or an
  // axe_stone sitting unassigned in the party's vault would incorrectly
  // read as "owned" here. This set also backs ingredient-level "final"/
  // unconsumed alternatives (e.g. carcass's bone_blade-or-dagger choice) -
  // that path was never extended to draw from the vault, only a recipe's
  // own "tool" field was (see vaultToolInstanceIds below), so keeping this
  // one character-only keeps those checks matching what start_craft
  // actually accepts.
  const ownedTools = ownedIds(playerTools);
  for (const instance of character.gear.items) {
    if (instance.location === "backpack" || instance.location === "body") {
      ownedTools.push(instance.itemId);
    }
  }

  // Instance-tracked tools sitting in the shared vault - usable for a
  // recipe's own "tool" field right where they sit: start_craft moves the
  // specific instance onto this character (location:"crafting") for the
  // duration, so anything currently borrowed by an OTHER character is
  // already gone from playerItems entirely (not just marked - moved),
  // leaving only what's genuinely still free here. Passed to the recipe
  // viewer as a second, separate ownership list (see
  // recipe-viewer.template.html's ownedToolsWithVault) rather than merged
  // into ownedTools above.
  const vaultToolInstanceIds = playerItems
    .filter((instance) => instance.location === "pool")
    .map((instance) => instance.itemId);

  // Instance-tracked tools currently borrowed for this character's active
  // craft (location:"crafting" - see start_craft/finish_craft's
  // borrowedInstances) - shown right alongside the flat character.crafting.tools
  // list above so a borrowed axe_stone is visibly "in the crafting
  // section," not just gone from wherever it used to be.
  const borrowedToolIds: string[] = [];
  const borrowedToolCounts: Record<string, number> = {};
  for (const instance of character.gear.items) {
    if (instance.location === "crafting") {
      if (!(instance.itemId in borrowedToolCounts)) borrowedToolIds.push(instance.itemId);
      borrowedToolCounts[instance.itemId] = (borrowedToolCounts[instance.itemId] ?? 0) + 1;
    }
  }

  // Crafted-item instances in the player's shared vault - one row PER
  // PHYSICAL INSTANCE, not aggregated by concrete id: each one has its own
  // quality and its own instanceId, so two Iron Battle Axes at different
  // wear levels are two separate rows, not one row with a count of 2.
  // instanceId is the row's own id (unique); lookupIds maps it back to the
  // concrete itemId for name/tier/kind lookups in tierInfo, which is keyed
  // by itemId, not instanceId.
  const playerItemLookupIds: Record<string, string> = {};
  const playerItemRowBalances: Record<string, number> = {};
  // Current quality per pool instance (its family's own qualityMax comes
  // from itemCatalogTierInfo instead - the item detail popup pairs the two
  // for its own "Quality: current/max" line).
  const playerItemRowQuality: Record<string, number | null> = {};
  for (const instance of playerItems) {
    playerItemLookupIds[instance.instanceId] = instance.itemId;
    playerItemRowBalances[instance.instanceId] = 1; // one row = one physical unit
    playerItemRowQuality[instance.instanceId] = instance.quality;
  }

  const playerItemsCombined: Record<string, number> = {
    ...playerItemBalances,
    ...playerItemRowBalances,
  };

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
  // Coarse "is there room for ANYTHING at all right now" check for the
  // Party's Resources check-out-to-backpack row below - backpackSlotsUsed/
  // backpackCapacity are both already computed server-side off the
  // character's current gear (items + resources + itemBalances, see
  // backend.items_catalog.backpack_slots_used/backpack_capacity), so this
  // doesn't need its own duplicated slot-cost math. Not amount-precise
  // (a specific click can still fail server-side with "Backpack is full"
  // if it doesn't quite fit) - just enough to swap the whole button row
  // for a plain message when there's plainly no room left at all.
  const backpackFull =
    hasBackpackEquipped && character.gear.backpackSlotsUsed >= character.gear.backpackCapacity;
  // Mirrors backend.items_catalog.has_saddlepack_equipped - hides (rather
  // than greys) the vault popup's "Move to saddlepack" button when false.
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && instance.familyId === "saddlepack"
  );

  // The embedded recipe viewer's own content height, in px - same-origin, so
  // its body height can be read directly and mirrored onto the iframe
  // element (see SoulCreation.tsx's identical pattern). The height-sync
  // above is normally exact, but a brief mismatch (e.g. content reflowing
  // taller after a narrow-screen media query settles, a tick after the
  // initial measurement) used to show the iframe's own native scrollbar for
  // that gap - a second scrollbar alongside the page's own. scrolling="no"
  // below guarantees the iframe itself never scrolls, regardless of any
  // such transient mismatch.
  const [recipeViewerHeight, setRecipeViewerHeight] = useState(600);
  const recipeViewerRef = useRef<HTMLIFrameElement>(null);

  // The viewer tracks its own selection (and, now, its own craftability
  // check) internally - since the iframe is same-origin, these globals are
  // read directly rather than this component duplicating that state via
  // postMessage. Not part of Window's real type, hence the cast -
  // recipe-viewer.template.html is the one place they actually get defined.
  type RecipeViewerWindow = Window & {
    getCurrentSelection?: () => { familyId: string; tier: number } | null;
    isCurrentSelectionCraftable?: (count?: number) => boolean;
    getCurrentSelectionXp?: (count?: number) => { rawXp: Record<string, number>; finalXp: number } | null;
    getCurrentSelectionDuration?: (count?: number) => number | null;
  };
  const getRecipeViewerWindow = () =>
    recipeViewerRef.current?.contentWindow as RecipeViewerWindow | null | undefined;

  // How many units to craft in one batch - the row of quick-count buttons
  // next to Craft. Ingredients scale with this; the server-side timer
  // doesn't (see start_craft's own count parameter).
  const CRAFT_COUNTS = [1, 2, 3, 4, 5, 10, 20, 25, 50] as const;
  const [craftCount, setCraftCount] = useState<number>(1);

  // Re-checked on an interval while the viewer is open, since there's no
  // "selection changed" event fired out of it - a player can browse
  // recipes/tiers freely and the button(s) should track whatever's on
  // screen right now, not just what it was when last polled. Checked once
  // per available count (1/2/5/10) so each quick-count button can be
  // disabled independently once affording it runs out.
  const [craftableCounts, setCraftableCounts] = useState<Record<number, boolean>>({});

  // The Craft button's own label - what a single start_craft/finish_craft
  // pair would actually pay out for whatever's selected in the viewer right
  // now, at the current craftCount (see recipe-viewer.template.html's
  // getCurrentSelectionXp, which mirrors backend.players' XP mechanics).
  // Re-polled alongside craftableCounts below since both depend on the same
  // "whatever's currently selected in the iframe" state with no change
  // event of its own.
  const [craftXpPreview, setCraftXpPreview] = useState<{ rawXp: Record<string, number>; finalXp: number } | null>(
    null
  );
  // The crafting timer length for whatever's selected right now, at the
  // current craftCount (see recipe-viewer.template.html's
  // getCurrentSelectionDuration, which mirrors backend.players.
  // _craft_duration_seconds - scaled by the recipe's own full raw-
  // material chain AND craftCount, not a flat number) - polled alongside
  // the XP preview above for the same reason.
  const [craftDurationPreview, setCraftDurationPreview] = useState<number | null>(null);
  useEffect(() => {
    if (!recipeViewerOpen) {
      setCraftableCounts({});
      setCraftXpPreview(null);
      setCraftDurationPreview(null);
      return;
    }
    const check = () => {
      const win = getRecipeViewerWindow();
      const next: Record<number, boolean> = {};
      for (const count of CRAFT_COUNTS) {
        next[count] = win?.isCurrentSelectionCraftable?.(count) ?? false;
      }
      setCraftableCounts(next);
      setCraftXpPreview(win?.getCurrentSelectionXp?.(craftCount) ?? null);
      setCraftDurationPreview(win?.getCurrentSelectionDuration?.(craftCount) ?? null);
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeViewerOpen, playerResourceBalances, playerItemBalances, playerTools, knownBlueprints, craftCount]);
  const canCraft = craftableCounts[craftCount] ?? false;

  const [crafting, setCrafting] = useState(false);
  const [craftError, setCraftError] = useState<string | null>(null);

  // Begins crafting `craftCount` units of whatever's currently selected in
  // the viewer, in one batch - checks ingredients (scaled by craftCount)/
  // tool/blueprint against the player's shared vault, transfers what's
  // needed onto the character, and starts the CRAFT_DURATION_SECONDS timer
  // server-side (character.crafting.activeCraft) - one timer regardless of count.
  // See the countdown effect below for what happens once that timer elapses.
  const startCraft = async () => {
    const win = getRecipeViewerWindow();
    const selection = win?.getCurrentSelection?.();
    if (!selection) {
      setCraftError("Pick a recipe in the viewer first.");
      return;
    }
    // The Craft button's enabled look is driven by craftableCounts, a
    // poll that only re-checks every 500ms - if the tier/recipe selection
    // changes and this fires before the next poll catches up, the button
    // can still look clickable for a moment based on the PREVIOUS
    // selection's craftability. Re-verify synchronously, against whatever
    // is selected right now, before ever hitting the network - this is
    // what actually decides whether to submit, not the polled state.
    if (!(win?.isCurrentSelectionCraftable?.(craftCount) ?? false)) {
      setCraftError("Couldn't craft that - check ingredients, tool, and blueprint.");
      return;
    }
    setCrafting(true);
    setCraftError(null);
    try {
      const res = await fetch(
        `/api/auth/me/characters/${character.id}/craft/${selection.familyId}/start`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: selection.tier, count: craftCount }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCraftError(body?.detail ?? "Couldn't craft that - check ingredients, tool, and blueprint.");
        return;
      }
      const data: RawPlayerData = await res.json();
      // A fresh craft starting means the last one's "Finished: ..." line
      // (still fading, if the player was quick) is stale news now - clear
      // it rather than let it linger alongside the new one starting up.
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      setLastCraftResult(null);
      onPlayerDataUpdated?.(data);
    } catch {
      setCraftError("Couldn't reach the server.");
    } finally {
      setCrafting(false);
    }
  };

  // Collects the output of an already-finished craft (server re-checks
  // activeCraft.readyAt itself - this is only ever called once the local
  // countdown below has already reached zero, or immediately on mount if
  // it turns out to already be in the past, e.g. the player closed the tab
  // mid-craft and came back later).
  const [finishing, setFinishing] = useState(false);
  // Keeps the "what just got made" line on screen a while after the
  // ingredients/tools it's summing up have already been cleared out from
  // under it - finish_craft's response has already dropped activeCraft by
  // the time it comes back, so this is captured from the CraftItemRequest
  // still in scope right before that call, not read back from the result.
  const [lastCraftResult, setLastCraftResult] = useState<{ name: string; count: number } | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
  }, []);
  const finishCraft = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/craft/finish`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        if (character.crafting.activeCraft) {
          setLastCraftResult({
            name: resolveOutputName(
              character.crafting.activeCraft.familyId,
              character.crafting.activeCraft.tier,
              resourceTierInfo,
              itemCatalogTierInfo
            ),
            count: character.crafting.activeCraft.count,
          });
          if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
          fadeTimeoutRef.current = setTimeout(() => setLastCraftResult(null), CRAFT_RESULT_FADE_MS);
        }
        onPlayerDataUpdated?.(data);
      }
    } catch {
      // Next tick's countdown effect will retry - no need to surface this.
    } finally {
      setFinishing(false);
    }
  };

  // Countdown against character.crafting.activeCraft.readyAt - resolved lazily
  // (matching backend.players' own "no background job" design), shared
  // with the soul-slot grid's own compact badge. Unlike that display-only
  // use, this tab is also responsible for actually collecting the craft:
  // fires finishCraft the moment the countdown reaches zero, including
  // immediately on mount if readyAt is already in the past.
  const remainingSeconds = useCraftCountdown(character.crafting.activeCraft?.readyAt);
  useEffect(() => {
    if (remainingSeconds === 0) finishCraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds === 0]);

  return (
    <div className={styles.panel}>
      <InAdventureToggle character={character} onPlayerDataUpdated={onPlayerDataUpdated} />
      <div className={styles.invSubTabRow}>
        <button
          type="button"
          className={`${styles.invSubTabButton} ${
            activeSubTab === "vault" ? styles.invSubTabButtonActive : ""
          }`}
          onClick={() => setActiveSubTab("vault")}
          aria-pressed={activeSubTab === "vault"}
        >
          Vault
        </button>
        <button
          type="button"
          className={`${styles.invSubTabButton} ${
            activeSubTab === "crafting" ? styles.invSubTabButtonActive : ""
          }`}
          onClick={() => setActiveSubTab("crafting")}
          aria-pressed={activeSubTab === "crafting"}
        >
          Crafting
        </button>
      </div>

      {activeSubTab === "crafting" && (
        <>
          {/* Hidden entirely when nothing's cooking - only appears once a
              craft is actively running (remainingSeconds !== null) and
              stays up through the "Finished: ..." line's own fade-out
              (lastCraftResult, cleared by the CRAFT_RESULT_FADE_MS timeout
              above), rather than sitting empty/idle between crafts. First
              in the list, ahead of Blueprints Known, when it's showing at
              all - an in-progress craft is the most relevant thing here. */}
          {(remainingSeconds !== null || lastCraftResult !== null) && (
          <div className={styles.accordionItem}>
            <button className={styles.accordionHeader} onClick={() => toggleSection("character")}>
              <span>
                {character.firstName}&apos;s Crafting
                {remainingSeconds !== null && (
                  <span className={styles.craftTimer}> {formatRemainingCompactLong(remainingSeconds)}</span>
                )}
              </span>
              <span className={styles.accordionChevron}>{openSections.has("character") ? "▴" : "▾"}</span>
            </button>
            {openSections.has("character") && (
              <div className={styles.accordionBody}>
                {/* A borrowed instance tool (axe_stone, ...) is a tool in use
                    too - just rendered in the separate list right below, since
                    it's not a flat balance. Skip this list entirely (rather
                    than showing its own empty-state message with padding)
                    when it has nothing but a borrowed tool already covers the
                    "using a tool" story - only claim "no tools" when BOTH
                    lists are actually empty. */}
                {(ownedIds(character.crafting.tools).length > 0 || borrowedToolIds.length === 0) && (
                  <IdList
                    ids={ownedIds(character.crafting.tools)}
                    emptyLabel="Not currently using any tools."
                    tierInfo={toolTierInfo}
                    sortByTier
                    fixedIcon="🔧"
                    balances={character.crafting.tools}
                    // Locked for the crafting duration - whatever start_craft
                    // staged here isn't the player's to move back out until
                    // the craft finishes (or the timer runs out and
                    // finish_craft drains it), same "no check-out either"
                    // rule these are already subject to.
                    onTransfer={remainingSeconds === null ? (id, amount) => transfer("tools", id, amount) : undefined}
                    textColor="#7eb8ff"
                  />
                )}
                {borrowedToolIds.length > 0 && (
                  <IdList
                    ids={borrowedToolIds}
                    emptyLabel=""
                    tierInfo={itemCatalogTierInfo}
                    sortByTier
                    fixedIcon="🔧"
                    balances={borrowedToolCounts}
                    quantityHiddenIds={new Set(borrowedToolIds)}
                    textColor="#7eb8ff"
                  />
                )}
                {(ownedIds(character.crafting.tools).length > 0 || borrowedToolIds.length > 0) && (
                  <div className={styles.toolsResourceDivider} />
                )}
                <ResourceList
                  balances={character.crafting.resources}
                  emptyLabel="No materials used."
                  tierInfo={resourceTierInfo}
                  onTransfer={remainingSeconds === null ? (id, amount) => transfer("resources", id, amount) : undefined}
                />
                {remainingSeconds !== null && character.crafting.activeCraft && (
                  <>
                    <div className={styles.craftOutputDivider} />
                    <p className={styles.craftOutputLine}>
                      Crafting {character.crafting.activeCraft.count}x{" "}
                      {resolveOutputName(
                        character.crafting.activeCraft.familyId,
                        character.crafting.activeCraft.tier,
                        resourceTierInfo,
                        itemCatalogTierInfo
                      )}
                    </p>
                  </>
                )}
                {!character.crafting.activeCraft && lastCraftResult && (
                  <>
                    <div className={styles.craftOutputDivider} />
                    <p className={`${styles.craftOutputLine} ${styles.craftResultFading}`}>
                      Finished: {lastCraftResult.count}x {lastCraftResult.name}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          )}

          {knownBlueprints.length > 0 && (
            <div className={styles.accordionItem}>
              <button className={styles.accordionHeader} onClick={() => toggleSection("blueprints")}>
                <span>{`Blueprints Known (${knownBlueprints.length})`}</span>
                <span className={styles.accordionChevron}>{openSections.has("blueprints") ? "▴" : "▾"}</span>
              </button>
              {openSections.has("blueprints") && (
                <div className={styles.accordionBody}>
                  <IdList
                    ids={knownBlueprints}
                    emptyLabel=""
                    tierInfo={blueprintTierInfo}
                    sortByTier
                    textColor="#7eb8ff"
                    dividerClassName={styles.toolsResourceDivider}
                  />
                </div>
              )}
            </div>
          )}

          <div className={styles.accordionItem}>
            <button className={styles.accordionHeader} onClick={() => toggleSection("partyTools")}>
              <span>Party&apos;s Tools</span>
              <span className={styles.accordionChevron}>{openSections.has("partyTools") ? "▴" : "▾"}</span>
            </button>
            {openSections.has("partyTools") && (
              <div className={styles.accordionBody}>
                <IdList
                  ids={ownedIds(playerTools)}
                  emptyLabel="Nothing in the shared tool pool."
                  tierInfo={toolTierInfo}
                  sortByTier
                  fixedIcon="🔧"
                  balances={playerTools}
                  textColor="#7eb8ff"
                />
              </div>
            )}
          </div>

          <div className={styles.accordionItem}>
            <button className={styles.accordionHeader} onClick={() => toggleSection("partyResources")}>
              <span>Party&apos;s Resources</span>
              <span className={styles.accordionChevron}>{openSections.has("partyResources") ? "▴" : "▾"}</span>
            </button>
            {openSections.has("partyResources") && (
              <div className={styles.accordionBody}>
                <ResourceList
                  balances={playerResourceBalances}
                  emptyLabel="Nothing in the shared crafting stock."
                  tierInfo={resourceTierInfo}
                  onTransfer={transferToBackpack}
                  amounts={RAW_RESOURCE_AMOUNTS}
                  showInfinity={false}
                  destinationIcon={BACKPACK_ACTION_ICON}
                  destinationUnavailableLabel={
                    !hasBackpackEquipped ? "No backpack equipped" : backpackFull ? "Backpack full" : undefined
                  }
                />
              </div>
            )}
          </div>

          <div className={styles.craftRow}>
            <div className={styles.craftControlsRow}>
              <div className={styles.craftButtonColumn}>
                <button
                  className={
                    !character.availability.inAdventure && canCraft && remainingSeconds === null
                      ? `${styles.craftButton} ${styles.craftButtonReady}`
                      : styles.craftButton
                  }
                  onClick={startCraft}
                  disabled={crafting || !canCraft || remainingSeconds !== null || character.availability.inAdventure}
                  title={
                    character.availability.inAdventure
                      ? `${character.firstName}  and more text incoming here.`
                      : canCraft && remainingSeconds === null
                      ? "Selected recipe can be crafted right now"
                      : undefined
                  }
                >
                  {remainingSeconds !== null ? (
                    <span className={styles.craftTimer}>Crafting… {formatRemainingCompactLong(remainingSeconds)}</span>
                  ) : crafting ? (
                    "Crafting…"
                  ) : canCraft ? (
                    <>
                      Craft
                      <span className={styles.craftButtonDetail}>
                        {craftDurationPreview !== null && formatRemainingCompactLong(craftDurationPreview)}
                        {craftXpPreview && formatXpPreview(craftXpPreview) && `, ${formatXpPreview(craftXpPreview)}`}
                      </span>
                    </>
                  ) : (
                    "Craft"
                  )}
                </button>
                {character.availability.inAdventure ? (
                  <span className={styles.craftUnavailable}>{character.firstName} is on the road.</span>
                ) : (
                  craftError && <span className={styles.craftError}>{craftError}</span>
                )}
              </div>
              <div className={styles.craftCountRow} role="radiogroup" aria-label="How many to craft">
                {CRAFT_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={craftCount === count}
                    className={[
                      styles.craftCountButton,
                      craftCount === count ? styles.craftCountButtonActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={crafting || remainingSeconds !== null || !(craftableCounts[count] ?? false)}
                    onClick={() => setCraftCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className={styles.recipeViewerHeading}
            onClick={() => setRecipeViewerOpen((prev) => !prev)}
          >
            <span className={styles.accordionChevron}>{recipeViewerOpen ? "▴" : "▾"}</span>
            Crafting Recipe Viewer
          </button>
          {recipeViewerOpen && (
            <iframe
              ref={recipeViewerRef}
              src={`/craft/recipe-viewer.html?embedded=1&inv=${encodeURIComponent(
                JSON.stringify(playerResourceBalances)
              )}&itemBalances=${encodeURIComponent(
                JSON.stringify(playerItemBalances)
              )}&tools=${encodeURIComponent(JSON.stringify(ownedTools))}&vaultTools=${encodeURIComponent(
                JSON.stringify(vaultToolInstanceIds)
              )}&blueprints=${encodeURIComponent(JSON.stringify(knownBlueprints))}`}
              title="Crafting Recipe Viewer"
              className={styles.recipeViewerFrame}
              style={{ height: recipeViewerHeight, overflow: "hidden" }}
              scrolling="no"
              onLoad={() => {
                const doc = recipeViewerRef.current?.contentWindow?.document;
                if (!doc?.body) return;
                setRecipeViewerHeight(doc.body.scrollHeight);
                const observer = new ResizeObserver(() => {
                  setRecipeViewerHeight(doc.body.scrollHeight);
                });
                observer.observe(doc.body);
              }}
            />
          )}
        </>
      )}

      {activeSubTab === "vault" && (
        <ItemGrid
          ids={Object.keys(playerItemsCombined).filter((id) => playerItemsCombined[id] > 0)}
          emptyLabel="Nothing crafted yet."
          tierInfo={itemCatalogTierInfo}
          balances={playerItemsCombined}
          lookupIds={playerItemLookupIds}
          instanceQuality={playerItemRowQuality}
          source="vault"
          hasBackpackEquipped={hasBackpackEquipped}
          hasSaddlepackEquipped={hasSaddlepackEquipped}
          inAdventure={character.availability.inAdventure}
          characterId={character.id}
          characterFirstName={character.firstName}
          onPlayerDataUpdated={onPlayerDataUpdated}
        />
      )}
    </div>
  );
}
