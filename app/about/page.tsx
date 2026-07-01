"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import styles from "./page.module.css";

const StatusWithCountdown = ({ status, initialSeconds, showDays = false }: { status: string; initialSeconds: number; showDays?: boolean }) => {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (remaining === 0) {
    return <span className={styles.statusReady}>ready</span>;
  }

  const statusClass = status === 'working' ? styles.statusWorking : status === 'travelling' ? styles.statusTravelling : styles.statusImprisoned;
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

export default function About() {
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
              <Image src="/images/about/gavun-wud-black.png" alt="Gavun the Wud" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Gavun of Wud</span>
            </Link>
            <Link href="https://x.com/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/20260609_084229.jpg" alt="Dark Lord of Polkadut" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Slayer of Polkadut</span>
            </Link>
            <Link href="https://linktr.ee/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/20260609_084240.jpg" alt="The Beyr Slayr" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>The Beyr Slayr</span>
            </Link>
            <Link href="https://www.youtube.com/@gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/20260609_084257.jpg" alt="Warlord of the Wud" width={80} height={80} className={styles.wudIcon} />
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

        <h2 className={styles.heading}>The World</h2>

        <p className={styles.body}>
          The Wudlands is not a place that welcomes the faint of heart. It is a world of dark forests,
          crumbling dungeons, desperate choices, and things older than memory that do not wish to be disturbed.
          You will enter it as a wanderer with little more than your wits and whatever courage you can muster —
          and the world will test both without mercy. What you find, what you survive, and what stories are told
          of your passing are entirely yours to shape.
        </p>

        <h2 className={styles.heading}>Adventures</h2>

        <p className={styles.body}>
          The Wudlands is made up of adventures — self-contained stories written by contributors from across the world.
          Each adventure is its own corner of the Wudlands: a haunted tower, a cursed merchant road, a court intrigue,
          a dungeon that has swallowed three expeditions before yours. You choose which adventure to enter, read the
          opening scene, and from that moment every decision is yours. Where you go, who you trust, when you run —
          all of it matters. The world does not forget what you choose.
        </p>

        <p className={styles.body}>
          Some adventures are locked when you first arrive. A story may require that you have already survived another
          before its gates will open to you. This is not an obstacle — it is the shape of the world. Certain ruins
          cannot be understood without knowing what fell in the war that built them. Certain factions will not speak
          to you until you carry a name they recognise. Complete what lies before you, and the deeper roads will open.
          The platform will tell you plainly what stands between you and the next chapter.
        </p>

        <p className={styles.body}>
          Entering an adventure requires a small coin — an on-chain fee that grants you the right to explore it again and again,
          up to three times by default. Each adventure costs approximately $1 for three exploration attempts. Think of it less as a toll and more as the price
          of a seat at the storyteller&apos;s fire. If you have exhausted your plays and wish to return, you may
          pay the fee once more and your count is restored. The road is always open to those willing to walk it again.
        </p>

        <h2 className={styles.heading}>Availability</h2>

        <p className={styles.body}>
          See what each character is up to at a glance in the character list: <span className={styles.statusReady}>ready</span>, <StatusWithCountdown status="working" initialSeconds={67} />, <StatusWithCountdown status="travelling" initialSeconds={280} showDays />, <StatusWithCountdown status="imprisoned" initialSeconds={576} showDays /> — each with a countdown timer showing when you are ready to continue your journeys. This status is purely about your current availability and does not impact adventure content.
        </p>

        <h2 className={styles.heading}>Story</h2>
        <p className={styles.body}>
          Temporary Status Effects apply only within the current adventure. Hunger, thirst, minor illness, cold, strength buffs, regeneration, and other temporary conditions fade completely when you leave and move to your next adventure. These are the moment-to-moment challenges that push your decisions during play.
        </p>

        <h2 className={styles.heading}>Onchain Data</h2>
        <p className={styles.body}>
          Onchain Status is permanent and recorded forever on the blockchain. These states follow you across every adventure you enter and shape how the world reacts to you. Your age — adult, middleaged, seasoned, elder, venerable, ancient — advances with each passing month and can be reversed. Your vital status — <span className={styles.statusAlive}>alive</span>, <span className={styles.statusDead}>dead</span>, <span className={styles.statusVampire}>vampire</span>, <span className={styles.statusSoulless}>soulless</span>, <span className={styles.statusMagicless}>magicless</span>, <span className={styles.statusCursed}>cursed</span>, or <span className={styles.statusIncorporal}>incorporal</span> persist until a future adventure offers a path to redemption. These states are depicted with icons and can determine whether you are allowed to enter certain stories or how characters within them will respond to you.
        </p>

      </section>
    </div>
  );
}
