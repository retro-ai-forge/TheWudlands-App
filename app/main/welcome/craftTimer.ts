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

/** "1:32" - the same m:ss format everywhere a craft countdown is shown
 * (the compact soul-slot badge, the inline crafting-tab timer) - a craft
 * never runs longer than a couple minutes, so this never needs to scale
 * beyond that. See formatRemainingLong for a timer that can run far
 * longer (travel, imprisonment, ...). */
export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "00D 00H 00:00" - fixed-width, every field always shown (zero-padded)
 * regardless of magnitude - for the Stats page's "Ready" row, which can
 * end up reflecting a timer far longer than any craft (travel,
 * imprisonment, ...) once those exist. */
export function formatRemainingLong(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(days)}D ${pad(hours)}H ${pad(minutes)}:${pad(secs)}`;
}
