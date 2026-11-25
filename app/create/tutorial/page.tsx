import type { Metadata } from "next";
import { pageMetadata } from "../../lib/seo";
import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";
import styles from "./page.module.css";
import h from "@/app/styles/headings.module.css";
import { LEGEND_PAIRS } from "@/app/lib/legend";
import { storyItemGroups } from "./storyItems";

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
<<set $isEnding to "failure:fled">>`;

const ITEM_GROUPS = storyItemGroups();
const ITEM_COUNT = ITEM_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

const ITEM_EXAMPLE = `<<if $lead.equipment.includes("rope")>>You climb down on your rope.<</if>>
<<if $lead.equipment.includes("pickaxe_3")>>Your pickaxe bites into the hard rock.<</if>>
<<for _i, _c range $char>><<if _c.equipment.includes("torch")>><<set _hasLight to true>><</if>><</for>>`;

/** An item id that may break after its underscores on a narrow screen. */
function breakableId(id: string) {
  return id.split("_").flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, `_${part}`]));
}

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

const GUTTER_EXAMPLE = `:root { --scene-gutter: 0px; }`;

const PICTURE_ROW_EXAMPLE = `<div class="row">[img[left.webp]][img[right.webp]]</div>`;

const PICTURE_ROW_CSS = `.row { display: flex; gap: 8px; }
.row img { width: 50%; margin: 0; }`;

const ENDING_EXAMPLE = `:: Throne room
The queen rises and takes your hand.
<<set $isEnding to "success:queen:met_queen">>

