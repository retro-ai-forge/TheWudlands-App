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

const READ_EXAMPLE = `<<if $lead.fame gte 30>>
  The guards recognise you and wave you through.
  [[Walk through the main gate->Market]]
<<elseif $lead.obscurity gte 30>>
  No one looks twice at you.
  [[Slip in through the smugglers' tunnel->Tunnel]]
  [[Pay the toll->Market]]
<<else>>
  The guards ask for the toll.
  [[Pay the toll->Market]]
  [[Walk to the west gate->WestGate]]
<</if>>`;

const CHANGE_EXAMPLE = `You lower your blade and let the bandit run.
<<set $lead.mercy += 3>>

[[Walk on->Road]]`;

const PARTY_EXAMPLE = `The whole party holds the bridge until dawn.
<<for _i, _c range $char>><<set _c.courage += 2>><</for>>`;

const RETREAT_EXAMPLE = `:: Retreat
You turn your back on the crypt and run.
<<for _i, _c range $char>><<set _c.cowardice += 1>><</for>>
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

        {/* ── World history ───────────────────────────────────── */}
        <section id="world-history" className={styles.section}>
          <h2 className={h.section}>The World Behind Your Story</h2>

          <p className={styles.body}>
            Every adventure takes place in a world with a long memory: the Chain-Lord, the drowned thrones,
            the occupied woods, the broken sky and the old powers that still shape the land.
            Read <Link href="/theworld/ancient" className={styles.inlineLink}>The Ancient Background of Wudlands</Link> before
            you write, so your ruins, rumours and villains fit the history players already know.
          </p>
        </section>

        {/* ── Your Legend ─────────────────────────────────────── */}
        <section id="legend" className={styles.section}>
          <h2 className={h.section}>Your Legend in Adventures</h2>

          <p className={styles.body}>
            Over many adventures each character builds a legend: Fame, Mercy, Courage and the rest
            (see <Link href="/create/tools?section=storyimpact" className={styles.inlineLink}>Your Legend</Link>).
            These values belong to each character, not to your story, and they outlive the adventure.
            That is why you reach them through the characters: <span className={styles.code}>$lead.mercy</span> for
            the party lead, <span className={styles.code}>$char[1].mercy</span> for the second in line.
          </p>

          <p className={styles.body}>
            A story changes at most <span className={styles.highlight}>two pairs</span>, its main levers:
            for example Mercy and Courage for a siege, or Favour and Corruption for a vampire court.
            Build the important decisions around those two. Reading other values is always fine.
            A story that pulls on everything leaves no clear mark.
          </p>

          <h3 className={`${h.sub} ${h.muted}`}>The variables</h3>
          <p className={styles.body}>
            Every character carries each name as its own value, from 0 to 100. Use whichever side of a pair fits your scene:
          </p>
          <ul className={styles.pairList}>
            {LEGEND_PAIRS.map(([a, b]) => (
              <li key={a}>
                <span className={styles.code}>{a}</span> / <span className={styles.code}>{b}</span>
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
            Before every scene the engine fills in each character&apos;s current values.
            Never set them in <span className={styles.code}>StoryInit</span>. Check a level with
            the lower edge of its range, for example <span className={styles.code}>gte 30</span> for known:
          </p>
          <pre className={styles.codeBlock}>{READ_EXAMPLE}</pre>

          <h3 className={`${h.sub} ${h.muted}`}>Changing the legend</h3>
          <p className={styles.body}>
            Change one character at a time. Only add with <span className={styles.code}>+=</span> (or take away with <span className={styles.code}>-=</span>),
            never set a value with <span className={styles.code}>to</span>: each change is added to that character
            the moment its scene plays. You don&apos;t need to lower the other side of a pair, the engine does that.
          </p>
          <pre className={styles.codeBlock}>{CHANGE_EXAMPLE}</pre>
          <p className={styles.body}>
            To mark the whole party, loop over <span className={styles.code}>$char</span>:
          </p>
          <pre className={styles.codeBlock}>{PARTY_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>Mark only decisions that should leave a lasting mark. Small deeds 1–3, great deeds 5 or more.</li>
            <li>A story changes at most two pairs; the submit check refuses a third. Echoes don&apos;t count. It moves each pair at most as far as its changes to that pair add up to, and never more than 10 points per character.</li>
            <li>Replays don&apos;t add up: the first time a character plays your story, those points are set aside for it, and every change uses them up. Once they are spent, your story no longer changes that character&apos;s Legend, however often it is played again.</li>
            <li>A change counts as soon as its scene plays and is never taken back, even if the adventure later ends in <span className={styles.code}>Retreat</span> or <span className={styles.code}>LastResort</span>. Like everything in the Wudlands, deeds are final.</li>
            <li>Renown fades slowly over time, about one point a week, unless new deeds feed it.</li>
            <li>With every change the engine applies the rules from Your Legend: opposites, Fame against Infamy, and echoes such as Cruelty raising Infamy.</li>
          </ul>

          <h3 className={`${h.sub} ${h.muted}`}>Running away</h3>
          <p className={styles.body}>
            Running away costs no Legend. If fleeing your story should leave a mark, your Retreat story may set a small price, such as 1 Cowardice. It counts like any other change, also toward your two pairs.
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
