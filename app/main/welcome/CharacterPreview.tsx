"use client";

import { useEffect, useState } from "react";
import styles from "./SoulCreation.module.css";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";

// Opened by clicking an active soul slot's character. For now just a
// headline with the character's name - a placeholder for the real
// character sheet (stats, gear, resources) planned later.
export function CharacterPreview({
  id,
  firstName,
  lastName,
  onClose,
  onDeleted,
}: {
  id: string;
  firstName: string;
  lastName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { setHidden: setHeaderHidden } = useHeaderVisibility();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setHeaderHidden(true);
    return () => setHeaderHidden(false);
  }, [setHeaderHidden]);

  async function handleDelete() {
    if (isDeleting) return;
    // Permanent and immediate - a plain confirm() is enough friction for a
    // destructive action with no other consequences (no shared state, no
    // one else affected), without building out a custom dialog for it.
    if (!window.confirm(`Permanently delete ${firstName} ${lastName}? This cannot be undone.`)) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete character");
      onDeleted();
    } catch {
      setDeleteError("Could not delete this character. Please try again.");
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.wizard}>
      <div className={styles.stage}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            {firstName} {lastName}
          </h1>
          {deleteError && <p className={styles.submitError}>{deleteError}</p>}
        </div>
      </div>

      <button
        type="button"
        className={`${styles.navButton} ${styles.close}`}
        onClick={onClose}
      >
        ✕ Close
      </button>

      <button
        type="button"
        className={`${styles.navButton} ${styles.delete}`}
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? "Deleting…" : "Delete Character"}
      </button>
    </div>
  );
}
