"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";

// A story stays open for 7 days from its last submission. Resubmitting a story
// refreshes submittedAt on the backend, which restarts this countdown. Once it
// runs out the story is "pending": the backend refuses further resubmissions
// until it has been reviewed (see _REVIEW_WINDOW in backend/auth_routes.py,
// which must match this value).
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_COLOR = "#4aa85c";

interface ReviewMetadata {
  meta_title?: string;
  meta_description?: string;
  meta_author?: string;
  meta_maxCharNum?: number;
  meta_adventureTier?: number;
  meta_durationWeeks?: number;
}

interface ReviewEntry {
  storyId: string;
  name?: string;
  lastUpdate?: string;
  submittedAt?: string;
  status?: string;
  address: string;
  metadata?: ReviewMetadata;
  sceneCount?: number;
  tags?: string[];
}

/** One line of the public rejected list (twine_rejected - minimal fields only). */
interface RejectedEntry {
  address: string;
  storyId: string;
  title: string;
  author?: string | null;
  tier?: number | null;
  sceneCount?: number | null;
  reason: string;
  rejectedAt: string;
}

const gold = "#7a6a3a";
const parchment = "#d4c9a8";
const mono = "'Courier New', Courier, monospace";

function shortAddress(a: string): string {
  if (!a) return "—";
  return a.length <= 10 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function pad2(n: number): string {
  // Pad with a non-breaking space (not "0") so widths line up without a
  // visible leading zero. nbsp isn't collapsed by HTML whitespace handling.
  return String(n).padStart(2, " ");
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "pending";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad2(d)}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
}