:: Dungeon
The door slams shut behind you.
<<set $isEnding to "failure:captured">>`;

const ENDINGS_LIST_EXAMPLE = `:: StoryInit
<<set $meta_endings to [
  "success:queen:met_queen",
  "success:queen:married_queen",
  "failure:captured",
  "failure:fled"
]>>`;

const ENDING_BY_CONDITION_EXAMPLE = `:: Treasury
<<if $gold gte 10>>
You leave with a heavy purse.<<set $isEnding to "success:rich">>
<<else>>
You leave with empty pockets.<<set $isEnding to "failure:poor">>
<</if>>`;

const ENDING_RETREAT_EXAMPLE = `:: Retreat
You turn your back on the castle and run.
<<set $isEnding to "failure:fled">>`;

const ENDING_LAST_RESORT_EXAMPLE = `:: LastResort
The tunnel collapses behind you. You crawl out, empty-handed.
<<set $isEnding to "lastresort">>`;

const ENDING_VALUES = [
  {
    value: '"success"',
    where: "An ending of your story. Every story needs at least one.",
    run: "The run is used up and counts for the characters who played it.",
  },
  {
    value: '"failure"',
    where: "An ending of your story, and every ending of your Retreat story.",
    run: "The run is used up and counts too - it just went badly.",
  },
  {
    value: '"lastresort"',
    where: "Only the LastResort scene, which must set it.",
    run: "Something broke: the player gets the run back.",
  },
];

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

        <div className={styles.download}>
          <h2 className={h.section}>Start with the Template</h2>
          <p className={styles.downloadText}>
            A complete little story to build on. It passes the submit check as it is, so you can test it at once and
            then replace it scene by scene with your own.
          </p>
          <a href="/downloads/wudlands-starter.twee" download className={styles.downloadButton}>
            Download wudlands-starter.twee
          </a>

          <h3 className={`${h.sub} ${h.muted}`}>What&apos;s inside</h3>
          <ul className={styles.downloadList}>
            <li>
              <span className={styles.code}>StoryInit</span>: every required setting, each with a comment on what it does, and your
              story&apos;s endings.
            </li>
            <li><span className={styles.code}>Start</span>: the first scene, with two links.</li>
            <li><span className={styles.code}>Arrival</span> and <span className={styles.code}>Lost</span>: a success and a failure ending.</li>
            <li><span className={styles.code}>Retreat</span>: where the Run away button leads. It ends in a failure.</li>
            <li><span className={styles.code}>LastResort</span>: where the platform sends a run when something breaks.</li>
          </ul>

          <h3 className={`${h.sub} ${h.muted}`}>How to start</h3>
          <ol className={styles.downloadList}>
            <li>In the story editor&apos;s library, choose Library &gt; Import and pick the downloaded file.</li>
             <li>Switch from Library to Story, click the imported story once so its highlighted. Then click Tags, the button with the tag icon, and add a genre from the{" "}
              <Link href="/create/review#story-tags" className={styles.inlineLink}>genre list</Link>, such as
              {" "}<span className={styles.code}>adventure</span>: every story needs at least one, and the file can&apos;t carry it. Rename,
              next to it, gives the story its real name.
            </li>
            <li>
              Double click the story to open it and change <span className={styles.code}>$meta_title</span>, <span className={styles.code}>$meta_description</span> and{" "}<span className={styles.code}>$meta_author</span> in <span className={styles.code}>StoryInit</span>.
            </li>
            <li>Write: replace the scenes with your own and add as many as your story needs.</li>
          </ol>
        </div>

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

        {/* ── Items ───────────────────────────────────────────── */}
        <section id="items" className={styles.section}>
          <details className={styles.fold}>
            <summary className={styles.foldSummary}>
              <h2 className={h.section}>Items the Characters Carry</h2>
            </summary>
            <div className={styles.foldBody}>
              <p className={styles.body}>
                A story can ask what the characters carry: <span className={styles.code}>equipment</span> with
                {" "}<span className={styles.code}>.includes()</span> and an item&apos;s family id, for one character or the whole party.
              </p>
              <pre className={styles.codeBlock}>{ITEM_EXAMPLE}</pre>
              <ul className={styles.ruleList}>
                <li>
                  The family id alone, like <span className={styles.code}>rope</span>, is the general check: the item
                  in any tier. Add a tier for a better one: <span className={styles.code}>pickaxe_3</span> is a pickaxe
                  of tier 3 or better. Every item comes in tiers 1 to 6.
                </li>
                <li>
                  Write the id, never the name: <span className={styles.code}>&quot;Rope&quot;</span> is refused. The
                  names below are those of tier 1; each higher tier has its own.
                </li>
                <li>
                  The list is made from the game&apos;s item data, so it always holds what the game has: {ITEM_COUNT} items
                  today.
                </li>
              </ul>
              <p className={styles.itemJump}>
                {ITEM_GROUPS.map((group, i) => (
                  <span key={group.kind}>
                    <a href={`#items-${group.kind}`} className={styles.inlineLink}>{group.heading}</a>
                    {i < ITEM_GROUPS.length - 1 && " · "}
                  </span>
                ))}
              </p>
              {ITEM_GROUPS.map((group) => (
                <div key={group.kind} id={`items-${group.kind}`} className={styles.itemGroup}>
                  <h3 className={`${h.sub} ${h.muted}`}>{group.heading} ({group.items.length})</h3>
                  <table className={`${styles.table} ${styles.itemTable}`}>
                    <thead>
                      <tr><th>Family id</th><th>Tier 1 name</th></tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={item.familyId}>
                          <td className={styles.itemId}>{breakableId(item.familyId)}</td>
                          <td>{item.tierOneName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
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

        {/* ── Text and pictures ───────────────────────────────── */}
        <section id="text-and-pictures" className={styles.section}>
          <h2 className={h.section}>Text and Pictures</h2>

          <p className={styles.body}>
            The platform insets your text 20px from both edges of the scene. Pictures still span the whole width, and
            the clickable areas on a picture always stay exactly on it, on a phone as on a wide screen.
          </p>
          <p className={styles.body}>
            To change the inset, set <span className={styles.code}>--scene-gutter</span> in your Story Stylesheet (Story &gt; Stylesheet in
            the editor). This puts the text flush with the edges:
          </p>
          <pre className={styles.codeBlock}>{GUTTER_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>Anything from <span className={styles.code}>0px</span> to <span className={styles.code}>48px</span> works; a larger value counts as 48px.</li>
            <li>
              You need no <span className={styles.code}>.passage {"{"} padding {"}"}</span> or <span className={styles.code}>.passage img</span> rules for it.
              Old ones do no harm, but the side padding always follows <span className={styles.code}>--scene-gutter</span>.
            </li>
            <li>
              Clickable areas (<span className={styles.code}>&lt;&lt;area&gt;&gt;</span>) belong to the top-most picture of a scene, and
              that picture always spans the full width.
            </li>
          </ul>
          <p className={styles.body}>
            Plain pictures you may lay out with your own classes, such as two side by side:
          </p>
          <pre className={styles.codeBlock}>{PICTURE_ROW_EXAMPLE}</pre>
          <p className={styles.body}>and in the Story Stylesheet:</p>
          <pre className={styles.codeBlock}>{PICTURE_ROW_CSS}</pre>
        </section>

        {/* ── Endings ──────────────────────────────────────────── */}
        <section id="endings" className={styles.section}>
          <h2 className={h.section}>How Your Story Ends</h2>

          <p className={styles.body}>
            Every scene without a way on ends the story. It says how the run ended by setting
            {" "}<span className={styles.code}>$isEnding</span>, and the platform keeps that ending for every character who played it.
          </p>
          <pre className={styles.codeBlock}>{ENDING_EXAMPLE}</pre>

          <h3 className={`${h.sub} ${h.muted}`}>The values</h3>
          <table className={styles.table}>
            <thead>
              <tr><th>Value</th><th>Where</th><th>The run</th></tr>
            </thead>
            <tbody>
              {ENDING_VALUES.map((row) => (
                <tr key={row.value}>
                  <td className={styles.highlight}>{row.value}</td>
                  <td>{row.where}</td>
                  <td>{row.run}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className={styles.ruleList}>
            <li>
              Give an ending a name after a colon, like <span className={styles.code}>{`"failure:captured"`}</span>, or a group and a
              name, like <span className={styles.code}>{`"success:queen:met_queen"`}</span>, to tell your endings apart. Each part is a
              word: a letter first, then letters, digits, <span className={styles.code}>_</span> or <span className={styles.code}>-</span>, at most 40 characters.
              Both are optional: <span className={styles.code}>{`"success"`}</span> on its own is fine too.
            </li>
            <li>
              An ending scene has no links or buttons. A scene that sets <span className={styles.code}>$isEnding</span> and still leads on
              is refused, and so is a scene without a way on that doesn&apos;t set it.
            </li>
            <li>
              Set it in the ending scene&apos;s own text, so it counts the moment the scene is shown (an
              {" "}<span className={styles.code}>&lt;&lt;if&gt;&gt;</span> is fine). Never by a click: not in a link&apos;s <span className={styles.code}>[ ]</span> part
              and not between a link&apos;s or button&apos;s tags. Until the ending scene it isn&apos;t set at all, and
              nothing may remove it.
            </li>
            <li>
              <span className={styles.code}>true</span> and <span className={styles.code}>false</span> aren&apos;t used any more, and <span className={styles.code}>StoryInit</span> never
              sets <span className={styles.code}>$isEnding</span>.
            </li>
          </ul>

          <h3 className={`${h.sub} ${h.muted}`}>Your endings in StoryInit</h3>
          <p className={styles.body}>
            List every success and failure once in <span className={styles.code}>StoryInit</span>, as words, no sentences:
          </p>
          <pre className={styles.codeBlock}>{ENDINGS_LIST_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>
              Every ending your scenes set must be in the list, or the submit check refuses it. The ending scene
              sets exactly the same text: <span className={styles.code}>{`<<set $isEnding to "success:queen:met_queen">>`}</span>.
            </li>
            <li>
              A group gathers endings that belong together: a follow-up story can open after any ending of the
              group <span className={styles.code}>queen</span>. So a name is never also a group:
              {" "}<span className={styles.code}>{`"success:queen"`}</span> and <span className={styles.code}>{`"success:queen:met_queen"`}</span> can&apos;t both be listed.
            </li>
            <li><span className={styles.code}>{`"lastresort"`}</span> isn&apos;t listed. An ending in the list that no scene sets is a note for the reviewer.</li>
          </ul>
          <p className={styles.soon}>
            <span className={styles.soonLabel}>Coming soon:</span> the story list shows each character the endings
            it reached, and follow-up stories can open on them. Only the characters who reached an ending ever
            see it.
          </p>

          <h3 className={`${h.sub} ${h.muted}`}>Ending by a condition</h3>
          <p className={styles.body}>
            One scene may end differently, depending on what happened before:
          </p>
          <pre className={styles.codeBlock}>{ENDING_BY_CONDITION_EXAMPLE}</pre>

          <h3 className={`${h.sub} ${h.muted}`}>When the party runs away</h3>
          <p className={styles.body}>
            Running away is a failure like any other. The platform&apos;s Run away button opens your
            {" "}<span className={styles.code}>Retreat</span> scene, and every ending of the Retreat story is a failure. If your Retreat is a
            single scene, it sets the failure itself:
          </p>
          <pre className={styles.codeBlock}>{ENDING_RETREAT_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>
              Only the Run away button opens <span className={styles.code}>Retreat</span>: no scene of yours may lead there, not even one of
              the Retreat story.
            </li>
            <li>
              A success in the Retreat story is refused. Name its failures apart, like
              {" "}<span className={styles.code}>{`"failure:fled"`}</span>, if a follow-up story should open only for those who fled.
            </li>
            <li>
              Running away counts once in the character&apos;s run-away record, the moment the button is
              clicked, even if something goes wrong afterwards.
            </li>
          </ul>

          <h3 className={`${h.sub} ${h.muted}`}>When something breaks</h3>
          <p className={styles.body}>
            If a scene can&apos;t be shown, the platform sends the run to your <span className={styles.code}>LastResort</span> scene and
            the player gets the run back. Give it a short, fitting end:
          </p>
          <pre className={styles.codeBlock}>{ENDING_LAST_RESORT_EXAMPLE}</pre>
          <ul className={styles.ruleList}>
            <li>
              <span className={styles.code}>LastResort</span> must set <span className={styles.code}>{`"lastresort"`}</span>, and no other scene may.
            </li>
            <li>Nothing links to it, and it links nowhere.</li>
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
