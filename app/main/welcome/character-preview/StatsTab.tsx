import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import { RACES, PROFESSIONS } from "@/app/lib/characterOptions";
import { getDisplayedAge } from "@/app/lib/ageScaling";
import type { SlotCharacterSummary } from "../SoulSlotGrid";

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

/** Preview page: face portrait, identity, and the full attribute/profession sheet. */
export function StatsTab({ character }: { character: SlotCharacterSummary }) {
  const professions = [
    { name: professionName(character.profession.prof1), lvl: character.profession.lvl1 },
    { name: professionName(character.profession.prof2), lvl: character.profession.lvl2 },
    { name: professionName(character.profession.prof3), lvl: character.profession.lvl3 },
  ].filter((p) => p.name);

  const classes = [
    { name: character.classes.class1, lvl: character.classes.lvl1 },
    { name: character.classes.class2, lvl: character.classes.lvl2 },
  ].filter((c) => c.name && c.name !== "none");

  return (
    <div className={styles.panel}>
      <div className={styles.statsLayout}>
        <div className={styles.faceFrame}>
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
        </div>

        <div className={styles.identityColumn}>
          <div className={styles.identityRow}>
            <span>Race</span>
            <span>{raceName(character.race)}</span>
          </div>
          <div className={styles.identityRow}>
            <span>Age</span>
            <span>{getDisplayedAge(character.age_month, character.race)} years</span>
          </div>
          <div className={styles.identityRow}>
            <span>Birthsign</span>
            <span>{character.birthsign}</span>
          </div>
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
                  <span>{c.name}</span>
                  <span>Level {c.lvl}</span>
                </div>
              ))}
              {professions.map((p) => (
                <div className={styles.professionRow} key={p.name}>
                  <span>{p.name}</span>
                  <span>Level {p.lvl}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.attrColumns}>
        <div className={styles.attrGroup}>
          <div className={styles.attrGroupHeader}>Body</div>
          {BODY_ATTRS.map(([key, label]) => (
            <div className={styles.attrDisplayRow} key={key}>
              <span>{label}</span>
              <span className={styles.attrDisplayValue}>{character.attr[key]}</span>
            </div>
          ))}
        </div>
        <div className={styles.attrGroup}>
          <div className={styles.attrGroupHeader}>Soul</div>
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
