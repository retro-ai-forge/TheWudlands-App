import { useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { RawPlayerData } from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

/** Small corner toggle shown on both the Body and Soul tabs - green means
 * this character is free (at base), red means they're currently out on an
 * adventure. Flips Character.availability.inAdventure, which backend.
 * players.unequip_item reads to decide whether a freed item lands in this
 * character's own camp storage (in adventure) or goes straight back to the
 * player's shared vault (at base) - see that function's own docstring. */
export function InAdventureToggle({
  character,
  onPlayerDataUpdated,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
  const [pending, setPending] = useState(false);
  const inAdventure = character.availability.inAdventure;

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/in-adventure`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inAdventure: !inAdventure }),
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        onPlayerDataUpdated?.(data);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.inAdventureToggle} ${inAdventure ? styles.inAdventureToggleOn : styles.inAdventureToggleOff}`}
      onClick={toggle}
      disabled={pending}
      title={inAdventure ? "On adventure - click to return to base" : "At base - click to start an adventure"}
      aria-label={inAdventure ? "On adventure" : "At base"}
      aria-pressed={inAdventure}
    />
  );
}
