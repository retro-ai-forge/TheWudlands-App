/**
 * Shared character types for the welcome page and the character preview tabs.
 *
 * Two shapes of a character exist on the client:
 * - SlotCharacterPreview: the lightweight summary from the player_characters
 *   collection - enough to draw the soul slot grid.
 * - SlotCharacterSummary: the full record from the characters collection (via
 *   /me/characters/{id}/full) - what CharacterPreview and its tabs work with.
 */

import type { PortraitArea } from "@/app/lib/portraitCrop";

export interface CharacterAvailability {
  name: string;
  timeRdy: string;
  /** Player-toggled - whether this character is currently out on an adventure, away from the shared vault. See InAdventureToggle.tsx. */
  inAdventure: boolean;
  /** Whether this character is currently resting at a rest stop during an adventure. */
  resting?: boolean;
  /** The type of rest location (cave, forest, prairie, ruin, dungeon). */
  restLocation?: string | null;
  /**
   * The running adventure this character is in, or null. The DB is the source of
   * truth for a running adventure - open it through this pointer on mount, never
   * from React/localStorage state. Every party member of the same run carries the
   * same sessionId, which is how characters are grouped by adventure.
   */
  adventure?: AdventurePointer | null;
}

/** A character's back-pointer to its running adventure (backend.adventures). */
export interface AdventurePointer {
  sessionId: string;
  storyId: string;
  title: string;
}

/** Lightweight preview from player_characters — enough to render the soul slot grid. */
export interface SlotCharacterPreview {
  characterId: string;
  name: string;
  slotNumber: number;
  status: string[];
  tags: string[];
  timers: Record<string, string>;
  availability: {
    inAdventure: boolean;
    resting?: boolean;
    restLocation?: string | null;
    adventure?: AdventurePointer | null;
  };
  portraitUrl: string;
  portraitFaceArea: PortraitArea | null;
  portraitFrameArea: PortraitArea | null;
  activeCraft: { familyId: string; tier: number; count: number; readyAt: string } | null;
}

export interface CharacterClasses {
  class1: string;
  lvl1: number;
  class2: string;
  lvl2: number;
}

export interface CharacterProfessions {
  prof1: string;
  lvl1: number;
  exp1: number;
  prof2: string;
  lvl2: number;
  exp2: number;
  prof3: string;
  lvl3: number;
  exp3: number;
  /** Which slot ("prof1"|"prof2"|"prof3"|"none") is the prime profession - the sole slot that receives final-item assembly-bonus XP on finishing a blueprint-gated item. */
  prime: string;
}

export interface CharacterAttributes {
  migh: number;
  agil: number;
  endu: number;
  prec: number;
  will: number;
  insi: number;
  lore: number;
  pres: number;
}

// One individually-tracked crafted item (a needsItemDefinition:true
// family - weapons, armor, shields, and the rest) - unlike a flat balance,
// each physical one a player/character owns is its own instance with its
// own quality.
export type ItemInstance = {
  instanceId: string;
  itemId: string;
  familyId: string;
  quality: number | null;
  /** "pool" | "backpack" | "body" | "soul" | "crafting" | "home" | "saddlepack" | "cart" - "crafting" means it's currently borrowed for an in-progress craft (see Character.activeCraft.borrowedInstances) and will return to wherever it came from once the craft finishes; "home"/"saddlepack"/"cart" mean it's still this character's own, uncapped, not counted against backpack capacity. */
  location: string;
  slotRef: string[];
  createdAt: string;
  quantity?: number;
};

/**
 * The character (if any) already living in a given soul slot. Carries the
 * full character record (stats, professions, portrait crops, inventory) -
 * not just enough to render the slot thumbnail - since this is also what
 * gets handed to CharacterPreview's full character sheet.
 */
