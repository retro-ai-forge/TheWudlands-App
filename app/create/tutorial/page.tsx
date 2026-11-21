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

const CHOICES_EXAMPLE = `:: Armoury
Which weapon do you draw?
<<listbox "$weapon">><<option "Sword" "sword">><<option "Bow" "bow">><</listbox>>

Which way do you go?
<label><<radiobutton "$path" "north" checked>> North</label>
<label><<radiobutton "$path" "south">> South</label>
<label><<checkbox "$careful" false true>> Move carefully</label>

[[Set out->Road]]

:: Road
<<if $path is "north">>The road climbs into the hills.<<else>>The road follows the river.<</if>>
<<if $weapon is "bow">>You keep your bow strung.<</if>>
<<if $careful>>You watch every step.<</if>>
[[Walk on->Camp]]`;

const CHANGING_CHOICES_EXAMPLE = `What do you light the way with?
<<if $hasLantern>><label><<radiobutton "$light" "lantern">> Lantern</label><</if>>
<label><<radiobutton "$light" "torch" checked>> Torch</label>
[[Enter the cave->Cave]]`;

const RANDOM_EITHER_EXAMPLE = `:: Forest
Wolves howl somewhere close.
<<button "Run for it">><<goto \`either("Ravine", "OldMill", "Riverbank")\`>><</button>>`;

const RANDOM_RANGE_EXAMPLE = `:: Library
The old book falls open on its own.
<<button "Turn the page">><<goto \`"Page" + random(1, 30)\`>><</button>>`;

const RANDOM_ODDS_EXAMPLE = `:: Cliff edge
<<button "Dive in">><<set $roll to random(1, 100)>><<if $roll lte 20>><<goto "Pearl">><<else>><<goto "Shore">><</if>><</button>>`;

const PICK_EXAMPLE = `:: Cliff
The path ends at a sheer cliff. Someone has to climb up and lower a rope.
Who climbs first?
<<pick_member [[CliffTop]]>>
[[Look for another way->Valley]]

:: CliffTop
$picked.name pulls up over the edge and ties the rope to a pine.
[[Follow the rope up->Plateau]]`;

const PICK_SEEN = `Who climbs first?
[ Alrik ]  [ Brena ]  [ Corin ]
[ Look for another way ]`;

