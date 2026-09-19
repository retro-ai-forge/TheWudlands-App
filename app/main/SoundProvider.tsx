"use client";

/**
 * One global on/off switch for the whole game's audio - lets any
 * component (a sound-effect hook, a background-music player, a settings
 * toggle) read or flip the same shared value without prop-threading it
 * down through every page. Mirrors HeaderVisibilityProvider's own
 * Context-per-concern pattern.
 *
 * Persisted to localStorage so the player's choice survives a reload -
 * unlike HeaderVisibilityProvider (which only ever needs to hold for the
 * current page's lifetime), muted/unmuted is a real preference. Starts
 * `false` (unmuted) on every render, including the very first server-
 * rendered one, then syncs from localStorage in an effect right after
 * mount - the standard hydration-safe pattern for a browser-only value:
 * server and client agree on the very first paint, and the client
 * corrects itself a tick later once it can actually read localStorage.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "wudlands-sound-muted";

interface SoundContextValue {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false);

  // One-time read on mount - see the module comment for why this can't
  // just be useState's own initializer (that runs during SSR too, where
  // localStorage doesn't exist).
  useEffect(() => {
    try {
      setMutedState(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Private-browsing/blocked storage - stay unmuted, same as a
      // first-ever visit.
    }
  }, []);

  const setMuted = (next: boolean) => {
    setMutedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Nothing to fall back to - the in-memory state above still works
      // for the rest of this session, it just won't persist.
    }
  };

  const toggleMuted = () => setMuted(!muted);

  return (
    <SoundContext.Provider value={{ muted, setMuted, toggleMuted }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound must be used within a SoundProvider");
  }
  return ctx;
}
