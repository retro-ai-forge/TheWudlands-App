"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

export default function About() {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>About The Wudlands</h2>

        <p className={styles.body}>
          The Wudlands is an old-school round-based <Link href="https://www.fightingfantasy.com/" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Fighting Fantasy</Link>-style adventure game inspired by <Link href="https://boardgamegeek.com/boardgame/199723/ultraquest-gold-ruhm-und-ehre" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>UltraQuest</Link>,{" "}
          <Link href="https://www.projectaon.org/en/Main/Home" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Lone Wolf Saga</Link>, <Link href="https://www.everquest.com/home" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>EverQuest</Link>, <Link href="https://goodman-games.com/dungeon-crawl-classics-rpg/" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Dungeon Crawl Classic</Link>, books from <Link href="https://en.wikipedia.org/wiki/Steve_Jackson_(British_game_designer)" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Steve Jackson</Link>, <Link href="https://en.wikipedia.org/wiki/Ian_Livingstone" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Ian Livingstone</Link>, and the{" "}
          <Link href="https://linktr.ee/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>GAVUN WUD meme</Link>, built as a browser-based fantasy RPG with scene-driven
          gameplay, pixel-art, ascii-art, narrative-driven adventures, and onchain
          character progression. The game will be built using a modular, plugin-based
          architecture that allows for easy extension and modification.
        </p>

        <section className={styles.wudSection}>
          <p className={styles.wudTitle}>— The Wud Legends —</p>
          <div className={styles.wudGrid}>
            <Link href="https://gavunwud.xyz//" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/theworld/gavun-wud-black.png" alt="Gavun the Wud" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Gavun of Wud</span>
            </Link>
            <Link href="https://x.com/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/theworld/20260609_084229.jpg" alt="Dark Lord of Polkadut" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Slayer of Polkadut</span>
            </Link>
            <Link href="https://linktr.ee/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/theworld/20260609_084240.jpg" alt="The Beyr Slayr" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>The Beyr Slayr</span>
            </Link>
            <Link href="https://www.youtube.com/@gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/theworld/20260609_084257.jpg" alt="Warlord of the Wud" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Warlord of the Wud</span>
            </Link>
          </div>
        </section>

        <h2 className={styles.heading}>Getting Started</h2>

        <p className={styles.body}>
          To step into the Wudlands, you will need a <strong>Polkadot wallet</strong> for login and to track your on-chain character progression.
          The following wallet extensions are supported: <strong>Nova Wallet</strong>, <strong>Polkadot.js</strong>, <strong>Talisman</strong>, and <strong>SubWallet</strong>.
          Install one of these compatible wallets on your <strong>mobile phone</strong> or browser to begin your adventure.
        </p>

        <div className={styles.sectionImage}>
          <Image
            src="/images/theworld/the-world-awaits.jpg"
            alt="The Wudlands Await"
            width={860}
            height={480}
            priority
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        <p className={styles.body}>
          The Wudlands is not a place that welcomes the faint of heart. It is a world of dark forests,
          crumbling dungeons, desperate choices, and things older than memory that do not wish to be disturbed.
          You will enter it as a wanderer with little more than your wits and whatever courage you can muster —
          and the world will test both without mercy. What you find, what you survive, and what stories are told
          of your passing are entirely yours to shape.
        </p>

        <div className={styles.sectionImage}>
          <Image
            src="/images/theworld/the-world-adventures.jpg"
            alt="The Wudlands Adventures"
            width={860}
            height={480}
            priority
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        <p className={styles.body}>
          The Wudlands is made up of adventures — self-contained stories written by contributors from across the world.
          Each adventure is its own corner of the Wudlands: a haunted tower, a cursed merchant road, a court intrigue,
          a dungeon that has swallowed three expeditions before yours. You choose which adventure to enter, read the
          opening scene, and from that moment every decision is yours. Where you go, who you trust, when you run —
          all of it matters. The world does not forget what you choose.
        </p>

        <div className={styles.sectionImage}>
          <Image
            src="/images/theworld/the-world-locked.jpg"
            alt="The Wudlands Locked Gates"
            width={860}
            height={480}
            priority
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        <p className={styles.body}>
          Some adventures are locked when you first arrive. A story may require that you have already survived another
          before its gates will open to you. This is not an obstacle — it is the shape of the world. Certain ruins
          cannot be understood without knowing what fell in the war that built them. Certain factions will not speak
          to you until you carry a name they recognise. Complete what lies before you, and the deeper roads will open.
          The platform will tell you plainly what stands between you and the next chapter.
        </p>

        <div className={styles.sectionImage}>
          <Image
            src="/images/theworld/the-world-price.jpg"
            alt="The Wudlands Price of Play"
            width={860}
            height={480}
            priority
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        <p className={styles.body}>
          Entering an adventure requires a small coin — an on-chain fee that grants you the right to explore it again and again,
          up to three times by default. Each adventure costs approximately $1 for three exploration attempts. Think of it less as a toll and more as the price
          of a seat at the storyteller&apos;s fire. If you have exhausted your plays and wish to return, you may
          pay the fee once more and your count is restored. The road is always open to those willing to walk it again.
        </p>

        <div className={styles.sectionImage}>
          <Image
            src="/images/theworld/the-world-eternal.jpg"
            alt="The Wudlands Eternal Record"
            width={860}
            height={480}
            priority
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        <p className={styles.body}>
          What the world writes of you does not fade. Every mark you leave — every choice, every scar, every name whispered in taverns — is recorded in the eternal ledger. These tales follow you from one adventure to the next, shaping how the world reads you before you have even spoken.
        </p>

        <div className={styles.accordion}>
          <div
            className={styles.accordionSummary}
            onClick={() => toggleSection("origin")}
            role="button"
            tabIndex={0}
            aria-expanded={openSection === "origin"}
          >
            <span>Origin &amp; Age</span>
            <span className={styles.chevron}>{openSection === "origin" ? "▼" : "▶"}</span>
          </div>
          {openSection === "origin" && (
            <div className={styles.accordionBody}>
              <p className={styles.body}>
                Your <strong>origin</strong> — the blood that runs through your veins, the craft
                your hands learned, the gender the world perceives — is written at your birth and does not change,
                see the {" "}<Link href="/characters" className={styles.externalLink}>Character Creation</Link>{" "}
                page. To understand how your nature shapes the stories that find you, refer to <Link href="/create?section=storyimpact" className={styles.externalLink}>Your Legend</Link> section in Create.
                Your <strong>age</strong> advances with every passing month — a horizon that moves
                toward you with every adventure you enter, and those months do not come back.
              </p>
            </div>
          )}
        </div>

        <div className={styles.accordion}>
          <div
            className={styles.accordionSummary}
            onClick={() => toggleSection("vital")}
            role="button"
            tabIndex={0}
            aria-expanded={openSection === "vital"}
          >
            <span>Vital Status</span>
            <span className={styles.chevron}>{openSection === "vital" ? "▼" : "▶"}</span>
          </div>
          {openSection === "vital" && (
            <div className={styles.accordionBody}>
              <p className={styles.body}>
                Your <strong>vital status</strong> — whether you walk as <span className={styles.statusAlive}>alive</span>, return as <span className={styles.statusDead}>dead</span>, hunger as a <span className={styles.statusVampire}>vampire</span> without aging, exist without a soul as <span className={styles.statusSoulless}>soulless</span>, stripped of magic as <span className={styles.statusMagicless}>magicless</span>, cursed by forces unseen as <span className={styles.statusCursed}>cursed</span>, trapped in stone as <span className={styles.statusPetrified}>⚡ petrified</span>, or drift unanchored as <span className={styles.statusIncorporal}>incorporal</span> — is the deepest mark. These conditions persist until a future adventure offers redemption, and they determine which doors open to you and which ones slam shut. The world knows what you are. The question is what YOU do about it.
              </p>
            </div>
          )}
        </div>

        <div className={styles.accordion}>
          <div
            className={styles.accordionSummary}
            onClick={() => toggleSection("lovehate")}
            role="button"
            tabIndex={0}
            aria-expanded={openSection === "lovehate"}
          >
            <span>Love &amp; Hate</span>
            <span className={styles.chevron}>{openSection === "lovehate" ? "▼" : "▶"}</span>
          </div>
          {openSection === "lovehate" && (
            <div className={styles.accordionBody}>
              <p className={styles.body}>
                Your relationship ratings with every significant person you have met,
                charmed, scorned, or loved are part of the eternal record
                and carry forward into every adventure that follows.
                See the <Link href="/create?section=lovehate" className={styles.externalLink}>Love &amp; Hate</Link> section in Create for
                details on how writers use this system.
              </p>
            </div>
          )}
        </div>

        <div className={styles.accordion}>
          <div
            className={styles.accordionSummary}
            onClick={() => toggleSection("teamwork")}
            role="button"
            tabIndex={0}
            aria-expanded={openSection === "teamwork"}
          >
            <span>Forged Together</span>
            <span className={styles.chevron}>{openSection === "teamwork" ? "▼" : "▶"}</span>
          </div>
          {openSection === "teamwork" && (
            <div className={styles.accordionBody}>
              <p className={styles.body}>
                Some of the greatest deeds cannot be accomplished alone. Building a bridge across the chasm, crafting a sky vessel, or building a sailship requires many hands working together — gathering stone and timber, forging steel, binding magical essence, mixing mortar and mystic compounds. These multi-hour undertakings demand cooperation, trust, and shared purpose. Only <strong>builders</strong> who have proven themselves through such feats gain access to these creations, allowing them to continue future adventures with the legendary works your fellowship has constructed together.
              </p>
            </div>
          )}
        </div>

      </section>
    </div>
  );
}