const cardStyle: React.CSSProperties = {
  border: `1px solid ${gold}`,
  background: "#141410",
  padding: "0.9rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
};
const cardTitle: React.CSSProperties = {
  fontFamily: mono,
  color: parchment,
  fontSize: "1.1rem",
  fontWeight: 700,
  wordBreak: "break-word",
};
const cardTimer: React.CSSProperties = {
  fontFamily: mono,
  fontSize: "1.1rem",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
};
const metaRow: React.CSSProperties = {
  display: "grid",
  gap: "0.35rem 0.9rem",
  fontFamily: mono,
  fontSize: "0.8rem",
};
// Tier / Weeks / Solo / Scenes: four short stats kept on a single line at every
// width, including below 400px, via four equal columns.
const statsRow: React.CSSProperties = {
  ...metaRow,
  gridTemplateColumns: "repeat(4, 1fr)",
};
// Author + Wallet sit side by side.
const pairRow: React.CSSProperties = {
  ...metaRow,
  gridTemplateColumns: "1fr 1fr",
};
// Wide screens (>600px): Author · Wallet · Tier · Weeks · Solo · Scenes on one
// line. Author and Wallet get extra width (pseudonyms / addresses are longer).
const authorStatsWide: React.CSSProperties = {
  ...metaRow,
  gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 1fr 1fr",
};
const metaLabel: React.CSSProperties = {
  color: gold,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontSize: "0.65rem",
  display: "block",
};
const metaValue: React.CSSProperties = {
  color: parchment,
  wordBreak: "break-word",
};
const descClamp = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
} as React.CSSProperties;
const descText: React.CSSProperties = {
  fontFamily: mono,
  color: parchment,
  fontSize: "0.85rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};
const moreBtn: React.CSSProperties = {
  marginTop: "0.3rem",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: mono,
  color: gold,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontSize: "0.7rem",
};
const tagList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
};
const tagChipBase: React.CSSProperties = {
  fontFamily: mono,
  fontSize: "0.7rem",
  border: "1px solid",
  borderRadius: "999px",
  // Fixed height + box-sizing so every chip is identical regardless of whether
  // its icon is a tall item image, a glyph, or nothing at all.
  height: "1.5rem",
  boxSizing: "border-box",
  lineHeight: 1,
  padding: "0 0.5rem",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

// Curated story-experience tags, each with a fixed colour and a small glyph
// that fits the Wudlands' dark-fantasy gamebook tone. Equipment-flavoured tags
// reuse the game's own item art (`img`); abstract genres use an emoji (`icon`);
// magic uses the 符 ("talisman/rune") glyph since we have no rune asset. Authors
// can tag a story with anything in Twine; tags outside this list still show, in
// a dull neutral colour (DULL_TAG) — only recognised ones get a colour + glyph.
const ITEM = (name: string) => `/images/items/${name}_t4.png`;
const SILVER = "#aab0ba"; // shared colour for the themeless "Free" tags
const PERIL = "#b8392f"; // shared red for all Combat & Peril tags
const LOVE = "#f179b2"; // shared light pink for romance / love / erotic
type TagMeta = { color: string; icon?: string; img?: string; desc: string; tint?: string };
// Colours are grouped by category (see TAG_CATEGORIES): each category is one
// hue in varying strengths, so a story's tags read as a palette. Combat is red,
// Magic violet, Guile teal, Journey green, Tone/Spoils gold — with romance an
// intentional pink exception, since "love" should read pink, not gold.
const TAG_META: Record<string, TagMeta> = {
  // Combat & Peril — all one red.
  gore: { color: PERIL, icon: "🩸", desc: "Graphic violence and viscera. Not for the squeamish." },
  combat: { color: PERIL, img: ITEM("sword"), desc: "Fights, duels and battles — blades drawn and blood spilled." },
  beast: { color: PERIL, img: ITEM("monster_part"), desc: "Monsters and wild creatures — the hunt, the lair, the maw." },
  lycan: { color: PERIL, icon: "🐺", desc: "Werewolves and shapeshifters — the beast within, cursed by the moon." },
  evil: { color: PERIL, icon: "😈", desc: "Villainy and malice — dark powers, cruelty and the foe's own schemes." },
  undead: { color: PERIL, img: ITEM("bone"), desc: "Skeletons, ghosts and the risen dead; graves that don't stay shut." },
  // Magic & the Uncanny — violets.
  magic: { color: "#a074e6", icon: "符", desc: "Spells, enchantment and the arcane; sorcerers, rituals and runes." },
  fate: { color: "#9163d6", icon: "🎲", desc: "Chance and destiny — dice, fortune and the turning of the wheel." },
  oracle: { color: "#8456c4", icon: "🔮", desc: "Visions and prophecy — seers, omens and glimpses of what comes." },
  horror: { color: "#7d52b5", icon: "💀", desc: "Dread and the supernatural — things that stalk the dark." },
  omen: { color: "#6a47a0", icon: "🌑", desc: "Dark portents — curses foretold and signs of ill fortune." },
  mystery: { color: "#5c3f8f", icon: "🔎", desc: "Secrets, clues and investigation; a whodunit to unravel." },
  // Guile, Wits & Reward — teals.
  treasure: { color: "#38bcb0", img: ITEM("crystal"), desc: "Loot, hoards and glittering reward — greed and its consequences." },
  puzzle: { color: "#30a79e", img: ITEM("lock_and_key"), desc: "Riddles, locks, traps and clever problem-solving over brute force." },
  trickster: { color: "#2a8e86", icon: "🃏", desc: "Cunning and mischief — cons, disguises and clever deceit." },
  armor: { color: "#26756e", img: ITEM("iron_chest_armor"), desc: "Armoured foes, sieges and holding the line — defence over daring." },
  stealth: { color: "#215f59", img: ITEM("dagger"), desc: "Sneaking and infiltration — shadows, silent blades and not being seen." },
  // Journey & Setting — greens.
  island: { color: "#46b56e", icon: "🌴", desc: "Tropics, jungles and far shores — palm, sand and distant isles." },
  adventure: { color: "#4aa85c", icon: "🧭", desc: "Grand journeys of danger and discovery across the land." },
  sea: { color: "#3f9e7c", icon: "🌊", desc: "Oceans, rivers and voyages — waves, ships and what swims beneath." },
  travel: { color: "#5f9a4c", img: ITEM("backpack"), desc: "Long roads and wilderness treks — the journey matters as much as the goal." },
  survival: { color: "#74a046", img: ITEM("tent"), desc: "Scarcity and the elements: shelter, hunger, cold and keeping alive." },
  ice: { color: "#74b89a", icon: "❄", tint: "#5aa6e0", desc: "Cold, frost and snow; frozen wastes and chilling peril." },
  mountain: { color: "#6f8c6f", icon: "⛰", desc: "Peaks, cliffs and high passes — thin air and long, hard climbs." },
  dungeon: { color: "#4f7e54", img: ITEM("torch"), desc: "Torch-lit crawls through crypts, caverns and the dark below." },
  relic: { color: "#5a8a5e", icon: "🏺", desc: "Ancient artefacts — lost relics of power and the ruins that hide them." },
  fire: { color: "#869740", icon: "🔥", desc: "Flame and ash — burning, pyromancy, scorched-earth peril." },
  cave: { color: "#3c6346", icon: "🕳", desc: "Caverns and tunnels — tight, dark spaces beneath the world." },
  // Tone — golds, plus the pink romance/love/erotic trio.
  comedy: { color: "#d8b23a", icon: "😄", desc: "Humour, wit and absurdity — a tale told with a grin." },
  court: { color: "#c6a23a", icon: "👑", desc: "Courtly intrigue — nobles, politics, scheming and the throne." },
  bard: { color: "#b89a48", icon: "🎵", desc: "Song and story — minstrels, legends and a tale well told." },
  tragedy: { color: "#9c8a5e", icon: "🥀", desc: "Loss, doom and sorrow; endings that are meant to hurt." },
  romance: { color: LOVE, icon: "❤", tint: "#ef5a93", desc: "Courtship and attraction; a budding romance, matters of the heart." },
  love: { color: LOVE, icon: "❤❤", tint: "#ef5a93", desc: "Deep affection and devotion — love that drives the whole tale." },
  erotic: { color: LOVE, icon: "❤❤❤", tint: "#ef5a93", desc: "Explicit intimacy and desire. Adult content — mature readers only." },
  vampire: { color: "#b03a5e", icon: "🧛", desc: "Vampires and blood nobility — seduction, hunger and the long night." },
  // Free — the lone catch-all, silver grey.
  other: { color: SILVER, icon: "✶", desc: "Any you wish — a catch-all for a theme no other tag captures." },
};
const DULL_TAG = "#817a66";

function tagVisual(tag: string): { color: string; icon?: string; img?: string; tint?: string } {
  const key = tag.trim().toLowerCase();
  const meta = TAG_META[key];
  // Every predefined tag has a generated icon at /icons/tag-<name>.png; use it
  // in place of the emoji/item-art glyph (the colour is still used for borders).
  return meta ? { ...meta, img: `/icons/tag-${key}.png`, icon: undefined } : { color: DULL_TAG };
}

// Request text (monochrome) presentation by appending the VS15 selector after
// each symbol code point, so a CSS `color` actually takes effect instead of the
// platform's default colour-emoji rendering. Glyphs without a text form just
// stay as colour emoji (hence "try to colour"); CJK/ASCII are unaffected.
function textGlyph(icon: string): string {
  return Array.from(icon)
    .map((ch) => (ch.codePointAt(0)! >= 0x2000 ? ch + "︎" : ch))
    .join("");
}

function TagChip({
  tag,
  block,
  labelled,
  large,
}: {
  tag: string;
  block?: boolean;
  labelled?: boolean;
  large?: boolean;
}) {
  const { color, icon, img, tint } = tagVisual(tag);
  const hasGlyph = !!(img || icon);
  // On the review table a predefined tag shows only its icon; the name is shown
  // in the legend (labelled) or when the tag is unknown and has no icon.
  const showText = labelled || !hasGlyph;
  const glyph = img ? (
    <img
      src={img}
      alt=""
      draggable={false}
      style={{ height: large ? "2.6em" : "1.4em", width: "auto", objectFit: "contain" }}
    />
  ) : icon ? (
    <span aria-hidden style={{ color: tint ?? color, ...(large ? { fontSize: "1.3em" } : {}) }}>
      {textGlyph(icon)}
    </span>
  ) : null;
  return (
    <span
      title={tag}
      style={{
        ...tagChipBase,
        color,
        border: labelled ? "none" : tagChipBase.border,
        borderColor: color,
        background: "transparent",
        padding: labelled ? 0 : tagChipBase.padding,
        // Labelled (legend) chips drop the fixed height so the larger icon fits.
        height: labelled ? "auto" : tagChipBase.height,
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        alignItems: "center",
        // Legend: icon in a fixed centred slot (so icons line up in a column,
        // multi-glyphs stay centred), then the neutral name — border wraps both.
        justifyContent: labelled ? "flex-start" : "center",
        gap: labelled ? "0.5em" : hasGlyph && showText ? "0.3em" : 0,
      }}
    >
      {labelled ? (
        <>
          <span
            style={{ width: "2.8em", flexShrink: 0, display: "inline-flex", justifyContent: "center" }}
          >
            {glyph}
          </span>
          <span style={{ color: parchment }}>{tag}</span>
        </>
      ) : (
        <>
          {glyph}
          {showText && <span>{tag}</span>}
        </>
      )}
    </span>
  );
}

// Plain tag row for the review table: just the icons (predefined tags) or the
// name (unknown tags). No colour, no chip — the legend carries the meaning.
function TagIcons({ tags }: { tags: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.45rem",
        fontSize: "1rem",
      }}
    >
      {orderTags(tags).map((t) => {
        const { color, icon, img, tint } = tagVisual(t);
        if (img) {
          return (
            <img
              key={t}
              src={img}
              alt={t}
              title={t}
              draggable={false}
              style={{ height: "1.9em", width: "auto", objectFit: "contain" }}
            />
          );
        }
        if (icon) {
          return (
            <span key={t} title={t} style={{ color: tint ?? color }}>
              {textGlyph(icon)}
            </span>
          );
        }
        return (
          <span
            key={t}
            style={{
              fontFamily: mono,
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: DULL_TAG,
            }}
          >
            {t}
          </span>
        );
      })}
    </div>
  );
}