export interface SlotCharacterSummary {
  id: string;
  slotNumber: number;
  firstName: string;
  lastName: string;
  vitalStatus: string;
  age_month: number;
  gender: string;
  raceGroup: string;
  race: string;
  birthsign: string;
  portraitUrl: string;
  portraitZoom: number;
  portraitPan: { x: number; y: number };
  /** Full-body crop, for equipment-slot rendering; null pre-dates the feature. */
  portraitFrameArea: PortraitArea | null;
  /** Face-only crop framed during creation; null falls back to a plain cover-fit image. */
  portraitFaceArea: PortraitArea | null;
  availability: CharacterAvailability;
  classes: CharacterClasses;
  profession: CharacterProfessions;
  attr: CharacterAttributes;
  /** Temporary crafting-session staging area - populated by start_craft, drained by finish_craft. */
  crafting: {
    /** Non-instance crafted items staged as a consumed "final" ingredient - concrete item id -> quantity. */
    itemBalances: Record<string, number>;
    /** In-progress craft, if any - one job at a time. Resolved lazily against readyAt, not a live server countdown. */
    activeCraft: {
      familyId: string;
      tier: number;
      count: number;
      readyAt: string;
      /** Instance-tracked tools (e.g. axe_stone) currently borrowed for this craft - each moved to location:"crafting" for the duration and returned to `source` once it finishes. */
      borrowedInstances?: { instanceId: string; source: string; slotRef: string[] }[];
    } | null;
  };
  /** Foraging trip state (see backend/foraging.py) - absent until the first trip. */
  foraging?: {
    activeForage: ActiveForage | null;
    lastResult: ForageResult | null;
  };
  /** Blueprint ids this character has learned - soulbound, never moves. */
  blueprints: string[];
  /** This character's personal vault (items + itemBalances). */
  vault: {
    itemBalances: Record<string, number>;
    items: ItemInstance[];
  };
  /** Everything this character actually owns/carries for adventuring. */
  gear: {
    /** Item instances this character holds - backpacked or equipped (see location/slotRef). */
    items: ItemInstance[];
    /** All stackable items this character owns, split by physical carry location (home injected from character_homes collection). */
    itemBalances: { home: Record<string, number>; camp: Record<string, number>; backpack: Record<string, number>; saddlepack: Record<string, number>; cart: Record<string, number> };
    /** Computed server-side (backend.items_catalog.backpack_slots_used/backpack_capacity) - total backpack slots currently occupied and the character's own ceiling (0 with nothing equipped). Powers a backpack-family item's own "Filled: X/Y" line - character-level, not tied to which specific backpack instance's popup is open. */
    backpackSlotsUsed: number;
    backpackCapacity: number;
    saddlepackSlotsUsed: number;
    saddlepackCapacity: number;
    cartSlotsUsed: number;
    cartCapacity: number;
    carryWeightUsed: number;
    carryWeightCapacity: number;
    bodyGearWeight: number;
    encumbranceState: "normal" | "encumbered" | "immobile";
    mountCarryWeightUsed: number;
    mountCarryWeightCapacity: number;
    mountGearWeight: number;
  };
  equippedLight: { family: string; tier: number; litAt: string; hand: string } | null;
  /** storyIds of every adventure this character finished (not ran away from). */
  completedStories?: string[];
  /** Current attribute values: attr (the maximum) minus temporary losses. */
  attrNow?: CharacterAttributes;
  /** Temporary points lost per attribute, e.g. { endu: 2 } - one heals per 20h free. */
  attrLost?: Partial<Record<keyof CharacterAttributes, number>>;
  /** When the next point heals (ISO), or null: nothing to heal, a drained group, or out foraging/crafting/adventuring. */
  nextHealAt?: string | null;
  stats: { adventureFinished: number; adventureRunAway: number };
  pcStatus?: string[];
  pcTags?: string[];
  pcTimers?: Record<string, string>;
}

/** One foraging mission (backend/data/foraging-missions.json). */
export type ForageMission = {
  id: string;
  /** Profession group, e.g. "Rural". */
  group: string;
  /** The group's headline, e.g. "Fields, Folds & Fishponds". */
  headline: string;
  /** The group's foraging name for this family, e.g. "Fishing". */
  activity: string;
  familyId: string;
  /** The mission's own headline, e.g. "Trout Pools Upstream". */
  name: string;
  /** Where it happens, phrased to sit mid-sentence, e.g. "the trout pools upstream". */
  place: string;
  text: string;
};

/** One piece of gathering gear and the bonus it gives (percent). */
export type ForageGearPiece = {
  instanceId: string | null;
  itemId: string;
  familyId: string;
  name: string;
  quality: number | null;
  tier: number;
  percent: number;
};

