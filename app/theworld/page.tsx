"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageVersionTag } from "../main/PageVersionTag";
import styles from "./page.module.css";

import GuideTable from "./GuideTable";

const StatusWithCountdown = ({ status, initialSeconds, showDays = false }: { status: string; initialSeconds: number; showDays?: boolean }) => {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    const timer = setInterval(() => setRemaining((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);
  if (remaining === 0) return <span className={styles.statusReady}>ready</span>;
  const statusClass = status === "working" ? styles.statusWorking : status === "travelling" ? styles.statusTravelling : styles.statusImprisoned;
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  return (
    <span className={statusClass}>
      {status} [<span style={{ fontVariantNumeric: "tabular-nums" }}>
        {(showDays || days > 0) && `${String(days).padStart(2, "0")}d `}
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>]
    </span>
  );
};

const CHARACTER_ROWS = [
  { key: "Race", value: "Permanent choice. Each race carries its own strengths, history, and the way the world reads you." },
  { key: "Class", value: "You begin classless. Classes unlock after enough experience — some require a teacher who may not find you worthy." },
  { key: "Age & Time", value: "Every adventure adds one month to your life. Old age accumulates. Life potions exist — but nothing here is free." },
  { key: "Equipment", value: "Soft carry limits. Exceed them and the weight tells — slower movement, quicker exhaustion." },
  { key: "Party", value: "Up to four adventurers. Set a marching order — the front takes threats, the rear gets taken first." },
];

const SURVIVAL_ROWS = [
  { key: "Choices", value: "Every decision carries weight. The story remembers what you did — and what you chose not to." },
  { key: "Survival", value: "Hunger, thirst, cold, disease — push too hard and your hands will shake at the wrong moment." },
  { key: "Combat", value: "Not every fight is one you are meant to win. Knowing when to run is as valuable as knowing when to stand." },
  { key: "Shelter", value: "No permanent home. Caves, barricaded inns, collapsed watchtowers. The Wudlands does not hand out homes." },
  { key: "Escape Route", value: (<>Every adventure has a way out. It may cost you something to reach it. Using an <span className={styles.code}>escape_route</span> counts as a playthrough.</>) },
];

export default function TheWorld() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>The World</h2>

        <p className={styles.body}>
          Behind the forests and the choices lies a power buried deep. Not a cold one — it breathes, it remembers, the Wudlands Engine has opinions about what you did last time. This page is the view behind the curtain: how the Wudlands works, what keeps it turning, and why the road never quite runs the same way twice.
        </p>

        <section className={styles.wudSection}>
          <p className={styles.wudTitle}>— The Wud Legends —</p>
          <div className={styles.wudGrid}>
            <Link href="https://gavunwud.com" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
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
          <Link href="https://gavunwud.com" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>GAVUN WUD meme</Link>.
        </p>

       {/* ── Minne ─────────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Love, Admiration<br />&amp;<br />the Art of Minne</h2>

        <p className={styles.body}>
          Gold buys a bed. Scars prove you survived. But neither will get you through a locked gate
          when the woman who holds the key has decided she is not interested.
        </p>

        <p className={styles.body}>
          They call it <strong>Minne</strong>. Knights who crossed mountains for a single moment of favour
          from someone who probably would not even be watching. All unreachable in their own way.
          That is the point. The reaching is the thing.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/guide/fame.jpg"
            alt="Famous and infamous names written on a wall, some in gold and some in blood."
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          What opens a door is a name that arrived before you did. Your fame tells them what kind of person stands on their doorstep. Your notoriety tells them whether to call for dinner or for the guard. Infamy is not so different from being admired. It simply arrives with better wine and more nervous smiles.
        </p>

        <p className={styles.body}>
          Flirtation, courtly games, seduction — none of it simple. A lady&apos;s favour can open a city gate or hand your enemies exactly the leverage they needed. What you pursue is your choice — but the choice, once made, belongs to the story.
        </p>

        {/* ── Your Nature ────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Your Nature</h2>
        <p className={styles.body}>
          Your <strong>origin</strong> — the blood that runs through your veins, the craft
          your hands learned, the gender the world perceives — is written at your birth and does not change. Your <strong>age</strong> advances with every adventure. Those months do not come back. More on the{" "}
          <Link href="/characters" className={styles.externalLink}>character creation</Link> page.
        </p>

        <p className={styles.body}>
          Your <strong>vital status</strong> is the deepest mark. You may walk as{" "}
          <span className={styles.statusAlive}>alive</span>, return as{" "}
          <span className={styles.statusDead}>dead</span>, hunger as a{" "}
          <span className={styles.statusVampire}>vampire</span> without aging, exist without a soul as{" "}
          <span className={styles.statusSoulless}>soulless</span>, find yourself stripped of magic as{" "}
          <span className={styles.statusMagicless}>magicless</span>, cursed by forces unseen as{" "}
          <span className={styles.statusCursed}>cursed</span>, trapped in stone as{" "}
          <span className={styles.statusPetrified}>petrified</span>, or drift unanchored as{" "}
          <span className={styles.statusIncorporal}>incorporal</span>.
          These conditions persist until a future adventure offers redemption. The world knows what you are. The question is what you do about it.
        </p>

        <p className={styles.body}>
          Your relationships — every person you have met, charmed, scorned, or loved — follow you from one adventure to the next. The innkeeper who trusted you, the lord whose son you failed to save. None of them forget. Neither does the record.
        </p>

        {/* ── Survival ───────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Survival<br />&amp;<br />Combat</h2>

        <p className={styles.body}>
          The Wudlands does not care whether you are ready. Hunger, thirst, cold — they arrive
          whether you planned for them or not. A fight you cannot win is still a fight you walked into.
          The wise learn when to run.
        </p>

        <GuideTable rows={SURVIVAL_ROWS} />

        {/* ── Character & Party ───────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Character<br />&amp;<br />Party</h2>

        <p className={styles.body}>
          Decide who you are before you set foot in the Wudlands. Choose carefully.
          You will wear this choice for the rest of your time in the world.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/guide/affection.jpg"
            alt="Famous and infamous names written on a wall, some in gold and some in blood."
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          You begin classless. The Wudlands does not hand you a title — you must earn it.
          Some paths require a teacher who may not find you worthy on the first meeting.
        </p>

        <p className={styles.body}>
          Up to four can travel together. Set a marching order — the road is full of things
          that do not fight fair. Think about who you put where.
        </p>

        <GuideTable rows={CHARACTER_ROWS} />

        {/* ── Character Availability ──────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Character Availability</h2>

        <p className={styles.body}>
          Character status at a glance: <span className={styles.statusFree}>free</span>, <span className={styles.statusReady}>ready</span>, <StatusWithCountdown status="working" initialSeconds={67} />, <StatusWithCountdown status="travelling" initialSeconds={280} showDays />, <StatusWithCountdown status="imprisoned" initialSeconds={576} showDays /> — each with a countdown until available. Does not affect adventure content.
        </p>

        {/* ── Story Effects ───────────────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Story Effects</h2>

        <p className={styles.body}>
          Hunger, thirst, cold, buffs — temporary conditions that fade when you leave the adventure. They push your decisions during play, nothing more.
        </p>
      </section>
      
      <PageVersionTag />
    </div>
  );
}
