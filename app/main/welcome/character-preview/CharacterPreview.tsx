"use client";

import { useEffect, useState } from "react";
import styles from "../soul-creation/SoulCreation.module.css";
import tabStyles from "./CharacterTabs.module.css";
import { useHeaderVisibility } from "@/app/main/HeaderVisibilityProvider";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { StatsTab } from "./StatsTab";
import { BodyTab } from "./BodyTab";
import { SoulTab } from "./SoulTab";
import { AdventureTab } from "./AdventureTab";
import { InventoryTab } from "./InventoryTab";

type TabKey = "stats" | "body" | "soul" | "adventure" | "inventory";

const ICON_BASE = "/images/character/char-preview-";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "stats", label: "Stats", icon: `${ICON_BASE}stats.png` },
  { key: "body", label: "Body", icon: `${ICON_BASE}body.png` },
  { key: "soul", label: "Soul", icon: `${ICON_BASE}soul.png` },
  { key: "adventure", label: "Adventure", icon: `${ICON_BASE}adventure.png` },
  { key: "inventory", label: "Inventory", icon: `${ICON_BASE}inventory.png` },
];

// Opened by clicking an active soul slot's character. Five subpages toggled
// by a hamburger-menu flyout below the name - Stats (attributes + face),
// Body (equipment slots), Soul (soul equipment), Adventure (addon
// selection), and Inventory (this character's vault vs. the player's
// shared vault). Close and Delete both live in that same flyout, but
// Delete's margin-top:auto (see .tabButtonDanger) pushes it all the way to
// the bottom of the panel, away from the other buttons.
export function CharacterPreview({
  character,
  playerResourceBalances,
  onClose,
  onDeleted,
}: {
  character: SlotCharacterSummary;
  playerResourceBalances: Record<string, number>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { setHidden: setHeaderHidden } = useHeaderVisibility();
  const [activeTab, setActiveTab] = useState<TabKey>("stats");
  const [menuOpen, setMenuOpen] = useState(false);
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
    if (!window.confirm(`Permanently delete ${character.firstName} ${character.lastName}? This cannot be undone.`)) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}`, {
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
    <div className={`${styles.wizard} ${styles.wizardScrollable}`}>
      <div className={styles.stage}>
        <div className={tabStyles.sheet}>
          <h1 className={tabStyles.name}>
            {character.firstName} {character.lastName}
          </h1>

          {deleteError && <p className={styles.submitError}>{deleteError}</p>}

          <div className={tabStyles.body}>
            <div className={tabStyles.mainColumn}>
              {activeTab === "stats" && <StatsTab character={character} />}
              {activeTab === "body" && <BodyTab character={character} />}
              {activeTab === "soul" && <SoulTab character={character} />}
              {activeTab === "adventure" && <AdventureTab character={character} />}
              {activeTab === "inventory" && (
                <InventoryTab character={character} playerResourceBalances={playerResourceBalances} />
              )}
            </div>

            {menuOpen && (
              <nav className={tabStyles.tabColumn}>
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={activeTab === tab.key ? tabStyles.tabButtonActive : tabStyles.tabButton}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setMenuOpen(false);
                    }}
                    aria-pressed={activeTab === tab.key}
                    title={tab.label}
                    aria-label={tab.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tab.icon} alt="" className={tabStyles.tabIcon} />
                  </button>
                ))}

                <button
                  type="button"
                  className={tabStyles.tabButton}
                  onClick={() => {
                    setMenuOpen(false);
                    onClose();
                  }}
                  title="Close"
                  aria-label="Close"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${ICON_BASE}close.png`} alt="" className={tabStyles.tabIcon} />
                </button>

                <button
                  type="button"
                  className={tabStyles.tabButtonDanger}
                  onClick={() => {
                    setMenuOpen(false);
                    handleDelete();
                  }}
                  disabled={isDeleting}
                  title={isDeleting ? "Deleting…" : "Delete Character"}
                  aria-label={isDeleting ? "Deleting…" : "Delete Character"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${ICON_BASE}delete.png`} alt="" className={tabStyles.tabIcon} />
                </button>
              </nav>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={menuOpen ? tabStyles.menuToggleOpen : tabStyles.menuToggle}
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        title={menuOpen ? "Close menu" : "Open menu"}
      >
        <span className={tabStyles.hamburgerBar} />
        <span className={tabStyles.hamburgerBar} />
        <span className={tabStyles.hamburgerBar} />
      </button>
    </div>
  );
}
