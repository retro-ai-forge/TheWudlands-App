"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { PageVersionTag } from "../main/PageVersionTag";
import styles from "./page.module.css";
import WalletGuide from "./WalletGuide";
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

export default function Guide() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>The Adventurer&apos;s Guide</h2>

        <p className={styles.body}>
          You are a wanderer in the Wudlands. What you carry, what you know, and what the world
          whispers about you when you are not listening — this guide tells you how all of it works,
          from your own eyes.
          For how the world itself ticks behind the curtain, see{" "}
          <Link href="/theworld" className={styles.externalLink}>The World</Link>.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/guide/adventurer-guide.jpg"
            alt="The Adventurer's Guide"
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          Connect a wallet to store your adventure progress on the blockchain. Your character, the deeds you have done,
          and the choices you have made are permanently recorded — no one can take them from you.
        </p>

        <WalletGuide />

        {/* ── Minne ─────────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Love, Admiration &amp; the Art of Minne</h2>

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
          What opens a door is a name that arrived before you did. Your fame tells them what kind of person
          stands on their step. Your notoriety tells them whether to call for wine or for the guard.
          It is not so different from being admired. It simply arrives with better wine and more nervous smiles.
        </p>

        <p className={styles.body}>
          Flirtation, courtly games, seduction — none of it simple. A lady&apos;s favour can open a city gate
          or hand your enemies exactly the leverage they needed. What you pursue is your choice — but the choice,
          once made, belongs to the story.
        </p>

        {/* ── Your Nature ────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Your Nature</h2>

        <p className={styles.body}>
          Your <strong>origin</strong> — the blood that runs through your veins, the craft
          your hands learned, the gender the world perceives — is written at your birth and does not change.
          Your <strong>age</strong> advances with every adventure. Those months do not come back.
          More on the{" "}
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
          These conditions persist until a future adventure offers redemption.
          The world knows what you are. The question is what you do about it.
        </p>

        <p className={styles.body}>
          Your relationships — every person you have met, charmed, scorned, or loved — follow you
          from one adventure to the next. The innkeeper who trusted you, the lord whose son you
          failed to save. None of them forget. Neither does the record.
        </p>

        {/* ── Survival ───────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Survival &amp; Combat</h2>

        <p className={styles.body}>
          The Wudlands does not care whether you are ready. Hunger, thirst, cold — they arrive
          whether you planned for them or not. A fight you cannot win is still a fight you walked into.
          The wise learn when to run.
        </p>

        <GuideTable rows={SURVIVAL_ROWS} />

        {/* ── Character & Party ───────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Character &amp; Party</h2>

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
