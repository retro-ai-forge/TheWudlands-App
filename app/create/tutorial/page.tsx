import type { Metadata } from "next";
import { pageMetadata } from "../../lib/seo";
import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";
import styles from "./page.module.css";
import h from "@/app/styles/headings.module.css";
import { LEGEND_PAIRS } from "@/app/lib/legend";

export const metadata: Metadata = pageMetadata({
  title: "Story Editor Tutorial",
  description: "A step-by-step walkthrough for building your first adventure in the Wudlands story editor - from your first scene to submitting a finished story.",
  path: "/create/tutorial",
});

const STEPS = [
  {
    title: "Interactive Fiction",
    desc: "Write scenes that branch based on player choices — every path leads somewhere, every dead end has a way back.",
  },
  {
    title: "Decision Options",
    desc: "Give the player meaningful choices at every turn. Each option should carry weight — consequences, risk, or discovery.",
  },
  {
    title: "Metadata",
    desc: "Tag your scenes with IDs, images, and flags the engine needs — entry points, retreats, endings, and dependencies.",
  },
  {
    title: "Story Variables",
    desc: "Track what the player has done with SugarCube variables — items picked up, doors opened, allies gained or lost.",
  },
  {
    title: "Testing & Submission",
    desc: "Play through your story, fix broken links and missing endings, then submit for review. The engine validates before it goes live.",
  },
];


const LEGEND_BANDS = [
  { range: "0–9", name: "none", use: "Nobody has heard of it." },
  { range: "10–29", name: "whispered", use: "Rumours. A few people wonder." },
  { range: "30–59", name: "known", use: "People recognise it and react." },
  { range: "60–89", name: "renowned", use: "It opens or closes doors on its own." },
  { range: "90–100", name: "legendary", use: "Songs, statues, and bounties." },
];

const READ_EXAMPLE = `<<if $meta_fame gte 30>>
  The guards recognise you and wave you through.
  [[Walk through the main gate->Market]]
<<elseif $meta_obscurity gte 30>>
  No one looks twice at you.
  [[Slip in through the smugglers' tunnel->Tunnel]]
  [[Pay the toll->Market]]
<<else>>
  The guards ask for the toll.
  [[Pay the toll->Market]]
  [[Walk to the west gate->WestGate]]
<</if>>`;

const CHANGE_EXAMPLE = `You lower your blade and let the bandit run.
<<set $meta_mercy += 3>>

[[Walk on->Road]]`;

const RETREAT_EXAMPLE = `:: Retreat
You turn your back on the crypt and run.
<<set $meta_cowardice += 2>>
<<set $isEnding to true>>`;

export default function Tutorial() {
  return (
    <div className={styles.page}>
      <section className={styles.content}>
        <h1 className={h.pageTitle}>Story Editor Tutorial</h1>

        <p className={styles.intro}>
          A step-by-step walkthrough for building your first adventure in the
          Wudlands story editor. Each section covers one layer of the process —
          from writing your first scene to submitting a finished story.
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/tutorial/groupline.jpg"
          alt="A party of adventurers setting out on the road"
          className={styles.banner}
        />

        <ol className={styles.stepList}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.stepItem}>
              <span className={styles.stepNum}>{i + 1}</span>
              <div className={styles.stepBody}>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepDesc}>{step.desc}</div>
              </div>
            </li>
          ))}
        </ol>

        {/* ── Your Legend ─────────────────────────────────────── */}
        <section id="legend" className={styles.section}>
          <h2 className={h.section}>Your Legend in Adventures</h2>

          <p className={styles.body}>
            Over many adventures each character builds a legend: Fame, Mercy, Courage and the rest
            (see <Link href="/create/tools?section=storyimpact" className={styles.inlineLink}>Your Legend</Link>).
            These values belong to the character, not to your story, and they outlive the adventure.
            That is why they always carry the <span className={styles.code}>meta_</span> prefix,
            like the story metadata in <span className={styles.code}>StoryInit</span>.
          </p>

          <p className={styles.body}>
            A good story picks <span className={styles.highlight}>two values</span> from the list as its main levers,
            for example Mercy and Courage for a siege, or Favour and Corruption for a vampire court.
            Build the important decisions around those two, and touch the others only where a scene truly calls for it.
            A story that pulls on everything leaves no clear mark.
          </p>

          <h3 className={`${h.sub} ${h.muted}`}>The variables</h3>
          <p className={styles.body}>
            Every name is its own variable, from 0 to 100. Use whichever side of a pair fits your scene:
          </p>
          <ul className={styles.pairList}>
            {LEGEND_PAIRS.map(([a, b]) => (
              <li key={a}>
                <span className={styles.code}>{"$meta_" + a}</span> / <span className={styles.code}>{"$meta_" + b}</span>
              </li>
            ))}
          </ul>
          <p className={styles.body}>
            The two sides of a pair are one scale: a character is either merciful or cruel, so only one of them
            is ever above 0. Fame and Infamy are the exception, both can be above 0 at the same time.
          </p>

          <h3 className={`${h.sub} ${h.muted}`}>Levels</h3>
          <p className={styles.body}>
            Decide with levels, not exact numbers. Each value falls into one of five levels:
          </p>
          <table className={styles.table}>
            <thead>
              <tr><th>Value</th><th>Level</th><th>What it means</th></tr>
            </thead>
            <tbody>
              {LEGEND_BANDS.map((band) => (
                <tr key={band.name}>
                  <td>{band.range}</td>
                  <td className={styles.highlight}>{band.name}</td>
                  <td>{band.use}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className={`${h.sub} ${h.muted}`}>Reading the legend</h3>
          <p className={styles.body}>
            When the adventure starts, the engine fills the variables with the character&apos;s values.
            Do not set them in <span className={styles.code}>StoryInit</span>. Check a level with
            the lower edge of its range, for example <span className={styles.code}>gte 30</span> for known:
          </p>
          <pre className={styles.codeBlock}>{READ_EXAMPLE}</pre>

          <h3 className={`${h.sub} ${h.muted}`}>Changing the legend</h3>
          <p className={styles.body}>
            Only add with <span className={styles.code}>+=</span> (or take away with <span className={styles.code}>-=</span>),
            never set a value with <span className={styles.code}>to</span>: each change is added to the character
            the moment its scene plays. You don&apos;t need to lower the other side of a pair, the engine does that.
          </p>
          <pre className={styles.codeBlock}>{CHANGE_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>Mark only decisions that should leave a lasting mark. Small deeds 1–3, great deeds 5 or more.</li>
            <li>Keep one adventure&apos;s changes to at most 10 per value. Review checks this, and that no loop lets a player repeat a change.</li>
            <li>A change counts as soon as its scene plays and is never taken back, even if the adventure later ends in <span className={styles.code}>Retreat</span> or <span className={styles.code}>LastResort</span>. Like everything in the Wudlands, deeds are final.</li>
            <li>Renown fades slowly over time, about one point every four weeks, unless new deeds feed it.</li>
            <li>With every change the engine applies the rules from Your Legend: opposites, Fame against Infamy, and echoes such as Cruelty raising Infamy.</li>
          </ul>

          <h3 className={`${h.sub} ${h.muted}`}>The price of running away</h3>
          <p className={styles.body}>
            Your Retreat story decides what fleeing costs. If it sets no price, one may be added after review.
          </p>
          <pre className={styles.codeBlock}>{RETREAT_EXAMPLE}</pre>
        </section>

        <Link href="/create" className={styles.backLink}>
          &larr; Back to Create
        </Link>
      </section>
      <PageVersionTag />
    </div>
  );
}
