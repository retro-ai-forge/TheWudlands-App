import { useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// The 10 dark squares baked into chakra-page-active.jpg (600x900) - found
// by pixel-analyzing the image for near-black square regions, each
// ~75x75px, i.e. ~12.5% of the image's own width (and, since the image is
// a fixed 2:3 ratio, the same 12.5% works as a percent of .soulImageFrame's
// width too, scaling in lockstep with the image at any render size).
// top/left are each square's measured center; numbered top to bottom per
// row (row of 1 in the center counts as one number, a left/right pair
// counts as two, in reading order).
const CHAKRA_SLOTS: { number: number; label: string; top: number; left: number }[] = [
  { number: 1, label: "Mind", top: 9.9, left: 50.0 },
  { number: 2, label: "Prime", top: 21.8, left: 26.2 },
  { number: 3, label: "Spirit", top: 21.8, left: 73.2 },
  { number: 4, label: "Correspondence", top: 34.3, left: 49.9 },
  { number: 5, label: "Entropy", top: 46.5, left: 22.2 },
  { number: 6, label: "Life", top: 46.6, left: 77.4 },
  { number: 7, label: "Forces", top: 53.6, left: 49.9 },
  { number: 8, label: "Time", top: 70.8, left: 30.0 },
  { number: 9, label: "Matter", top: 70.8, left: 69.6 },
  { number: 10, label: "10th Sphere", top: 86.1, left: 49.8 },
];

// A slot is active once the character's total soul attributes (will +
// insight + lore + presence), divided by 10 and rounded down, reaches its
// number - e.g. 55 -> floor(5.5) = 5, so slots 1-5 are active; 100 -> all
// ten; 11 -> only slot 1.
function activeChakraCount(attr: SlotCharacterSummary["attr"]): number {
  return Math.floor((attr.will + attr.insi + attr.lore + attr.pres) / 10);
}

export function SoulTab({ character }: { character: SlotCharacterSummary }) {
  // Click-to-toggle "lighter" test state only, for eyeballing whether each
  // slot's measured position actually lines up with its dark square - not
  // real equip state (no backend concept of equipped soul gear yet). Only
  // ever applies to active slots - inactive ones aren't clickable at all.
  const [litSlots, setLitSlots] = useState<Set<number>>(new Set());
  const toggleLit = (number: number) => setLitSlots((prev) => {
    const next = new Set(prev);
    if (next.has(number)) next.delete(number); else next.add(number);
    return next;
  });

  const activeCount = activeChakraCount(character.attr);

  return (
    <div className={`${styles.panel} ${styles.soulPanel}`}>
      <div className={styles.soulImageBox}>
        <div className={styles.soulImageFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/chakra-page-active.jpg"
            alt="Soul chakra"
            className={styles.soulImage}
          />

          {/* Styled like BodyTab's .equipSlotOverlay (dashed border,
              translucent box) via composing the same base .equipSlot, but
              percent-sized/positioned per slot instead of a fixed rem
              offset, since these sit ON the image at exact measured points
              rather than pushed out past its edge. No name label - the
              chakra's name is already baked into the image directly above
              each square. Inactive slots (number > activeCount) render no
              button at all - just chakra-inactive.png, see below. */}
          {CHAKRA_SLOTS.map(({ number, label, top, left }) => {
            if (number > activeCount) return null;
            return (
              <button
                type="button"
                key={number}
                className={`${styles.soulChakraSlot} ${litSlots.has(number) ? styles.soulChakraSlotLit : ""}`}
                style={{ top: `${top}%`, left: `${left}%` }}
                title={`${number}. ${label}`}
                onClick={() => toggleLit(number)}
              >
                <span className={styles.equipSlotEmpty}>Empty</span>
              </button>
            );
          })}

          {/* Inactive slots (number > activeCount): chakra-inactive.png is
              native-sized art (213x214), not a badge cropped to fit a
              75x75px slot square - it's meant to spill out over the
              surrounding area, not sit clipped inside one slot's box. So
              it's rendered at the same zoom factor the frame already
              applies to the 600px-native main image (width: 35.5% =
              213/600, height: auto to keep its own native aspect), as a
              plain non-interactive <img> rather than inside a button -
              nothing to click, and pointer-events:none so it never blocks
              an active neighbor's button underneath it. */}
          {CHAKRA_SLOTS.filter(({ number }) => number > activeCount).map(({ number, label, top, left }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={number}
              src="/images/character/chakra-inactive.png"
              alt={`${label} (inactive)`}
              title={`${number}. ${label} (inactive)`}
              className={styles.soulChakraInactiveImage}
              style={{ top: `${top}%`, left: `${left}%` }}
            />
          ))}
        </div>
      </div>

      <p className={styles.placeholderNote}>Active soul slots</p>
    </div>
  );
}
