import { useEffect, useRef, useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// GET /api/auth/blueprint-categories - lore/reference data (not
// player-specific), reused here purely to look up each known blueprint's own
// tier/starter flag by id, since Character.blueprints is just a flat id
// list with no tier attached.
type BlueprintCategoryItem = { id: string; tier: number; isBasic: boolean };
type BlueprintCategoryFamily = { items: BlueprintCategoryItem[] };
type BlueprintCategoryEntry = { families: BlueprintCategoryFamily[] };
type BlueprintTierInfo = Record<string, { tier: number; isBasic: boolean }>;

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

function IdList({
  ids,
  emptyLabel,
  tierInfo,
  sortByTier,
}: {
  ids: string[];
  emptyLabel: string;
  /** When given, prefixes each entry with "T1: "/"T2: "/... or "S: " for a starter. */
  tierInfo?: BlueprintTierInfo;
  /** Starters first, then by tier ascending - requires `tierInfo`. */
  sortByTier?: boolean;
}) {
  if (ids.length === 0) return <p className={styles.inventoryEmpty}>{emptyLabel}</p>;
  const sortedIds = sortByTier
    ? [...ids].sort((a, b) => {
        const infoA = tierInfo?.[a];
        const infoB = tierInfo?.[b];
        if (!infoA || !infoB) return 0;
        if (infoA.isBasic !== infoB.isBasic) return infoA.isBasic ? -1 : 1;
        return infoA.tier - infoB.tier;
      })
    : ids;
  return (
    <div className={styles.inventoryDetailsList}>
      {sortedIds.map((id) => {
        const info = tierInfo?.[id];
        const prefix = info ? (info.isBasic ? "S: " : `T${info.tier}: `) : "";
        return (
          <span key={id}>
            {prefix}
            {formatResourceLabel(id)}
          </span>
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
  playerToolStarter,
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
  playerToolStarter: Record<string, number>;
}) {
  // Fetched once - maps every blueprint id to its own tier/starter flag, so
  // the Blueprints Known lists below can show "T1: Copper Anvil" etc.
  const [blueprintTierInfo, setBlueprintTierInfo] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    fetch("/api/auth/blueprint-categories")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BlueprintCategoryEntry[]) => {
        const info: BlueprintTierInfo = {};
        for (const entry of data) {
          for (const family of entry.families) {
            for (const item of family.items) {
              info[item.id] = { tier: item.tier, isBasic: item.isBasic };
            }
          }
        }
        setBlueprintTierInfo(info);
      })
      .catch(() => setBlueprintTierInfo({}));
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
  const [recipeViewerOpen, setRecipeViewerOpen] = useState(true);

  // Blueprints are soulbound to the character (never move to the player's
  // shared pool), so both the regular and starter lists always count as
  // "known" for the recipe viewer's missing-blueprint check.
  const knownBlueprints = [...character.blueprints, ...character.blueprintStarter];
  // A tool counts as available whether it's still sitting in the player's
  // shared pool or already checked out onto this character - both mean the
  // character can use it.
  const ownedTools = ownedIds(playerTools, playerToolStarter, character.tools, character.toolStarter);

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
              <ResourceList balances={character.resourceBalances} emptyLabel="No materials carried." />
            </SubAccordionItem>
            <SubAccordionItem
              id="tools"
              label="Tools"
              openId={openCharacterSub}
              onToggle={toggleCharacterSub}
            >
              <IdList
                ids={[...ownedIds(character.tools), ...ownedIds(character.toolStarter)]}
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
              />
            </SubAccordionItem>
            <SubAccordionItem
              id="tools"
              label="Tools"
              openId={openPartySub}
              onToggle={togglePartySub}
            >
              <IdList
                ids={[...ownedIds(playerTools), ...ownedIds(playerToolStarter)]}
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
