import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import { RACES, PROFESSIONS, BIRTHSIGNS, PROFESSION_RESOURCE_FAMILIES } from "@/app/lib/characterOptions";
import { getDisplayedAge } from "@/app/lib/ageScaling";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatRemainingCompactLong, useCraftCountdown } from "../craftTimer";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import type { ItemInstance } from "../SoulSlotGrid";
import {
  IdList,
  ResourceList,
  ItemDetailPopup,
  ownedIds,
  resolveOutputName,
  formatResourceLabel,
  formatXpPreview,
  CRAFT_RESULT_FADE_MS,
} from "./VaultTab";
import type { BlueprintTierInfo, ResourceTierInfo, RawPlayerData } from "./VaultTab";
import { getBlueprintCatalog, getResourceCatalog, getToolCatalog, getItemCatalog } from "./catalogCache";

import baseLevelsData from "../../../../backend/data/base-levels.json";
const XP_LEVELS = baseLevelsData.levels;


const BODY_ATTRS = [
  ["migh", "Might"],
  ["agil", "Agility"],
  ["endu", "Endurance"],
  ["prec", "Precision"],
] as const;

const SOUL_ATTRS = [
  ["will", "Will"],
  ["insi", "Insight"],
  ["lore", "Lore"],
  ["pres", "Presence"],
] as const;

function raceName(id: string): string {
  return RACES.find((r) => r.id === id)?.name ?? id;
}

function professionName(id: string): string {
  if (!id || id === "none") return "";
  return PROFESSIONS.find((p) => p.id === id)?.name ?? id;
}

function professionDescription(id: string): string {
  if (!id || id === "none") return "";
  return PROFESSIONS.find((p) => p.id === id)?.description ?? "";
}

