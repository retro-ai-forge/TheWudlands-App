"use client";

import Image from "next/image";
import Link from "next/link";
import { PageVersionTag } from "../main/PageVersionTag";
import styles from "./page.module.css";

export default function TheWorld() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>The World</h2>

        <p className={styles.body}>
          Behind the forests and the choices lies a machine. Not a cold one — it breathes,
          it remembers, and it has opinions about what you did last time.
          This page is the view behind the curtain: how the Wudlands works, what keeps it turning,
          and why the road never quite runs the same way twice.
        </p>

        <section className={styles.wudSection}>
          <p className={styles.wudTitle}>— The Wud Legends —</p>
          <div className={styles.wudGrid}>
            <Link href="https://serverless-gavunwud-745793950624.europe-west1.run.app/" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
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

        <p className={styles.body}>
          Inspiration is drawn from the old-school choice-based{" "}
          <Link href="https://www.fightingfantasy.com/" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Fighting Fantasy</Link> format,{" "}
          <Link href="https://boardgamegeek.com/boardgame/199723/ultraquest-gold-ruhm-und-ehre" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>UltraQuest</Link>,{" "}
          <Link href="https://www.projectaon.org/en/Main/Home" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Lone Wolf Saga</Link>,{" "}
          <Link href="https://www.everquest.com/home" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>EverQuest</Link>,{" "}
          <Link href="https://goodman-games.com/dungeon-crawl-classics-rpg/" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Dungeon Crawl Classic</Link>, books from{" "}
          <Link href="https://en.wikipedia.org/wiki/Steve_Jackson_(British_game_designer)" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Steve Jackson</Link>{" "}
          and{" "}
          <Link href="https://en.wikipedia.org/wiki/Ian_Livingstone" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Ian Livingstone</Link>, and the{" "}
          <Link href="https://linktr.ee/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>GAVUN WUD meme</Link>.
        </p>

        {/* ── Adventures ─────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Adventures as Building Blocks</h2>

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
          The Wudlands is not one story. It is made up of adventures — self-contained stories written by
          contributors from across the world. Each adventure is its own corner: a haunted tower, a cursed
          merchant road, a court intrigue. You choose which to enter, read the opening scene, and from
          that moment every decision is yours.
        </p>

        {/* ── Dependencies ───────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Dependencies &amp; Locked Gates</h2>

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
          Some adventures are locked when you first arrive. A story may require that you have survived
          another before its gates open. Certain ruins cannot be understood without knowing what fell
          in the war that built them. Certain factions will not speak to you until you carry a name
          they recognise. Complete what lies before you, and the deeper roads will open.
        </p>

        {/* ── Death is not the end ───────────────────────────── */}
        <h2 className={styles.sectionHeading}>Death Is Not the End</h2>

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
          In the Wudlands, dying does not erase you. Your vital status shifts — from{" "}
          <span className={styles.statusAlive}>alive</span> to{" "}
          <span className={styles.statusDead}>dead</span>, or something stranger:{" "}
          <span className={styles.statusVampire}>vampire</span>,{" "}
          <span className={styles.statusSoulless}>soulless</span>,{" "}
          <span className={styles.statusCursed}>cursed</span>,{" "}
          <span className={styles.statusPetrified}>petrified</span>,{" "}
          <span className={styles.statusIncorporal}>incorporal</span>.
          Each status changes what doors open, what NPCs say, what stories are available.
          A dead adventurer still walks. They simply walk differently.
          Redemption exists — but only when a future adventure offers it.
        </p>

        {/* ── The Eternal Record ─────────────────────────────── */}
        <h2 className={styles.sectionHeading}>The Eternal Record</h2>

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
          What the world writes of you does not fade. Every choice, every scar, every name whispered
          in taverns is recorded in the eternal ledger. Fame, notoriety, relationships — they follow
          you from one adventure to the next. The innkeeper you helped remembers. The lord whose
          son you failed does too. These tales shape how the world reads you before you have even spoken.
        </p>

        {/* ── Price of Play ──────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>The Price of Play</h2>

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
          Entering an adventure costs a small on-chain fee — approximately $1 for three attempts.
          Think of it as the price of a seat at the storyteller&apos;s fire. Exhaust your plays
          and wish to return? Pay again. The road is always open.
        </p>

        {/* ── Forged Together ────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Forged Together</h2>

        <p className={styles.body}>
          Some of the greatest deeds cannot be accomplished alone. Building a bridge across the chasm,
          crafting a sky vessel, constructing a sailship — these demand many hands working together.
          Gathering stone and timber, forging steel, binding magical essence. Only builders who have
          proven themselves gain access to these creations, carrying them into future adventures.
        </p>

        {/* ── Ancient Background ─────────────────────────────── */}
        <h2 className={styles.sectionHeading}>The Ancient Background</h2>

        <p className={styles.body}>
          Before the roads, before the crowns — before the world had a name — there were powers
          older than memory. Titans who hauled continents from the abyss, queens who ruled from
          drowned thrones, engines that bent fate itself.
          The ancient history of the Wudlands runs deep and dark.
        </p>

        <p className={styles.body}>
          <Link href="/theworld/ancient" className={styles.externalLink}>Read the Ancient Background →</Link>
        </p>

      </section>
      <PageVersionTag />
    </div>
  );
}
