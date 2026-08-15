"use client";

import { useEffect } from "react";
import styles from "./SoulCreation.module.css";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";

// Opened by clicking an active soul slot's character. For now just a
// headline with the character's name - a placeholder for the real
// character sheet (stats, gear, resources) planned later.
export function CharacterPreview({
  firstName,
  lastName,
  onClose,
}: {
  firstName: string;
  lastName: string;
  onClose: () => void;
}) {
  const { setHidden: setHeaderHidden } = useHeaderVisibility();

  useEffect(() => {
    setHeaderHidden(true);
    return () => setHeaderHidden(false);
  }, [setHeaderHidden]);

  return (
    <div className={styles.wizard}>
      <div className={styles.stage}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            {firstName} {lastName}
          </h1>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.navButton} ${styles.close}`}
        onClick={onClose}
      >
        ✕ Close
      </button>
    </div>
  );
}
