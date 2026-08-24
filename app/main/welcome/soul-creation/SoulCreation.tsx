"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pinyon_Script } from "next/font/google";
import styles from "./SoulCreation.module.css";
import {
  GENDERS,
  RACES,
  racesByCategory,
  professionsByCategory,
  PROFESSIONS,
  BIRTHSIGNS,
  type BirthsignId,
} from "@/app/lib/characterOptions";
import {
  getDisplayedAge,
  getLifeEnergyFill,
  LIFE_ENERGY_MIN_AGE_MONTHS,
  LIFE_ENERGY_MAX_AGE_MONTHS,
} from "@/app/lib/ageScaling";
import SoulBulb from "./SoulBulb";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";
import { PortraitEditor, type PortraitArea } from "../PortraitEditor";

const pinyonScript = Pinyon_Script({ subsets: ["latin"], weight: "400" });

const PAGE_COUNT = 6;

// Page 5 (Trappings) — resource items the player may pick from, and how
// many units of each tier they may spend, both derived server-side from
// their chosen professions (see GET /api/auth/me/trappings-options). Kept
// as the single source of truth so this picker can never offer something
// POST /me/characters would reject.
type TrappingsItem = {
  id: string;
  name: string;
  familyId: string;
  tier: number;
};

// One blueprintPoolsByProfessionCount rule (see resource-selection-rules.json),
// paired with the blueprint items it makes eligible - `count` is how many
// separate combo boxes this pool gets, one independent pick each.
type TrappingsBlueprintPool = {
  source: string;
  tier: number;
  count: number;
  items: TrappingsItem[];
};

type TrappingsOptions = {
  tierPools: Record<string, number>;
  items: TrappingsItem[];
  blueprintPools: TrappingsBlueprintPool[];
};

const EMPTY_TRAPPINGS_OPTIONS: TrappingsOptions = { tierPools: {}, items: [], blueprintPools: [] };

const BLUEPRINT_SOURCE_LABELS: Record<string, string> = {
  tool_basic: "Starter Tool Blueprint",
  tool: "Tool Blueprint",
  item_basic: "Starter Item Blueprint",
  item: "Item Blueprint",
};

// Ids owned (quantity > 0) across one or more stackable pools, deduplicated -
// used to build the embedded recipe viewer's "?tools=" ownership list, which
// only cares whether something is owned at all, not how many.
function ownedIds(...pools: Record<string, number>[]): string[] {
  const ids = new Set<string>();
  for (const pool of pools) {
    for (const [id, qty] of Object.entries(pool)) {
      if (qty > 0) ids.add(id);
    }
  }
  return [...ids];
}

