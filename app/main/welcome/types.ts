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
  stats: { adventureFinished: number; adventureRunAway: number };
  pcStatus?: string[];
  pcTags?: string[];
  pcTimers?: Record<string, string>;
}
