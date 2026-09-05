import { useEffect, useState } from "react";

// Shared between the Inventory tab's own countdown and the soul-slot
// grid's compact badge - both tick against the same
// Character.activeCraft.readyAt, just displayed at different sizes.

/** Ticks once a second against `readyAt` (ISO 8601, or null/undefined for
 * no active craft) - returns remaining whole seconds (clamped to >= 0), or
 * null when there's nothing to count down. Purely a display countdown -
 * unlike InventoryTab's own use of readyAt, this never calls finish_craft
 * itself; that stays the Inventory tab's responsibility. */
export function useCraftCountdown(readyAt: string | null | undefined): number | null {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!readyAt) {
      setRemainingSeconds(null);
      return;
    }
    const readyAtMs = new Date(readyAt).getTime();
    const tick = () => setRemainingSeconds(Math.max(0, Math.ceil((readyAtMs - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [readyAt]);

  return remainingSeconds;
}

/** "00:00:00" - hours:minutes:seconds, always all three fields
 * zero-padded, no day component and no unit letters - hours just keep
 * counting up past 24 rather than rolling into a separate day field (a
 * craft can run from seconds to many hours depending on the recipe's own
 * raw-material chain and tier, see backend.players._craft_duration_seconds,
 * so a fixed two-field hour cap isn't enough). Used everywhere a craft
 * countdown or duration estimate is shown - the Craft button, the
 * crafting-tab accordion header, the soul-slot badge, the Stats page's
 * "Ready" row. */
export function formatRemainingCompactLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}
