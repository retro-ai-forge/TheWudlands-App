"use client";

/**
 * Lets deeply nested flows (e.g. soul creation) force the header to stay
 * blended out, overriding its own scroll/idle fade logic, without having to
 * render the header themselves.
 */

import { createContext, useContext, useState, type ReactNode } from "react";

interface HeaderVisibilityContextValue {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

const HeaderVisibilityContext = createContext<HeaderVisibilityContextValue | null>(null);

export function HeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  return (
    <HeaderVisibilityContext.Provider value={{ hidden, setHidden }}>
      {children}
    </HeaderVisibilityContext.Provider>
  );
}

export function useHeaderVisibility() {
  const ctx = useContext(HeaderVisibilityContext);
  if (!ctx) {
    throw new Error("useHeaderVisibility must be used within a HeaderVisibilityProvider");
  }
  return ctx;
}
