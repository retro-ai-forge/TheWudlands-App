// Age display scaling by race — a character's canonical age is always
// tracked in human-equivalent MONTHS (see SoulCreation's `char_age`), never
// years, so scaling stays precise. Longer-lived races just display an
// older-looking number in years for the same underlying maturity, e.g. a
// 28-year-old (336-month, human-equivalent) elf displays as ~233.
//
// multiplier = race's typical max lifespan / human's typical max lifespan.
// Lifespans are typical D&D 5e reference figures (Player's Handbook, Volo's
// Guide to Monsters, Mordenkainen's/Monsters of the Multiverse); races not
// covered by official lifespan tables (Beastfolk, Elder, Ogre, Giant) use an
// in-world estimate consistent with their lore description in RACES.

const HUMAN_LIFESPAN_YEARS = 90;

export const RACE_LIFESPAN_YEARS: Record<string, number> = {
  human: 90,
  elf: 750,
  dwarf: 350,
  halfling: 70,
  orc: 50,
  gnome: 425,
  goblin: 60,
  minotaur: 100,
  tiefling: 100,
  dragonborn: 80,
  lizardfolk: 60,
  beastfolk: 70, // no official 5e lifespan; estimated in line with feral, short-lived lore
  halfelf: 180,
  halforc: 75,
  elder: 1000, // custom lore race — "immortal blood runs thin, but runs deep"
  ogre: 70, // no official 5e lifespan; brutish/short-lived per RACES description
  goliath: 100,
  giant: 300, // no official 5e lifespan; "towering and ancient" per RACES description
};

export const AGE_SCALE_BY_RACE: Record<string, number> = Object.fromEntries(
  Object.entries(RACE_LIFESPAN_YEARS).map(([id, lifespan]) => [
    id,
    Math.round((lifespan / HUMAN_LIFESPAN_YEARS) * 100) / 100,
  ])
);

// `humanAgeMonths` is the canonical, human-equivalent age in months. Returns
// the age in full years (always rounded down), scaled to the given race, for
// display purposes only — never store this value back into the canonical
// months figure.
export function getDisplayedAge(humanAgeMonths: number, raceId: string): number {
  const multiplier = AGE_SCALE_BY_RACE[raceId] ?? 1;
  return Math.floor((humanAgeMonths * multiplier) / 12);
}

// Life Energy bulb fill — younger souls run hotter, older souls run lower.
// Linear between the two extremes; ages outside 23–58 clamp to the nearest end.
const LIFE_ENERGY_MAX_FILL = 100; // at the youngest end, age 23 (276 months)
const LIFE_ENERGY_MIN_FILL = 5; // at the oldest end, age 58 (696 months)
const LIFE_ENERGY_MIN_AGE_MONTHS = 23 * 12;
const LIFE_ENERGY_MAX_AGE_MONTHS = 58 * 12;

export function getLifeEnergyFill(humanAgeMonths: number): number {
  const t =
    (humanAgeMonths - LIFE_ENERGY_MIN_AGE_MONTHS) /
    (LIFE_ENERGY_MAX_AGE_MONTHS - LIFE_ENERGY_MIN_AGE_MONTHS);
  const clampedT = Math.max(0, Math.min(1, t));
  return LIFE_ENERGY_MAX_FILL + clampedT * (LIFE_ENERGY_MIN_FILL - LIFE_ENERGY_MAX_FILL);
}
