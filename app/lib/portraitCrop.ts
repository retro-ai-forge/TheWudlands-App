// Shared helper for rendering a fractional crop rectangle of a character's
// portraitUrl as a plain <img> (not a CSS background-image, so a broken URL
// still fires a real onError the caller can react to). Used for both the
// soul-slot face thumbnail and the character sheet's face/body crops.

/** A crop rectangle, as fractions (0-1) of the source portrait's natural size. */
export interface PortraitArea {
  x: number;
  y: number;
  width: number;
  height: number;
  // The crop rectangle's true on-screen aspect ratio (width/height),
  // captured directly from the editor's own frame element at save time (see
  // PortraitEditor.tsx's getPortraitAreas) - x/y/width/height alone can't
  // reproduce this, since they're fractions of two different bases (the
  // source image's natural width and natural height) that don't cancel out
  // into a ratio without also knowing the natural size. A display box (see
  // BodyTab.tsx) should use this directly rather than assuming a fixed
  // shape - the editor's own frame can render at a slightly different ratio
  // than its nominal CSS one depending on the viewport it was framed on.
  // Optional only because records saved before this field existed won't
  // have it.
  aspectRatio?: number;
}

// Setting the img's own width/height to 100/width% and 100/height% renders
// the WHOLE natural image at that scale - at which point the crop's own
// left/top edge sits exactly area.x/area.y of the way across the img's own
// box, in the img's own percentage terms (independent of the scale factor,
// since area.x is already a fraction of the full image). Translating by
// that same negative percentage moves the crop's edge to the wrapper's
// edge (0,0). The wrapper must be the same size as the box being filled,
// with position:relative and overflow:hidden - and must be shaped to
// area.aspectRatio, or the crop renders visibly stretched.
export function getPortraitCropImgStyle(area: PortraitArea) {
  // No upper bound: a letterboxed frame (the frame's own aspect ratio
  // doesn't match the source image, so it doesn't fully fill the frame in
  // one axis) legitimately produces a fraction greater than 1 in that axis
  // - the frame spans more of the wrapper than the image's own natural
  // size does. Clamping that back down to 1 would force this axis's
  // percentage to 100%, stretching the image to fill the wrapper instead
  // of rendering it at its real scaled size with letterbox gaps showing
  // the wrapper's own background on either side.
  const width = Math.max(area.width, 0.01);
  const height = Math.max(area.height, 0.01);
  return {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: `${100 / width}%`,
    height: `${100 / height}%`,
    maxWidth: "none",
    // Negate the number itself, not the string - area.x/y are routinely
    // negative (any letterboxed crop, e.g. a frame whose aspect ratio
    // doesn't match the source image), and `-${area.x * 100}%` on a
    // negative value string-concatenates into a doubly-negative, CSS-invalid
    // "--25%", which the browser then silently drops the whole transform
    // for - leaving the image unpositioned instead of cropped.
    transform: `translate(${-area.x * 100}%, ${-area.y * 100}%)`,
  };
}
