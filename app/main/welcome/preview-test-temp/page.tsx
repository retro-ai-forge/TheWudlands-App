"use client";

import { CharacterPreview } from "../character-preview/CharacterPreview";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

const mockCharacter: SlotCharacterSummary = {
  id: "mock-char-1",
  slotNumber: 1,
  firstName: "Mistress",
  lastName: "Quenn",
  vitalStatus: "alive",
  age_month: 432,
  gender: "f",
  raceGroup: "Common",
  race: "elf",
  birthsign: "fatecoil_mark",
  portraitUrl: "/images/soul-creation/char-empty.jpg",
  portraitZoom: 1,
  portraitPan: { x: 0, y: 0 },
  portraitFrameArea: { x: 0, y: -0.25, width: 1, height: 1.5 },
  portraitFaceArea: { x: 0.28, y: -0.2275, width: 0.44, height: 0.44 },
  availability: { name: "ready", timeRdy: new Date().toISOString() },
  classes: { class1: "none", lvl1: 0, class2: "none", lvl2: 0 },
  profession: { prof1: "none", lvl1: 0, prof2: "none", lvl2: 0, prof3: "none", lvl3: 0 },
  attr: { migh: 3, agil: 3, endu: 3, prec: 3, will: 3, insi: 3, lore: 3, pres: 3 },
  resourceBalances: {},
  tools: [],
};

const mockPlayerBalances = {};

export default function PreviewTestPage() {
  return (
    <CharacterPreview
      character={mockCharacter}
      playerResourceBalances={mockPlayerBalances}
      onClose={() => {}}
      onDeleted={() => {}}
      onPortraitSaved={() => {}}
    />
  );
}