// Legend grouping — organises the flat TAG_META into themed sections so the
// guide reads in a sensible order rather than as one long list.
const TAG_CATEGORIES: { title: string; tags: string[] }[] = [
  { title: "Combat & Peril", tags: ["gore", "combat", "beast", "lycan", "evil", "undead"] },
  { title: "Magic & the Uncanny", tags: ["magic", "fate", "oracle", "horror", "omen", "mystery"] },
  { title: "Guile, Wits & Reward", tags: ["treasure", "puzzle", "trickster", "armor", "stealth"] },
  {
    title: "Journey & Setting",
    tags: ["adventure", "travel", "survival", "dungeon", "relic", "sea", "mountain", "cave", "island", "fire", "ice"],
  },
  { title: "Tone", tags: ["comedy", "court", "bard", "tragedy", "romance", "love", "erotic", "vampire"] },
  { title: "Free", tags: ["other"] },
];

// "Free" tags — the catch-all `other` plus any custom tag not in TAG_META —
// always sort to the end of a story's tag list, after the categorised ones.
const FREE_TAGS = new Set(TAG_CATEGORIES.find((c) => c.title === "Free")!.tags);
function isFreeTag(tag: string): boolean {
  const key = tag.trim().toLowerCase();
  return FREE_TAGS.has(key) || !TAG_META[key];
}
function orderTags(tags: string[]): string[] {
  return [...tags.filter((t) => !isFreeTag(t)), ...tags.filter(isFreeTag)];
}

