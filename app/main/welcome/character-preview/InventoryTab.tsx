import { useEffect, useRef, useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// GET /api/auth/blueprint-categories - lore/reference data (not
// player-specific), reused here purely to look up each known blueprint's own
// tier by id, since Character.blueprints is just a flat id list with no tier attached.
type BlueprintCategoryItem = { id: string; name: string; tier: number };
type BlueprintCategoryFamily = { familyId: string; kind: string; items: BlueprintCategoryItem[] };
type BlueprintCategoryEntry = { families: BlueprintCategoryFamily[] };
type BlueprintTierInfo = Record<
  string,
  { tier: number; familyId: string; kind: string; name?: string }
>;
type ResourceTierInfo = Record<string, { tier: number; family: string }>;

// One individually-tracked crafted item (a needsItemDefinition:true
// family - weapons, armor, shields, and the rest) - unlike a flat balance,
// each physical one a player/character owns is its own instance with its
// own quality.
export type ItemInstance = {
  instanceId: string;
  itemId: string;
  familyId: string;
  quality: number | null;
  location: string;
  slotRef: string[];
  createdAt: string;
};

// The raw shape returned by /me/characters and every check-in/check-out
// transfer endpoint (backend.players.Player.to_dict()) - enough to refresh
// the whole roster plus the shared vault/tool pool after a transfer.
export type RawPlayerData = {
  characters: SlotCharacterSummary[];
  inventory: {
    tools: Record<string, number>;
    resources: Record<string, number>;
    itemBalances: Record<string, number>;
    items: ItemInstance[];
  };
};

const TRANSFER_AMOUNTS = [1, 2, 5, 10, 20, 50] as const;

/** The row of quick-transfer quantity buttons revealed under a clicked resource/tool row. */
function TransferButtons({
  owned,
  pending,
  onPick,
}: {
  owned: number;
  pending: boolean;
  onPick: (amount: number) => void;
}) {
  return (
    <div className={styles.transferButtons}>
      {TRANSFER_AMOUNTS.map((amount) => (
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
      <button
        type="button"
        className={styles.transferButton}
        disabled={pending || owned <= 0}
        onClick={(e) => {
          e.stopPropagation();
          onPick(owned);
        }}
      >
        ∞
      </button>
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
    case "misc":
    case "equipment":
      return "📦";
    default:
      return "";
  }
}

function getTierIndicator(tier: number): string {
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

function isProcessedResource(id: string): boolean {
  const processedPatterns = [
    "metal_bar", "metal_ingot", "plank", "leather", "woven_cloth", "refined_ore",
    "alloy_dust", "coal", "cut_crystal", "hardened_stick", "reinforced_frame",
    "ground_spice", "dressed_meat", "herbal_extract", "distilled_essence",
    "refined_clay", "ground_pigment", "lacquer", "quilted_thread", "trimmed_pelt",
    "venomous_extract", "parchment", "pigment", "arcane_dust", "clockwork_mechanism",
    "medicinal_paste", "cured_chitin"
  ];
  return processedPatterns.some(pattern => id.includes(pattern));
}

function getResourceIcon(id: string): string {
  return isProcessedResource(id) ? "⚒️" : "🪨";
}

function ResourceList({
  balances,
  emptyLabel,
  tierInfo,
  onTransfer,
}: {
  balances: Record<string, number>;
  emptyLabel: string;
  tierInfo?: ResourceTierInfo;
  /** When given, clicking a row reveals quick-transfer quantity buttons that call this with (id, amount). */
  onTransfer?: (id: string, amount: number) => Promise<boolean>;
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
  const processedItems = entries.filter(([id]) => isProcessedResource(id));
  const rawItems = entries.filter(([id]) => !isProcessedResource(id));

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
              const icon = getResourceIcon(id);
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
                  <td style={isGreyed ? { color: "#665b42" } : undefined}>{formatResourceLabel(id)}</td>
                  <td>{qty}</td>
                </tr>,
              ];
              if (isExpanded && onTransfer) {
                rows.push(
                  <tr key={`${id}-transfer`}>
                    <td colSpan={4}>
                      <TransferButtons
                        owned={qty}
                        pending={pendingId === id}
                        onPick={(amount) => handlePick(id, amount)}
                      />
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
      const info = tierInfo[id];
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
        const infoA = tierInfo[a];
        const infoB = tierInfo[b];
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

  const canTransfer = Boolean(onTransfer && balances);
  const columnCount = balances ? 4 : 3;

  const renderRow = (id: string) => {
    const info = tierInfo?.[id];
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
          {info?.name ? stripBlueprintPrefix(info.name) : formatResourceLabel(id)}
        </td>
        {balances && <td>{owned}</td>}
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
    const nonToolIds = sortedIds.filter((id) => tierInfo[id]?.kind !== "tool");
    const toolIds = sortedIds.filter((id) => tierInfo[id]?.kind === "tool");
    return (
      <>
        {nonToolIds.length > 0 && (
          <table className={styles.inventoryTable}><tbody>{nonToolIds.flatMap(renderRow)}</tbody></table>
        )}
        {nonToolIds.length > 0 && toolIds.length > 0 && <div className={styles.resourceDivider} />}
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

// A single sub-accordion item (Resources/Tools/Blueprints Known/...) within
// one of the two top-level sections - `openIds`/`onToggle` let any number of
// siblings be open at once (each toggles independently, unlike the
// mutually-exclusive top-level accordion in app/characters/page.tsx).
function SubAccordionItem({
  id,
  label,
  openIds,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  openIds: Set<string>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = openIds.has(id);
  return (
    <div className={styles.subAccordionItem}>
      <button className={styles.subAccordionHeader} onClick={() => onToggle(id)}>
        <span>{label}</span>
        <span className={styles.accordionChevron}>{isOpen ? "▴" : "▾"}</span>
      </button>
      {isOpen && <div className={styles.subAccordionBody}>{children}</div>}
    </div>
  );
}

/** Exchange page: this character's own crafting stock next to the party's shared stock. */
export function InventoryTab({
  character,
  playerResourceBalances,
  playerTools,
  playerItemBalances,
  playerItems,
  onPlayerDataUpdated,
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

  // Fetched once - maps every blueprint id to its own tier and family info, so
  // the Blueprints Known lists below can show tier information etc.
  const [blueprintTierInfo, setBlueprintTierInfo] = useState<BlueprintTierInfo>({});

  // Resource tier info: id -> tier (for displaying tier indicators on resources)
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});

  // Tool tier info: id -> tier/family (for displaying tier indicators on tools)
  const [toolTierInfo, setToolTierInfo] = useState<BlueprintTierInfo>({});

  // Every concrete id belonging to an item-inventory-properties.json family
  // (all 118, regardless of storage bucket) - itemCatalogIds reclassifies a
  // matching resources-balance entry (arrow/bolt/oil) as an item for
  // display, itemCatalogTierInfo gives the combined Items list real
  // tier/family sorting the same way blueprints/resources/tools already get.
  const [itemCatalogIds, setItemCatalogIds] = useState<Set<string>>(new Set());
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
      .then((data: Array<{ id: string; familyId: string; tier: number; resourceFamily: string }>) => {
        const tierMap: ResourceTierInfo = {};
        for (const item of data) {
          tierMap[item.id] = { tier: item.tier, family: item.resourceFamily };
        }
        setResourceTierInfo(tierMap);
      })
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
      .then((data: Array<{ id: string; name: string; familyId: string; tier: number; kind: string[] }>) => {
        const ids = new Set<string>();
        const tierMap: BlueprintTierInfo = {};
        for (const item of data) {
          ids.add(item.id);
          tierMap[item.id] = { tier: item.tier, familyId: item.familyId, kind: item.kind[0] ?? "", name: item.name };
        }
        setItemCatalogIds(ids);
        setItemCatalogTierInfo(tierMap);
      })
      .catch(() => {
        setItemCatalogIds(new Set());
        setItemCatalogTierInfo({});
      });
  }, []);

  // Top-level accordion (this character's crafting stock vs. the party's) -
  // both can be open at once, toggled independently. The recipe viewer
  // below is always visible, not part of this fold.
  const [openSections, setOpenSections] = useState<Set<"blueprints" | "character" | "party">>(new Set());
  const toggleSection = (id: "blueprints" | "character" | "party") => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Party's Vault still has sub-items (Tools/Resources) that can each open
  // independently - the character's own section no longer does, now that
  // it's just a single Resources table with no fold of its own.
  const [openPartySub, setOpenPartySub] = useState<Set<string>>(new Set());
  const togglePartySub = (id: string) => setOpenPartySub((prev) => {
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
  // Crafting only ever checks the player's shared vault now, never the
  // character's own - the character vault is a temporary staging area for
  // an active craft (populated/drained by start/finish_craft), not
  // somewhere a player parks materials ahead of time. So the recipe
  // viewer's owned/needed check reflects the player vault only, matching
  // exactly what backend.players.start_craft actually checks.
  const ownedTools = ownedIds(playerTools);

  // Crafted-item instances in the player's shared vault, counted by their
  // concrete (tier-specific) id - same "id -> quantity" shape
  // playerItemBalances already has, so both can render through the same
  // IdList. Two Iron Battle Axes and one Copper Battle Axe show as two
  // separate rows, not lumped together, since they're different concrete
  // ids even though they share a family.
  const playerItemCounts: Record<string, number> = {};
  for (const instance of playerItems) {
    playerItemCounts[instance.itemId] = (playerItemCounts[instance.itemId] ?? 0) + 1;
  }

  // Some item-inventory-properties.json families (ammo - arrow/bolt/oil)
  // are physically stored in resources, not itemBalances/items, since
  // they're ordinary stackable PROCESSED_RESOURCE_ITEMS entries. They
  // still belong in the Items list for display, and get excluded from the
  // Resources list below so they aren't shown twice.
  const playerAmmoBalances: Record<string, number> = {};
  const playerResourcesExcludingItems: Record<string, number> = {};
  for (const [id, qty] of Object.entries(playerResourceBalances)) {
    if (itemCatalogIds.has(id)) {
      playerAmmoBalances[id] = qty;
    } else {
      playerResourcesExcludingItems[id] = qty;
    }
  }

  const playerItemsCombined: Record<string, number> = {
    ...playerItemBalances,
    ...playerItemCounts,
    ...playerAmmoBalances,
  };

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
    isCurrentSelectionCraftable?: () => boolean;
  };
  const getRecipeViewerWindow = () =>
    recipeViewerRef.current?.contentWindow as RecipeViewerWindow | null | undefined;

  // Re-checked on an interval while the viewer is open, since there's no
  // "selection changed" event fired out of it - a player can browse
  // recipes/tiers freely and the button should track whatever's on screen
  // right now, not just what it was when last clicked.
  const [canCraft, setCanCraft] = useState(false);
  useEffect(() => {
    if (!recipeViewerOpen) {
      setCanCraft(false);
      return;
    }
    const check = () => setCanCraft(getRecipeViewerWindow()?.isCurrentSelectionCraftable?.() ?? false);
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeViewerOpen, playerResourceBalances, playerTools, knownBlueprints]);

  const [crafting, setCrafting] = useState(false);
  const [craftError, setCraftError] = useState<string | null>(null);

  // Begins crafting whatever's currently selected in the viewer - checks
  // ingredients/tool/blueprint against the player's shared vault, transfers
  // what's needed onto the character, and starts the CRAFT_DURATION_SECONDS
  // timer server-side (character.activeCraft). See the countdown effect
  // below for what happens once that timer elapses.
  const startCraft = async () => {
    const selection = getRecipeViewerWindow()?.getCurrentSelection?.();
    if (!selection) {
      setCraftError("Pick a recipe in the viewer first.");
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
          body: JSON.stringify({ tier: selection.tier }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCraftError(body?.detail ?? "Couldn't craft that - check ingredients, tool, and blueprint.");
        return;
      }
      const data: RawPlayerData = await res.json();
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
        onPlayerDataUpdated?.(data);
      }
    } catch {
      // Next tick's countdown effect will retry - no need to surface this.
    } finally {
      setFinishing(false);
    }
  };

  // Countdown against character.activeCraft.readyAt - resolved lazily
  // (matching backend.players' own "no background job" design): ticks
  // once a second while a craft is in progress, and fires finishCraft the
  // moment it reaches zero, including immediately on mount if readyAt is
  // already in the past.
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  useEffect(() => {
    const readyAt = character.activeCraft?.readyAt;
    if (!readyAt) {
      setRemainingSeconds(null);
      return;
    }
    const readyAtMs = new Date(readyAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((readyAtMs - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) finishCraft();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.activeCraft?.readyAt]);

  const formatRemaining = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className={styles.panel}>
      {knownBlueprints.length > 0 && (
        <div className={styles.accordionItem}>
          <button className={styles.accordionHeader} onClick={() => toggleSection("blueprints")}>
            <span>{`Blueprints Known (${knownBlueprints.length})`}</span>
            <span className={styles.accordionChevron}>{openSections.has("blueprints") ? "▴" : "▾"}</span>
          </button>
          {openSections.has("blueprints") && (
            <div className={styles.accordionBody}>
              <IdList ids={knownBlueprints} emptyLabel="" tierInfo={blueprintTierInfo} sortByTier textColor="#7eb8ff" />
            </div>
          )}
        </div>
      )}

      <div className={styles.accordionItem}>
        <button className={styles.accordionHeader} onClick={() => toggleSection("character")}>
          <span>
            {character.firstName}&apos;s Crafting
            {remainingSeconds !== null && (
              <span className={styles.craftTimer}> {formatRemaining(remainingSeconds)}</span>
            )}
          </span>
          <span className={styles.accordionChevron}>{openSections.has("character") ? "▴" : "▾"}</span>
        </button>
        {openSections.has("character") && (
          <div className={styles.accordionBody}>
            <IdList
              ids={ownedIds(character.tools)}
              emptyLabel="Not currently using any tools."
              tierInfo={toolTierInfo}
              sortByTier
              fixedIcon="🔧"
              balances={character.tools}
              onTransfer={(id, amount) => transfer("tools", id, amount)}
              textColor="#7eb8ff"
            />
            {ownedIds(character.tools).length > 0 && <div className={styles.toolsResourceDivider} />}
            <ResourceList
              balances={character.resources}
              emptyLabel="No materials used."
              tierInfo={resourceTierInfo}
              onTransfer={(id, amount) => transfer("resources", id, amount)}
            />
          </div>
        )}
      </div>

      <div className={styles.accordionItem}>
        <button className={styles.accordionHeader} onClick={() => toggleSection("party")}>
          <span>Party&apos;s Vault</span>
          <span className={styles.accordionChevron}>{openSections.has("party") ? "▴" : "▾"}</span>
        </button>
        {openSections.has("party") && (
          <div className={styles.accordionBody}>
            <SubAccordionItem
              id="tools"
              label="Tools"
              openIds={openPartySub}
              onToggle={togglePartySub}
            >
              <IdList
                ids={ownedIds(playerTools)}
                emptyLabel="Nothing in the shared tool pool."
                tierInfo={toolTierInfo}
                sortByTier
                fixedIcon="🔧"
                balances={playerTools}
              />
            </SubAccordionItem>
            <SubAccordionItem
              id="resources"
              label="Resources"
              openIds={openPartySub}
              onToggle={togglePartySub}
            >
              <ResourceList
                balances={playerResourcesExcludingItems}
                emptyLabel="Nothing in the shared crafting stock."
                tierInfo={resourceTierInfo}
              />
            </SubAccordionItem>
            <SubAccordionItem
              id="items"
              label="Items"
              openIds={openPartySub}
              onToggle={togglePartySub}
            >
              <IdList
                ids={Object.keys(playerItemsCombined).filter((id) => playerItemsCombined[id] > 0)}
                emptyLabel="Nothing crafted yet."
                tierInfo={itemCatalogTierInfo}
                sortByTier
                balances={playerItemsCombined}
              />
            </SubAccordionItem>
          </div>
        )}
      </div>

      <div className={styles.craftRow}>
        <button
          className={styles.craftButton}
          onClick={startCraft}
          disabled={crafting || !canCraft || remainingSeconds !== null}
        >
          {remainingSeconds !== null ? (
            <span className={styles.craftTimer}>Crafting… {formatRemaining(remainingSeconds)}</span>
          ) : crafting ? (
            "Crafting…"
          ) : (
            "Craft"
          )}
        </button>
        {canCraft && remainingSeconds === null && (
          <span className={styles.craftReadyCheck} title="Selected recipe can be crafted right now">
            ✓
          </span>
        )}
        {craftError && <span className={styles.craftError}>{craftError}</span>}
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
          )}&tools=${encodeURIComponent(JSON.stringify(ownedTools))}&blueprints=${encodeURIComponent(
            JSON.stringify(knownBlueprints)
          )}`}
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
    </div>
  );
}
