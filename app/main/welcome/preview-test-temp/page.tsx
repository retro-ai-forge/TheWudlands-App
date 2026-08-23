"use client";
import { CharacterPreview } from "../character-preview/CharacterPreview";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

const mockCharacter: SlotCharacterSummary = {
  id: "mock-1", slotNumber: 1, firstName: "Aelric", lastName: "Thornwood",
  vitalStatus: "Alive", age_month: 312, gender: "m", raceGroup: "Common", race: "elf",
  birthsign: "The Far-Sight Rune", portraitUrl: "", portraitZoom: 1, portraitPan: { x: 0, y: 0 },
  portraitFrameArea: null, portraitFaceArea: null,
  availability: { name: "Ready", timeRdy: new Date().toISOString() },
  classes: { class1: "none", lvl1: 0, class2: "none", lvl2: 0 },
  profession: { prof1: "blacksmith", lvl1: 3, prof2: "hunter", lvl2: 1, prof3: "none", lvl3: 0 },
  attr: { migh: 5, agil: 3, endu: 4, prec: 2, will: 6, insi: 3, lore: 2, pres: 4 },
  resourceBalances: { iron_ore: 12, oak_wood: 4, hemp_fiber: 20 },
  tools: ["axe_stone", "tanning_rack"],
};
const mockPlayerBalances = { iron_ore: 40, silk_thread: 6 };

export default function PreviewTestPage() {
  return (
    <CharacterPreview character={mockCharacter} playerResourceBalances={mockPlayerBalances}
      onClose={() => alert("close clicked")} onDeleted={() => alert("deleted")} />
  );
}
