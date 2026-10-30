"use client";

import { PageVersionTag } from "../main/PageVersionTag";
import styles from "./page.module.css";
import Link from "next/link";
import WalletGuide from "./WalletGuide";

export default function Guide() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>

        <h2 className={styles.heading}>Guide</h2>

        <p className={styles.body}>
          You are a wanderer in the Wudlands. What you carry, what you know, and what the world whispers about you when you are not listening — this guide tells you how all of it works, from your own eyes.</p>

        <div className={styles.imageFrame}>
          <img
            src="/images/guide/adventurer-guide.jpg"
            alt="The Adventurer's Guide"
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          Warning: Entering the Wudlands can bring fortune or misery. Choose your path wisely and stay true to it. Watch out for story titles that meet your interest and can push your character over the limits. We hold every path free to choose from. You cannot find yours —{" "}
          <Link href="/create" className={styles.externalLink}>create</Link> it yourself.
          </p>

        {/* ── Adventures ─────────────────────────────────────── */}
        <div className={styles.imageFrame}>
          <img
            src="/images/theworld/the-world-adventures.jpg"
            alt="The Wudlands Adventures"
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          The Wudlands is not one story. It is made up of adventures — self-contained stories written by contributors from across the world. Each adventure is its own corner born from dark fantasy, a court intrigue, a call for eternal life as a vampire or just exploration. You choose which to enter, read the opening scene, and from that moment every decision is yours.
        </p>

        {/* ── Dependencies ───────────────────────────────────── */}
        <div className={styles.imageFrame}>
          <img
            src="/images/theworld/the-world-locked.jpg"
            alt="The Wudlands Locked Gates"
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          Some adventures are locked when you first arrive. A story may require that you have endured another before its gates open. Certain ruins cannot be understood without knowing what fell in the war that built them. Certain factions will not speak to you until you carry a name they recognise. Complete what lies before you, and the deeper roads will open.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/theworld/the-world-awaits.jpg"
            alt="The Wudlands Await"
            className={styles.sectionImage}
            />
        </div>

        {/* ── Death is not the end ───────────────────────────── */}
        <h2 className={styles.sectionHeading}>Death Is Not the End</h2>

        <p className={styles.body}>
          In the Wudlands, dying does not erase you. Your vital status shifts — from{" "}
          <span className={styles.statusAlive}>alive</span> to{" "}
          <span className={styles.statusDead}>dead</span>, or something stranger:{" "}
          <span className={styles.statusVampire}>vampire</span>,{" "}
          <span className={styles.statusSoulless}>soulless</span>,{" "}
          <span className={styles.statusCursed}>cursed</span>,{" "}
          <span className={styles.statusPetrified}>petrified</span>,{" "}
          <span className={styles.statusIncorporal}>incorporal</span>.
          Each status changes which ways lead forward, what the people around you say, what stories are available. An undead adventurer still walks. They simply walk differently. Redemption exists — but only when a future adventure offers it.
        </p>

        {/* ── The Eternal Record ─────────────────────────────── */}
        <div className={styles.imageFrame}>
          <img
            src="/images/theworld/the-world-eternal.jpg"
            alt="The Wudlands Eternal Record"
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          What the world writes of you does not fade. Every choice, every scar, every name whispered
          in taverns is recorded in the eternal ledger. Fame, notoriety, relationships — they follow
          you from one adventure to the next. The innkeeper you helped remembers. The lord whose
          son you failed does too. These tales shape how the world reads you before you have even spoken.
        </p>

        {/* ── Price of Play ──────────────────────────────────── */}
        <div className={styles.imageFrame}>
          <img
            src="/images/theworld/the-world-price.jpg"
            alt="The Wudlands Price of Play"
            className={styles.sectionImage}
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
          Some of the greatest deeds cannot be accomplished alone. Building a bridge across the chasm, crafting a sky vessel, re-opening the ancient mines — these demand many hands working together. Gathering stone and timber, forging steel, binding magical essence. Only builders who have proven themselves gain access to these creations, carrying them into future adventures.
        </p>

        {/* ── Wallet ────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>How to Enter</h2>
        <p className={styles.body}>
          Connect a wallet to store your adventure progress on the blockchain. Your character, the deeds you have done,
          and the choices you have made are permanently recorded — no one can take them from you.
        </p>

        <WalletGuide />

      </section>
      <PageVersionTag />
    </div>
  );
}