/**
 * Rejected stories as plain text lines - folded by default, and each line's
 * reason folded again inside it. Uses native <details> so it needs no state.
 */
function RejectedList({ entries }: { entries: RejectedEntry[] }) {
  const summaryStyle: React.CSSProperties = { cursor: "pointer", listStyle: "revert" };
  return (
    <details style={{ marginTop: "2.5rem" }}>
      <summary
        style={{
          ...summaryStyle,
          // Same look as the section headings above.
          fontFamily: mono,
          fontSize: "1rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#c07a3a",
        }}
      >
        Returned to the Quill ({entries.length})
      </summary>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
          marginTop: "0.9rem",
          fontFamily: mono,
          fontSize: "0.85rem",
          color: parchment,
        }}
      >
        {entries.map((r) => {
          const parts = [
            r.title || "Untitled",
            r.author || null,
            shortAddress(r.address),
            r.tier != null ? `Tier ${r.tier}` : null,
            r.sceneCount != null ? `${r.sceneCount} scene${r.sceneCount === 1 ? "" : "s"}` : null,
          ].filter(Boolean);
          return (
            <details key={`${r.storyId}-${r.rejectedAt}`}>
              <summary style={summaryStyle}>{parts.join(" · ")}</summary>
              <p
                style={{
                  margin: "0.3rem 0 0.4rem 1.2rem",
                  color: gold,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {r.reason}
              </p>
            </details>
          );
        })}
      </div>
    </details>
  );
}

