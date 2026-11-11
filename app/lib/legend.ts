// Your Legend: the character's reputation values (backend/legend.py), stored
// on the character as legend: {name: 0-100}. In stories each name is the
// variable $meta_<name>. Except for fame/infamy a pair is one scale, so only
// one side of it is ever above 0.

/** [first, second] per pair, the same order as backend LEGEND_PAIRS. */
export const LEGEND_PAIRS: [string, string][] = [
  ["fame", "infamy"],
  ["renown", "obscurity"],
  ["faith", "heresy"],
  ["honor", "shame"],
  ["loyalty", "treachery"],
  ["mercy", "cruelty"],
  ["courage", "cowardice"],
  ["favour", "disgrace"],
  ["purity", "corruption"],
  ["wildkin", "despoiler"],
];

/** Level names by their lowest value, highest first. */
export const LEGEND_LEVELS: { min: number; max: number; name: string }[] = [
  { min: 90, max: 100, name: "legendary" },
  { min: 60, max: 89, name: "renowned" },
  { min: 30, max: 59, name: "known" },
  { min: 10, max: 29, name: "whispered" },
  { min: 0, max: 9, name: "none" },
];

export function legendLevel(value: number): string {
  return (LEGEND_LEVELS.find((l) => value >= l.min) ?? LEGEND_LEVELS[LEGEND_LEVELS.length - 1]).name;
}

/** The side of a pair to show: the higher one (the first on a tie). */
export function legendSide(legend: Record<string, number> | undefined, [a, b]: [string, string]): { name: string; value: number } {
  const va = legend?.[a] ?? 0;
  const vb = legend?.[b] ?? 0;
  return vb > va ? { name: b, value: vb } : { name: a, value: va };
}