export function SoulCreation({
  onExit,
  slotNumber,
  playerTools,
  playerToolStarter,
}: {
  onExit: () => void;
  slotNumber: number;
  /** The player's existing shared tool pools - available to this new
   * character too, even before it's saved, since tools live on the player. */
  playerTools: Record<string, number>;
  playerToolStarter: Record<string, number>;
}) {
  const [page, setPage] = useState(0);
  const { setHidden: setHeaderHidden } = useHeaderVisibility();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [race, setRace] = useState("human");
  const [gender, setGender] = useState("");
  const [profession1, setProfession1] = useState("");
  const [profession2, setProfession2] = useState("");
  const [profession3, setProfession3] = useState("");
  // Persisted to the character's Firestore document later on; local-only state for now.
  const [portraitUrl, setPortraitUrl] = useState("");

  // Page 5 (Trappings) — the resources the player may choose from (refetched
  // whenever the chosen professions change, since those gate what's on
  // offer), the player's in-progress picks, and submit state for the
  // save-and-exit Continue click.
  const [trappingsOptions, setTrappingsOptions] = useState<TrappingsOptions>(EMPTY_TRAPPINGS_OPTIONS);
  const [trappingsLoaded, setTrappingsLoaded] = useState(false);
  const [selectedResources, setSelectedResources] = useState<Record<string, number>>({});
  // One combo box's pick, keyed by "<poolIndex>:<slotIndex>" - as many slots
  // per pool as that pool's `count` (e.g. a "3"-profession tool_basic pool
  // with count:2 gets 2 independent combo boxes). Built into a flat
  // selectedBlueprints array (dropping empty picks) at submit time.
  const [blueprintSelections, setBlueprintSelections] = useState<Record<string, string>>({});
  // The embedded recipe viewer's own content height, in px - the iframe is
  // same-origin, so its body height can be read directly and mirrored onto
  // the iframe element, instead of guessing a fixed height that leaves
  // either dead grey space or an unwanted inner scrollbar.
  const [recipeViewerHeight, setRecipeViewerHeight] = useState(600);
  const recipeViewerRef = useRef<HTMLIFrameElement>(null);
  const [recipeViewerSrc, setRecipeViewerSrc] = useState("");
  const [recipeViewerLoaded, setRecipeViewerLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Set the iframe's src only once per visit to page 5 (not on every stepper
  // click or combo box pick, which would reload the whole document and lose
  // whatever recipe/tier the player was looking at) - later picks are pushed
  // in via postMessage instead, see the effect below.
  useEffect(() => {
    if (page !== 5) return;
    setRecipeViewerLoaded(false);
    setRecipeViewerSrc(
      `/craft/recipe-viewer.html?embedded=1&inv=${encodeURIComponent(
        JSON.stringify(selectedResources)
      )}&tools=${encodeURIComponent(
        JSON.stringify(ownedIds(playerTools, playerToolStarter))
      )}&blueprints=${encodeURIComponent(
        JSON.stringify(Object.values(blueprintSelections).filter(Boolean))
      )}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Live updates once the iframe has actually loaded (and can receive
  // messages) - keeps the currently-selected item/tier in the embedded
  // viewer untouched, just refreshes what's owned/needed. Tools don't
  // change during creation (no tool-selection step exists), but including
  // them here is harmless.
  useEffect(() => {
    if (!recipeViewerLoaded) return;
    recipeViewerRef.current?.contentWindow?.postMessage(
      {
        type: "recipe-viewer:update",
        inv: selectedResources,
        tools: ownedIds(playerTools, playerToolStarter),
        blueprints: Object.values(blueprintSelections).filter(Boolean),
      },
      window.location.origin
    );
  }, [selectedResources, blueprintSelections, playerTools, playerToolStarter, recipeViewerLoaded]);

  useEffect(() => {
    if (page !== 5) return;
    let cancelled = false;
    setTrappingsLoaded(false);
    const params = new URLSearchParams({
      profession1: profession1 || "none",
      profession2: profession2 || "none",
      profession3: profession3 || "none",
    });
    fetch(`/api/auth/me/trappings-options?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : EMPTY_TRAPPINGS_OPTIONS))
      .then((data: TrappingsOptions) => {
        if (!cancelled) {
          setTrappingsOptions(data ?? EMPTY_TRAPPINGS_OPTIONS);
          setSelectedResources({});
          setBlueprintSelections({});
          setTrappingsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrappingsOptions(EMPTY_TRAPPINGS_OPTIONS);
          setSelectedResources({});
          setBlueprintSelections({});
          setTrappingsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, profession1, profession2, profession3]);

  // Units of `tier` already allocated across `resources` (the player's picks
  // so far) — used both to render each tier's remaining budget and to clamp
  // further +/- clicks to what's left.
  function tierUnitsSpent(resources: Record<string, number>, tier: number): number {
    return trappingsOptions.items
      .filter((item) => item.tier === tier)
      .reduce((sum, item) => sum + (resources[item.id] ?? 0), 0);
  }

  function adjustSelectedResource(item: TrappingsItem, delta: number) {
    setSelectedResources((prev) => {
      const current = prev[item.id] ?? 0;
      const pool = trappingsOptions.tierPools[String(item.tier)] ?? 0;
      const spentByOthers = tierUnitsSpent(prev, item.tier) - current;
      const next = Math.max(0, Math.min(current + delta, pool - spentByOthers));
      if (next === current) return prev;
      const updated = { ...prev };
      if (next === 0) {
        delete updated[item.id];
      } else {
        updated[item.id] = next;
      }
      return updated;
    });
  }

  // Page 4 (Birthsign) — a single required pick; null blocks Continue.
  const [birthsign, setBirthsign] = useState<BirthsignId | null>(null);
  // Which single tile is currently showing its text-revealing backside —
  // purely a display toggle, independent of `birthsign` (the actual pick).
  // At most one at a time: flipping a new tile flips any other back, and
  // scrolling clears it so a flipped tile doesn't scroll off looking stuck open.
  const [flippedBirthsign, setFlippedBirthsign] = useState<BirthsignId | null>(null);
  // Clicking a tile can itself trigger a native "scroll the focused button
  // into view" nudge, which would otherwise immediately fire the scroll
  // handler below and undo the flip the click just caused. Suppress
  // scroll-driven clearing for a moment after every tile click.
  const suppressBirthsignScrollClearRef = useRef(false);

  function handleBirthsignTileClick(id: BirthsignId) {
    setBirthsign(id);
    setFlippedBirthsign((prev) => (prev === id ? null : id));
    suppressBirthsignScrollClearRef.current = true;
    setTimeout(() => {
      suppressBirthsignScrollClearRef.current = false;
    }, 300);
  }

  // Portrait framing (zoom/pan/crop math) is owned by PortraitEditor, mounted
  // for page 3 below - these mirror its latest reported value so
  // handleContinue's save below can read it after navigating past page 3.
  const [portraitZoom, setPortraitZoom] = useState(1);
  const [portraitPan, setPortraitPan] = useState({ x: 0, y: 0 });
  const [savedPortraitFrameArea, setSavedPortraitFrameArea] = useState<PortraitArea | null>(null);
  const [savedPortraitFaceArea, setSavedPortraitFaceArea] = useState<PortraitArea | null>(null);

  // Page 2 (Attributes) — spending the Body/Soul totals from the triangle
  // (page 1) across the 4 stats each. Every stat starts at the backend's
  // floor of 1 (see AttributeStats in character.py); the lowest
  // possible pool is 4 (BODY_SOUL_RATIO_MIN), which exactly covers that
  // 4-stats-at-1 floor with nothing left to spend.
  type BodyAttrKey = "migh" | "agil" | "endu" | "prec";
  type SoulAttrKey = "will" | "insi" | "lore" | "pres";
  const [bodyAttributes, setBodyAttributes] = useState<Record<BodyAttrKey, number>>({
    migh: 1,
    agil: 1,
    endu: 1,
    prec: 1,
  });
  const [soulAttributes, setSoulAttributes] = useState<Record<SoulAttrKey, number>>({
    will: 1,
    insi: 1,
    lore: 1,
    pres: 1,
  });

  // Set once, on the first click anywhere on page 1 (outside form controls).
  // Further clicks do nothing — this is a one-way activation.
  const [triangleActivated, setTriangleActivated] = useState(false);

  // The joystick (equilize-joystick.png, shown once activated) can be dragged,
  // but its center is confined to the actual non-transparent pixels of
  // equilize-middle-illu.png (top:61.5%, left:50%, width:28% of triangleGroup,
  // natural size 208x213 — see .middleOverlayWrapIllu, whose position the
  // joystick wrap shares exactly). Offset is tracked in pixels from that
  // image's center; recomputed from the triangle's actual rendered size on
  // every drag so it stays correct at any viewport.
  const triangleGroupRef = useRef<HTMLDivElement>(null);
  const isDraggingJoystickRef = useRef(false);
  const joystickDragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 });

  // Continue-button validation feedback for page 1: fields still missing a
  // value flash for 2s and fade back; if the triangle itself was never
  // activated, the illustration gets a golden flash instead.
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const missingFieldsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [illuActivationHint, setIlluActivationHint] = useState(false);
  const illuActivationHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashMissingFields(fields: string[]) {
    if (missingFieldsTimeoutRef.current) clearTimeout(missingFieldsTimeoutRef.current);
    setMissingFields(new Set(fields));
    missingFieldsTimeoutRef.current = setTimeout(() => setMissingFields(new Set()), 2000);
  }

  function flashIlluActivationHint() {
    if (illuActivationHintTimeoutRef.current) clearTimeout(illuActivationHintTimeoutRef.current);
    setIlluActivationHint(false);
    requestAnimationFrame(() => {
      setIlluActivationHint(true);
      illuActivationHintTimeoutRef.current = setTimeout(() => setIlluActivationHint(false), 2000);
    });
  }

  // Alpha mask of equilize-middle-illu.png, sampled once at its natural
  // resolution so the joystick's travel area matches its actual silhouette
  // instead of a rough circle approximation.
  const illuMaskRef = useRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.src = "/images/soul-creation/equilize-middle-illu.png";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      illuMaskRef.current = { data, width: canvas.width, height: canvas.height };
    };
  }, []);

  const ALPHA_THRESHOLD = 24;
  function isIlluOpaqueAt(u: number, v: number) {
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    const mask = illuMaskRef.current;
    if (!mask) return Math.hypot(u - 0.5, v - 0.5) <= 0.5; // fallback circle until the mask loads
    const x = Math.min(mask.width - 1, Math.max(0, Math.floor(u * mask.width)));
    const y = Math.min(mask.height - 1, Math.max(0, Math.floor(v * mask.height)));
    return mask.data[(y * mask.width + x) * 4 + 3] > ALPHA_THRESHOLD;
  }

  // Clamps a candidate offset (in pixels from the illustration's center) to
  // the furthest opaque point along the ray from that center, assuming the
  // artwork is star-shaped (a straight line from its center to any opaque
  // point stays inside the silhouette) — true for the sun/star illustration.
  function clampToIlluShape(dx: number, dy: number, boxWidth: number, boxHeight: number) {
    if (dx === 0 && dy === 0) return { x: 0, y: 0 };
    const toUv = (t: number) => ({ u: 0.5 + (dx * t) / boxWidth, v: 0.5 + (dy * t) / boxHeight });
    const full = toUv(1);
    if (isIlluOpaqueAt(full.u, full.v)) return { x: dx, y: dy };
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const { u, v } = toUv(mid);
      if (isIlluOpaqueAt(u, v)) lo = mid;
      else hi = mid;
    }
    return { x: dx * lo, y: dy * lo };
  }

  // The illustration's box size, in the same coordinate space used for
  // joystickOffset (which is always tracked relative to its center).
  // triangleGroupRef is only mounted while page === 1 (see its JSX below),
  // so on later pages the live measurement is gone even though joystickOffset
  // (and thus the real age/body/soul it encodes) is still perfectly valid.
  // Cache the last real measurement so callers keep using the true numbers
  // instead of silently falling back to a flat placeholder once navigated away.
  const lastIlluBoxSizeRef = useRef<{ boxWidth: number; boxHeight: number } | null>(null);
  function getIlluBoxSize() {
    const group = triangleGroupRef.current;
    if (!group) return lastIlluBoxSizeRef.current;
    const boxWidth = group.getBoundingClientRect().width * 0.28;
    const size = { boxWidth, boxHeight: boxWidth * (213 / 208) };
    lastIlluBoxSizeRef.current = size;
    return size;
  }

  // The lower-right⟷upper-left diagonal of the joystick's travel area controls
  // Life Energy/Age: the lower-right end is youngest (23, fullest life
  // energy), the upper-left end is oldest (58, lowest). Endpoints are the
  // shape's own boundary along that diagonal (via clampToIlluShape); since
  // the shape is star-convex from its center, every point on the segment
  // between them is guaranteed to stay inside it.
  function getAgeDiagonal(boxWidth: number, boxHeight: number) {
    const lowerRight = clampToIlluShape(boxWidth, boxHeight, boxWidth, boxHeight);
    const upperLeft = clampToIlluShape(-boxWidth, -boxHeight, boxWidth, boxHeight);
    return { upperLeft, lowerRight };
  }

  // t=0 at the upperLeft end (oldest, 58yr) — t=1 at the lowerRight end
  // (youngest, 23yr) — 420 whole-month steps between them.
  function ageMonthsToDiagonalT(ageMonths: number) {
    return (LIFE_ENERGY_MAX_AGE_MONTHS - ageMonths) / (LIFE_ENERGY_MAX_AGE_MONTHS - LIFE_ENERGY_MIN_AGE_MONTHS);
  }

  function diagonalTToAgeMonths(t: number) {
    return Math.round(LIFE_ENERGY_MAX_AGE_MONTHS - t * (LIFE_ENERGY_MAX_AGE_MONTHS - LIFE_ENERGY_MIN_AGE_MONTHS));
  }

  function pointOnDiagonal(t: number, upperLeft: { x: number; y: number }, lowerRight: { x: number; y: number }) {
    return {
      x: upperLeft.x + t * (lowerRight.x - upperLeft.x),
      y: upperLeft.y + t * (lowerRight.y - upperLeft.y),
    };
  }

  // Projects a point onto the axis from `start` to `end`, returning how far
  // along it the point's closest projection falls — 0 at `start`, 1 at
  // `end`, clamped. Movement perpendicular to the axis doesn't affect it.
  function projectOntoAxis(
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): number {
    const ab = { x: end.x - start.x, y: end.y - start.y };
    const ap = { x: point.x - start.x, y: point.y - start.y };
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    return abLenSq === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLenSq));
  }

  // Projects the current joystick offset onto the age diagonal to find the
  // age it represents.
  function getCharAgeMonths(): number {
    // Before activation the joystick sits at its default dead-center offset,
    // which projects to the age diagonal's midpoint (~43) rather than the
    // narrative default (28) — so age must stay pinned until the joystick
    // actually has a meaningful position (set the moment it activates).
    if (!triangleActivated) return 28 * 12;
    const box = getIlluBoxSize();
    if (!box) return 28 * 12;
    const { upperLeft, lowerRight } = getAgeDiagonal(box.boxWidth, box.boxHeight);
    return diagonalTToAgeMonths(projectOntoAxis(joystickOffset, upperLeft, lowerRight));
  }

  // The axis exactly perpendicular (in real pixel space) to the age
  // diagonal controls the Body/Soul split: the "highest" end favors Body,
  // the "most left" end favors Soul — one always shrinks as the other
  // grows. Same star-convexity guarantee as the age diagonal. True
  // perpendicularity matters: it's what guarantees every point sitting on
  // the age diagonal itself (including its upper-left/oldest end) has a
  // perfectly neutral 45/45 split, with zero component along this axis — a
  // rotate-by-90°-in-pixel-space of the age direction (boxWidth, boxHeight)
  // is (boxHeight, -boxWidth), since their dot product is exactly 0. (A
  // naive (1,-1) box-unit diagonal isn't truly perpendicular here, since
  // boxWidth ≠ boxHeight — 208×213 source art — and previously let the
  // oldest corner drift off-center.) Any reach asymmetry between the two
  // ends is handled separately, per-side, in getBodySoulRatioT below.
  function getBodySoulAxis(boxWidth: number, boxHeight: number) {
    const highest = clampToIlluShape(boxHeight, -boxWidth, boxWidth, boxHeight);
    const mostLeft = clampToIlluShape(-boxHeight, boxWidth, boxWidth, boxHeight);
    return { highest, mostLeft };
  }

  // highest/mostLeft sit on the same line through the center but, since the
  // shape isn't symmetric, rarely at equal distances from it — projecting
  // onto the segment between them (like the age axis does) lands the center
  // off from t=0.5 and the true edges short of t=0/1 (49/49, 98/4 instead of
  // 50/50, 100/4). Measuring each side against its own distance keeps the
  // center exactly at 0.5, and BOOST saturates to the true 0/1 ends a bit
  // before the physical edge, so imprecise dragging still reaches them.
  const BODY_SOUL_AXIS_BOOST = 1.15;
  function getBodySoulRatioT(boxWidth: number, boxHeight: number): number {
    const { highest, mostLeft } = getBodySoulAxis(boxWidth, boxHeight);
    const highestDist = Math.hypot(highest.x, highest.y);
    const mostLeftDist = Math.hypot(mostLeft.x, mostLeft.y);
    if (highestDist === 0 || mostLeftDist === 0) return 0.5;
    const unit = { x: highest.x / highestDist, y: highest.y / highestDist };
    const signed = joystickOffset.x * unit.x + joystickOffset.y * unit.y;
    if (signed >= 0) {
      return 0.5 + 0.5 * Math.max(0, Math.min(1, (signed / highestDist) * BODY_SOUL_AXIS_BOOST));
    }
    return 0.5 - 0.5 * Math.max(0, Math.min(1, (-signed / mostLeftDist) * BODY_SOUL_AXIS_BOOST));
  }

  const BODY_SOUL_RATIO_MAX = 100; // dominant attribute, at either end of the axis
  const BODY_SOUL_RATIO_MIN = 4; // yielding attribute, at either end of the axis

  // The total of Body + Soul isn't fixed — it peaks near mid-age (104, the
  // raw split's own natural maximum — the true highest the two can ever add
  // up to, reached near the Body/Soul axis itself), tapers to 90 at the
  // oldest end, and drops much further to 33 at the youngest end. Exposed as
  // its own value below (bodySoulSum) rather than buried in the split.
  const BODY_SOUL_SUM_AT_OLDEST = 90;
  const BODY_SOUL_SUM_PEAK = 104;
  const BODY_SOUL_SUM_AT_YOUNGEST = 33;
  const BODY_SOUL_SUM_PEAK_AGE_T = 0.5; // where along the age diagonal the peak sits

  function ageTToBodySoulSum(ageT: number): number {
    // Clamped defensively — the interpolation below is bounded by construction,
    // but capping here too means any future edit to it can't push the total
    // past its intended ends instead of quietly overshooting.
    const clamp = (n: number) => Math.max(BODY_SOUL_SUM_AT_YOUNGEST, Math.min(BODY_SOUL_SUM_PEAK, n));
    if (ageT <= BODY_SOUL_SUM_PEAK_AGE_T) {
      const localT = ageT / BODY_SOUL_SUM_PEAK_AGE_T;
      return clamp(BODY_SOUL_SUM_AT_OLDEST + localT * (BODY_SOUL_SUM_PEAK - BODY_SOUL_SUM_AT_OLDEST));
    }
    const localT = (ageT - BODY_SOUL_SUM_PEAK_AGE_T) / (1 - BODY_SOUL_SUM_PEAK_AGE_T);
    return clamp(BODY_SOUL_SUM_PEAK + localT * (BODY_SOUL_SUM_AT_YOUNGEST - BODY_SOUL_SUM_PEAK));
  }

  // Matches what getBodySoul's own formulas produce at the activation resting
  // point (age 28, dead-center on the Body/Soul axis) — so activating the
  // triangle doesn't cause a visible jump from this placeholder.
  const DEFAULT_BODY_SOUL = { body: 25, soul: 25, bodySoulSum: 50 };

  // Body/Soul are derived from two independent projections of the same
  // joystick offset: the age diagonal sets how much total the two share
  // (bodySoulSum), and the perpendicular axis sets how that total is split
  // between them. The raw split (4–100) always sums to 104, so it's rescaled
  // to match bodySoulSum while preserving the ratio.
  function getBodySoul(): { body: number; soul: number; bodySoulSum: number } {
    // Same reasoning as getCharAgeMonths — stay pinned to the placeholder
    // split until the joystick has actually been placed somewhere.
    if (!triangleActivated) return DEFAULT_BODY_SOUL;
    const box = getIlluBoxSize();
    if (!box) return DEFAULT_BODY_SOUL;

    const { upperLeft, lowerRight } = getAgeDiagonal(box.boxWidth, box.boxHeight);
    const ageT = projectOntoAxis(joystickOffset, upperLeft, lowerRight);
    const bodySoulSum = ageTToBodySoulSum(ageT);

    const ratioT = getBodySoulRatioT(box.boxWidth, box.boxHeight);
    const bodyRaw = BODY_SOUL_RATIO_MIN + ratioT * (BODY_SOUL_RATIO_MAX - BODY_SOUL_RATIO_MIN);
    const soulRaw = BODY_SOUL_RATIO_MAX - ratioT * (BODY_SOUL_RATIO_MAX - BODY_SOUL_RATIO_MIN);
    const rawSum = bodyRaw + soulRaw;

    // bodySoulSum (33–104) rarely equals the raw split's own sum (104), so
    // scaling by it can push a value under 4 — clamp hard so neither
    // attribute ever leaves [4, 100], matching their true min/max.
    const clamp = (n: number) => Math.max(BODY_SOUL_RATIO_MIN, Math.min(BODY_SOUL_RATIO_MAX, Math.round(n)));

    return {
      body: clamp((bodyRaw / rawSum) * bodySoulSum),
      soul: clamp((soulRaw / rawSum) * bodySoulSum),
      bodySoulSum: Math.round(bodySoulSum),
    };
  }

  // Set once, on the first click anywhere on page 1 (outside form controls).
  // Further clicks do nothing — this is a one-way activation. Rests the
  // joystick exactly on the age diagonal, at the default starting age (28).
  function handleTriangleClick() {
    if (triangleActivated) return;
    setTriangleActivated(true);
    const box = getIlluBoxSize();
    if (box) {
      const { upperLeft, lowerRight } = getAgeDiagonal(box.boxWidth, box.boxHeight);
      setJoystickOffset(pointOnDiagonal(ageMonthsToDiagonalT(28 * 12), upperLeft, lowerRight));
    }
  }

  function isFormControl(target: EventTarget | null) {
    return target instanceof HTMLElement && !!target.closest("input, select, textarea, option, optgroup, button, a, label");
  }

  // Page-wide activation click — the triangle no longer gates this to its
  // own shape; any click on page 1 outside of form controls activates it.
  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (page !== 1 || triangleActivated || isFormControl(e.target)) return;
    handleTriangleClick();
  }

  // Page-wide joystick dragging. Pressing down does NOT move the joystick —
  // it only starts tracking the drag; the joystick moves by the same delta
  // the pointer travels from there, clamped to the illustration's shape.
  function handlePagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (page !== 1 || !triangleActivated || isFormControl(e.target)) return;
    isDraggingJoystickRef.current = true;
    joystickDragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: joystickOffset.x,
      offsetY: joystickOffset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingJoystickRef.current) return;
    const box = getIlluBoxSize();
    if (!box) return;
    const start = joystickDragStartRef.current;
    const dx = start.offsetX + (e.clientX - start.pointerX);
    const dy = start.offsetY + (e.clientY - start.pointerY);
    setJoystickOffset(clampToIlluShape(dx, dy, box.boxWidth, box.boxHeight));
  }

  function handlePagePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingJoystickRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Canonical age, always tracked in human-equivalent MONTHS (never years) so
  // race-based display scaling stays precise — driven by the joystick's
  // position on the age diagonal once activated. Drives how many profession
  // slots are unlocked: under 30 the character has only had time to learn
  // one trade, 30–42 two, 43+ three.
  const char_age = getCharAgeMonths();
  const activeProfessionCount = char_age >= 61 * 12 ? 3 : char_age >= 51 * 12 ? 2 : 1;
  const displayedAge = getDisplayedAge(char_age, race);

  // Body/Soul share one reserve (bodySoulSum) — driven by the joystick's
  // position, see getBodySoul above.
  const { body, soul, bodySoulSum } = getBodySoul();

  // Page 2 (Attributes) spending pools — how much of body/soul is still
  // unallocated across their 4 stats. "Remaining" is intentionally the true
  // pool minus the CURRENT total (not minus-the-floor) — it's what actually
  // bounds how far a stat can still go, so it can't drift from the number
  // used to clamp maxAllowed below. That does mean an untouched section
  // reads pool-minus-4 (e.g. 21, not the triangle's 25) since the mandatory
  // floor of 1 per stat already accounts for those first 4 points.
  const bodyPointsSpent = Object.values(bodyAttributes).reduce((sum, v) => sum + v, 0);
  const bodyPointsRemaining = body - bodyPointsSpent;
  const soulPointsSpent = Object.values(soulAttributes).reduce((sum, v) => sum + v, 0);
  const soulPointsRemaining = soul - soulPointsSpent;

  // Applies `delta` (+1/-1) via a functional update so it always reads the
  // true latest value — required for press-and-hold repeat below, where the
  // same step closure fires many times and a captured render-time value
  // would go stale after the first tick. Clamped so a section's total spend
  // can never exceed its pool.
  function handleBodyAttributeChange(key: BodyAttrKey, delta: number) {
    setBodyAttributes((prev) => {
      const remaining = body - Object.values(prev).reduce((sum, v) => sum + v, 0);
      const maxAllowed = prev[key] + remaining;
      return { ...prev, [key]: Math.max(1, Math.min(prev[key] + delta, maxAllowed)) };
    });
  }

  function handleSoulAttributeChange(key: SoulAttrKey, delta: number) {
    setSoulAttributes((prev) => {
      const remaining = soul - Object.values(prev).reduce((sum, v) => sum + v, 0);
      const maxAllowed = prev[key] + remaining;
      return { ...prev, [key]: Math.max(1, Math.min(prev[key] + delta, maxAllowed)) };
    });
  }

  // Spends `total` across `keys` at random, each starting from the mandatory
  // floor of 1 - used by the Randomize button below to fill both sections at
  // once with a valid (fully-spent) split, so Continue unlocks immediately.
  function randomSpend<K extends string>(total: number, keys: readonly K[]): Record<K, number> {
    const result = Object.fromEntries(keys.map((k) => [k, 1])) as Record<K, number>;
    let remaining = total - keys.length;
    while (remaining > 0) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      result[key] += 1;
      remaining -= 1;
    }
    return result;
  }

  function handleRandomizeAttributes() {
    setBodyAttributes(randomSpend(body, ["migh", "agil", "endu", "prec"] as const));
    setSoulAttributes(randomSpend(soul, ["will", "insi", "lore", "pres"] as const));
  }

  // Press-and-hold repeat for the attribute stepper triangles: one immediate
  // step, a short pause, then fast auto-repeat until release. Listens on
  // `window` for the release rather than just the button, since a hold that
  // ends because the button became disabled mid-repeat (hit the pool's cap)
  // would otherwise never fire its own pointerup — disabled elements stop
  // dispatching pointer events to themselves.
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function stopHold() {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  }
  function startHold(step: () => void) {
    stopHold();
    step();
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(step, 90);
    }, 400);
    window.addEventListener("pointerup", stopHold, { once: true });
    window.addEventListener("pointercancel", stopHold, { once: true });
  }

  const isPage2Ready = bodyPointsRemaining === 0 && soulPointsRemaining === 0;

  const isPage5Ready =
    trappingsLoaded &&
    Object.keys(trappingsOptions.tierPools).every(
      (tier) => tierUnitsSpent(selectedResources, Number(tier)) >= (trappingsOptions.tierPools[tier] ?? 0)
    );

  const isLastPage = page === PAGE_COUNT - 1;

  // What page 1 (Foundation) requires before Continue may proceed: the
  // triangle activated, a gender, every currently-unlocked profession slot
  // filled with a distinct profession, and both name fields typed in.
  const isGenderMissing = gender === "";
  const isProfession1Missing = activeProfessionCount >= 1 && profession1 === "";
  const isProfession2Missing = activeProfessionCount >= 2 && profession2 === "";
  const isProfession3Missing = activeProfessionCount >= 3 && profession3 === "";
  const isFirstNameMissing = firstName.trim() === "";
  const isLastNameMissing = lastName.trim() === "";

  // Only compares against slots that are currently active/unlocked — a
  // stale value left in a since-deactivated slot (e.g. age dragged back
  // down) must not count as a clash.
  const isProfession1Duplicate =
    activeProfessionCount >= 1 &&
    profession1 !== "" &&
    ((activeProfessionCount >= 2 && profession1 === profession2) ||
      (activeProfessionCount >= 3 && profession1 === profession3));
  const isProfession2Duplicate =
    activeProfessionCount >= 2 &&
    profession2 !== "" &&
    (profession2 === profession1 || (activeProfessionCount >= 3 && profession2 === profession3));
  const isProfession3Duplicate =
    activeProfessionCount >= 3 &&
    profession3 !== "" &&
    (profession3 === profession1 || profession3 === profession2);

  const isPage1Ready =
    triangleActivated &&
    !isGenderMissing &&
    !isProfession1Missing &&
    !isProfession2Missing &&
    !isProfession3Missing &&
    !isProfession1Duplicate &&
    !isProfession2Duplicate &&
    !isProfession3Duplicate &&
    !isFirstNameMissing &&
    !isLastNameMissing;

  // The wizard is a fixed full-viewport overlay, but the page behind it
  // (header + welcomeScreen + footer) can still exceed 100vh and scroll
  // underneath it. Some browsers scroll the html element rather than body,
  // so both need to be locked while the wizard is mounted.
  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  // Blend the header out for the whole wizard (pages 0–3) and restore it
  // once the wizard unmounts, whichever page that happens on.
  useEffect(() => {
    setHeaderHidden(true);
    return () => setHeaderHidden(false);
  }, [setHeaderHidden]);

  async function handleContinue() {
    if (!isLastPage) {
      setPage((p) => p + 1);
      return;
    }
    if (isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const raceGroup = RACES.find((r) => r.id === race)?.category ?? "Common";
      const res = await fetch("/api/auth/me/characters", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotNumber,
          firstName,
          lastName,
          age_month: char_age,
          gender,
          raceGroup,
          race,
          profession1: profession1 || "none",
          profession2: profession2 || "none",
          profession3: profession3 || "none",
          // An untouched portrait step leaves this blank - stored as a
          // deliberately unloadable placeholder rather than "", so the soul
          // slot's existing broken-image handling renders it as a "?"
          // instead of silently reading as "no portrait was ever framed"
          // (the separate, neutral empty-soul art).
          portraitUrl: portraitUrl.trim() || "empty",
          birthsign: birthsign ?? "",
          portraitZoom,
          portraitPan,
          portraitFrameArea: savedPortraitFrameArea,
          portraitFaceArea: savedPortraitFaceArea,
          attr: { ...bodyAttributes, ...soulAttributes },
          selectedResources,
          selectedBlueprints: Object.values(blueprintSelections).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed to save character");
      onExit();
    } catch {
      setSubmitError("Could not save your character. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // The Continue button stays clickable even when page 1 isn't ready yet —
  // clicking it "anyway" is what triggers the highlight telling the user
  // what's still missing, rather than doing nothing like a disabled button.
  function handleContinueClick() {
    if (page === 1 && !isPage1Ready) {
      // Both can apply at once: a fresh page load has the triangle
      // un-activated AND every field still empty, so highlight all of it,
      // not just the triangle hint.
      if (!triangleActivated) {
        flashIlluActivationHint();
      }
      const missing: string[] = [];
      if (isGenderMissing) missing.push("gender");
      if (isProfession1Missing) missing.push("profession1");
      if (isProfession2Missing) missing.push("profession2");
      if (isProfession3Missing) missing.push("profession3");
      if (isProfession1Duplicate) missing.push("profession1");
      if (isProfession2Duplicate) missing.push("profession2");
      if (isProfession3Duplicate) missing.push("profession3");
      if (isFirstNameMissing) missing.push("firstName");
      if (isLastNameMissing) missing.push("lastName");
      if (missing.length > 0) flashMissingFields(missing);
      return;
    }
    if (page === 2 && !isPage2Ready) {
      return;
    }
    if (page === 5 && !isPage5Ready) {
      return;
    }
    if (page === 4 && birthsign === null) {
      flashMissingFields(["birthsign"]);
      return;
    }
    handleContinue();
  }

  return (
    <div
      className={`${styles.wizard} ${page === 1 || page === 3 ? styles.noTouchScroll : ""} ${
        page === 0 || page === 2 || page === 4 || page === 5 ? styles.wizardScrollable : ""
      }`}
      onClick={handlePageClick}
      onPointerDown={handlePagePointerDown}
      onPointerMove={handlePagePointerMove}
      onPointerUp={handlePagePointerUp}
      onPointerCancel={handlePagePointerUp}
      onScroll={() => {
        if (suppressBirthsignScrollClearRef.current) return;
        if (flippedBirthsign !== null) setFlippedBirthsign(null);
      }}
    >
      <div className={styles.stage}>
        <div
          className={
            page === 0 || page === 2
              ? `${styles.content} ${styles.contentTop} ${styles.contentTopTight} ${styles.contentScrollable}`
              : page === 4
              ? `${styles.content} ${styles.contentTop} ${styles.contentTopTight} ${styles.contentScrollable} ${styles.contentWide}`
              : page === 5
              ? `${styles.content} ${styles.contentTop} ${styles.contentTopTight} ${styles.contentScrollable} ${styles.contentWidest}`
              : page === 1 || page === 3
              ? `${styles.content} ${styles.contentTop} ${styles.contentTopTight}`
              : styles.content
          }
        >
          {page === 0 ? (
            <>
              <h1 className={styles.headline}>Shaping forces</h1>
              <p className={`${styles.introText} ${styles.introTextLarge}`}>
                Every character is shaped by three forces. Body and Soul share one reserve of points —
                strengthen one, and the other yields — those points will be distributed across your attributes.
              </p>

              <div className={styles.attributeRow}>
                <div className={styles.attributeItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    draggable={false}
                    className={styles.attributeIcon}
                    src="/images/soul-creation/equilize-body.png"
                    alt="Body"
                  />
                  <span className={styles.attributeLabel}>Body</span>
                </div>
                <div className={styles.attributeItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    draggable={false}
                    className={styles.attributeIcon}
                    src="/images/soul-creation/equilize-soul.png"
                    alt="Soul"
                  />
                  <span className={styles.attributeLabel}>Soul</span>
                </div>
                <div className={styles.attributeItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    draggable={false}
                    className={styles.attributeIcon}
                    src="/images/soul-creation/equilize-life.png"
                    alt="Life"
                  />
                  <span className={styles.attributeLabel}>Life</span>
                </div>
              </div>

              <p className={`${styles.introText} ${styles.introTextLarge}`}>
                Life Energy sets that reserve&apos;s size — more Energy rises your starting age. Body and Soul each range from 4-100.
              </p>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                draggable={false}
                className={styles.middleIllustration}
                src="/images/soul-creation/equilize-middle-illu.png"
                alt="The mystic triangle"
              />

              <p className={`${styles.introText} ${styles.introTextLarge}`}>
                Continue to activate the mystic triangle to balance Body, Soul, and Life Energy.
              </p>

              <div className={styles.upcomingSteps}>
                <p className={styles.upcomingStepsLabel}>Also ahead in this wizard</p>
                <div className={styles.upcomingStepList}>
                  <div className={styles.upcomingStep}>
                    <span className={styles.upcomingStepTitle}>Portrait</span>
                    <span className={styles.upcomingStepDesc}>
                      Paste any image URL and frame your character&apos;s face — zoom and pan to get the crop exactly right. An image hosting service is recommended for a stable link.
                    </span>
                  </div>
                  <div className={styles.upcomingStep}>
                    <span className={styles.upcomingStepTitle}>Birth Sign</span>
                    <span className={styles.upcomingStepDesc}>
                      Choose one of eight permanent signs. Each grants a rechargeable ability that shapes how your adventures unfold.
                    </span>
                  </div>
                  <div className={styles.upcomingStep}>
                    <span className={styles.upcomingStepTitle}>Trappings</span>
                    <span className={styles.upcomingStepDesc}>
                      Your professions determine what resources and blueprints you carry into the world — spend your starting budget across tiered items.
                    </span>
                  </div>
                </div>
              </div>

            </>
          ) : page === 1 ? (
            <>
              <h1 className={styles.headline}>Foundation</h1>
              <p className={styles.introText}>
                Select the{" "}
                <Link href="/characters" className={styles.inlineLink}>origins.</Link>
              </p>
              <div className={styles.nameRow}>
                <input
                  className={`${styles.textInput} ${missingFields.has("firstName") ? styles.fieldMissing : ""}`}
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <input
                  className={`${styles.textInput} ${missingFields.has("lastName") ? styles.fieldMissing : ""}`}
                  type="text"
                  placeholder="Surname"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </>
          ) : page === 2 ? (
            <div className={styles.attrPage} onContextMenu={(e) => e.preventDefault()}>
              <h1 className={styles.headline}>Attributes</h1>
              <div className={styles.attrPicker}>
                <div className={styles.attrSection}>
                  <div className={styles.attrSectionHeader}>
                    <span>Body</span>
                    <span>{bodyPointsRemaining} / {body} remaining</span>
                  </div>
                  {(
                    [
                      ["migh", "Might"],
                      ["agil", "Agility"],
                      ["endu", "Endurance"],
                      ["prec", "Precision"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className={styles.attrRow} key={key}>
                      <span className={styles.attrLabel}>{label}</span>
                      <div className={styles.attrStepper}>
                        <button
                          type="button"
                          className={styles.attrStepBtn}
                          onPointerDown={() => startHold(() => handleBodyAttributeChange(key, -1))}
                          onContextMenu={(e) => e.preventDefault()}
                          disabled={bodyAttributes[key] <= 1}
                          aria-label={`Decrease ${label}`}
                        >
                          ◀
                        </button>
                        <span className={styles.attrValueBox}>{bodyAttributes[key]}</span>
                        <button
                          type="button"
                          className={styles.attrStepBtn}
                          onPointerDown={() => startHold(() => handleBodyAttributeChange(key, 1))}
                          onContextMenu={(e) => e.preventDefault()}
                          disabled={bodyPointsRemaining <= 0}
                          aria-label={`Increase ${label}`}
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.attrSection}>
                  <div className={styles.attrSectionHeader}>
                    <span>Soul</span>
                    <span>{soulPointsRemaining} / {soul} remaining</span>
                  </div>
                  {(
                    [
                      ["will", "Will"],
                      ["insi", "Insight"],
                      ["lore", "Lore"],
                      ["pres", "Presence"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className={styles.attrRow} key={key}>
                      <span className={styles.attrLabel}>{label}</span>
                      <div className={styles.attrStepper}>
                        <button
                          type="button"
                          className={styles.attrStepBtn}
                          onPointerDown={() => startHold(() => handleSoulAttributeChange(key, -1))}
                          onContextMenu={(e) => e.preventDefault()}
                          disabled={soulAttributes[key] <= 1}
                          aria-label={`Decrease ${label}`}
                        >
                          ◀
                        </button>
                        <span className={styles.attrValueBox}>{soulAttributes[key]}</span>
                        <button
                          type="button"
                          className={styles.attrStepBtn}
                          onPointerDown={() => startHold(() => handleSoulAttributeChange(key, 1))}
                          onContextMenu={(e) => e.preventDefault()}
                          disabled={soulPointsRemaining <= 0}
                          aria-label={`Increase ${label}`}
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className={styles.randomizeButton}
                onClick={handleRandomizeAttributes}
              >
                Randomize
              </button>
            </div>
          ) : page === 3 ? (
            <>
              <h1 className={styles.headline}>Portrait</h1>
              <PortraitEditor
                initialUrl={portraitUrl}
                initialZoom={portraitZoom}
                initialPan={portraitPan}
                onChange={(value) => {
                  setPortraitUrl(value.portraitUrl);
                  setPortraitZoom(value.portraitZoom);
                  setPortraitPan(value.portraitPan);
                  setSavedPortraitFrameArea(value.portraitFrameArea);
                  setSavedPortraitFaceArea(value.portraitFaceArea);
                }}
              />
            </>
          ) : page === 4 ? (
            <>
              <h1 className={styles.headline}>Birth Sign</h1>
              <div
                className={`${styles.birthsignGrid} ${
                  missingFields.has("birthsign") ? styles.fieldMissing : ""
                }`}
              >
                {BIRTHSIGNS.map((sign) => {
                  const isFlipped = flippedBirthsign === sign.id;
                  return (
                    <button
                      key={sign.id}
                      type="button"
                      className={`${styles.birthsignTile} ${
                        birthsign === sign.id ? styles.birthsignTileSelected : ""
                      }`}
                      onClick={() => handleBirthsignTileClick(sign.id)}
                      aria-pressed={birthsign === sign.id}
                      aria-label={`${sign.name}: ${isFlipped ? "hide" : "show"} description`}
                    >
                      <div
                        className={`${styles.birthsignFlipper} ${
                          isFlipped ? styles.birthsignFlipperFlipped : ""
                        }`}
                      >
                        <div className={styles.birthsignFace}>
                          <img src={sign.image} alt={sign.name} className={styles.birthsignImage} />
                        </div>
                        <div className={`${styles.birthsignFace} ${styles.birthsignFaceBack}`}>
                          <h3 className={styles.birthsignName}>{sign.name}</h3>
                          <p className={styles.birthsignFlavor}>{sign.flavor}</p>
                          <p className={styles.birthsignEffect}>
                            <span className={styles.birthsignEffectLabel}>Event: </span>
                            {sign.effect}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className={styles.introText}>
                Your birth sign is permanent once chosen. It grants one charge per adventure — rare events like
                death and revival, or regaining a lost soul, may grant a second or third charge.
              </p>
            </>
          ) : page === 5 ? (
            <>
              <h1 className={styles.headline}>Trappings</h1>
              <p className={styles.introText}>
                Your professions leave you with the makings of your trade. Choose what you carry into the world.
              </p>
              <p className={styles.trappingsProfessionList}>
                {[profession1, profession2, profession3]
                  .filter((id) => id && id !== "none")
                  .map((professionId) => PROFESSIONS.find((p) => p.id === professionId)?.name)
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className={styles.trappingsPicker}>
                {Object.keys(trappingsOptions.tierPools)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((tier) => {
                    const pool = trappingsOptions.tierPools[String(tier)] ?? 0;
                    const spent = tierUnitsSpent(selectedResources, tier);
                    const remaining = pool - spent;
                    return (
                      <div key={tier} className={styles.trappingsTierGroup}>
                        <div className={styles.trappingsTierHeader}>
                          <span>Tier {tier}</span>
                          <span>
                            {remaining} / {pool} remaining
                          </span>
                        </div>
                        {trappingsOptions.items
                          .filter((item) => item.tier === tier)
                          .map((item) => {
                            const amount = selectedResources[item.id] ?? 0;
                            return (
                              <div key={item.id} className={styles.trappingsRow}>
                                <div className={styles.trappingsItemInfo}>
                                  <span className={styles.trappingsItemName}>{item.name}</span>
                                  <span className={styles.trappingsItemFamily}>{item.familyId}</span>
                                </div>
                                <div className={styles.trappingsStepper}>
                                  <button
                                    type="button"
                                    className={styles.attrStepBtn}
                                    onPointerDown={() => startHold(() => adjustSelectedResource(item, -1))}
                                    onContextMenu={(e) => e.preventDefault()}
                                    disabled={amount <= 0}
                                    aria-label={`Decrease ${item.name}`}
                                  >
                                    ◀
                                  </button>
                                  <span className={styles.trappingsAmount}>{amount}</span>
                                  <button
                                    type="button"
                                    className={styles.attrStepBtn}
                                    onPointerDown={() => startHold(() => adjustSelectedResource(item, 1))}
                                    onContextMenu={(e) => e.preventDefault()}
                                    disabled={remaining <= 0}
                                    aria-label={`Increase ${item.name}`}
                                  >
                                    ▶
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
              {trappingsOptions.blueprintPools.length > 0 && (
                <div className={styles.trappingsPicker}>
                  {trappingsOptions.blueprintPools.map((pool, poolIdx) => {
                    // Slots within the same pool shouldn't offer each other's
                    // already-picked item - two dropdowns both landing on
                    // the exact same blueprint would waste a slot.
                    const slotKeys = Array.from({ length: pool.count }, (_, slotIdx) => `${poolIdx}:${slotIdx}`);
                    const pickedElsewhere = (thisKey: string) =>
                      new Set(slotKeys.filter((k) => k !== thisKey).map((k) => blueprintSelections[k]).filter(Boolean));
                    return (
                      <div key={poolIdx} className={styles.trappingsTierGroup}>
                        <div className={styles.trappingsTierHeader}>
                          <span>{BLUEPRINT_SOURCE_LABELS[pool.source] ?? pool.source}</span>
                          <span>Tier {pool.tier}</span>
                        </div>
                        {slotKeys.map((slotKey) => {
                          const taken = pickedElsewhere(slotKey);
                          const value = blueprintSelections[slotKey] ?? "";
                          return (
                            <div key={slotKey} className={styles.trappingsRow}>
                              <select
                                className={styles.trappingsBlueprintSelect}
                                value={value}
                                onChange={(e) =>
                                  setBlueprintSelections((prev) => ({ ...prev, [slotKey]: e.target.value }))
                                }
                              >
                                <option value="">— choose —</option>
                                {pool.items
                                  .filter((item) => item.id === value || !taken.has(item.id))
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name.replace("Blueprint: ", "")} (T{item.tier})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
              {submitError && <p className={styles.submitError}>{submitError}</p>}
              {recipeViewerSrc && (
                <>
                  <p className={styles.recipeViewerHeading}>Crafting Recipes</p>
                  <iframe
                    ref={recipeViewerRef}
                    src={recipeViewerSrc}
                    title="Crafting Recipe Viewer"
                    className={styles.recipeViewerFrame}
                    style={{ height: recipeViewerHeight }}
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
                </>
              )}
              <button
                className={`${styles.navButton} ${styles.continueInline} ${
                  !isPage5Ready ? styles.continueInactive : ""
                }`}
                onClick={handleContinueClick}
                disabled={isLastPage && isSubmitting}
              >
                {isLastPage && isSubmitting ? "Saving…" : "Continue"}
              </button>
            </>
          ) : (
            <h1 className={styles.headline}>Page {page + 1}</h1>
          )}
        </div>

        {page === 1 && (
          <div className={styles.triangleGroup} ref={triangleGroupRef}>
            {/* Bulbs — lowest layer. Sit under the body/soul/life holes. */}
            <div className={`${styles.bulbSlot} ${styles.bulbSlotBody}`}>
              <SoulBulb
                fillPercent={body}
                color="#9e1303"
                showPercent={false}
                label="Body"
                className={styles.bulbFill}
              />
            </div>
            <div className={`${styles.bulbSlot} ${styles.bulbSlotSoul}`}>
              <SoulBulb
                fillPercent={soul}
                color="#8b5cf6"
                showPercent={false}
                label="Soul"
                className={styles.bulbFill}
              />
            </div>
            <div className={`${styles.bulbSlot} ${styles.bulbSlotLife}`}>
              <SoulBulb
                fillPercent={getLifeEnergyFill(char_age)}
                color="#aaa9a9"
                showPercent={false}
                label="Life"
                className={styles.bulbFill}
              />
            </div>

            {/* Body/Soul/Life medallions — sit on top of the bulbs, below the triangle.
                Once activated, they slowly grey out, darken, and fade away to
                reveal the full-color bulbs underneath. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              draggable={false}
              className={`${styles.medallion} ${styles.medallionBody} ${triangleActivated ? styles.medallionActivated : ""}`}
              src="/images/soul-creation/equilize-body.png"
              alt="Body"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              draggable={false}
              className={`${styles.medallion} ${styles.medallionSoul} ${triangleActivated ? styles.medallionActivated : ""}`}
              src="/images/soul-creation/equilize-soul.png"
              alt="Soul"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              draggable={false}
              className={`${styles.medallion} ${styles.medallionLife} ${triangleActivated ? styles.medallionActivated : ""}`}
              src="/images/soul-creation/equilize-life.png"
              alt="Life"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              draggable={false}
              className={styles.triangleImg}
              src="/images/soul-creation/equilize-triangle.png"
              alt=""
            />
            <div
              className={`${styles.middleOverlayWrap} ${styles.middleOverlayWrapIllu} ${triangleActivated ? styles.middleOverlayFadeOut : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                draggable={false}
                className={`${styles.middleOverlayImg} ${illuActivationHint ? styles.illuActivationHint : ""}`}
                src="/images/soul-creation/equilize-middle-illu.png"
                alt=""
              />
              <div className={styles.illuShine} />
            </div>
            <div
              className={`${styles.middleOverlayWrap} ${styles.middleOverlayWrapJoystick} ${triangleActivated ? styles.middleOverlayFadeIn : ""}`}
              style={{
                "--joy-x": `${joystickOffset.x}px`,
                "--joy-y": `${joystickOffset.y}px`,
              } as React.CSSProperties}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                draggable={false}
                className={styles.middleOverlayImg}
                src="/images/soul-creation/equilize-joystick.png"
                alt=""
              />
            </div>
          </div>
        )}

        {page === 1 && (
          <div className={styles.statBlockLeft} title={`Body + Soul = ${bodySoulSum}`}>
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${pinyonScript.className}`}>{body}</span>
              <span className={styles.statLabel}>Body</span>
            </div>
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${pinyonScript.className}`}>{soul}</span>
              <span className={styles.statLabel}>Soul</span>
            </div>
          </div>
        )}

        {page === 1 && (
          <div className={styles.statBlockRight}>
            <div className={styles.statItem}>
              <span className={`${styles.statValue} ${pinyonScript.className}`}>{displayedAge}</span>
              <span className={styles.statLabel}>Age</span>
            </div>
          </div>
        )}

        {page === 1 && (
          <>
            <h2 className={styles.sideHeadline}>Origins</h2>
            <div className={styles.sideSelectsLeft}>
              <select
                className={styles.comboBox}
                value={race}
                onChange={(e) => setRace(e.target.value)}
              >
                <option value="" disabled>Race</option>
                {Object.entries(racesByCategory).map(([category, races]) => (
                  <optgroup key={category} label={category}>
                    {races.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                className={`${styles.comboBox} ${missingFields.has("gender") ? styles.fieldMissing : ""}`}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="" disabled>Gender</option>
                {GENDERS.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {page === 1 && (
          <>
            <h2 className={styles.sideHeadlineRight}>Craft</h2>
            <div className={styles.sideSelectsRight}>
              <select
                className={`${styles.comboBox} ${missingFields.has("profession1") ? styles.fieldMissing : ""}`}
                disabled={activeProfessionCount < 1}
                value={profession1}
                onChange={(e) => setProfession1(e.target.value)}
              >
                <option value="" disabled>Profession 1</option>
                {Object.entries(professionsByCategory).map(([category, professions]) => (
                  <optgroup key={category} label={category}>
                    {professions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                className={`${styles.comboBox} ${missingFields.has("profession2") ? styles.fieldMissing : ""}`}
                disabled={activeProfessionCount < 2}
                value={profession2}
                onChange={(e) => setProfession2(e.target.value)}
              >
                <option value="" disabled>Profession 2</option>
                {Object.entries(professionsByCategory).map(([category, professions]) => (
                  <optgroup key={category} label={category}>
                    {professions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                className={`${styles.comboBox} ${missingFields.has("profession3") ? styles.fieldMissing : ""}`}
                disabled={activeProfessionCount < 3}
                value={profession3}
                onChange={(e) => setProfession3(e.target.value)}
              >
                <option value="" disabled>Profession 3</option>
                {Object.entries(professionsByCategory).map(([category, professions]) => (
                  <optgroup key={category} label={category}>
                    {professions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Page 5's own Continue button sits inline right under the recipe
            viewer instead - see the copy rendered there. */}
        {page !== 5 && (
          <button
            className={`${styles.navButton} ${styles.continue} ${
              (page === 1 && !isPage1Ready) || (page === 2 && !isPage2Ready) || (page === 4 && birthsign === null) ? styles.continueInactive : ""
            }`}
            onClick={handleContinueClick}
            disabled={isLastPage && isSubmitting}
          >
            {isLastPage && isSubmitting ? "Saving…" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
