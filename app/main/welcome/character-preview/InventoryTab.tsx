import { useEffect, useRef, useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// GET /api/auth/blueprint-categories - lore/reference data (not
// player-specific), reused here purely to look up each known blueprint's own
// tier by id, since Character.blueprints is just a flat id list with no tier attached.
type BlueprintCategoryItem = { id: string; tier: number };
type BlueprintCategoryFamily = { familyId: string; kind: string; items: BlueprintCategoryItem[] };
type BlueprintCategoryEntry = { families: BlueprintCategoryFamily[] };
type BlueprintTierInfo = Record<
  string,
  { tier: number; familyId: string; kind: string }
>;
type ResourceTierInfo = Record<string, { tier: number; family: string }>;

// Resource/tool/blueprint ids are catalog keys (e.g. "iron_ore",
// "blueprint_copper_anvil") - no per-id display-name lookup is wired to this
// page yet, so ids are just formatted for reading. The "blueprint_" prefix
// is dropped since whichever list a blueprint id shows up in is already
// headed "Blueprints Known"/"Starter Blueprints Known".
function formatResourceLabel(id: string): string {
  return id
    .replace(/^blueprint_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getKindIcon(kind: string): string {
  switch (kind) {
    case "tool":
      return "🔧";
    case "weapon":
    case "armor":
    case "shield":
    case "equipment":
      return "📦";
    default:
      return "";
  }
}

function getTierIndicator(tier: number): string {
  if (tier >= 4) {
    return "✨".repeat(tier - 3);
  }
  return "○".repeat(tier);
}

function getTierSymbolClass(tier: number): string {
  if (tier >= 4) {
    return styles.tierSymbolStar;
  }
  return styles.tierSymbolCircle;
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
}: {
  balances: Record<string, number>;
  emptyLabel: string;
  tierInfo?: ResourceTierInfo;
}) {
  let entries = Object.entries(balances).filter(([, qty]) => qty > 0);
  if (entries.length === 0) {
    return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;
  }

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

  const renderProcessedGroup = (familyGroups: Record<string, Array<[string, number]>>, highestTierByFamily: Record<string, number>, sortedFamilies: string[]) => {
    return (
      <table className={styles.inventoryTable}>
        <tbody>
          {sortedFamilies.flatMap((family) => {
            const familyItems = familyGroups[family].sort((a, b) => {
              const tierA = tierInfo?.[a[0]]?.tier ?? 0;
              const tierB = tierInfo?.[b[0]]?.tier ?? 0;
              return tierB - tierA;
            });

            return familyItems.map(([id, qty]) => {
              const icon = getResourceIcon(id);
              const tierData = tierInfo?.[id];
              const tier = tierData?.tier ?? 0;
              const tierDisplay = tier ? getTierIndicator(tier) : "";
              const isGreyed = tier > 0 && highestTierByFamily[family] > tier;
              return (
                <tr key={id} style={isGreyed ? { opacity: 0.5, color: "var(--text-dim)" } : undefined}>
                  <td>{icon}</td>
                  <td><span className={tier > 0 ? getTierSymbolClass(tier) : styles.tierSymbol}>{tierDisplay}</span></td>
                  <td>{formatResourceLabel(id)}</td>
                  <td>{qty}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    );
  };

  const renderRawGroup = (familyGroups: Record<string, Array<[string, number]>>, highestTierByFamily: Record<string, number>, sortedFamilies: string[]) => {
    return (
      <table className={styles.inventoryTable}>
        <tbody>
          {sortedFamilies.flatMap((family) => {
            const familyItems = familyGroups[family].sort((a, b) => {
              const tierA = tierInfo?.[a[0]]?.tier ?? 0;
              const tierB = tierInfo?.[b[0]]?.tier ?? 0;
              return tierB - tierA;
            });

            return familyItems.map(([id, qty]) => {
              const icon = getResourceIcon(id);
              const tierData = tierInfo?.[id];
              const tier = tierData?.tier ?? 0;
              const tierDisplay = tier ? getTierIndicator(tier) : "";
              const isGreyed = tier > 0 && highestTierByFamily[family] > tier;
              return (
                <tr key={id} style={isGreyed ? { opacity: 0.5, color: "var(--text-dim)" } : undefined}>
                  <td>{icon}</td>
                  <td><span className={tier > 0 ? getTierSymbolClass(tier) : styles.tierSymbol}>{tierDisplay}</span></td>
                  <td>{formatResourceLabel(id)}</td>
                  <td>{qty}</td>
                </tr>
              );
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
      {renderProcessedGroup(processedData.familyGroups, processedData.highestTierByFamily, processedData.sortedFamilies)}
      {hasProcessed && hasRaw && <div className={styles.resourceDivider} />}
      {renderRawGroup(rawData.familyGroups, rawData.highestTierByFamily, rawData.sortedFamilies)}
    </>
  );
}

function IdList({
  ids,
  emptyLabel,
  tierInfo,
  sortByTier,
}: {
  ids: string[];
  emptyLabel: string;
  /** When given, prefixes each entry with "T1: "/"T2: "/... tier numbers. */
  tierInfo?: BlueprintTierInfo;
  /** Sort by tier descending (highest first) - requires `tierInfo`. */
  sortByTier?: boolean;
}) {
  if (ids.length === 0) return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;

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
        // Then by tier descending (highest first)
        return infoB.tier - infoA.tier;
      })
    : ids;

  // Find highest tier for each family to grey out lower tiers
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

  return (
    <div className={styles.inventoryDetailsList}>
      {sortedIds.map((id, index) => {
        const info = tierInfo?.[id];
        const tierDisplay = info ? getTierIndicator(info.tier) : "";
        const isGreyed =
          info && highestTierByFamily[info.familyId] > info.tier;
        const icon = info?.kind ? getKindIcon(info.kind) : "";

        // Add divider between items and tools
        const prevInfo = index > 0 ? tierInfo?.[sortedIds[index - 1]] : null;
        const showDivider =
          index > 0 &&
          info &&
          prevInfo &&
          prevInfo.kind !== info.kind &&
          info.kind === "tool";

        return (
          <div key={id}>
            {showDivider && <div className={styles.resourceDivider} />}
            <div className={styles.inventoryRow} style={isGreyed ? { opacity: 0.5, color: "var(--text-dim)" } : undefined}>
              <span>{icon}</span>
              <span className={info?.tier ? getTierSymbolClass(info.tier) : styles.tierSymbol}>{tierDisplay}</span>
              <span>{formatResourceLabel(id)}</span>
            </div>
          </div>
        );
      })}
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

// A single sub-accordion item (Resources/Tools/Blueprints Known/...) within
// one of the two top-level sections - `openId`/`onToggle` implement the
// mutual exclusivity (opening one closes whichever sibling was open),
// mirroring app/characters/page.tsx's accordion exactly.
function SubAccordionItem({
  id,
  label,
  openId,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  openId: string | null;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = openId === id;
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
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
}) {
  // Fetched once - maps every blueprint id to its own tier and family info, so
  // the Blueprints Known lists below can show tier information etc.
  const [blueprintTierInfo, setBlueprintTierInfo] = useState<BlueprintTierInfo>({});

  // Resource tier info: id -> tier (for displaying tier indicators on resources)
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});

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
  }, []);

  // Top-level accordion (this character's crafting stock vs. the party's) -
  // only one open at a time. The recipe viewer below is always visible, not
  // part of this fold.
  const [openSection, setOpenSection] = useState<"character" | "party" | null>(null);
  const toggleSection = (id: "character" | "party") =>
    setOpenSection((prev) => (prev === id ? null : id));

  // Each top-level section has its own sub-accordion state, so opening a
  // sub-item in one section never affects the other.
  const [openCharacterSub, setOpenCharacterSub] = useState<string | null>(null);
  const [openPartySub, setOpenPartySub] = useState<string | null>(null);
  const toggleCharacterSub = (id: string) => setOpenCharacterSub((prev) => (prev === id ? null : id));
  const togglePartySub = (id: string) => setOpenPartySub((prev) => (prev === id ? null : id));

  // Independent of the Crafting accordion above - folding the recipe viewer
  // has nothing to do with toggling between the character's and party's stock.
  const [recipeViewerOpen, setRecipeViewerOpen] = useState(false);

  // Blueprints are soulbound to the character (never move to the player's
  // shared pool), so this counts as "known" for the recipe viewer's
  // missing-blueprint check.
  const knownBlueprints = character.blueprints;
  // A tool counts as available whether it's still sitting in the player's
  // shared pool or already checked out onto this character - both mean the
  // character can use it.
  const ownedTools = ownedIds(playerTools, character.tools);

  // The embedded recipe viewer's own content height, in px - same-origin, so
  // its body height can be read directly and mirrored onto the iframe
  // element (see SoulCreation.tsx's identical pattern).
  const [recipeViewerHeight, setRecipeViewerHeight] = useState(600);
  const recipeViewerRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className={styles.panel}>
      <div className={styles.accordionItem}>
        <button className={styles.accordionHeader} onClick={() => toggleSection("character")}>
          <span>{character.firstName}&apos;s Crafting</span>
          <span className={styles.accordionChevron}>{openSection === "character" ? "▴" : "▾"}</span>
        </button>
        {openSection === "character" && (
          <div className={styles.accordionBody}>
            <SubAccordionItem
              id="resources"
              label="Resources"
              openId={openCharacterSub}
              onToggle={toggleCharacterSub}
            >
              <ResourceList balances={character.resourceBalances} emptyLabel="No materials carried." tierInfo={resourceTierInfo} />
            </SubAccordionItem>
            <SubAccordionItem
              id="tools"
              label="Tools"
              openId={openCharacterSub}
              onToggle={toggleCharacterSub}
            >
              <IdList
                ids={ownedIds(character.tools)}
                emptyLabel="Not currently holding any tools."
              />
            </SubAccordionItem>
            {knownBlueprints.length > 0 && (
              <SubAccordionItem
                id="blueprints"
                label={`Blueprints Known (${knownBlueprints.length})`}
                openId={openCharacterSub}
                onToggle={toggleCharacterSub}
              >
                <IdList ids={knownBlueprints} emptyLabel="" tierInfo={blueprintTierInfo} sortByTier />
              </SubAccordionItem>
            )}
          </div>
        )}
      </div>

      <div className={styles.accordionItem}>
        <button className={styles.accordionHeader} onClick={() => toggleSection("party")}>
          <span>Party&apos;s Crafting</span>
          <span className={styles.accordionChevron}>{openSection === "party" ? "▴" : "▾"}</span>
        </button>
        {openSection === "party" && (
          <div className={styles.accordionBody}>
            <SubAccordionItem
              id="resources"
              label="Resources"
              openId={openPartySub}
              onToggle={togglePartySub}
            >
              <ResourceList
                balances={playerResourceBalances}
                emptyLabel="Nothing in the shared crafting stock."
                tierInfo={resourceTierInfo}
              />
            </SubAccordionItem>
            <SubAccordionItem
              id="tools"
              label="Tools"
              openId={openPartySub}
              onToggle={togglePartySub}
            >
              <IdList
                ids={ownedIds(playerTools)}
                emptyLabel="Nothing in the shared tool pool."
              />
            </SubAccordionItem>
          </div>
        )}
      </div>

      <p className={styles.placeholderNote}>
        Moving items between crafting stocks isn&apos;t wired up yet - this shows both sides for now.
      </p>

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
            JSON.stringify(character.resourceBalances)
          )}&tools=${encodeURIComponent(JSON.stringify(ownedTools))}&blueprints=${encodeURIComponent(
            JSON.stringify(knownBlueprints)
          )}`}
          title="Crafting Recipe Viewer"
          className={styles.recipeViewerFrame}
          style={{ height: recipeViewerHeight }}
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
