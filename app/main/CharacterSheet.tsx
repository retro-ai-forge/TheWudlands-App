import { Cinzel } from "next/font/google";
import styles from "./CharacterSheet.module.css";
import type { CharacterData } from "./characterData";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["400", "600", "700"] });

function fantasyTitle(...extra: string[]) {
  return [cinzel.className, styles.fantasyTitle, ...extra].join(" ");
}

export function CharacterSheet({
  character,
  onBack,
}: {
  character: CharacterData;
  onBack: () => void;
}) {
  return (
    <div className={styles.wrap}>
      <button className={`${styles.vintageButton} ${styles.back}`} onClick={onBack}>
        ← Back
      </button>

      <div className={styles.sheet}>
        <header className={styles.header}>
          <h1 className={fantasyTitle(styles.title)}>{character.name}</h1>
          <p className={styles.subtitle}>
            {character.race} {character.profession} • Level {character.level} •{" "}
            {character.affiliation}
          </p>
        </header>

        <div className={styles.portraitSection}>
          <div className={styles.mentalRow}>
            <div className={`${styles.statPill} ${styles.mentalSide}`}>INT {character.attributes.int}</div>
            <div className={styles.statPill}>POW {character.attributes.pow}</div>
            <div className={`${styles.statPill} ${styles.mentalSide}`}>WIS {character.attributes.wis}</div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.portrait}
            src="/images/character/char_placeholder_silhouette.png"
            alt={`${character.name} portrait`}
          />

          <div className={styles.feetRow}>
            <div className={styles.statPill}>DEX {character.attributes.dex}</div>
            <div className={styles.statPill}>SPEED {character.attributes.speed}</div>
          </div>

          <div className={styles.physicalList}>
            <div className={styles.statPill}>STR {character.attributes.str}</div>
            <div className={styles.statPill}>KON {character.attributes.kon}</div>
            <div className={styles.statPill}>STA {character.attributes.sta}</div>
          </div>
        </div>

        <div className={styles.columns}>
          <section>
            <h2 className={fantasyTitle(styles.sectionHeading)}>Vigor & Wealth</h2>
            <div className={styles.vigorList}>
              <div className={styles.statPill}>
                HP {character.hp.current} / {character.hp.max}
              </div>
              <div className={styles.statPill}>
                XP {character.xp.current} / {character.xp.max}
              </div>
              <div className={styles.statPill}>Gold {character.gold}</div>
            </div>

            <h2 className={fantasyTitle(styles.sectionHeading, styles.inventoryHeading)}>
              Inventory
            </h2>
            <ul className={styles.inventoryList}>
              {character.inventory.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className={fantasyTitle(styles.sectionHeading)}>Quest Log</h2>
            <div className={styles.questLog}>
              {character.questLog.map((quest) => (
                <p key={quest}>• {quest}</p>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.actions}>
          <button className={styles.vintageButton}>Enter Adventure</button>
          <button className={styles.vintageButton}>Equip</button>
          <button className={styles.vintageButton}>Rest</button>
        </div>
      </div>
    </div>
  );
}
