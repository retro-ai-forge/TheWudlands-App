export interface CharacterAttributes {
  // Physical
  str: number;
  kon: number;
  sta: number;
  dex: number;
  speed: number;
  // Mental
  pow: number;
  int: number;
  wis: number;
}

export interface CharacterData {
  id: number;
  name: string;
  race: string;
  profession: string;
  level: number;
  affiliation: string;
  attributes: CharacterAttributes;
  hp: { current: number; max: number };
  xp: { current: number; max: number };
  gold: number;
  inventory: string[];
  questLog: string[];
}

// Dummy roster until character generation is wired up to the backend/database.
const CHARACTERS: CharacterData[] = [
  {
    id: 1,
    name: "Aldric Thornvale",
    race: "Human",
    profession: "Paladin",
    level: 3,
    affiliation: "Order of the Lantern",
    attributes: { str: 14, kon: 13, sta: 13, dex: 10, speed: 9, pow: 12, int: 9, wis: 13 },
    hp: { current: 18, max: 24 },
    xp: { current: 420, max: 600 },
    gold: 87,
    inventory: ["Iron Sword", "Travel Cloak", "Healing Herb x2"],
    questLog: [
      "Clear the Goblin Cave",
      "Recover the Watchtower Sigil",
      "Speak with the Forest Hermit",
    ],
  },
  {
    id: 2,
    name: "Sylvaine Windwhisper",
    race: "Elf",
    profession: "Ranger",
    level: 4,
    affiliation: "Wardens of the Greenway",
    attributes: { str: 11, kon: 12, sta: 12, dex: 17, speed: 16, pow: 10, int: 13, wis: 14 },
    hp: { current: 22, max: 26 },
    xp: { current: 810, max: 900 },
    gold: 54,
    inventory: ["Longbow", "Quiver of Arrows x18", "Traveler's Rations"],
    questLog: [
      "Track the Wounded Stag",
      "Deliver the Sealed Letter",
      "Scout the Northern Treeline",
    ],
  },
  {
    id: 3,
    name: "Borgin Ashenhammer",
    race: "Dwarf",
    profession: "Blacksmith",
    level: 2,
    affiliation: "Ironhold Guild",
    attributes: { str: 17, kon: 18, sta: 18, dex: 8, speed: 7, pow: 9, int: 10, wis: 8 },
    hp: { current: 26, max: 30 },
    xp: { current: 180, max: 400 },
    gold: 132,
    inventory: ["War Hammer", "Smithing Tongs", "Ingot of Iron x3"],
    questLog: [
      "Forge the Guildmaster's Blade",
      "Collect Ore from the Deep Vein",
      "Repair the Village Gate",
    ],
  },
  {
    id: 4,
    name: "Kessa Duskmire",
    race: "Tiefling",
    profession: "Rogue",
    level: 3,
    affiliation: "The Quiet Hand",
    attributes: { str: 9, kon: 11, sta: 11, dex: 16, speed: 15, pow: 10, int: 12, wis: 10 },
    hp: { current: 16, max: 22 },
    xp: { current: 505, max: 600 },
    gold: 210,
    inventory: ["Twin Daggers", "Lockpicks", "Smoke Vial x2"],
    questLog: [
      "Steal the Merchant's Ledger",
      "Vanish Before the City Watch Arrives",
      "Meet the Fence at Midnight",
    ],
  },
  {
    id: 5,
    name: "Orrun Blackscale",
    race: "Dragonborn",
    profession: "Warrior",
    level: 5,
    affiliation: "Legion of the Broken Crown",
    attributes: { str: 18, kon: 17, sta: 16, dex: 11, speed: 10, pow: 15, int: 8, wis: 9 },
    hp: { current: 30, max: 34 },
    xp: { current: 1120, max: 1500 },
    gold: 63,
    inventory: ["Greatsword", "Scaled Plate", "Ration Pack"],
    questLog: [
      "Defend the Bridge at Ashford",
      "Answer the Legion's Call to Arms",
      "Recover the Broken Crown's Standard",
    ],
  },
  {
    id: 6,
    name: "Meribeth Hollowbrook",
    race: "Human",
    profession: "Scholar",
    level: 1,
    affiliation: "Lantern Keep Archives",
    attributes: { str: 8, kon: 9, sta: 9, dex: 10, speed: 9, pow: 11, int: 17, wis: 15 },
    hp: { current: 10, max: 14 },
    xp: { current: 40, max: 200 },
    gold: 26,
    inventory: ["Worn Tome", "Quill and Ink", "Traveler's Lantern"],
    questLog: [
      "Catalogue the Lost Scrolls",
      "Translate the Old Wudlands Runes",
      "Report Findings to the Archivist",
    ],
  },
];

export function loadCharacter(id: number): CharacterData {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}
