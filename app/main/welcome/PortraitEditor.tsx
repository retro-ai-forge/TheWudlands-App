"use client";

/**
 * Reusable portrait framing widget: paste an image URL, then zoom (wheel /
 * trackpad pinch / two-finger touch pinch) and pan (drag) it to frame both
 * a full-body "frame" crop and a face-only "face" crop. Extracted from the
 * Soul Creation wizard's Portrait step (which still uses this, unchanged)
 * so the same editor can also open standalone to re-frame an existing
 * character's portrait after creation.
 *
 * Owns no save/cancel UI of its own - the caller wraps this with whatever
 * heading and action buttons make sense for its context (the wizard's
 * "Continue", or a standalone editor's "Save"/"Cancel") and reads the
 * latest framing via onChange, fired whenever the url/zoom/pan (and so the
 * derived crop rectangles) change.
 */

import { useEffect, useRef, useState } from "react";
import styles from "./PortraitEditor.module.css";

export type PortraitArea = { x: number; y: number; width: number; height: number };

export interface PortraitEditorValue {
  portraitUrl: string;
  portraitZoom: number;
  portraitPan: { x: number; y: number };
  portraitFrameArea: PortraitArea | null;
  portraitFaceArea: PortraitArea | null;
}

export function PortraitEditor({
  initialUrl = "",
  initialZoom = 1,
  initialPan = { x: 0, y: 0 },
  onChange,
}: {
  initialUrl?: string;
  initialZoom?: number;
  initialPan?: { x: number; y: number };
  onChange: (value: PortraitEditorValue) => void;
}) {
  const [portraitUrl, setPortraitUrl] = useState(initialUrl);
  const [portraitZoom, setPortraitZoom] = useState(initialZoom);
  const [portraitPan, setPortraitPan] = useState(initialPan);

  const portraitFrameRef = useRef<HTMLDivElement>(null);
  const portraitUrlInputRef = useRef<HTMLInputElement>(null);
  const portraitHeadZoneRef = useRef<HTMLDivElement>(null);
  const portraitNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const portraitDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);
  // Pointers currently down on the portrait image — one active pointer pans
  // (existing drag behavior below), two active pointers pinch-zoom instead.
  const portraitActivePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const portraitPinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  // The image's very first load (mount) should keep initialZoom/initialPan
  // as-is - reopening the editor on an already-framed portrait shouldn't
  // snap it back to unzoomed/centered. Every later load (the user pasted a
  // different URL) is a new image with no framing yet, so that one really
  // should reset to the 1x/centered baseline.
  const isFirstLoadRef = useRef(true);

  // .portraitFrame is viewport-height-relative (80vh) and the URL field is
  // pinned near the true bottom edge, so on short viewports the gap between
  // them can shrink well below the hint text's fixed CSS offset, pushing it
  // to overlap the frame. Measuring the actual gap and centering the hint
  // within it keeps it clear on any height. This is the midpoint's distance
  // from the viewport TOP — paired with the CSS's translate(-50%, -50%),
  // that centers the text's own box on the midpoint, rather than anchoring
  // just one edge of it there.
  const [portraitHintCenterY, setPortraitHintCenterY] = useState<number | null>(null);
  useEffect(() => {
    function updatePortraitHintCenterY() {
      const frame = portraitFrameRef.current;
      const urlInput = portraitUrlInputRef.current;
      if (!frame || !urlInput) return;
      setPortraitHintCenterY((frame.getBoundingClientRect().bottom + urlInput.getBoundingClientRect().top) / 2);
    }
    updatePortraitHintCenterY();
    window.addEventListener("resize", updatePortraitHintCenterY);
    return () => window.removeEventListener("resize", updatePortraitHintCenterY);
  }, []);

  // The scale at which the image's natural size fits entirely inside the
  // frame without cropping — the zoom baseline (1x).
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

  // What .portraitFrame (the full character screen) and .portraitHeadZone
  // (the face preview) currently show, both translated back into the
  // original uploaded image's own coordinate space (0-1 fractions of its
  // natural width/height) — portable, so it still makes sense however
  // large/small the image is later re-rendered at, unlike the on-screen
  // pixel positions used while editing. Re-applying { x, y, width, height }
  // as a crop reproduces exactly what the user framed here, regardless of
  // zoom/pan, which are just the editing controls used to arrive at these
  // two rectangles.
  // zoom/pan default to current state, but accept explicit overrides for the
  // moment right after resetting them (see handlePortraitImageLoad) - a
  // setState call doesn't update this render's own portraitZoom/portraitPan
  // closure values, so computing immediately afterward would otherwise still
  // read the pre-reset numbers.
  function getPortraitAreas(
    zoomOverride?: number,
    panOverride?: { x: number; y: number }
  ): { frameArea: PortraitArea | null; faceArea: PortraitArea | null } {
    const nat = portraitNaturalSizeRef.current;
    const frame = portraitFrameRef.current;
    const headZone = portraitHeadZoneRef.current;
    if (!nat || !frame || !headZone) return { frameArea: null, faceArea: null };

    const zoom = zoomOverride ?? portraitZoom;
    const pan = panOverride ?? portraitPan;
    const frameRect = frame.getBoundingClientRect();
    const scale = getPortraitFitScale() * zoom;
    const renderedW = nat.width * scale;
    const renderedH = nat.height * scale;
    // Image's rendered top-left corner, relative to the frame's own top-left.
    const imgOffsetX = (frameRect.width - renderedW) / 2 + pan.x;
    const imgOffsetY = (frameRect.height - renderedH) / 2 + pan.y;

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

  const [savedPortraitFrameArea, setSavedPortraitFrameArea] = useState<PortraitArea | null>(null);
  const [savedPortraitFaceArea, setSavedPortraitFaceArea] = useState<PortraitArea | null>(null);

  function recomputeSavedAreas(zoomOverride?: number, panOverride?: { x: number; y: number }) {
    const { frameArea, faceArea } = getPortraitAreas(zoomOverride, panOverride);
    if (frameArea) setSavedPortraitFrameArea(frameArea);
    if (faceArea) setSavedPortraitFaceArea(faceArea);
  }

  // Covers dragging/zooming an already-loaded image. A freshly loaded image
  // (a new src, or the very first load) is handled explicitly inside
  // handlePortraitImageLoad instead - portraitZoom/portraitPan often don't
  // actually change value there (a reset to 1/{0,0} that was already
  // 1/{0,0}, or an unedited reopen), so relying on this effect's dependency
  // array alone would silently skip recomputing against the image that just
  // became the natural-size source of truth.
  useEffect(() => {
    recomputeSavedAreas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portraitZoom, portraitPan.x, portraitPan.y]);

  useEffect(() => {
    onChange({
      portraitUrl,
      portraitZoom,
      portraitPan,
      portraitFrameArea: savedPortraitFrameArea,
      portraitFaceArea: savedPortraitFaceArea,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portraitUrl, portraitZoom, portraitPan, savedPortraitFrameArea, savedPortraitFaceArea]);

  // True once the current portraitUrl fails to load — the browser's own
  // broken-image + alt-text rendering isn't stylable/positionable (it's
  // stuck top-left of the image box and often unreadable), so on error the
  // image itself is hidden and this drives a custom, readable message with
  // its own dark backdrop instead.
  const [portraitLoadFailed, setPortraitLoadFailed] = useState(false);

  function handlePortraitImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    portraitNaturalSizeRef.current = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
    setPortraitLoadFailed(false);
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      // The image's natural size just became known, which is what switches
      // the img's inline style from the "size unknown yet" placeholder
      // (100%/100%, no scale/pan) to the real scale+pan math - but setting a
      // ref doesn't itself trigger a re-render. Recompute the areas now that
      // natural size is known (so an open-then-immediately-save round trip
      // doesn't wipe the existing framing back to null), and force a render
      // via a new pan object as a fallback in case that computation comes
      // back empty for some reason - all without touching the zoom/pan
      // values themselves (unlike the reset below, meant for a genuinely new
      // image with no framing to preserve).
      recomputeSavedAreas();
      setPortraitPan((prev) => ({ ...prev }));
    } else {
      // A genuinely new image (the user pasted a different URL) - starts
      // unzoomed/centered. Recompute explicitly with these exact values
      // rather than relying on the effect above: portraitZoom/portraitPan
      // were very likely ALREADY 1/{0,0} (the common case - paste a URL,
      // don't touch zoom/pan, move on), so the effect's own dependencies
      // wouldn't register a change and would never fire, leaving the saved
      // areas computed against whatever the PREVIOUS image's dimensions
      // were - wrong for this one.
      setPortraitZoom(1);
      setPortraitPan({ x: 0, y: 0 });
      recomputeSavedAreas(1, { x: 0, y: 0 });
    }
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
  // has no other natural zoom gesture.
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

  return (
    <>
      <div
        className={styles.portraitFrame}
        ref={portraitFrameRef}
        onWheel={handlePortraitWheel}
        title={savedPortraitFrameArea ? `frameArea: ${JSON.stringify(savedPortraitFrameArea)}` : undefined}
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
        {/* Outer rectangle marks the portrait bounds; the inner one shows
            where the head must land — the character preview page uses that
            same defined area to align/crop it. */}
        <div className={styles.portraitOutline} />
        <div
          className={styles.portraitHeadZone}
          ref={portraitHeadZoneRef}
          title={savedPortraitFaceArea ? `faceArea: ${JSON.stringify(savedPortraitFaceArea)}` : undefined}
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
  );
}