function TagLegend() {
  return (
    <div style={{ marginTop: "3rem", borderTop: `1px solid ${gold}`, paddingTop: "1.75rem" }}>
      <h3
        style={{
          fontFamily: mono,
          fontSize: "1rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#c07a3a",
          marginBottom: "0.9rem",
        }}
      >
        Story Tags
      </h3>
      <p
        style={{
          fontFamily: mono,
          color: gold,
          fontSize: "0.8rem",
          lineHeight: 1.5,
          marginBottom: "1.4rem",
        }}
      >
        Tag your passages in Twine to tell players what kind of tale awaits. The marks below carry
        a fixed colour; use as many as fit. Any other tag still appears on the queue — just in a
        plain, dull colour.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {TAG_CATEGORIES.map((cat) => (
          <div key={cat.title}>
            <div
              style={{
                fontFamily: mono,
                color: gold,
                fontSize: "0.7rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                borderBottom: `1px solid ${gold}44`,
                paddingBottom: "0.35rem",
                marginBottom: "0.75rem",
              }}
            >
              {cat.title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              {cat.tags.map((name) => (
                <div
                  key={name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "7.5rem 1fr",
                    gap: "0.75rem",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <TagChip tag={name} labelled large />
                  </div>
                  <span
                    style={{
                      fontFamily: mono,
                      color: parchment,
                      fontSize: "0.8rem",
                      lineHeight: 1.45,
                    }}
                  >
                    {TAG_META[name].desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tier icons live at /icons/t{1..6}.png (same art the character screens use).
// Fall back to the raw number if the tier is out of that range or unset.
function TierValue({ tier }: { tier?: number }): React.ReactNode {
  if (tier == null) return null;
  if (tier < 1 || tier > 6) return tier;
  return (
    <img
      src={`/icons/t${tier}.png`}
      alt={`Tier ${tier}`}
      title={`Tier ${tier}`}
      draggable={false}
      style={{ width: "1.4em", height: "1.4em", objectFit: "contain", verticalAlign: "middle" }}
    />
  );
}

// Duration shown as a 4-segment "thermometer" glass tube — one lit segment per
// week (1–4). Clamped to the 1–4 range the author picks.
function DurationTube({ weeks }: { weeks?: number }): React.ReactNode {
  if (weeks == null) return null;
  const filled = Math.max(0, Math.min(4, weeks));
  return (
    <span
      title={`${weeks} week${weeks === 1 ? "" : "s"}`}
      style={{
        position: "relative",
        display: "inline-flex",
        width: "72px",
        height: "7px",
        border: `1px solid ${gold}`,
        borderRadius: "4px",
        overflow: "hidden",
        background: "#0f0f0c",
        verticalAlign: "middle",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            flex: 1,
            borderRight: i < 3 ? `1px solid ${gold}` : undefined,
            background:
              i < filled
                ? "linear-gradient(180deg, #8fd16a 0%, #5fae3f 45%, #3c7a26 100%)"
                : "transparent",
          }}
        />
      ))}
      {/* Glass glare across the top. */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "8px",
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0) 55%)",
        }}
      />
    </span>
  );
}

// Max party size shown as filled circles — one per allowed character (1–4).
function CharDots({ count }: { count?: number }): React.ReactNode {
  if (count == null) return null;
  const n = Math.max(1, Math.min(4, count));
  return (
    <span
      title={`${count} character${count === 1 ? "" : "s"}`}
      style={{ display: "inline-flex", gap: "3px", verticalAlign: "middle" }}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #d9b8f0, #9b6fc9)",
            border: "1px solid #7a5aa0",
          }}
        />
      ))}
    </span>
  );
}

