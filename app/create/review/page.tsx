"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";
import h from "@/app/styles/headings.module.css";
import storyGenres from "../../../backend/data/story-genres.json";

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
  meta_access?: string;
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
  /** How many warnings the story check gave; the warnings themselves are for
   * the author and reviewers only (GET .../story, checkWarnings). */
  warningCount?: number;
  /** It waits: JavaScript or something the platform can't play yet. */
  held?: boolean;
  /** It has its own JavaScript, or something the check reads as code. */
  hasCode?: boolean;
}

/** One warning of the story check (backend story_rules.finding). */
interface CheckWarning {
  place: string;
  line: number | null;
  kind: "code" | "unsupported" | "note";
  message: string;
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
  gridTemplateColumns: "repeat(5, 1fr)",
};
// Author + Wallet sit side by side.
const pairRow: React.CSSProperties = {
  ...metaRow,
  gridTemplateColumns: "1fr 1fr",
};
// Wide screens (>600px): Author · Wallet · Tier · Weeks · Solo · Scenes · Access on one
// line. Author and Wallet get extra width (pseudonyms / addresses are longer).
const authorStatsWide: React.CSSProperties = {
  ...metaRow,
  gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 1fr 1fr 1fr",
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

// Curated story-experience tags (the genres), each with a fixed colour and a
// description, from backend/data/story-genres.json, which the submit check
// reads too: a story lists 1 to 5 of them in $meta_genres (backend/story_rules.py).
// Each one has a generated icon at /icons/tag-<id>.png (see tagVisual).
// Authors can add any other words in Twine; those still show, in a dull
// neutral colour (DULL_TAG), and are listed under "other".
// Colours are grouped by category (see TAG_CATEGORIES): each category is one
// hue in varying strengths, so a story's tags read as a palette. Combat is red,
// Magic violet, Guile teal, Journey green, Tone gold — with romance an
// intentional pink exception, since "love" should read pink, not gold.
type TagMeta = { color: string; icon?: string; img?: string; desc: string; tint?: string };
const TAG_META: Record<string, TagMeta> = Object.fromEntries(
  storyGenres.categories.flatMap((c) =>
    c.genres.map((g): [string, TagMeta] => [g.id, { color: g.color, desc: g.desc }]),
  ),
);
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
const TAG_CATEGORIES: { title: string; tags: string[] }[] = storyGenres.categories.map((c) => ({
  title: c.title,
  tags: c.genres.map((g) => g.id),
}));

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

// The genre list; the tutorial links here (/create/review#story-tags).
const STORY_TAGS_ANCHOR = "story-tags";

function TagLegend() {
  return (
    <div
      id={STORY_TAGS_ANCHOR}
      style={{ marginTop: "3rem", borderTop: `1px solid ${gold}`, paddingTop: "1.75rem", scrollMarginTop: "1rem" }}
    >
      <h2 className={h.section}>
        Story Tags
      </h2>
      <p
        style={{
          fontFamily: mono,
          color: gold,
          fontSize: "0.8rem",
          lineHeight: 1.5,
          marginBottom: "1.4rem",
        }}
      >
        Tell players what kind of tale awaits: every story lists 1 to 5 of the genres below in its
        StoryInit, like {`<<set $meta_genres to ["adventure", "mystery"]>>`}. Each carries a fixed
        colour. Twine&apos;s own story and scene tags stay yours: they aren&apos;t shown here.
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

// How players get runs of the story ($meta_access): free = unlimited, trial =
// one free run then buy more, paid = buy runs before playing.
const ACCESS_INFO: Record<string, { label: string; color: string; title: string }> = {
  free: { label: "Free", color: PENDING_COLOR, title: "Free — play as often as you like" },
  trial: { label: "Trial", color: "#e6c98a", title: "Trial — one free run, then buy more" },
  paid: { label: "Paid", color: parchment, title: "Paid — buy runs to play" },
};

function AccessValue({ access }: { access?: string }): React.ReactNode {
  if (!access) return null;
  const info = ACCESS_INFO[access];
  if (!info) return access;
  return (
    <span style={{ color: info.color }} title={info.title}>
      {info.label}
    </span>
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

type ReviewOutcome = "approved" | "rejected";

const reviewerTools: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  borderTop: `1px dashed ${gold}`,
  paddingTop: "0.6rem",
};
const actionRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
  fontFamily: mono,
  fontSize: "0.8rem",
  color: parchment,
};
const actionBtn = (accent: string): React.CSSProperties => ({
  background: "none",
  border: `1px solid ${accent}`,
  padding: "0.3rem 0.7rem",
  cursor: "pointer",
  fontFamily: mono,
  color: accent,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontSize: "0.7rem",
});
const REJECT_COLOR = "#c55865";

// A reviewer's decision on one story: approve (it goes live and can be played)
// or reject with a reason. The backend only allows both once the author can no
// longer change the story, i.e. after its 7 days.
function ReviewActions({
  entry,
  reviewable,
  onDone,
}: {
  entry: ReviewEntry;
  reviewable: boolean;
  onDone: (outcome: ReviewOutcome) => void;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function send(outcome: ReviewOutcome) {
    setBusy(true);
    setError(undefined);
    const path = `/api/auth/twine-reviews/${encodeURIComponent(entry.address)}/${encodeURIComponent(entry.storyId)}`;
    try {
      const res = await fetch(`${path}/${outcome === "approved" ? "approve" : "reject"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: outcome === "rejected" ? JSON.stringify({ reason: reason.trim() }) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : `Failed (${res.status})`);
      }
      onDone(outcome);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Stories still in their days of grace get no buttons: their section says
  // why, and the editor link above stays for support.
  if (!reviewable) {
    return null;
  }

  return (
    <>
      {mode === "idle" && (
        <div style={actionRow}>
          <button style={actionBtn(PENDING_COLOR)} onClick={() => setMode("approve")}>
            Approve
          </button>
          <button style={actionBtn(REJECT_COLOR)} onClick={() => setMode("reject")}>
            Reject
          </button>
        </div>
      )}
      {mode === "approve" && (
        <div style={actionRow}>
          <span>Make it live? Players can then play it, and its author can no longer change it.</span>
          <button style={actionBtn(PENDING_COLOR)} disabled={busy} onClick={() => send("approved")}>
            {busy ? "Approving…" : "Yes, approve"}
          </button>
          <button style={actionBtn(gold)} disabled={busy} onClick={() => setMode("idle")}>
            Cancel
          </button>
        </div>
      )}
      {mode === "reject" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Why is it rejected? The reason is shown publicly in the list of returned stories."
            style={{
              fontFamily: mono,
              fontSize: "0.85rem",
              background: "#0a0a0a",
              color: parchment,
              border: `1px solid ${gold}`,
              padding: "0.5rem",
              resize: "vertical",
            }}
          />
          <div style={actionRow}>
            <button
              style={actionBtn(REJECT_COLOR)}
              disabled={busy || !reason.trim()}
              onClick={() => send("rejected")}
            >
              {busy ? "Rejecting…" : "Reject story"}
            </button>
            <button style={actionBtn(gold)} disabled={busy} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div style={{ ...actionRow, color: REJECT_COLOR }}>{error}</div>}
    </>
  );
}

// Reviewers open a submission in the story editor to test-play it: the editor
// keeps it as a local review copy (twinejs-integrated src/routes/review-load).
const editorLink: React.CSSProperties = {
  alignSelf: "flex-start",
  fontFamily: mono,
  color: gold,
  fontSize: "0.8rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
};

const waitColor = "#d08a3a";
const noteColor = "#9a927a";
const checkLine: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem 0.9rem",
  fontFamily: mono,
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
};
const warningList: React.CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  fontFamily: mono,
  fontSize: "0.75rem",
  lineHeight: 1.5,
  color: parchment,
};

// What the story check said, for everyone: whether the story waits and how
// many warnings it got (the warnings themselves are in WarningsPanel).
function CheckSummary({ entry }: { entry: ReviewEntry }) {
  const count = entry.warningCount ?? 0;
  if (!entry.held && count === 0) return null;
  return (
    <div style={checkLine}>
      {entry.held && (
        <span
          style={{ color: waitColor }}
          title="It uses JavaScript or something the platform can't play yet, so it can't be approved until there are rules for that."
        >
          ⏳ Waits for rules{entry.hasCode ? " · uses JavaScript" : ""}
        </span>
      )}
      {count > 0 && (
        <span style={{ color: noteColor }}>
          {count} warning{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function warningWhere(w: CheckWarning): string {
  if (!w.place) return "";
  return w.line ? `${w.place}, line ${w.line}: ` : `${w.place}: `;
}

// Reviewers only: today's story check on the submission - what keeps it from
// going live, then the notes. Loaded when opened (it reads the whole story).
function WarningsPanel({ entry }: { entry: ReviewEntry }) {
  const [open, setOpen] = useState(false);
  const [warnings, setWarnings] = useState<CheckWarning[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || warnings) return;
    setError(undefined);
    try {
      const res = await fetch(
        `/api/auth/twine-reviews/${encodeURIComponent(entry.address)}/${encodeURIComponent(entry.storyId)}/story`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setWarnings(Array.isArray(data.checkWarnings) ? data.checkWarnings : []);
      setProblems(Array.isArray(data.checkProblems) ? data.checkProblems : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const count = entry.warningCount ?? 0;
  if (count === 0 && !entry.held) return null;
  const waiting = (warnings || []).filter((w) => w.kind !== "note");
  const notes = (warnings || []).filter((w) => w.kind === "note");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <button style={{ ...moreBtn, alignSelf: "flex-start" }} onClick={toggle}>
        {open ? "Hide warnings ▲" : `Show warnings (${count}) ▾`}
      </button>
      {open && error && <span style={{ color: waitColor, fontFamily: mono, fontSize: "0.75rem" }}>{error}</span>}
      {open && warnings && (
        <>
          {problems.length > 0 && (
            <>
              <span style={{ ...checkLine, color: "#b8392f" }}>Refused by today&apos;s check (fix with Save review)</span>
              <ul style={warningList}>
                {problems.map((p, i) => (
                  <li key={`p${i}`}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {waiting.length > 0 && (
            <>
              <span style={{ ...checkLine, color: waitColor }}>Keeps it waiting</span>
              <ul style={warningList}>
                {waiting.map((w, i) => (
                  <li key={`w${i}`}>
                    {warningWhere(w)}
                    {w.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          {notes.length > 0 && (
            <>
              <span style={{ ...checkLine, color: noteColor }}>Notes for the reviewer</span>
              <ul style={warningList}>
                {notes.map((w, i) => (
                  <li key={`n${i}`}>
                    {warningWhere(w)}
                    {w.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  color,
  label,
  wide,
  reviewer,
  reviewable,
  onReviewed,
}: {
  entry: ReviewEntry;
  color: string;
  label: string;
  wide: boolean;
  reviewer: boolean;
  reviewable: boolean;
  onReviewed: (outcome: ReviewOutcome) => void;
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

      <CheckSummary entry={entry} />

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
        const access = (
          <MetaItem label="Access" value={<AccessValue access={md.meta_access} />} center />
        );

        if (wide) {
          // One line: Author · Wallet · Tier · Weeks · Solo · Scenes · Access.
          return (
            <div style={authorStatsWide}>
              {author}
              {wallet}
              {tier}
              {duration}
              {maxChars}
              {scenes}
              {access}
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
              {access}
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

      {reviewer && (
        <div style={reviewerTools}>
          <a
            href={`/twine/#/review/${encodeURIComponent(entry.address)}/${encodeURIComponent(entry.storyId)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={editorLink}
          >
            Open in editor to test-play ↗
          </a>
          <WarningsPanel entry={entry} />
          <ReviewActions entry={entry} reviewable={reviewable} onDone={onReviewed} />
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
  const [reviewer, setReviewer] = useState(false);
  const [notice, setNotice] = useState<string>();
  // Bumped after a rejection, so the returned list loads again.
  const [rejectedVersion, setRejectedVersion] = useState(0);

  // An approved or rejected story leaves the queue at once.
  function handleReviewed(entry: ReviewEntry, outcome: ReviewOutcome) {
    const title = entry.metadata?.meta_title || entry.name || "Untitled";
    setEntries((prev) =>
      prev ? prev.filter((e) => !(e.address === entry.address && e.storyId === entry.storyId)) : prev
    );
    setNotice(
      outcome === "approved"
        ? `"${title}" is approved and live: players can play it now.`
        : `"${title}" was rejected and returned to its author.`
    );
    if (outcome === "rejected") setRejectedVersion((v) => v + 1);
  }

  // Reviewer tools only show for reviewers; the backend checks the role again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me/roles", { credentials: "include" });
        if (!cancelled && res.ok) setReviewer((await res.json()).reviewer === true);
      } catch {
        /* signed out or offline: no reviewer tools */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // The genre list appears once the queue has loaded, after the browser has
  // already looked for a #story-tags target: scroll to it then.
  const loaded = entries !== null;
  useEffect(() => {
    if (loaded && window.location.hash === `#${STORY_TAGS_ANCHOR}`) {
      document.getElementById(STORY_TAGS_ANCHOR)?.scrollIntoView();
    }
  }, [loaded]);

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
  }, [rejectedVersion]);

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1rem", background: "#0a0a0a" }}>
      <section style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h1 className={h.pageTitle}>
          Submit Status
        </h1>
        <p style={{ fontFamily: mono, color: gold, fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Herein lie all tales submitted for judgement. Each is granted seven days&rsquo; grace — revise as you will, and the hourglass turns anew. When the last grain falls, the tale passes to the reviewers.
        </p>

        {error && <p style={{ fontFamily: mono, color: "#c55865" }}>{error}</p>}
        {notice && <p style={{ fontFamily: mono, color: PENDING_COLOR, fontSize: "0.9rem" }}>{notice}</p>}

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
              <EntryCard
                key={entry.storyId}
                entry={entry}
                color={color}
                label={label}
                wide={wide}
                reviewer={reviewer}
                reviewable={!!started && remaining <= 0}
                onReviewed={(outcome) => handleReviewed(entry, outcome)}
              />
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
            <h2
              className={h.section}
              style={first ? { marginTop: 0 } : undefined}
            >
              {title}
            </h2>
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
