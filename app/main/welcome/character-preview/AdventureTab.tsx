import { useEffect, useRef, useState } from "react";
import styles from "./CharacterTabs.module.css";
import type { RawPlayerData } from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

const BLOCKED_FLASH_MS = 2500;

export function AdventureTab({
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

  const endAdventure = async (reason: "stop" | "run_away") => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/in-adventure`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inAdventure: false, reason }),
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        onPlayerDataUpdated?.(data);
      }
    } finally {
      setPending(false);
    }
  };

  const startAdventure = async () => {
    if (pending) return;
    if (isCrafting) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setBlockedFlash(true);
      flashTimeoutRef.current = setTimeout(() => setBlockedFlash(false), BLOCKED_FLASH_MS);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/in-adventure`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inAdventure: true }),
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        onPlayerDataUpdated?.(data);
      } else if (res.status === 400) {
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        setBlockedFlash(true);
        flashTimeoutRef.current = setTimeout(() => setBlockedFlash(false), BLOCKED_FLASH_MS);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.panel}>
      <p className={styles.placeholderNote}>
        Enter and leave adventures to test items in camp.
      </p>
      <div className={styles.adventureToggleWrap}>
        {inAdventure ? (
          <div className={styles.adventureButtonPair}>
            <button
              type="button"
              className={`${styles.adventureToggleButton} ${styles.adventureToggleButtonOn}`}
              onClick={() => endAdventure("stop")}
              disabled={pending}
            >
              Stop Adventure
            </button>
            <button
              type="button"
              className={`${styles.adventureToggleButton} ${styles.adventureToggleButtonRun}`}
              onClick={() => endAdventure("run_away")}
              disabled={pending}
            >
              Run Away
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`${styles.adventureToggleButton} ${styles.adventureToggleButtonOff}`}
            onClick={startAdventure}
            disabled={pending}
          >
            Start Adventure
          </button>
        )}
        {blockedFlash && (
          <p className={styles.inAdventureToggleFlash} role="status">
            Still crafting &mdash; can&apos;t start a story yet.
          </p>
        )}
      </div>
      <p className={styles.placeholderNote}>
        Adventures {character.firstName} can enter will be listed here once addon selection
        is wired up to the character sheet.
      </p>
    </div>
  );
}