function MetaItem({
  label,
  value,
  center,
}: {
  label: string;
  value: React.ReactNode;
  center?: boolean;
}) {
  if (center) {
    // Centre the label and value within the cell, and give the value a fixed-
    // height box so the three graphical stats (tier icon, week tube, char dots)
    // line up on a common row despite their different native heights.
    return (
      <div style={{ textAlign: "center" }}>
        <span style={metaLabel}>{label}</span>
        <span
          style={{
            ...metaValue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "1.4em",
          }}
        >
          {value ?? "—"}
        </span>
      </div>
    );
  }
  return (
    <div>
      <span style={metaLabel}>{label}</span>
      <span style={metaValue}>{value ?? "—"}</span>
    </div>
  );
}

function EntryCard({
  entry,
  color,
  label,
  wide,
}: {
  entry: ReviewEntry;
  color: string;
  label: string;
  wide: boolean;
}) {
  const md = entry.metadata || {};
  const description = md.meta_description || "";
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  // Measure the clamped description on first paint; only offer "Read more" when
  // the text actually overflows two lines.
  useEffect(() => {
    const el = descRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [description]);

  return (
    <div style={cardStyle}>
      {/* The left group (name + icons) grows to fill the row, so the timestamp
          sits at the right when it fits on the line, and drops to the left of
          the next line (below the title) when the card is too narrow. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.35rem 0.75rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            flex: "1 1 60%",
            minWidth: 0,
          }}
        >
          <span style={cardTitle}>{md.meta_title || entry.name || "Untitled"}</span>
          {entry.tags && entry.tags.length > 0 && <TagIcons tags={entry.tags} />}
        </div>
        <span style={{ ...cardTimer, color, flexShrink: 0 }}>{label}</span>
      </div>

      {(() => {
        const author = <MetaItem label="Author" value={md.meta_author} />;
        const wallet = (
          <MetaItem
            label="Wallet"
            value={<span title={entry.address}>{shortAddress(entry.address)}</span>}
          />
        );
        const tier = (
          <MetaItem label="Tier" value={<TierValue tier={md.meta_adventureTier} />} center />
        );
        const duration = (
          <MetaItem label="Weeks" value={<DurationTube weeks={md.meta_durationWeeks} />} center />
        );
        const maxChars = (
          <MetaItem
            label={md.meta_maxCharNum === 1 ? "Solo" : "Group"}
            value={<CharDots count={md.meta_maxCharNum} />}
            center
          />
        );
        const scenes = (
          <MetaItem label="Scenes" value={entry.sceneCount ?? null} center />
        );

        if (wide) {
          // One line: Author · Wallet · Tier · Weeks · Solo · Scenes.
          return (
            <div style={authorStatsWide}>
              {author}
              {wallet}
              {tier}
              {duration}
              {maxChars}
              {scenes}
            </div>
          );
        }
        return (
          <>
            <div style={pairRow}>
              {author}
              {wallet}
            </div>
            <div style={statsRow}>
              {tier}
              {duration}
              {maxChars}
              {scenes}
            </div>
          </>
        );
      })()}


      {description && (
        <div>
          <div ref={descRef} style={expanded ? descText : { ...descText, ...descClamp }}>
            {description}
          </div>
          {(overflowing || expanded) && (
            <button style={moreBtn} onClick={() => setExpanded((x) => !x)}>
              {expanded ? "Show less ▲" : "Read more ▾"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReviewStatus() {
  const [entries, setEntries] = useState<ReviewEntry[] | null>(null);
  const [rejected, setRejected] = useState<RejectedEntry[]>([]);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 600px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/twine-reviews");
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setEntries(await res.json());
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loaded separately so a failure here never hides the review queue itself.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/twine-rejected");
        if (!cancelled && res.ok) setRejected(await res.json());
      } catch {
        /* the rejected list is optional - leave it empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1rem", background: "#0a0a0a" }}>
      <section style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h2
          style={{
            // Standard page-header style, matching .heading in the other
            // /create pages (app/create/page.module.css).
            fontFamily: mono,
            fontSize: "1.1rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#c07a3a",
            borderBottom: "1px solid #7a6a3a",
            paddingBottom: "0.75rem",
            marginBottom: "2rem",
          }}
        >
          Submit Status
        </h2>
        <p style={{ fontFamily: mono, color: gold, fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Herein lie all tales submitted for judgement. Each is granted seven days&rsquo; grace — revise as you will, and the hourglass turns anew. When the last grain falls, the tale passes to the reviewers.
        </p>

        {error && <p style={{ fontFamily: mono, color: "#c55865" }}>{error}</p>}

        {!error && entries === null && (
          <p style={{ fontFamily: mono, color: parchment }}>Loading…</p>
        )}

        {entries !== null && entries.length === 0 && (
          <p style={{ fontFamily: mono, color: parchment, fontStyle: "italic" }}>
            No stories submitted for review yet.
          </p>
        )}

        {entries !== null && entries.length > 0 && (() => {
          // Split on the same rule the backend locks on: once the window has run
          // out, the story is pending and listed under its own heading. `now`
          // ticks every second, so a story moves across the moment it expires.
          const rows = entries.map((e) => {
            const anchor = e.lastUpdate || e.submittedAt;
            const started = anchor ? new Date(anchor).getTime() : 0;
            const remaining = started ? started + REVIEW_WINDOW_MS - now : 0;
            return { entry: e, started, remaining, pending: !!started && remaining <= 0 };
          });
          const renderRow = ({ entry, started, remaining }: (typeof rows)[number]) => {
            const color = !started
              ? parchment
              : remaining <= 0
              ? PENDING_COLOR
              : remaining < 86400000
              ? "#d4a24a"
              : parchment;
            const label = started ? formatRemaining(remaining) : "—";
            return (
              <EntryCard key={entry.storyId} entry={entry} color={color} label={label} wide={wide} />
            );
          };
          // Shortest timer first. Among pending stories that puts the one waiting
          // longest on top; entries without a timestamp sink to the bottom.
          const byRemaining = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
            (a.started ? a.remaining : Infinity) - (b.started ? b.remaining : Infinity);
          const open = rows.filter((r) => !r.pending).sort(byRemaining);
          const pending = rows.filter((r) => r.pending).sort(byRemaining);
          const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.9rem" };
          const sectionHeading = (title: string, first: boolean) => (
            <h3
              style={{
                // Same look as the Story Tags heading below.
                fontFamily: mono,
                fontSize: "1rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#c07a3a",
                marginTop: first ? 0 : "2.5rem",
                marginBottom: "0.9rem",
              }}
            >
              {title}
            </h3>
          );
          // Pending first: those are the ones the reviewers act on now.
          return (
            <>
              {pending.length > 0 && (
                <>
                  {sectionHeading("Before the Reviewers", true)}
                  <div style={listStyle}>{pending.map(renderRow)}</div>
                </>
              )}
              {open.length > 0 && (
                <>
                  {sectionHeading("Days of Grace", pending.length === 0)}
                  <div style={listStyle}>{open.map(renderRow)}</div>
                </>
              )}
            </>
          );
        })()}

        {rejected.length > 0 && <RejectedList entries={rejected} />}

        {entries !== null && <TagLegend />}

        <div style={{ marginTop: "2.5rem" }}>
          <Link
            href="/create"
            style={{
              fontFamily: mono,
              color: gold,
              textDecoration: "none",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontSize: "0.85rem",
            }}
          >
            &larr; Back to Create
          </Link>
        </div>
      </section>
      <PageVersionTag />
    </div>
  );
}