const KEEP_EXAMPLE = `:: StoryInit
<<set $keep_metHermit to false>>

:: Hut
<<if $keep_metHermit>>
The hermit looks up from the fire. "You again. The forest must like you."
[[Sit by the fire->Fire]]
<<else>>
An old man watches you from the door of a moss-covered hut.
<<set $keep_metHermit to true>>
[[Greet him->Fire]]
<</if>>`;

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

        {/* ── Choices the player picks ────────────────────────── */}
        <section id="choices" className={styles.section}>
          <h2 className={h.section}>Choices the Player Picks</h2>

          <p className={styles.body}>
            Besides links and buttons, a scene can ask the player to pick before going on: one entry from a
            drop-down (<span className={styles.code}>&lt;&lt;listbox&gt;&gt;</span>), one of several radio buttons, or a
            checkbox to tick. Each pick is stored in a variable of your own, and the next scene reads it.
          </p>
          <pre className={styles.codeBlock}>{CHOICES_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>
              A drop-down gets its entries from <span className={styles.code}>&lt;&lt;option &quot;Sword&quot; &quot;sword&quot;&gt;&gt;</span>:
              the first text is what the player sees, the second what your variable stores. Write every entry out.
              A <span className={styles.code}>&lt;&lt;cycle&gt;&gt;</span>, a word that changes to the next entry with each tap,
              works the same way.
            </li>
            <li>
              Each radio button and checkbox sits inside its own <span className={styles.code}>&lt;label&gt;</span>, with plain
              words as its text and nothing else in it. Radio buttons with the same variable belong together: the
              player picks one of them.
            </li>
            <li>
              Every text a player can pick appears only once in a scene: link and button texts, labels and
              options, also across different drop-downs and in different branches of an <span className={styles.code}>&lt;&lt;if&gt;&gt;</span>.
              The player&apos;s pick comes back to the game as its text, so two equal texts couldn&apos;t be told apart.
            </li>
            <li>
              Players only pick from what you wrote; they never type anything. Store a pick in your own
              variable, never in <span className={styles.code}>$char</span>, <span className={styles.code}>$lead</span> or
              a <span className={styles.code}>$meta_</span> value.
            </li>
          </ul>
          <p className={styles.body}>
            For choices that change during the story, put radio buttons inside <span className={styles.code}>&lt;&lt;if&gt;&gt;</span>:
          </p>
          <pre className={styles.codeBlock}>{CHANGING_CHOICES_EXAMPLE}</pre>
          <p className={styles.body}>
            <span className={styles.code}>&lt;&lt;optionsfrom&gt;&gt;</span>, which fills a drop-down from a variable, isn&apos;t
            accepted: its entries would only exist while the story is played, so the submit check couldn&apos;t read them.
          </p>
        </section>

        {/* ── Random jumps ────────────────────────────────────── */}
        <section id="random-jumps" className={styles.section}>
          <h2 className={h.section}>Random Jumps</h2>

          <p className={styles.body}>
            A button can send the player to a scene chosen at random. To one of a few scenes you list, each
            equally likely:
          </p>
          <pre className={styles.codeBlock}>{RANDOM_EITHER_EXAMPLE}</pre>
          <p className={styles.body}>
            Or to one of a numbered row of scenes, here <span className={styles.code}>Page1</span> to <span className={styles.code}>Page30</span>,
            each equally likely, like a gamebook&apos;s &quot;turn to 17&quot;:
          </p>
          <pre className={styles.codeBlock}>{RANDOM_RANGE_EXAMPLE}</pre>
          <p className={styles.body}>
            For uneven odds, roll a number and choose the scene with <span className={styles.code}>&lt;&lt;if&gt;&gt;</span>.
            Here one dive in five finds the pearl:
          </p>
          <pre className={styles.codeBlock}>{RANDOM_ODDS_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>
              Keep the backquotes (<span className={styles.code}>`</span>) around <span className={styles.code}>either(...)</span> and
              around <span className={styles.code}>&quot;Page&quot; + random(1, 30)</span>. Without them SugarCube reads the pick as a
              scene name and never jumps; the submit check tells you so.
            </li>
            <li>
              Write the scene names out. <span className={styles.code}>either</span> lists each scene once, and with
              {" "}<span className={styles.code}>random</span> every scene of the row must exist, at most 200 of them. A variable
              in the pick, like <span className={styles.code}>&quot;Page&quot; + $page</span>, isn&apos;t accepted.
            </li>
            <li>
              A random jump sits between a button&apos;s or link&apos;s tags, like every
              {" "}<span className={styles.code}>&lt;&lt;goto&gt;&gt;</span>, so the dice are rolled when the player clicks. A scene
              never jumps on its own.
            </li>
            <li>
              The player never sees the number, only the scene they end up in.
            </li>
          </ul>
        </section>

        {/* ── Picking a party member ──────────────────────────── */}
        <section id="pick-member" className={styles.section}>
          <h2 className={h.section}>Letting the Player Choose a Character</h2>

          <p className={styles.soon}>
            <span className={styles.soonLabel}>Coming soon:</span> <span className={styles.code}>&lt;&lt;pick_member&gt;&gt;</span> is
            planned. The editor and the submit check don&apos;t accept it yet, and details may still change.
          </p>

          <p className={styles.body}>
            Sometimes one character has to step forward: climb the cliff, speak to the queen, taste the potion.
            Let the player decide who with <span className={styles.code}>&lt;&lt;pick_member&gt;&gt;</span>. The game
            shows one button per party member who can still act, labelled with the character&apos;s name, and the click goes on to
            the scene you name. From then on the chosen character is <span className={styles.code}>$picked</span>,
            read the same way as <span className={styles.code}>$lead</span>.
          </p>
          <pre className={styles.codeBlock}>{PICK_EXAMPLE}</pre>
          <p className={styles.body}>With a party of three, the player sees:</p>
          <pre className={styles.codeBlock}>{PICK_SEEN}</pre>
          <ul className={styles.ruleList}>
            <li>
              <span className={styles.code}>$picked</span> stays the chosen character through any number of scenes,
              until it is picked again: with the next <span className={styles.code}>&lt;&lt;pick_member&gt;&gt;</span>, or
              by the player in the settings. Before the first pick it is the lead, and if the chosen character falls,
              it is the lead again.
            </li>
            <li>
              Read <span className={styles.code}>$picked</span> and change its Legend with <span className={styles.code}>+=</span> and <span className={styles.code}>-=</span>,
              like <span className={styles.code}>$lead</span>, but never set it: only <span className={styles.code}>&lt;&lt;pick_member&gt;&gt;</span> changes who it is.
            </li>
            <li>
              The player can choose another lead at any time with the settings button; the new lead counts from the
              next scene on. If the lead falls, the game steps in before your next scene and lets the player choose a
              new lead from the characters who can still act. From then on <span className={styles.code}>$lead</span> is that character, so
              don&apos;t count on <span className={styles.code}>$lead</span> being the same character from start to end.
            </li>
            <li>
              A character can still act while alive, or as a vampire or other undead: it can lead,
              be chosen, and keep the adventure going. A character who is dead and not undead has fallen: it stays
              in the party until the adventure ends, but gets no button and never leads. When every character has
              fallen, the adventure ends at once, and everything in camp is lost.
            </li>
            <li>
              Your story will be able to say who may enter: only some (say, only vampires), everyone except some
              (no undead), and who must be there (one living and one dead character). The names of these settings
              are still to come.
            </li>
            <li>
              Don&apos;t build these buttons yourself with a <span className={styles.code}>&lt;&lt;for&gt;&gt;</span> loop:
              links and buttons inside a loop are refused. A click only tells the game the button&apos;s text, so three
              &quot;Help&quot; buttons would look the same, and each would act on the last character of the loop.
            </li>
            <li>Two characters with the same name are no problem: the game knows which character each button stands for.</li>
            <li>In the editor&apos;s Test, the buttons show the names of your test party.</li>
          </ul>
        </section>

        {/* ── Story memory ────────────────────────────────────── */}
        <section id="story-memory" className={styles.section}>
          <h2 className={h.section}>Remembering Earlier Runs</h2>

          <p className={styles.soon}>
            <span className={styles.soonLabel}>Coming soon:</span> story memory is planned. Until then,
            {" "}<span className={styles.code}>$keep_</span> variables work like any other variable and are forgotten
            when the adventure ends.
          </p>

          <p className={styles.body}>
            Characters remember your story. Start a variable&apos;s name with <span className={styles.code}>$keep_</span> and
            its value is kept, saved the moment your story changes it. The next time those characters play your story,
            the value is there again: a door already opened, a hermit who knows them, a debt still unpaid.
          </p>
          <pre className={styles.codeBlock}>{KEEP_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>
              Only variables starting with <span className={styles.code}>$keep_</span> are kept. Everything else
              starts fresh with every run.
            </li>
            <li>
              Give each one its first-time value in <span className={styles.code}>StoryInit</span>. On a replay the
              remembered value replaces it.
            </li>
            <li>
              Keep plain values only: numbers, <span className={styles.code}>true</span> or <span className={styles.code}>false</span>,
              and quoted words. Keep only what matters; there will be a limit per story.
            </li>
            <li>
              The memory belongs to the characters: every member of the party remembers what happened. When an
              adventure starts, the values come from the lead&apos;s memory, and a lead who never played your story
              starts with your <span className={styles.code}>StoryInit</span> values. Choosing another lead later
              doesn&apos;t change them.
            </li>
            <li>Only your story reads its memory. Other stories never see it.</li>
            <li>
              A changed version of your story goes out under a new id and starts with no memories.
            </li>
          </ul>
        </section>

        <Link href="/create" className={styles.backLink}>
          &larr; Back to Create
        </Link>
      </section>
      <PageVersionTag />
    </div>
  );
}
