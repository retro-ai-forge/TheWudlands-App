// Mirror of backend/character_names.py - the rules for a character's first
// name and surname (backend/data/character-name-rules.json): Latin letters
// (with accents and umlauts, plus extraLetters) and one space, hyphen or
// apostrophe between two letters; at most two accents, one hyphen and one
// apostrophe in the whole name, and no reserved word (SugarCube commands,
// staff words). The backend is the authority; this lets the creation form
// explain a problem before the character is saved.
import rules from "../../backend/data/character-name-rules.json";

export const NAME_MAX_LENGTH: number = rules.maxLength;

const EXTRA_LETTERS = new Set<string>([...rules.extraLetters]);
const MAX_ACCENTS: number = rules.maxAccentsInFullName;
const SEPARATORS = new Set<string>(rules.separators);
const REPLACE: [string, string][] = Object.entries(rules.replace);
const MAX_IN_FULL_NAME: [string, number][] = Object.entries(rules.maxInFullName);
const RESERVED_WORDS: string[] = [...rules.reservedWords.commands, ...rules.reservedWords.staff].map((w) =>
  w.toLowerCase()
);
const RESERVED_ANYWHERE: string[] = rules.reservedAnywhere.map((w) => w.toLowerCase());

const SEPARATOR_WORDS: Record<string, string> = { " ": "space", "-": "hyphen", "'": "apostrophe" };
const NUMBER_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three" };

const count = (limit: number, word: string) => `${NUMBER_WORDS[limit] ?? String(limit)} ${word}${limit === 1 ? "" : "s"}`;

function separatorPhrase(): string {
  const words: string[] = [];
  for (const separator of rules.separators) {
    const word = SEPARATOR_WORDS[separator] ?? JSON.stringify(separator);
    if (!words.includes(word)) words.push(word);
  }
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** NFKC (wide or bold letter styles become plain letters), curly apostrophes
 * made plain, trimmed, runs of spaces collapsed - the stored form. */
export function normalizeName(value: string): string {
  let text = value.normalize("NFKC");
  for (const [from, to] of REPLACE) text = text.split(from).join(to);
  return text.split(" ").filter(Boolean).join(" ");
}

const isLetter = (ch: string) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || EXTRA_LETTERS.has(ch);
// Accents: the combining diacritical marks block, minus the invisible
// combining grapheme joiner U+034F.
const isMark = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x300 && code < 0x370 && code !== 0x34f;
};

/** null for Latin letters with at most MAX_ACCENTS accents in all, each on a
 * letter, and a separator only between two letters. */
function shapeProblem(name: string, separators: Set<string>): "letters" | "accents" | null {
  let previous: "letter" | "separator" | null = null;
  let accents = 0;
  for (const ch of name.normalize("NFD")) {
    if (isLetter(ch)) previous = "letter";
    else if (isMark(ch)) {
      if (previous !== "letter") return "letters";
      accents += 1;
      if (accents > MAX_ACCENTS) return "accents";
    } else if (separators.has(ch)) {
      if (previous !== "letter") return "letters";
      previous = "separator";
    } else return "letters";
  }
  return previous === "letter" ? null : "letters";
}

/** The first sign `text` holds more often than maxInFullName allows ("one hyphen"), or null. */
function tooMany(text: string): string | null {
  for (const [sign, limit] of MAX_IN_FULL_NAME) {
    if (text.split(sign).length - 1 > limit) return count(limit, SEPARATOR_WORDS[sign] ?? JSON.stringify(sign));
  }
  return null;
}

/** The reserved word or phrase `text` holds - as whole words, or spelled by
 * the whole text once its separators are removed - or null. */
function reserved(text: string): string | null {
  let lowered = text.toLowerCase();
  for (const separator of SEPARATORS) lowered = lowered.split(separator).join(" ");
  const words = lowered.split(" ").filter(Boolean);
  const squashed = words.join("");
  for (const entry of RESERVED_WORDS) {
    const parts = entry.split(" ").filter(Boolean);
    if (squashed === parts.join("")) return entry;
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((part, j) => words[i + j] === part)) return entry;
    }
  }
  return RESERVED_ANYWHERE.find((entry) => squashed.includes(entry)) ?? null;
}

function problem(text: string, label: string, separators: Set<string> = SEPARATORS): string | null {
  const shape = shapeProblem(text, separators);
  if (shape === "letters") return `${label} can only use Latin letters, with a single ${separatorPhrase()} between letters`;
  if (shape === "accents") return `${label} can have at most ${count(MAX_ACCENTS, "accent")}`;
  const excess = tooMany(text);
  if (excess) return `${label} can have at most ${excess}`;
  const word = reserved(text);
  if (word) return `${label} can't use the reserved word "${word}"`;
  return null;
}

/** Why `value` can't be used as a name, or null when it can. `label` names the field. */
export function nameProblem(value: string, label: string): string | null {
  const name = normalizeName(value);
  if (!name) return `${label} is required`;
  if ([...name].length > NAME_MAX_LENGTH) return `${label} can be at most ${NAME_MAX_LENGTH} characters`;
  return problem(name, label);
}

/** Why the two names can't be used together as the text "first surname"
 * (the way they're shown), or null - after each has passed on its own. */
export function fullNameProblem(first: string, last: string): string | null {
  const own = nameProblem(first, "First name") ?? nameProblem(last, "Surname");
  if (own) return own;
  return problem(
    `${normalizeName(first)} ${normalizeName(last)}`,
    "First name and surname together",
    new Set([...SEPARATORS, " "])
  );
}
