// Every item a story can check with $lead.equipment.includes("rope"), for the
// tutorial's item list. Built when the page is built, from the game's own item
// data: the same files the submit check reads (backend/items_catalog.py
// _FINAL_CATALOG_FILES, plus the families' kinds), so the list never shows an
// item the check refuses or misses a new one. tests/test_tutorial_item_list.py
// keeps the two lists of files equal and gives every kind a heading here.
import families from "@/backend/data/item-inventory-properties.json";
import tools from "@/backend/data/base-tools.json";
import resources from "@/backend/data/base-resources.json";
import processed from "@/backend/data/base-processed.json";
import armor from "@/backend/data/base-items-armor.json";
import shields from "@/backend/data/base-items-shield.json";
import weapons from "@/backend/data/base-items-weapon.json";
import food from "@/backend/data/base-items-food.json";
import potions from "@/backend/data/base-items-potion.json";
import adventuringGear from "@/backend/data/base-items-adventuring-gear.json";
import essentials from "@/backend/data/base-items-essentials.json";
import companions from "@/backend/data/base-items-companion.json";
import mounts from "@/backend/data/base-items-mount.json";

type ItemRow = { familyId: string; tier: number; name: string };
type FamilyRow = { familyId: string; kind?: string[] };

const ITEM_FILES = [
  tools, resources, processed, armor, shields, weapons, food, potions,
  adventuringGear, essentials, companions, mounts,
] as unknown as ItemRow[][];

/** Headings in page order, by the family's first kind. */
const KIND_HEADINGS: [string, string][] = [
  ["weapon", "Weapons and ammunition"],
  ["shield", "Shields"],
  ["armor", "Armor and cloaks"],
  ["adventuring_gear", "Adventuring gear"],
  ["essentials", "Essentials"],
  ["mount", "Mounts and riding gear"],
  ["companion", "Companions and charms"],
  ["food", "Food"],
  ["potion", "Potions"],
  ["tool", "Crafting stations"],
  ["raw_resource", "Raw materials"],
  ["processed", "Processed materials"],
];

export type StoryItem = { familyId: string; tierOneName: string };
export type StoryItemGroup = { kind: string; heading: string; items: StoryItem[] };

/** The items by kind, each family once with its tier-1 name, sorted by id. */
export function storyItemGroups(): StoryItemGroup[] {
  const tierOneName = new Map<string, string>();
  for (const rows of ITEM_FILES) {
    for (const row of rows) {
      if (row.tier === 1) tierOneName.set(row.familyId, row.name);
    }
  }
  const byKind = new Map<string, StoryItem[]>();
  for (const family of families as unknown as FamilyRow[]) {
    const name = tierOneName.get(family.familyId);
    // A family without tiered items isn't an item yet; the check refuses it too.
    if (name === undefined) continue;
    const kind = family.kind?.[0] ?? "other";
    const items = byKind.get(kind) ?? [];
    items.push({ familyId: family.familyId, tierOneName: name });
    byKind.set(kind, items);
  }
  const headings = new Map(KIND_HEADINGS);
  const order = [
    ...KIND_HEADINGS.map(([kind]) => kind),
    // A kind added to the data later still shows, under its own name.
    ...[...byKind.keys()].filter((kind) => !headings.has(kind)).sort(),
  ];
  return order
    .filter((kind) => byKind.has(kind))
    .map((kind) => ({
      kind,
      heading: headings.get(kind) ?? kind.replace(/_/g, " "),
      items: byKind.get(kind)!.sort((a, b) => a.familyId.localeCompare(b.familyId)),
    }));
}
