import { useEffect, useRef, useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { RawPlayerData } from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

// How long the "still crafting" flash stays up before clearing itself -
// mirrors InventoryTab's ItemDetailPopup ITEM_POPUP_FLASH_MS, just a local
// copy since that constant isn't exported and this is a much smaller flash.
const BLOCKED_FLASH_MS = 2500;

/** Small corner toggle shown on both the Body and Soul tabs - green means
 * this character is free (at base), red means they're currently out on a
 * story. Flips Character.availability.inAdventure, which backend.
 * players.unequip_item reads to decide whether a freed item lands in this
 * character's own camp storage (in adventure) or goes straight back to the
 * player's shared vault (at base) - see that function's own docstring.
 *
 * Crafting and being out on a story are mutually exclusive (backend.
 * players.set_in_adventure/start_craft both enforce this now) - switching
 * to "out on a story" is blocked while a craft is still running. Checked
 * here client-side first (character.crafting.activeCraft is already in
 * hand, no need for a round trip just to find out), with the backend's own
 * check as the real guard either way. */
export function InAdventureToggle({
  character,
  onPlayerDataUpdated,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
  const [pending, setPending] = useState(false);
  const [blockedFlash, setBlockedFlash] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);
  const inAdventure = character.availability.inAdventure;
  const isCrafting =
    !!character.crafting.activeCraft &&
    new Date(character.crafting.activeCraft.readyAt).getTime() > Date.now();

  const flashBlocked = () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setBlockedFlash(true);
    flashTimeoutRef.current = setTimeout(() => setBlockedFlash(false), BLOCKED_FLASH_MS);
  };

  const toggle = async () => {
    if (pending) return;
    if (!inAdventure && isCrafting) {
      flashBlocked();
      return;
    }
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
      } else if (res.status === 400) {
        // Backend's own version of the isCrafting check above (e.g. a
        // craft that started on another device/tab since this one last
        // refreshed) - same flash either way.
        flashBlocked();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.inAdventureToggle} ${inAdventure ? styles.inAdventureToggleOn : styles.inAdventureToggleOff}`}
        onClick={toggle}
        disabled={pending}
        title={inAdventure ? "On the road - click to return home" : "At Home - click to start a story"}
        aria-label={inAdventure ? "On the road" : "At Home"}
        aria-pressed={inAdventure}
      />
      {blockedFlash && (
        <p className={styles.inAdventureToggleFlash} role="status">
          Still crafting - can&apos;t start a story yet.
        </p>
      )}
    </>
  );
}