function professionResourceFamilies(id: string): string {
  if (!id || id === "none") return "";
  const category = PROFESSIONS.find((p) => p.id === id)?.category;
  const families = category ? PROFESSION_RESOURCE_FAMILIES[category] : undefined;
  if (!families) return "";
  return families
    .map((family) => family.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
    .join(", ");
}

function birthsignName(id: string): string {
  return BIRTHSIGNS.find((b) => b.id === id)?.name ?? id;
}

function sumAttrs(
  keys: readonly (readonly [keyof SlotCharacterSummary["attr"], string])[],
  attr: SlotCharacterSummary["attr"]
): number {
  return keys.reduce((total, [key]) => total + attr[key], 0);
}

const CRAFT_COUNTS = [1, 2, 3, 4, 5, 10, 20, 25, 50] as const;

type RecipeViewerWindow = Window & {
  getCurrentSelection?: () => { familyId: string; tier: number } | null;
  isCurrentSelectionCraftable?: (count?: number) => boolean;
  getCurrentSelectionXp?: (count?: number) => { rawXp: Record<string, number>; finalXp: number } | null;
  getCurrentSelectionDuration?: (count?: number) => number | null;
};

/** Preview page: face portrait, identity, and the full attribute/profession sheet. */
export function StatsTab({
  character,
  onEditPortrait,
  onOpenBirthsign,
  onPlayerDataUpdated,
  playerResourceBalances,
  playerTools,
  playerItemBalances,
  playerItems,
}: {
  character: SlotCharacterSummary;
  onEditPortrait?: () => void;
  onOpenBirthsign?: () => void;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  playerResourceBalances: Record<string, number>;
  playerTools: Record<string, number>;
  playerItemBalances: Record<string, number>;
  playerItems: ItemInstance[];
}) {
  const birthsignInfo = BIRTHSIGNS.find((b) => b.id === character.birthsign) ?? null;

  const craftRemainingSeconds = useCraftCountdown(character.crafting.activeCraft?.readyAt);
  const inAdventure = character.availability.inAdventure;

  const [blueprintTierInfo, setBlueprintTierInfo] = useState<BlueprintTierInfo>({});
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);

  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});
  const [toolTierInfo, setToolTierInfo] = useState<BlueprintTierInfo>({});
  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});

  useEffect(() => {
    getBlueprintCatalog().then(setBlueprintTierInfo).catch(() => setBlueprintTierInfo({}));
    getResourceCatalog().then(setResourceTierInfo).catch(() => setResourceTierInfo({}));
    getToolCatalog().then(setToolTierInfo).catch(() => setToolTierInfo({}));
    getItemCatalog().then(setItemCatalogTierInfo).catch(() => setItemCatalogTierInfo({}));
  }, []);

  // --- Crafting state ---

  const transfer = async (
    kind: "itemBalances" | "resources" | "tools",
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

  const knownBlueprints = character.blueprints ?? [];

  const ownedTools = useMemo(() => {
    const tools = ownedIds(playerTools);
    for (const instance of character.gear.items) {
      if (instance.location === "backpack" || instance.location === "body") {
        tools.push(instance.itemId);
      }
    }
    return tools;
  }, [playerTools, character.gear.items]);

  const vaultToolInstanceIds = useMemo(
    () => playerItems.filter((instance) => instance.location === "pool").map((instance) => instance.itemId),
    [playerItems]
  );

  const borrowedToolIds: string[] = [];
  const borrowedToolCounts: Record<string, number> = {};
  for (const instance of character.gear.items) {
    if (instance.location === "crafting") {
      if (!(instance.itemId in borrowedToolCounts)) borrowedToolIds.push(instance.itemId);
      borrowedToolCounts[instance.itemId] = (borrowedToolCounts[instance.itemId] ?? 0) + 1;
    }
  }

  const playerItemsCombined = useMemo(() => {
    const rowBalances: Record<string, number> = {};
    for (const instance of playerItems) {
      rowBalances[instance.instanceId] = 1;
    }
    return { ...playerItemBalances, ...rowBalances };
  }, [playerItems, playerItemBalances]);

  const [craftingAccordionOpen, setCraftingAccordionOpen] = useState(false);

  const [recipeViewerOpen, setRecipeViewerOpen] = useState(false);
  const [recipeViewerHeight, setRecipeViewerHeight] = useState(600);
  const recipeViewerRef = useRef<HTMLIFrameElement>(null);
  const [recipeViewerLoaded, setRecipeViewerLoaded] = useState(false);

  const getRecipeViewerWindow = () =>
    recipeViewerRef.current?.contentWindow as RecipeViewerWindow | null | undefined;

  const [craftCount, setCraftCount] = useState<number>(1);
  const [craftableCounts, setCraftableCounts] = useState<Record<number, boolean>>({});
  const [craftXpPreview, setCraftXpPreview] = useState<{ rawXp: Record<string, number>; finalXp: number } | null>(null);
  const [craftDurationPreview, setCraftDurationPreview] = useState<number | null>(null);

  useEffect(() => {
    if (!recipeViewerOpen) {
      setCraftableCounts({});
      setCraftXpPreview(null);
      setCraftDurationPreview(null);
      setRecipeViewerLoaded(false);
    }
  }, [recipeViewerOpen]);

  useEffect(() => {
    if (!recipeViewerOpen) return;
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
  }, [recipeViewerOpen, playerResourceBalances, playerItemBalances, playerTools, knownBlueprints, craftCount]);

  useEffect(() => {
    if (!recipeViewerLoaded) return;
    recipeViewerRef.current?.contentWindow?.postMessage(
      {
        type: "recipe-viewer:update",
        inv: playerResourceBalances,
        itemBalances: playerItemBalances,
        tools: ownedTools,
        vaultTools: vaultToolInstanceIds,
        blueprints: knownBlueprints,
      },
      window.location.origin
    );
  }, [recipeViewerLoaded, playerResourceBalances, playerItemBalances, ownedTools, vaultToolInstanceIds, knownBlueprints]);

  const [recipePopupItemId, setRecipePopupItemId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "recipe-viewer:show-item" && typeof e.data.itemId === "string") {
        setRecipePopupItemId(e.data.itemId);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const canCraft = craftableCounts[craftCount] ?? false;
  const [crafting, setCrafting] = useState(false);
  const [craftError, setCraftError] = useState<string | null>(null);

  const startCraft = async () => {
    const win = getRecipeViewerWindow();
    const selection = win?.getCurrentSelection?.();
    if (!selection) {
      setCraftError("Pick a recipe in the viewer first.");
      return;
    }
    if (!(win?.isCurrentSelectionCraftable?.(craftCount) ?? false)) {
      setCraftError("Couldn&apos;t craft that - check ingredients, tool, and blueprint.");
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
        setCraftError(body?.detail ?? "Couldn&apos;t craft that - check ingredients, tool, and blueprint.");
        return;
      }
      const data: RawPlayerData = await res.json();
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      setLastCraftResult(null);
      onPlayerDataUpdated?.(data);
    } catch {
      setCraftError("Couldn&apos;t reach the server.");
    } finally {
      setCrafting(false);
    }
  };

  const [finishing, setFinishing] = useState(false);
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
      // Next tick's countdown effect will retry.
    } finally {
      setFinishing(false);
    }
  };

  const remainingSeconds = useCraftCountdown(character.crafting.activeCraft?.readyAt);
  useEffect(() => {
    if (remainingSeconds === 0) finishCraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds === 0]);

  // --- Profession / prime state ---

  const [settingPrime, setSettingPrime] = useState(false);
  const [xpOverlay, setXpOverlay] = useState<{
    slot: "prof1" | "prof2" | "prof3";
    lvl: number;
    top: number;
    right: number;
  } | null>(null);
  const [descOverlay, setDescOverlay] = useState<{
    slot: "prof1" | "prof2" | "prof3";
    name: string;
    description: string;
    isPrime: boolean;
    top: number;
    left: number;
  } | null>(null);
  const [birthsignOverlay, setBirthsignOverlay] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [carryOverlay, setCarryOverlay] = useState<{ top: number; left: number } | null>(null);
  const openXpOverlay = (
    p: { slot: "prof1" | "prof2" | "prof3"; lvl: number },
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (p.lvl >= 30) return;
    setDescOverlay(null);
    if (xpOverlay?.slot === p.slot) { setXpOverlay(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setXpOverlay({ slot: p.slot, lvl: p.lvl, top: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right });
  };
  const openDescOverlay = (
    p: { slot: "prof1" | "prof2" | "prof3"; name: string; description: string; isPrime: boolean },
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    setXpOverlay(null);
    if (descOverlay?.slot === p.slot) { setDescOverlay(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setDescOverlay({ slot: p.slot, name: p.name, description: p.description, isPrime: p.isPrime, top: window.innerHeight - rect.top + 6, left: rect.left });
  };
  const setPrimeProfession = async (slot: "prof1" | "prof2" | "prof3") => {
    if (settingPrime) return;
    setSettingPrime(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/profession/prime`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        onPlayerDataUpdated?.(data);
      }
    } catch {
      // Best-effort - the row just stays clickable to try again.
    } finally {
      setSettingPrime(false);
    }
  };

  const effectivePrime = ["prof1", "prof2", "prof3"].includes(character.profession.prime)
    ? character.profession.prime
    : "prof1";

  const professions = (
    [
      {
        slot: "prof1" as const,
        name: professionName(character.profession.prof1),
        description: professionDescription(character.profession.prof1),
        lvl: character.profession.lvl1,
        exp: character.profession.exp1,
        resourceFamilies: professionResourceFamilies(character.profession.prof1),
      },
      {
        slot: "prof2" as const,
        name: professionName(character.profession.prof2),
        description: professionDescription(character.profession.prof2),
        lvl: character.profession.lvl2,
        exp: character.profession.exp2,
        resourceFamilies: professionResourceFamilies(character.profession.prof2),
      },
      {
        slot: "prof3" as const,
        name: professionName(character.profession.prof3),
        description: professionDescription(character.profession.prof3),
        lvl: character.profession.lvl3,
        exp: character.profession.exp3,
        resourceFamilies: professionResourceFamilies(character.profession.prof3),
      },
    ]
      .filter((p) => p.name)
      .map((p) => ({ ...p, isPrime: p.slot === effectivePrime }))
      .sort((a, b) => (a.isPrime === b.isPrime ? 0 : a.isPrime ? -1 : 1))
  );

  const classes = [
    { name: character.classes.class1, lvl: character.classes.lvl1 },
    { name: character.classes.class2, lvl: character.classes.lvl2 },
  ].filter((c) => c.name && c.name !== "none");

  return (
    <div className={styles.panel}>
      <div className={styles.statsLayout}>
        <div className={styles.portraitStatsGroup}>
          <button
            type="button"
            className={styles.faceFrame}
            onClick={onEditPortrait}
            title="Edit portrait"
            aria-label="Edit portrait"
          >
            {character.portraitUrl && character.portraitUrl !== "empty" ? (
              character.portraitFaceArea ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.portraitUrl}
                  alt={character.firstName}
                  style={getPortraitCropImgStyle(character.portraitFaceArea)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.portraitUrl}
                  alt={character.firstName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )
            ) : (
              <span className={styles.noPortraitPlaceholder} aria-label="No portrait">
                no
                <br />
                portrait
              </span>
            )}
          </button>

          <div className={styles.characterStatsFrame}>
            {(() => {
              const f = character.stats?.adventureFinished ?? 0;
              const r = character.stats?.adventureRunAway ?? 0;
              const total = f + r;
              const fPct = total > 0 ? (f / total) * 100 : 100;
              const rPct = total > 0 ? (r / total) * 100 : 0;
              return (
                <>
                  <div className={styles.characterStatsHeading}>
                  {fPct >= 50 ? (
                    <><span>Stalwart</span><span className={styles.stalwartPct}>{Math.round(fPct)}%</span></>
                  ) : (
                    <><span>Craven</span><span className={styles.cravenPct}>{Math.round(rPct)}%</span></>
                  )}
                </div>
                  <div className={styles.storyBar}>
                    <div
                      className={styles.storyBarFinished}
                      style={{ width: `${fPct}%` }}
                    >
                      <span className={styles.storyBarLabel}>STOOD</span>
                    </div>
                    <div
                      className={styles.storyBarRunAway}
                      style={{ width: `${rPct}%` }}
                    >
                      <span className={styles.storyBarLabel}>RUN</span>
                    </div>
                  </div>
                  <div className={styles.miniStatsGrid}>
                    <span>Adventures</span><span>{total}</span>
                    <span>Crafted</span><span>0</span>
                    <span>Blueprints</span><span>{character.blueprints?.length ?? 0}</span>
                    <span>Items</span><span>{character.gear?.items?.length ?? 0}</span>
                    <span>Slain</span><span>0</span>
                    <span>Deaths</span><span>0</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className={styles.identityColumn}>
          <div className={styles.identityRow}>
            <span>Race</span>
            <span>{raceName(character.race)}</span>
          </div>
          <div className={styles.identityRow}>
            <span>Age</span>
            <span>{getDisplayedAge(character.age_month, character.race)} years</span>
          </div>
          {birthsignInfo ? (
            <div className={styles.identityRow}>
              <button
                type="button"
                className={styles.birthsignLabelBtn}
                onClick={(e) => {
                  if (birthsignOverlay) { setBirthsignOverlay(null); return; }
                  const rect = e.currentTarget.getBoundingClientRect();
                  setBirthsignOverlay({ top: window.innerHeight - rect.top + 6, left: rect.left });
                }}
              >
                Birthsign
              </button>
              <button
                type="button"
                className={styles.birthsignNameBtn}
                onClick={onOpenBirthsign}
              >
                {birthsignInfo.name}
              </button>
            </div>
          ) : (
            <div className={styles.identityRow}>
              <span>Birthsign</span>
              <span>{birthsignName(character.birthsign)}</span>
            </div>
          )}
          <div className={styles.identityRow}>
            <span>Vital</span>
            <span>{character.vitalStatus}</span>
          </div>
          <div className={styles.identityRow}>
            <span>{craftRemainingSeconds ? "Crafting" : inAdventure ? "ON THE ROAD" : "Ready"}</span>
            <span
              className={
                craftRemainingSeconds
                  ? styles.readyTimerValue
                  : inAdventure
                  ? styles.readyAwayValue
                  : styles.readyNowValue
              }
            >
              {craftRemainingSeconds ? formatRemainingCompactLong(craftRemainingSeconds) : inAdventure ? "away" : "now"}
            </span>
          </div>
          <button
            type="button"
            className={`${styles.identityRow} ${styles.carryCapacityRow} ${
              character.gear.encumbranceState === "immobile"
                ? styles.carryOverloaded
                : character.gear.encumbranceState === "encumbered"
                ? styles.carryEncumbered
                : styles.carryNormal
            }`}
            onClick={(e) => {
              if (carryOverlay) { setCarryOverlay(null); return; }
              const rect = e.currentTarget.getBoundingClientRect();
              setCarryOverlay({ top: window.innerHeight - rect.top + 6, left: rect.left });
            }}
          >
            <span>Burden {character.gear.encumbranceState === "immobile" ? "— Crushed" : character.gear.encumbranceState === "encumbered" ? "— Encumbered" : "— Light"}</span>
            <span>{character.gear.carryWeightUsed ?? 0}/{character.gear.carryWeightCapacity ?? (10 + Math.floor((character.attr.migh + character.attr.endu) / 3))}</span>
          </button>
          <div className={styles.professionDivider} />
          {classes.map((c) => (
            <div className={styles.professionRow} key={c.name}>
              <div className={styles.professionRowMain}>
                <span>{c.name}</span>
                <span>Level {c.lvl}</span>
              </div>
            </div>
          ))}
          {professions.map((p, i) => (
            <div className={`${styles.professionRow}${i === professions.length - 1 ? ` ${styles.professionRowLast}` : ""}`} key={p.name}>
              <div className={styles.professionRowSplit}>
                <button
                  type="button"
                  className={styles.professionLeftZone}
                  onClick={(e) => openDescOverlay(p, e)}
                  disabled={settingPrime}
                  title={p.isPrime ? undefined : "Click to make this the prime profession"}
                >
                  <span className={p.isPrime ? styles.professionPrime : undefined}>
                    {p.name}
                    {p.isPrime && <span className={styles.professionPrimeTag}> (prime)</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.professionRightZone}${xpOverlay?.slot === p.slot ? ` ${styles.professionRightZoneActive}` : ""}`}
                  onClick={(e) => openXpOverlay(p, e)}
                  title="View XP table"
                >
                  Lvl {p.lvl} — {p.exp.toLocaleString()} XP
                </button>
              </div>
              {p.resourceFamilies && (
                <span className={styles.professionResourceFamilies}>{p.resourceFamilies}</span>
              )}
            </div>
          ))}

          <div className={styles.attrColumns}>
            <div className={styles.attrGroupHeader}>
              <span>Body <span className={styles.attrGroupTotal}>{sumAttrs(BODY_ATTRS, character.attr)}/{sumAttrs(BODY_ATTRS, character.attr)}</span></span>
              <span>Soul <span className={styles.attrGroupTotal}>{sumAttrs(SOUL_ATTRS, character.attr)}/{sumAttrs(SOUL_ATTRS, character.attr)}</span></span>
            </div>
            <div className={styles.attrGrid}>
              {BODY_ATTRS.map(([key, label], i) => {
                const [sKey, sLabel] = SOUL_ATTRS[i];
                return (
                  <div className={styles.attrGridRow} key={key}>
                    <span className={styles.attrLabel}>{label}</span>
                    <span className={styles.attrDisplayValue}>{character.attr[key]}</span>
                    <span />
                    <span className={styles.attrLabel}>{sLabel}</span>
                    <span className={styles.attrDisplayValue}>{character.attr[sKey]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {(character.blueprints?.length ?? 0) > 0 && (
            <div className={`${styles.accordionItem} ${styles.accordionItemWide}`}>
              <button className={styles.accordionHeader} onClick={() => setBlueprintsOpen(!blueprintsOpen)}>
                <span>Blueprints</span>
                <span className={styles.accordionChevron}>{blueprintsOpen ? "▴" : "▾"}</span>
              </button>
              {blueprintsOpen && (
                <div className={styles.accordionBody}>
                  <IdList
                    ids={character.blueprints}
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

          {/* --- Character's Crafting accordion (active craft timer + borrowed tools/resources) --- */}
          {(remainingSeconds !== null || lastCraftResult !== null) && (
          <div className={styles.accordionItem}>
            <button className={styles.accordionHeader} onClick={() => setCraftingAccordionOpen(!craftingAccordionOpen)}>
              <span>
                {character.firstName}&apos;s Crafting
                {remainingSeconds !== null && (
                  <span className={styles.craftTimer}> {formatRemainingCompactLong(remainingSeconds)}</span>
                )}
              </span>
              <span className={styles.accordionChevron}>{craftingAccordionOpen ? "▴" : "▾"}</span>
            </button>
            {craftingAccordionOpen && (
              <div className={styles.accordionBody}>
                {(ownedIds(character.crafting.itemBalances).length > 0 || borrowedToolIds.length === 0) && (
                  <IdList
                    ids={ownedIds(character.crafting.itemBalances)}
                    emptyLabel="Not currently using any tools."
                    tierInfo={toolTierInfo}
                    sortByTier
                    fixedIcon="🔧"
                    balances={character.crafting.itemBalances}
                    onTransfer={remainingSeconds === null ? (id, amount) => transfer("itemBalances", id, amount) : undefined}
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
                {(ownedIds(character.crafting.itemBalances).length > 0 || borrowedToolIds.length > 0) && (
                  <div className={styles.toolsResourceDivider} />
                )}
                <ResourceList
                  balances={character.crafting.itemBalances}
                  emptyLabel="No materials used."
                  tierInfo={resourceTierInfo}
                  onTransfer={remainingSeconds === null ? (id, amount) => transfer("itemBalances", id, amount) : undefined}
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

          {/* --- Craft button + count selector --- */}
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
                      ? `${character.firstName} is on the road.`
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

          {/* --- Crafting Recipe Viewer --- */}
          <div className={`${styles.accordionItem} ${styles.accordionItemWide}`} style={recipeViewerOpen ? { marginBottom: 0, borderBottom: "none" } : undefined}>
            <button className={styles.accordionHeader} onClick={() => setRecipeViewerOpen((prev) => !prev)}>
              <span>Crafting Recipe Viewer</span>
              <span className={styles.accordionChevron}>{recipeViewerOpen ? "▴" : "▾"}</span>
            </button>
          </div>
          {recipeViewerOpen && (
            <iframe
              ref={recipeViewerRef}
              src="/craft/recipe-viewer.html?embedded=1"
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
                setRecipeViewerLoaded(true);
              }}
            />
          )}
          {recipePopupItemId && itemCatalogTierInfo[recipePopupItemId] && (
            <ItemDetailPopup
              info={itemCatalogTierInfo[recipePopupItemId]}
              fallbackName={formatResourceLabel(recipePopupItemId)}
              owned={playerItemsCombined[recipePopupItemId] ?? 0}
              isInstance={false}
              movable={false}
              quality={null}
              moveId={recipePopupItemId}
              source="vault"
              hasBackpackEquipped={false}
              hasSaddlepackEquipped={false}
              characterId={character.id}
              onPlayerDataUpdated={onPlayerDataUpdated}
              onClose={() => setRecipePopupItemId(null)}
            />
          )}

        </div>

      </div>

      {xpOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setXpOverlay(null)} />
          <div
            className={styles.xpOverlayPanel}
            style={{ bottom: xpOverlay.top, right: xpOverlay.right }}
          >
            {XP_LEVELS.filter((l) => l.level >= xpOverlay.lvl - 2 && l.level <= xpOverlay.lvl + 2).map((entry) => (
              <div
                key={entry.level}
                className={`${styles.xpOverlayRow}${entry.level === xpOverlay.lvl ? ` ${styles.xpOverlayCurrentRow}` : ""}`}
              >
                Lvl {entry.level} — {entry.XP.toLocaleString()} XP
              </div>
            ))}
          </div>
        </>
      )}
      {descOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setDescOverlay(null)} />
          <div
            className={styles.descOverlayPanel}
            style={{ bottom: descOverlay.top, left: descOverlay.left }}
          >
            <div className={styles.descOverlayHeader}>
              <div className={styles.descOverlayName}>{descOverlay.name}</div>
              {descOverlay.isPrime ? (
                <span className={styles.descOverlayPrimeTag}>(prime)</span>
              ) : (
                <button
                  type="button"
                  className={styles.descOverlayMakePrimeBtn}
                  disabled={settingPrime}
                  onClick={() => { setPrimeProfession(descOverlay.slot); setDescOverlay(null); }}
                >
                  (make prime)
                </button>
              )}
            </div>
            <div className={styles.descOverlayText}>{descOverlay.description}</div>
          </div>
        </>
      )}
      {carryOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setCarryOverlay(null)} />
          <div
            className={styles.descOverlayPanel}
            style={{ bottom: carryOverlay.top, left: carryOverlay.left }}
          >
            <div className={styles.descOverlayText}>
              {character.gear.carryWeightCapacity ?? (10 + Math.floor((character.attr.migh + character.attr.endu) / 3))} = 10 + (might {character.attr.migh} + endur {character.attr.endu})/3
            </div>
          </div>
        </>
      )}
      {birthsignOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setBirthsignOverlay(null)} />
          <div
            className={styles.descOverlayPanel}
            style={{ bottom: birthsignOverlay.top, left: birthsignOverlay.left }}
          >
            <div className={styles.descOverlayText}>
              Your birth sign is permanent once chosen. It grants one charge per adventure — rare
              events like death and revival, or regaining a lost soul, may grant a second or third
              charge.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