/** The gathering gear a trip uses: one weapon at most, every matching item. */
export type ForageGear = {
  weapon: ForageGearPiece | null;
  items: ForageGearPiece[];
  percent: number;
  /** Weapons carried that don't count yet, e.g. a bow without quiver/arrows. */
  blockedWeapons?: { name: string; missing: string[] }[];
  /** Lights carried that don't count, e.g. a torch without a tinderbox or a lantern without oil. */
  blockedLights?: { name: string; missing: string[] }[];
  /** Items that would help but don't count, e.g. a flying charm on a rat (needs: winged companion). */
  blockedItems?: { name: string; missing: string[] }[];
};

/** A trip in progress - resolved lazily against readyAt. */
export type ActiveForage = ForageMission & {
  missionId: string;
  slotNumber: number;
  startedAt: string;
  readyAt: string;
  gear?: ForageGear;
};

/** What a collected trip brought home. */
export type ForageOldGear = {
  instanceId: string;
  itemId: string;
  familyId: string;
  name: string;
  tier: number;
  icon: string;
  description?: string;
  quality: number;
  /** Full quality at this tier. */
  qualityMax: number;
};

export type ForageResult = {
  missionId: string;
  name: string;
  place: string;
  activity: string;
  familyId: string;
  /** Concrete resource id (e.g. "ore_1") -> amount, dropped into the character's home storage. */
  found: Record<string, number>;
  total: number;
  exhausted: boolean;
  outcome: "rich" | "thin" | "depleted";
  message: string;
  returnedAt: string;
  /** Gathering-gear bonus that applied, in percent. */
  gearPercent?: number;
  /** Gear used and how much quality it lost. */
  gear?: { instanceId: string | null; name: string; kind: "weapon" | "item"; wear: number; destroyed: boolean }[];
  /** Names of gear destroyed on this trip (quality reached 0). */
  broken?: string[];
  /** Arrows/bolts shot (item id -> amount) - one per unit found with a bow/crossbow. */
  ammoUsed?: Record<string, number>;
  /** Finds no arrow/bolt could cover (none left, or none of a high enough tier) - the weapon wears for those at or above its tier. */
  ammoShortfall?: number;
  /** What the trip's light burned (item id -> amount): one oil for a lantern, one torch or candle. */
  lightUsed?: Record<string, number>;
  /** Rare extra raw materials found on the way (item id -> amount) - a bonus outside the pool, also taken home. */
  surprise?: Record<string, number>;
  /** The sentence for the surprise finds, or null when there were none. */
  surpriseMessage?: string | null;
  /** A forgotten, damaged T1 piece of gathering gear found on the way (sent home), or null. */
  oldGear?: ForageOldGear | null;
  /** The sentence for the old gear, or null when none was found. */
  oldGearMessage?: string | null;
  /** The night out: weather, tent/bedroll carried, and the temporary Body/Soul points it cost. */
  night?: {
    /** foraging-rules.json "nights.weather" id, e.g. "warm", "rain", "sandstorm". */
    weather: string;
    shelter: string[];
    kind: "both" | "body" | "soul" | "sheltered" | "calm";
    message: string;
    /** Points actually lost when the trip was collected (attr key -> amount). */
    lost?: Record<string, number>;
    /** Name of the tent the night destroyed (also listed in `broken`). */
    tentLost?: string;
    /** "dead" / "soulless" if the night drained Body / Soul completely. */
    vitalStatus?: string | null;
  };
};

/** GET /api/auth/me/characters/{id}/foraging */
export type ForagingState = {
  characterId: string;
  slotNumber: number;
  hasPool: boolean;
  /** Trip length - 20h by default (FORAGING_DURATION_MINUTES can shorten it for local testing). */
  durationMinutes: number;
  groups: { group: string; headline: string; activities: Record<string, string> }[];
  /** One per family still worth a trip - picked-clean families are left out. */
  sites: {
    familyId: string;
    initial: number;
    remaining: number;
    count: number;
    /** Expected finds, including the gear bonus the character has right now. */
    yieldMin: number;
    yieldMax: number;
    gear: ForageGear;
    /** Weapon / item families that would help on this site. */
    helpfulWeapons: string[];
    helpfulItems: string[];
    mission: ForageMission | null;
  }[];
  dormantFamilies: string[];
  activeForage: ActiveForage | null;
  lastResult: ForageResult | null;
};
