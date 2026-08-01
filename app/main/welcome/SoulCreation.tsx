"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pinyon_Script } from "next/font/google";
import styles from "./SoulCreation.module.css";
import { GENDERS, racesByCategory, professionsByCategory } from "@/app/lib/characterOptions";
import {
  getDisplayedAge,
  getLifeEnergyFill,
  LIFE_ENERGY_MIN_AGE_MONTHS,
  LIFE_ENERGY_MAX_AGE_MONTHS,
} from "@/app/lib/ageScaling";
import SoulBulb from "./SoulBulb";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";

const pinyonScript = Pinyon_Script({ subsets: ["latin"], weight: "400" });

const PAGE_COUNT = 5;

export function SoulCreation({ onExit }: { onExit: () => void }) {
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

  // Manual fit/zoom/pan for the portrait, instead of object-fit:cover (which
  // always force-crops to fill the frame). At zoom 1 the whole image is
  // shown, uncropped, scaled down/up only as far as needed to fit inside
  // .portraitFrame (whichever dimension is the tighter constraint) — zoom
  // then scales up from there (mouse wheel/trackpad pinch, or two-finger
  // touch pinch), and pan (drag) repositions within whatever now overflows
  // the frame.
  const [portraitZoom, setPortraitZoom] = useState(1);
  const [portraitPan, setPortraitPan] = useState({ x: 0, y: 0 });
  const portraitFrameRef = useRef<HTMLDivElement>(null);
  const portraitUrlInputRef = useRef<HTMLInputElement>(null);
  const portraitHeadZoneRef = useRef<HTMLDivElement>(null);
  const portraitNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const portraitDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);
  // Pointers currently down on the portrait image — one active pointer pans
  // (existing drag behavior below), two active pointers pinch-zoom instead.
  const portraitActivePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const portraitPinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  // .portraitFrame is viewport-height-relative (80vh) and the URL field is
  // pinned near the true bottom edge, so on short viewports the gap between
  // them can shrink well below the hint text's fixed CSS offset, pushing it
  // to overlap the frame. Measuring the actual gap and centering the hint
  // within it (like the old zoom slider did) keeps it clear on any height.
  // This is the midpoint's distance from the viewport TOP — paired with the
  // CSS's translate(-50%, -50%), that centers the text's own box on the
  // midpoint, rather than anchoring just one edge of it there.
  const [portraitHintCenterY, setPortraitHintCenterY] = useState<number | null>(null);
  useEffect(() => {
    if (page !== 3) return;
    function updatePortraitHintCenterY() {
      const frame = portraitFrameRef.current;
      const urlInput = portraitUrlInputRef.current;
      if (!frame || !urlInput) return;
      setPortraitHintCenterY((frame.getBoundingClientRect().bottom + urlInput.getBoundingClientRect().top) / 2);
    }
    updatePortraitHintCenterY();
    window.addEventListener("resize", updatePortraitHintCenterY);
    return () => window.removeEventListener("resize", updatePortraitHintCenterY);
  }, [page]);

  // The scale at which the image's natural size fits entirely inside the
  // frame without cropping — the zoom slider's 1x baseline.
  function getPortraitFitScale(): number {
    const nat = portraitNaturalSizeRef.current;
    const frame = portraitFrameRef.current;
    if (!nat || !frame) return 1;
    const rect = frame.getBoundingClientRect();
    return Math.min(rect.width / nat.width, rect.height / nat.height);
  }

  // How far the image can be panned from center, per axis — (frame + image)/2
  // is the distance at which the image's near edge just reaches the frame's
  // far edge, i.e. it's about to completely leave the frame. That's a
  // deliberately permissive limit (lets the image go beyond the frame's own
  // edges, not just up to them) and works the same whether the image is
  // currently larger or smaller than the frame in that axis — smaller
  // doesn't mean locked centered, it just starts with more room to spare.
  function getPortraitPanLimits(zoom: number) {
    const nat = portraitNaturalSizeRef.current;
    const frame = portraitFrameRef.current;
    if (!nat || !frame) return { maxX: 0, maxY: 0 };
    const rect = frame.getBoundingClientRect();
    const scale = getPortraitFitScale() * zoom;
    return {
      maxX: (rect.width + nat.width * scale) / 2,
      maxY: (rect.height + nat.height * scale) / 2,
    };
  }

  // A crop rectangle expressed relative to the ORIGINAL uploaded image
  // (0–1 fractions of its natural width/height) — portable, so it still
  // makes sense however large/small the image is later re-rendered at,
  // unlike the on-screen pixel positions used while editing.
  type PortraitArea = { x: number; y: number; width: number; height: number };

  // What .portraitFrame (the full character screen) and .portraitHeadZone
  // (the face preview) currently show, both translated back into that same
  // natural-image coordinate space — this is what actually needs storing:
  // re-applying { x, y, width, height } as a crop (e.g. background-position
  // + background-size, or a server-side crop) reproduces exactly what the
  // user framed here, regardless of zoom/pan, which are just the editing
  // controls used to arrive at these two rectangles.
  function getPortraitAreas(): { frameArea: PortraitArea | null; faceArea: PortraitArea | null } {
    const nat = portraitNaturalSizeRef.current;
    const frame = portraitFrameRef.current;
    const headZone = portraitHeadZoneRef.current;
    if (!nat || !frame || !headZone) return { frameArea: null, faceArea: null };

    const frameRect = frame.getBoundingClientRect();
    const scale = getPortraitFitScale() * portraitZoom;
    const renderedW = nat.width * scale;
    const renderedH = nat.height * scale;
    // Image's rendered top-left corner, relative to the frame's own top-left.
    const imgOffsetX = (frameRect.width - renderedW) / 2 + portraitPan.x;
    const imgOffsetY = (frameRect.height - renderedH) / 2 + portraitPan.y;

    // `left`/`top` are frame-relative pixels; converts through the image's
    // current render scale/offset back to natural-image fractions.
    const toNaturalArea = (left: number, top: number, width: number, height: number): PortraitArea => ({
      x: (left - imgOffsetX) / scale / nat.width,
      y: (top - imgOffsetY) / scale / nat.height,
      width: width / scale / nat.width,
      height: height / scale / nat.height,
    });

    const headRect = headZone.getBoundingClientRect();
    return {
      frameArea: toNaturalArea(0, 0, frameRect.width, frameRect.height),
      faceArea: toNaturalArea(headRect.left - frameRect.left, headRect.top - frameRect.top, headRect.width, headRect.height),
    };
  }

  // True once the current portraitUrl fails to load — the browser's own
  // broken-image + alt-text rendering isn't stylable/positionable (it's
  // stuck top-left of the image box and often unreadable), so on error the
  // image itself is hidden and this drives a custom, readable message with
  // its own dark backdrop instead.
  const [portraitLoadFailed, setPortraitLoadFailed] = useState(false);

  function handlePortraitImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    portraitNaturalSizeRef.current = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
    setPortraitLoadFailed(false);
    setPortraitZoom(1);
    setPortraitPan({ x: 0, y: 0 });
  }

  function handlePortraitImageError() {
    setPortraitLoadFailed(true);
  }

  function handlePortraitZoomChange(rawZoom: number) {
    const clamped = Math.max(1, Math.min(3, rawZoom));
    setPortraitZoom(clamped);
    // Re-clamp so zooming back out can't leave a pan offset from the old,
    // more-permissive zoom level stranded outside the new limits.
    const { maxX, maxY } = getPortraitPanLimits(clamped);
    setPortraitPan((prev) => ({
      x: Math.max(-maxX, Math.min(maxX, prev.x)),
      y: Math.max(-maxY, Math.min(maxY, prev.y)),
    }));
  }

  // Trackpad pinch reliably arrives as a wheel event with ctrlKey set (the
  // browser translates the OS-level pinch gesture for us); a plain mouse
  // wheel arrives without it. Both are treated as zoom here, since a mouse
  // has no other natural zoom gesture and this replaces the old slider.
  function handlePortraitWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0006);
    handlePortraitZoomChange(portraitZoom * factor);
  }

  function pinchDistance(pointers: Map<number, { x: number; y: number }>): number {
    const [a, b] = Array.from(pointers.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function handlePortraitPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (!portraitNaturalSizeRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pointers = portraitActivePointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      portraitDragRef.current = null;
      portraitPinchStartRef.current = { distance: pinchDistance(pointers), zoom: portraitZoom };
    } else if (pointers.size === 1) {
      portraitPinchStartRef.current = null;
      portraitDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: portraitPan.x,
        startPanY: portraitPan.y,
      };
    }
  }

  function handlePortraitPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const pointers = portraitActivePointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinchStart = portraitPinchStartRef.current;
    if (pointers.size === 2 && pinchStart) {
      const ratio = pinchDistance(pointers) / pinchStart.distance;
      handlePortraitZoomChange(pinchStart.zoom * ratio);
      return;
    }

    const drag = portraitDragRef.current;
    if (!drag) return;
    const { maxX, maxY } = getPortraitPanLimits(portraitZoom);
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    setPortraitPan({
      x: Math.max(-maxX, Math.min(maxX, drag.startPanX + dx)),
      y: Math.max(-maxY, Math.min(maxY, drag.startPanY + dy)),
    });
  }

  function handlePortraitPointerUp(e: React.PointerEvent<HTMLImageElement>) {
    const pointers = portraitActivePointersRef.current;
    pointers.delete(e.pointerId);
    e.currentTarget.releasePointerCapture(e.pointerId);
    portraitDragRef.current = null;
    portraitPinchStartRef.current = null;
    // Releasing one finger of a pinch, with the other still down, resumes
    // as a single-finger pan from here rather than jumping.
    const [remaining] = Array.from(pointers.entries());
    if (remaining) {
      const [, pos] = remaining;
      portraitDragRef.current = {
        startClientX: pos.x,
        startClientY: pos.y,
        startPanX: portraitPan.x,
        startPanY: portraitPan.y,
      };
    }
  }

  // Page 2 (Attributes) — spending the Body/Soul totals from the triangle
  // (page 1) across the 4 stats each. Every stat starts at the backend's
  // floor of 1 (see BodyStats/SoulStats in character.py); the lowest
  // possible pool is 4 (BODY_SOUL_RATIO_MIN), which exactly covers that
  // 4-stats-at-1 floor with nothing left to spend.
  type BodyAttrKey = "strength" | "stamina" | "dexterity" | "speed";
  type SoulAttrKey = "power" | "wisdom" | "intelligence" | "perception";
  const [bodyAttributes, setBodyAttributes] = useState<Record<BodyAttrKey, number>>({
    strength: 1,
    stamina: 1,
    dexterity: 1,
    speed: 1,
  });
  const [soulAttributes, setSoulAttributes] = useState<Record<SoulAttrKey, number>>({
    power: 1,
    wisdom: 1,
    intelligence: 1,
    perception: 1,
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

  // Everything the portrait step needs to hand off later: portraitUrl (the
  // source image), portraitZoom (kept mainly for re-opening the editor at
  // the same view), and the two crop rectangles actually used to render the
  // character screen (frameArea) and the face preview (faceArea).
  const { frameArea: portraitFrameArea, faceArea: portraitFaceArea } = getPortraitAreas();

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

  function handleContinue() {
    if (isLastPage) {
      onExit();
    } else {
      setPage((p) => p + 1);
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
    handleContinue();
  }

  return (
    <div
      className={`${styles.wizard} ${page === 1 || page === 3 ? styles.noTouchScroll : ""} ${
        page === 0 || page === 2 ? styles.wizardScrollable : ""
      }`}
      onClick={handlePageClick}
      onPointerDown={handlePagePointerDown}
      onPointerMove={handlePagePointerMove}
      onPointerUp={handlePagePointerUp}
      onPointerCancel={handlePagePointerUp}
    >
      <div className={styles.stage}>
        <div
          className={
            page === 0 || page === 2
              ? `${styles.content} ${styles.contentTop} ${styles.contentTopTight} ${styles.contentScrollable}`
              : page === 1 || page === 3 || page === 4
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
                Life Energy sets that reserve&apos;s size — more Energy rises your starting age. Body and Soul each range from 4-100;
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
            <>
              <h1 className={styles.headline}>Attributes</h1>

              <div className={`${styles.attrSection} ${styles.attrSectionBody}`}>
                <h2 className={styles.attrSectionHeading}>Body</h2>
                <div className={styles.attrRemaining}>
                  <span className={styles.attrRemainingValue}>
                    {bodyPointsRemaining}/{body}
                  </span>
                  <span className={styles.attrRemainingLabel}>
                    point{body === 1 ? "" : "s"} to spend
                  </span>
                </div>
                {(
                  [
                    ["strength", "Strength"],
                    ["stamina", "Stamina"],
                    ["dexterity", "Dexterity"],
                    ["speed", "Speed"],
                  ] as const
                ).map(([key, label]) => (
                  <div className={styles.attrRow} key={key}>
                    <span className={styles.attrLabel}>{label}</span>
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
                ))}
              </div>

              <div className={`${styles.attrSection} ${styles.attrSectionSoul}`}>
                <h2 className={styles.attrSectionHeading}>Soul</h2>
                <div className={styles.attrRemaining}>
                  <span className={styles.attrRemainingValue}>
                    {soulPointsRemaining}/{soul}
                  </span>
                  <span className={styles.attrRemainingLabel}>
                    point{soul === 1 ? "" : "s"} to spend
                  </span>
                </div>
                {(
                  [
                    ["power", "Power"],
                    ["wisdom", "Wisdom"],
                    ["intelligence", "Intelligence"],
                    ["perception", "Perception"],
                  ] as const
                ).map(([key, label]) => (
                  <div className={styles.attrRow} key={key}>
                    <span className={styles.attrLabel}>{label}</span>
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
                ))}
              </div>
            </>
          ) : page === 3 ? (
            <>
              <h1 className={styles.headline}>Portrait</h1>
              <div
                className={styles.portraitFrame}
                ref={portraitFrameRef}
                onWheel={handlePortraitWheel}
                title={portraitFrameArea ? `frameArea: ${JSON.stringify(portraitFrameArea)}` : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  draggable={false}
                  className={styles.portraitImage}
                  style={{
                    ...(portraitNaturalSizeRef.current
                      ? {
                          width: `${portraitNaturalSizeRef.current.width * getPortraitFitScale() * portraitZoom}px`,
                          height: `${portraitNaturalSizeRef.current.height * getPortraitFitScale() * portraitZoom}px`,
                          transform: `translate(calc(-50% + ${portraitPan.x}px), calc(-50% + ${portraitPan.y}px))`,
                        }
                      : { width: "100%", height: "100%", transform: "translate(-50%, -50%)" }),
                    ...(portraitLoadFailed ? { visibility: "hidden" as const } : {}),
                  }}
                  src={portraitUrl.trim() !== "" ? portraitUrl : "/images/character/char_placeholder_silhouette.png"}
                  alt={portraitUrl.trim() !== "" ? "Your character's portrait" : "A placeholder silhouette of your character"}
                  onLoad={handlePortraitImageLoad}
                  onError={handlePortraitImageError}
                  onPointerDown={handlePortraitPointerDown}
                  onPointerMove={handlePortraitPointerMove}
                  onPointerUp={handlePortraitPointerUp}
                  onPointerCancel={handlePortraitPointerUp}
                />
                {portraitLoadFailed && (
                  <div className={styles.portraitLoadError}>
                    Couldn&apos;t load that image — check the URL and try again.
                  </div>
                )}
                {/* Outer rectangle marks the portrait bounds; the inner one
                    shows where the head must land — the character preview
                    page will use that same defined area to align/crop it. */}
                <div className={styles.portraitOutline} />
                <div
                  className={styles.portraitHeadZone}
                  ref={portraitHeadZoneRef}
                  title={portraitFaceArea ? `faceArea: ${JSON.stringify(portraitFaceArea)}` : undefined}
                />
              </div>
              <p
                className={styles.portraitHint}
                style={portraitHintCenterY !== null ? { top: `${portraitHintCenterY}px` } : undefined}
              >
                Zoom and pan the image to frame it.
              </p>
              <input
                ref={portraitUrlInputRef}
                className={`${styles.textInput} ${styles.portraitUrlInput}`}
                type="text"
                placeholder="Paste an image URL"
                value={portraitUrl}
                onChange={(e) => {
                  setPortraitUrl(e.target.value);
                  setPortraitLoadFailed(false);
                }}
              />
            </>
          ) : page === 4 ? (
            <h1 className={styles.headline}>Craft</h1>
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

        <button
          className={`${styles.navButton} ${styles.continue} ${page === 1 && !isPage1Ready ? styles.continueInactive : ""}`}
          onClick={handleContinueClick}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
