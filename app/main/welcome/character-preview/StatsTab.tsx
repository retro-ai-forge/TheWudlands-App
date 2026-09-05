import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import { RACES, PROFESSIONS, BIRTHSIGNS, PROFESSION_RESOURCE_FAMILIES } from "@/app/lib/characterOptions";
import { getDisplayedAge } from "@/app/lib/ageScaling";
import { useState } from "react";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import type { RawPlayerData } from "./InventoryTab";

const BODY_ATTRS = [
  ["migh", "Might"],
  ["agil", "Agility"],
  ["endu", "Endurance"],
  ["prec", "Precision"],
] as const;

const SOUL_ATTRS = [
  ["will", "Will"],
  ["insi", "Insight"],
  ["lore", "Lore"],
  ["pres", "Presence"],
] as const;

function raceName(id: string): string {
  return RACES.find((r) => r.id === id)?.name ?? id;
}

function professionName(id: string): string {
  if (!id || id === "none") return "";
  return PROFESSIONS.find((p) => p.id === id)?.name ?? id;
}

// The profession's raw-material resource families (e.g. blacksmith ->
// ["ore","wood","sand"]), formatted as a display caption - "Ore, Wood,
// Sand". Empty for a blank/"none" profession slot.
function professionResourceFamilies(id: string): string {
  if (!id || id === "none") return "";
  const category = PROFESSIONS.find((p) => p.id === id)?.category;
  const families = category ? PROFESSION_RESOURCE_FAMILIES[category] : undefined;
  if (!families) return "";
  return families
    .map((family) => family.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
    .join(", ");
}

function birthsignName(id: string): string {
  return BIRTHSIGNS.find((b) => b.id === id)?.name ?? id;
}

// Sum of a group's 4 attributes - the full/base total. Shown as X/Y where Y
// is always this full sum; X (current) has no separate temporary-stat pool
// yet, so it's the same value until that system exists.
function sumAttrs(
  keys: readonly (readonly [keyof SlotCharacterSummary["attr"], string])[],
  attr: SlotCharacterSummary["attr"]
): number {
  return keys.reduce((total, [key]) => total + attr[key], 0);
}

/** Preview page: face portrait, identity, and the full attribute/profession sheet. */
export function StatsTab({
  character,
  onEditPortrait,
  onOpenBirthsign,
  onPlayerDataUpdated,
}: {
  character: SlotCharacterSummary;
  onEditPortrait?: () => void;
  onOpenBirthsign?: () => void;
  /** Called with the fresh roster/vault/pool after setting the prime profession. */
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
  const birthsignInfo = BIRTHSIGNS.find((b) => b.id === character.birthsign) ?? null;

  // The sole slot ("prof1"|"prof2"|"prof3") that receives final-item
  // assembly-bonus XP on finishing a blueprint-gated item - player-chosen
  // by clicking a profession row below, persisted on the character.
  const [settingPrime, setSettingPrime] = useState(false);
  const setPrimeProfession = async (slot: "prof1" | "prof2" | "prof3") => {
    if (settingPrime) return;
    setSettingPrime(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/profession/prime`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        onPlayerDataUpdated?.(data);
      }
    } catch {
      // Best-effort - the row just stays clickable to try again.
    } finally {
      setSettingPrime(false);
    }
  };

  // Matches backend.players.finish_craft's own default: "prof1" until the
  // player has ever explicitly picked a prime profession, so the Stats
  // page shows the same slot as prime that's actually earning the
  // assembly-bonus XP, not a blank state that doesn't match reality.
  const effectivePrime = ["prof1", "prof2", "prof3"].includes(character.profession.prime)
    ? character.profession.prime
    : "prof1";

  const professions = (
    [
      {
        slot: "prof1" as const,
        name: professionName(character.profession.prof1),
        lvl: character.profession.lvl1,
        exp: character.profession.exp1,
        resourceFamilies: professionResourceFamilies(character.profession.prof1),
      },
      {
        slot: "prof2" as const,
        name: professionName(character.profession.prof2),
        lvl: character.profession.lvl2,
        exp: character.profession.exp2,
        resourceFamilies: professionResourceFamilies(character.profession.prof2),
      },
      {
        slot: "prof3" as const,
        name: professionName(character.profession.prof3),
        lvl: character.profession.lvl3,
        exp: character.profession.exp3,
        resourceFamilies: professionResourceFamilies(character.profession.prof3),
      },
    ]
      .filter((p) => p.name)
      .map((p) => ({ ...p, isPrime: p.slot === effectivePrime }))
      // The prime profession (if any) always sorts to the top - clicking a
      // row to make it prime visibly promotes it, not just marks it.
      .sort((a, b) => (a.isPrime === b.isPrime ? 0 : a.isPrime ? -1 : 1))
  );

  const classes = [
    { name: character.classes.class1, lvl: character.classes.lvl1 },
    { name: character.classes.class2, lvl: character.classes.lvl2 },
  ].filter((c) => c.name && c.name !== "none");

  return (
    <div className={styles.panel}>
      <div className={styles.statsLayout}>
        <button
          type="button"
          className={styles.faceFrame}
          onClick={onEditPortrait}
          title="Edit portrait"
          aria-label="Edit portrait"
        >
          {character.portraitUrl ? (
            character.portraitFaceArea ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.portraitUrl}
                alt={character.firstName}
                style={getPortraitCropImgStyle(character.portraitFaceArea)}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.portraitUrl}
                alt={character.firstName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/images/soul-creation/char-empty.jpg"
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </button>

        <div className={styles.identityColumn}>
          <div className={styles.identityRow}>
            <span>Race</span>
            <span>{raceName(character.race)}</span>
          </div>
          <div className={styles.identityRow}>
            <span>Age</span>
            <span>{getDisplayedAge(character.age_month, character.race)} years</span>
          </div>
          {birthsignInfo ? (
            <button type="button" className={styles.identityRowButton} onClick={onOpenBirthsign}>
              <span>Birthsign</span>
              <span>{birthsignInfo.name}</span>
            </button>
          ) : (
            <div className={styles.identityRow}>
              <span>Birthsign</span>
              <span>{birthsignName(character.birthsign)}</span>
            </div>
          )}
          <div className={styles.identityRow}>
            <span>Vital</span>
            <span>{character.vitalStatus}</span>
          </div>
          <div className={styles.identityRow}>
            <span>Ready</span>
            <span>now</span>
          </div>

          {classes.length > 0 || professions.length > 0 ? (
            <div className={styles.professionList}>
              {classes.map((c) => (
                <div className={styles.professionRow} key={c.name}>
                  <div className={styles.professionRowMain}>
                    <span>{c.name}</span>
                    <span>Level {c.lvl}</span>
                  </div>
                </div>
              ))}
              {professions.map((p) => (
                <button
                  type="button"
                  className={`${styles.professionRow} ${styles.professionRowClickable}`}
                  key={p.name}
                  onClick={() => setPrimeProfession(p.slot)}
                  disabled={settingPrime}
                  title={p.isPrime ? undefined : "Click to make this the prime profession"}
                >
                  <div className={styles.professionRowMain}>
                    <span className={p.isPrime ? styles.professionPrime : undefined}>
                      {p.name}
                      {p.isPrime && <span className={styles.professionPrimeTag}> (prime)</span>}
                    </span>
                    <span>Lvl {p.lvl} — {p.exp} XP</span>
                  </div>
                  {p.resourceFamilies && (
                    <span className={styles.professionResourceFamilies}>{p.resourceFamilies}</span>
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.attrColumns}>
        <div className={styles.attrGroup}>
          <div className={styles.attrGroupHeader}>
            <span>Body</span>
            <span className={styles.attrGroupTotal}>
              {sumAttrs(BODY_ATTRS, character.attr)}/{sumAttrs(BODY_ATTRS, character.attr)}
            </span>
          </div>
          {BODY_ATTRS.map(([key, label]) => (
            <div className={styles.attrDisplayRow} key={key}>
              <span>{label}</span>
              <span className={styles.attrDisplayValue}>{character.attr[key]}</span>
            </div>
          ))}
        </div>
        <div className={styles.attrGroup}>
          <div className={styles.attrGroupHeader}>
            <span>Soul</span>
            <span className={styles.attrGroupTotal}>
              {sumAttrs(SOUL_ATTRS, character.attr)}/{sumAttrs(SOUL_ATTRS, character.attr)}
            </span>
          </div>
          {SOUL_ATTRS.map(([key, label]) => (
            <div className={styles.attrDisplayRow} key={key}>
              <span>{label}</span>
              <span className={styles.attrDisplayValue}>{character.attr[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
