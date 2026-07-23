"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import ImageGallery from "./ImageGallery";

function randomizeText(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (match) => {
    const options = match.slice(1, -1).split(' | ');
    return options[Math.floor(Math.random() * options.length)];
  });
}

const FLIRT_LINES = [
  "She wears a {crimson | deep wine | blood-red} {silk gown | satin robe | velvet dress} that clings to her skin like {rose petals | spilled wine | liquid shadow}, each breath she takes demanding the fabric's surrender.",
  "The fabric drapes loose and deliberate, unbuttoned at the throat to reveal the curve of her collarbone, while the scent of {rose petals | scattered silk scarves | perfumed oils} mingles with the warmth radiating from her skin.",
  "A {gold | silver | pearl} pendant hangs low at her collarbone, catching light from {multiple candles | brazier flames | hanging lanterns} and drawing your eye to where her pulse quickens.",
  "Her hair falls {unbound | loosely braided | tumbling past her shoulders}, damp at the nape, intertwined with {silk ribbons | golden threads | fresh flowers} that frame her face like an invitation."
];

const STORY_STATS = [
  { stat: "Fame",         description: "Known as a hero — trusted, admired, celebrated",    storyUse: "Nobility welcomes you with honor, strangers offer aid" },
  { stat: "Infamy",     description: "Feared by the powerful — a weapon in the shadows",   storyUse: "Noble houses employ you for dark deeds, finest vintage wines flow freely" },
  { stat: "Faith",        description: "Devoted to a god or cosmic force, earning divine favour", storyUse: "Temples offer shelter, clergy grant healing, holy orders call on you" },
  { stat: "Heresy",       description: "Denounced by the faithful, touched by forbidden powers", storyUse: "Inquisitors hunt you, holy temples bar entry, but dark shrines grant power to the condemned" },
  { stat: "Notoriety",    description: "Bards sing your legend in every tavern and kingdom", storyUse: "Doors open without asking, nobles and merchants gift you gold" },
  { stat: "Obscurity",    description: "Unknown, hidden, forgotten, walking unseen through the world", storyUse: "Slip past guards unnoticed, enemies cannot find you" },
  { stat: "Loyality",     description: "Bonds of loyalty and deep romance",        storyUse: "Allies risk their lives for you, secret aid flows freely" },
  { stat: "Treachery",       description: "Scorned lovers and betrayed allies",       storyUse: "Ambushed by those who once knew you, reputation poisoned" },
  { stat: "Honor",        description: "Esteemed by peers for integrity and strength", storyUse: "Duels avoided through reputation, lead honor guard" },
  { stat: "Disdain",      description: "Scorned and disrespected by worthy foes",  storyUse: "Challenged constantly, betrayed by allies" },
  { stat: "Persuasion",   description: "Words that sway hearts and minds",           storyUse: "Enemies lay down arms, merchants offer discounts" },
  { stat: "Intimidation", description: "Rule through fear and force of will",      storyUse: "Enemies flee in terror, merchants comply quickly" },
  { stat: "Guildmember",  description: "Belonging to a guild or secret order",      storyUse: "Call for aid, access guild safehouse" },
  { stat: "Guildoutcast", description: "Exiled or ostracized from organized groups", storyUse: "Former allies hunt you, no refuge" },
  { stat: "Wealth",       description: "Gold, treasures, and assets accumulated",  storyUse: "Buy out rivals, commission grand works" },
  { stat: "Debt",         description: "Owe gold or favors to powerful forces",    storyUse: "Creditors demand payment in blood" },
  { stat: "Manipulation", description: "Master of deception and cunning schemes",   storyUse: "Turn enemies against each other, blackmail nobles" },
  { stat: "Sincerity",    description: "Known for truth and unwavering honor",      storyUse: "Enemies trust your word, easier treaties" },
];

const LEGEND_PREVIEWS = [
  {
    heading: "No Reputation",
    image: "/images/create/legend-1.jpg",
    alt: "City gates, no stats",
    text: "The gate guards eye you like any other traveler and ask to pay a toll before entering the city.",
    textGated: false,
    choices: [
      { label: "Greet and walk to the front gate", gated: false },
      { label: "Walk to the west gate", gated: false },
    ],
  },
  {
    heading: "Guildmember",
    image: "/images/create/legend-2.jpg",
    alt: "City gates, Guildmember greater than 30",
    text: "The gate guards eye you like any other traveler and ask to pay a toll before entering the city.",
    textGated: false,
    choices: [
      { label: "Greet and walk to the front gate", gated: false },
      { label: "Walk to the west gate", gated: false },
      { label: "Slip in through the smugglers' tunnel", gated: true },
    ],
  },
  {
    heading: "High Fame or Infamy",
    image: "/images/create/legend-3.jpg",
    alt: "City gates, Fame greater than 40",
    text: "The gate guards recognize you at once and wave you through with a salute.",
    textGated: true,
    choices: [
      { label: "Greet the guard and walk through the main gate", gated: true },
    ],
  },
];

export default function Storyteller() {
  const [showImageDimensionsPopup, setShowImageDimensionsPopup] = useState(false);
  const [expandSchema, setExpandSchema] = useState(false);
  const [expandExample, setExpandExample] = useState(false);
  const [expandVIP, setExpandVIP] = useState(false);
  const [expandUsage, setExpandUsage] = useState(false);
  const [expandStats, setExpandStats] = useState(false);
  const [legendSlide, setLegendSlide] = useState(0);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const [randomFlirtLine, setRandomFlirtLine] = useState("");

  useEffect(() => {
    const generateRandomLine = () => {
      const randomIndex = Math.floor(Math.random() * FLIRT_LINES.length);
      setRandomFlirtLine(randomizeText(FLIRT_LINES[randomIndex]));
    };

    generateRandomLine();
    const interval = setInterval(generateRandomLine, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLegendSlide((i) => (i + 1) % LEGEND_PREVIEWS.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const guidelinesRef = useRef<HTMLDetailsElement>(null);
  const romanceRef = useRef<HTMLDetailsElement>(null);
  const writingRef = useRef<HTMLDetailsElement>(null);
  const imagesRef = useRef<HTMLDetailsElement>(null);
  const exampleRef = useRef<HTMLDetailsElement>(null);
  const echoesRef = useRef<HTMLDetailsElement>(null);
  const storyimpactRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section) setOpenSection(section);
  }, []);

  useEffect(() => {
    const refs: { [key: string]: React.RefObject<HTMLDetailsElement | null> } = {
      guidelines: guidelinesRef,
      romance: romanceRef,
      writing: writingRef,
      images: imagesRef,
      example: exampleRef,
      echoes: echoesRef,
      storyimpact: storyimpactRef,
    };

    if (openSection && refs[openSection]?.current) {
      setTimeout(() => {
        refs[openSection]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, [openSection]);
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>Call for Artists</h2>

        <p className={styles.authorIntro}>
          <strong>Imagine a world, create an immersive experience.</strong> Set its mood, sketch its dangers, map the choices that lead through it.
          Gather the images that bring it to life.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/create/wudland-engine.jpg"
            alt="The Wudlands Engine"
            className={styles.sectionImage}
          />
        </div>

         <p className={styles.authorIntro}>
          Feed your vision into the Wudlands engine — and watch it transform
          into a playable adventure that thousands of wanderers will enter, explore, and carry with them forever.
          Everything you need to know is below. Open a section when you&apos;re ready.
        </p>

        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <span className={styles.stepText}>
              <strong>Write your scenes as choices.</strong> Describe each scene and the choices that
              lead out of it — branching paths, loops, and dead ends that circle back.
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <span className={styles.stepText}>
              <strong>Add images.</strong> Give scenes a dark, atmospheric picture. Optional, but
              they bring the world to life.
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <span className={styles.stepText}>
              <strong>Submit for review.</strong> Send in your story and images. Once validated and
              approved, your adventure goes live to players worldwide.
            </span>
          </li>
        </ol>

        <div style={{ scrollMarginTop: "1rem", marginBottom: "1.5rem", padding: "2rem", background: "#0a0a0a", border: "1px solid #7a6a3a" }}>
          <p className={styles.body}>
            Get inspired by the story guidelines and romance traditions, 
            follow the sections below to find everything needed to build your story. 
            They define the minimal, essential architecture: how to write scenes and choices, 
            how to integrate images, and how to structure a complete addon—from your first scene to 
            your final ending. Let&apos;s build an engine that powers the Wudlands.
          </p>
          <div className={styles.imageFrameClean}>
            <img
              src="/images/create/engine-beyond.jpg"
              alt="The Wudlands Engine"
              className={styles.sectionImageClean}
            />
          </div>
        </div>


        <details ref={guidelinesRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "guidelines"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "guidelines" ? null : "guidelines");
          }}>[ Story Guidelines ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          The Wudlands is a dark, story-driven fantasy adventure rooted in the tradition of Fighting Fantasy gamebooks
          and old-school dungeon crawling. It is a world of desperate choices, hidden dangers, and hard-earned survival.
          Anyone can contribute an adventure addon — a self-contained story that players can enter, explore, and struggle through.
          Addon creators are free to shape their own corner of the Wudlands: invent monsters, ancient ruins, secret factions,
          forbidden magic, cursed artefacts, weather-battered wilderness, and whatever strange wonders or horrors they imagine.
          The only rule is that everything must serve the story. In the future we will add more content like Sci-Fi, Cthulhu 
          1920 horror, and more, but for now we are focused on the core fantasy experience.
        </p>

         <img
          src="/images/create/createstory.jpg"
          alt="A magic book with a glowing red cover, open to a page with a quill pen poised above it. The text on the page reads: &apos;Create your own story in the Wudlands.&apos;"
          className={styles.sectionImage}
        />

        <p className={styles.body}>
          The Wudlands is not a sandbox. There is no base-building, no permanent home, no safe corner of the world to retreat to.
          Temporary shelters, makeshift camps, collapsed forts, and story-driven structures are allowed when the narrative calls for them —
          a cave to weather a storm, a barricaded inn to hold against the night, a ruined tower that becomes a brief refuge.
          These places exist within the story, not as persistent player-owned properties.
          Survival systems such as hunger, thirst, exhaustion, wounds, disease, and harsh weather are welcome additions
          as long as they create tension, push decisions, and deepen the sense of danger rather than functioning as mechanical
          busywork disconnected from the plot.
        </p>

        <p className={styles.body}>
          Stories in the Wudlands do not have to be linear. Addon creators are encouraged to build branching paths,
          narrative loops, and N:M relationships between scenes and outcomes. A single choice may open into several possible
          scenes. Several entirely different choices may converge back to the same location, encounter, or conclusion.
          Players may revisit places, retrace steps, or circle back through the world in ways that feel natural rather than forced.
          What matters is that the story remains clear and playable at every point — no dead ends, no broken loops,
          no scenes that leave the player stranded without any path forward.
        </p>


        <p className={styles.body}>
          Adventures in The Wudlands can depend on one another. An addon creator may declare that their adventure
          requires one or more other adventures to have been completed first — and that completing a given adventure
          opens the way to one specific continuation or branches into several, depending on how the player reached the end.
          This means a player may need to finish an earlier story before a later one becomes accessible to them.
          Creators are responsible for declaring these dependencies clearly when submitting their addon.
          Where an adventure requires a prerequisite, that prerequisite must be reasonably completable on its own terms —
          it cannot exist solely as a gate. The chain of adventures should feel like a natural progression through the world,
          not an artificial lock. Dependencies between addons are resolved by the platform and presented to players before they begin.
        </p>

        <p className={styles.body}>
          Every addon must include at least one ending and an escape route. This is not optional. When a player is overwhelmed,
          badly wounded, out of resources, or simply lost, there must always be a valid path they can take to retreat,
          recover, or reach some form of conclusion. This fallback path should work as a short, complete adventure on its own —
          not a punishment for failure, but an honest exit that respects the player&apos;s experience.
          A story without an escape route is an incomplete story.
        </p>

        <p className={styles.body}>
          The engine that runs addon stories is built to handle missing or undefined scenes gracefully. If a requested node,
          scene, or encounter cannot be found in the addon data, the system will not crash or break the session.
          Instead it falls back to the addon&apos;s <span className={styles.code}>emergency_exit</span> scene — a dedicated
          error-recovery scene that ends the story. 
          The description of the emergency scene should contain a description of something unusual, unforeseen, blocking
          the way forward — a collapsed tunnel, a sudden rockfall, an ambush by bandits,
          a magical trap, or any other narrative obstacle that fits the tone of the story. 
          Addon creators are responsible for defining this scene and ensuring a smooth narrative end.
          A play through only counts against the limit of 3 replays, 
          if any scene with <span className={styles.code}>ending: true</span> was encountered. 
          Several endings should be available. <br/><br/>
          Being redirected to 
          the <span className={styles.code}>emergency_exit</span> does not count 
          as a playthrough, and does not consume one of the three replays.
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Guideline</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Game Style</td>
              <td>Dark, choice-based fantasy adventure with an old-school dungeon crawling feel. Atmosphere and tension come first.</td>
            </tr>
            <tr>
              <td>Core Focus</td>
              <td>Every addon must center on a clear, driven storyline. Open sandboxes without narrative direction are not accepted.</td>
            </tr>
            <tr>
              <td>Player Experience</td>
              <td>Dangerous, immersive, and sometimes deadly — but always meaningful. Failure should feel earned, not arbitrary.</td>
            </tr>
            <tr>
              <td>Choices Matter</td>
              <td>Every significant decision must lead to real consequences. Choices that change nothing undermine the experience.</td>
            </tr>
            <tr>
              <td>Fame</td>
              <td>The adventurer&apos;s reputation — famed heroes earn trust and open doors, while infamous wanderers earn darker renown. Use fame to shape how VIP and NPCs react, what they know, and what stories follow the adventurer.</td>
            </tr>
            <tr>
              <td>Notoriety</td>
              <td>How far the adventurer&apos;s reputation has travelled. Low notoriety means renown is local; high notoriety means even distant lands have heard the tales. Creators use this to determine what NPCs already know.</td>
            </tr>
            <tr>
              <td>Story Structure</td>
              <td>Branching paths, loops, and various scene relationships are allowed and encouraged. Stories do not need to be linear.</td>
            </tr>
            <tr>
              <td>Adventure Dependencies</td>
              <td>Addons may require other adventures to be completed first. Finishing one adventure can unlock one or more others, as declared by the creator.</td>
            </tr>
             <tr>
              <td>Combat Scenes</td>
              <td>In all combat scenes the escape route remains available by default, though the author may impose consequences — injury, lost items, narrative fallout — for choosing to flee. The escape route may be disabled when the story has clearly forewarned the player of the danger through warnings, environmental cues, or an explicit threat of ambush. The player must always have a fair opportunity to prepare or withdraw before the fight begins.</td>
            </tr>
            <tr>
              <td>Default Entry</td>
              <td>The <span className={styles.code}>default_entry</span> is the scene id where every new session begins. It also acts as the non-error fallback when a requested scene cannot be resolved under normal conditions. It must exist in the scene map and must provide a path toward the escape route.</td>
            </tr>
            <tr>
              <td>Escape Route</td>
              <td>The <span className={styles.code}>default_exit</span> is the primary retreat ending. It must be marked <span className={styles.code}>{`"ending": true`}</span>. Players must always have a path to escape or recover. Warn in the current scene if the next scene disables the escape button.</td>
            </tr>
            <tr>
              <td>Missing Scene Fallback</td>
              <td>If a scene cannot be found, the engine redirects to the addon&apos;s <span className={styles.code}>emergency_exit</span> scene. 
              It must be marked <span className={styles.code}>{`"ending": false`}</span>.</td>
            </tr>
            <tr>
              <td>Survival</td>
              <td>Hunger, thirst, exhaustion, wounds, disease, and harsh weather may be used to deepen tension. They must serve the story.</td>
            </tr>

            <tr>
              <td>Addon Freedom</td>
              <td>Creators may invent anything — monsters, factions, magic systems, strange worlds — as long as it serves the adventure.</td>
            </tr>
            <tr>
              <td>Rule of Thumb</td>
              <td>If it does not strengthen the story, the tension, or the atmosphere, it should not be in the contribution.</td>
            </tr>
          </tbody>
        </table>

          </div>
        </details>

        <details ref={romanceRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "romance"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "romance" ? null : "romance");
          }}>[ Romance &amp; Minne ]</summary>
          <div className={styles.groupBody}>

        {/* ── Story Elements ─────────────────────────────────────── */}

        <p className={styles.body}>
          The Wudlands draws deep inspiration from the fantasy literature and interactive fiction of the 1980s and 1990s —
          an era defined by the pulp paperbacks of Fighting Fantasy, the early Dungeons &amp; Dragons modules, and the illustrated
          gamebooks that shaped a generation of adventurers. That tradition is vivid, atmospheric, and full of imagination.
          It is also a product of its time. The storytelling conventions of that era carried with them the gender roles,
          social assumptions, and romantic archetypes that were commonplace in popular fiction of the period.
          Players returning to this style of adventure will recognise them. They are part of what makes the experience
          feel authentic to its roots.
        </p>

        <img
          src="/images/create/minne.jpg"
          alt="A knight kneels before a noble lady in a candlelit castle hall — courtly love in the tradition of Minne."
          className={styles.sectionImage}
        />

        <p className={styles.body}>
          Central to medieval fantasy — and to the literature that inspired it — is the concept of
          <span className={styles.highlight}> Minne</span>: the courtly love tradition of the German-speaking world,
          rooted in the poetry of the Minnesingers and the chivalric romances of the high Middle Ages.
          In this tradition, a knight or wandering hero pledges his service and devotion to a noble lady —
          often unattainable, often of higher station — and undertakes trials, quests, and feats of courage
          in her name. The lady holds power not through force but through honour, favour, and the withholding or granting
          of affection. This dynamic — the devoted wanderer and the compelling, unreachable figure — recurs throughout
          The Wudlands in NPC relationships, quest structures, and story rewards.
          It is intended as atmosphere, not instruction.
        </p>

        <p className={styles.body}>
          Some content in The Wudlands and its addons can reflect the gender dynamics, stereotypes, and romantic conventions
          common to 80s and 90s fantasy fiction. Female characters may be depicted as mysterious, seductive, or as objects
          of chivalric pursuit. Male characters may be portrayed through the lens of the classic lone adventurer archetype.
          Power imbalances rooted in social class, beauty, or magical allure may appear as narrative devices.
          These elements can be presented as <span className={styles.highlight}>vintage atmosphere</span> — the deliberate aesthetic
          of a genre that carries both charm and the limitations of its era.
          They do not reflect the personal values of The Wudlands team, nor are they intended as endorsements of
          real-world attitudes toward gender, relationships, or social hierarchy.
        </p>

        <p className={styles.body}>
          Romantic storylines in addons may include flirtation, seduction, courtly intrigue, jealousy, unrequited devotion,
          and morally ambiguous power dynamics between characters — all common tropes of the genre.
          These may appear in text, dialogue, and branching choices. In adult-flagged addons, romantic storylines
          may extend into explicit erotic territory under the rules described in Section Content Standards of the GTCs.
          Where romance is present, creators are encouraged to give it weight and consequence within the story —
          a kiss earned through three nights of danger means more than one handed out freely.
          Romantic and erotic elements should feel like part of the world, not tacked-on rewards.
        </p>

        <p className={styles.body}>
          Writers who prefer to avoid romantic or courtly love storylines entirely are free to do so —
          no addon is required to contain them. If a specific story carries significant romantic themes,
          creators are asked to indicate this clearly in the addon description so players can make informed choices
          before entering.
        </p>

          </div>
        </details>

        <details ref={writingRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "writing"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "writing" ? null : "writing");
          }}>[ 1 Story scenes ]</summary>
          <div className={styles.groupBody}>

        {/* ── Story Elements ─────────────────────────────────────── */}

        <p className={styles.body}>
          Every addon submitted to The Wudlands is made up of two core elements: JSON file that defines the structure and 
          flow of the story, images that give scenes a visual presence. Those addons will be listed as 
          unapproved until they meet the platform requirements and pass the validation checks. Once approved, they 
          become available to players worldwide. Below are the detailed specifications for each element, 
          along with an example of a complete addon at the end.
        </p>

        <p className={styles.body}>
          The story itself is defined in a single JSON file. This file describes every scene, every choice, every
          connection between scenes, and the metadata the engine needs to run the addon correctly. The file must be
          valid JSON and must pass the platform schema validation before it can be published. Below is the full
          structure with all available fields.
        </p>

        <button
          onClick={() => setExpandSchema(!expandSchema)}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          {expandSchema ? "[ HIDE JSON SCHEMA ]" : "[ SHOW JSON SCHEMA ]"}
        </button>
        {expandSchema && (
          <code className={styles.codeBlock}>{`
{
  "id":               "string  — unique id, lowercase, authorname and number, e.g. id-adv-<authorname>-<uniqueNumber>",
  "title":            "string  — adventure title shown to players",
  "author":           "string  — your artist name to display",
  "version":          "string  — version format, e.g. 1.0.0",
  "polkadot_address": "string  — your polkadot address for revenue share",
  "eth_address":      "string  — optional. your ETH address for revenue share",

  "comment":          "adult — true if addon contains adult content",
  "adult":            false,   
  "comment":          "array of character requirements to enter this adventure",
  "character":        ["m","solo","elf"],
  "comment":          "array of strings to tag the addon for search and discovery",
  "tags":             ["dungeon", "horror", "romance", "survival"],
  "comment":          "array of addon ids, one must be completed before this one is accessible",
  "requires":         ["id-adv-auth-musterman-235","id-adv-auth-musterman-236"],

  "default_entry": "string  — scene id used as start point AND missing-scene fallback",
  "emergency_exit": "string  — scene id used on errors to lead to the escape route",
  "escape_route":  "string  — scene id of the retreat / fallback ending",

  "scenes": [
    {
      "id_scene": "<scene_id>",
      "image":   "string  — optional. filename of the scene image, e.g. ruined-gate.jpg",
      "image_style": "string  — optional. display preset applied to the image. available styles:",
          "comment":   "origin         — no filter, image shown as-is (default when field is omitted)",
          "comment":   "mirrorh        — horizontally flipped image",
          "comment":   "mirrorv        — vertically flipped image",
          "comment":   "darkened       — heavy shadow, very gloomy atmosphere",
          "comment":   "pitchblack     — near total darkness, only outlines remain",
          "comment":   "bright         — lifted and warmed, rare daylight or hope",
          "comment":   "blackwhite     — full desaturation, all colour removed",
          "comment":   "vintage        — aged, parchment-like tone",
          "comment":   "deepsepia      — full sepia burn, old photograph feel",
          "comment":   "cold           — icy blue shift, ghostly and frozen",
          "comment":   "moonlight      — deep cold contrast, pale silver light",
          "comment":   "crimson        — dark blood-red wash, dread and danger",
          "comment":   "copper         — warm metallic orange, firelit scenes",
          "comment":   "deepocean      — submerged blue-green darkness",
          "comment":   "poison         — sickly green hue, cursed or toxic places",
          "comment":   "infrared       — alien colour inversion, heat-map look",
          "comment":   "goldenhour     — warm amber sunset glow",
          "comment":   "apocalypse     — scorched high-contrast ruin",
          "comment":   "neonsurge      — blown-out electric colour overload",
          "comment":   "inverted       — full colour inversion, uncanny and unsettling",
          "comment":   "xray           — white-on-black skeletal exposure",
          "comment":   "emerge         —  emerges once from black to full brightness",
          "comment":   "colorpulse     — animated: cycles between greyscale and full colour (6s)",
          "comment":   "heat           — animated: slow hue and saturation pulse (2s)",
          "comment":   "fog            — pale mist veil, washed-out and desaturated",
          "comment":   "rain           — animated diagonal rain streaks, cold blue-grey wash",
          "comment":   "snow           — animated: falling snowflakes, soft white overlay",
          "comment":   "lightening     — animated: rapid lightning flashes (1s)",
          "comment":   "scanlines      — soft horizontal scanline overlay",
          "comment":   "scanlinesdark  — scanlines over darkened image",
          "comment":   "verticalstrips — soft vertical strip overlay",
          "comment":   "drunk          — animated: slow irregular sway and rotation (5s)",
          "comment":   "flicker        — animated: erratic rapid brightness flicker",
      "text":    "string  — narrative prose shown to the player. Supports \\n for line breaks.",
      "ending":   true, 
      "comment": "ending marks this as a terminal scene — deducts from the 3 playthroughs.",
      "comment": "false is also a terminal scene, but does not deduct from the 3 playthroughs.",
      "comment": "default_entry must not be marked as an ending!",
      "choices": [
        { "text": "string  — 1st choice label the player sees", "to": "string  — target <scene id>" },
        { "text": "string  — 2nd choice label the player sees", "to": "string  — target <scene id>" }
      ]
    },
    {
      "comment": "repeat the scene structure for each scene in your addon",
      "id_scene": "<scene_id>"
    },
    {
      "comment": "3rd scene",
      "id_scene": "<scene_id>"
    }
  ]
}
  `}</code>
        )}

        <p className={styles.body}>
          A few rules that apply across the whole file:
          the <span className={styles.code}>default_entry</span> scene must exist in <span className={styles.code}>scenes</span> and
          must have at least one choice that eventually leads to the <span className={styles.code}>escape_route</span>. 
          The <span className={styles.code}>escape_route</span> scene must be marked <span className={styles.code}>{`"ending": true`}</span>. 
          The <span className={styles.code}>emergency_exit</span> scene must be provided to recover from errors, it must lead to 
          the <span className={styles.code}>escape_route</span>. 
          Every <span className={styles.code}>to</span> value in a choice must reference a valid scene id within the same addon —
          cross-addon jumps are handled through <span className={styles.code}>unlocks</span>, not through choices.
          Scene ids must be lowercase and may only contain letters, digits, and hyphens.
        </p>

          </div>
        </details>

        <details ref={imagesRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "images"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "images" ? null : "images");
          }}>[ 2 Images sets ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          Each scene in your addon may reference one image. Images are not required for every scene and can be used
          for several scenes, but they strongly reinforce atmosphere and help players orient themselves within the
          world. The image is displayed above the scene text when the player enters that scene.
        </p>

        <h3 className={styles.subHeading}>Image Dimensions and Story Design</h3>

        <p className={styles.body}>
          The aspect ratio of your image directly affects how much space remains on the screen for story text, choices,
          and interactive buttons. Choose your image dimensions strategically based on the pacing and focus of each scene.
        </p>

        <button
          onClick={() => setShowImageDimensionsPopup(true)}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          [ View image dimension preview ]
        </button>

        {showImageDimensionsPopup && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0, 0, 0, 0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              cursor: "pointer",
            }}
            onClick={() => setShowImageDimensionsPopup(false)}
          >
            <div
              style={{
                background: "#0a0a0a",
                padding: "2rem",
                maxWidth: "90%",
                maxHeight: "90vh",
                overflow: "auto",
                border: "2px solid #c07a3a",
                cursor: "pointer",
              }}
              onClick={() => setShowImageDimensionsPopup(false)}
            >
              <img
                src="/images/create/ScreenImageSizes.jpg"
                alt="Diagram showing five different mobile phone screen layouts with different image aspect ratios: 16:9 (landscape), 3:2, 1:1 (square), 2:3 (portrait), and 4:5 (tall portrait). Green areas represent image space, gray areas represent space available for text and buttons."
                style={{ maxWidth: "100%", height: "auto" }}
              />
              <p
                style={{
                  textAlign: "center",
                  marginTop: "1rem",
                  color: "#7a6a3a",
                  fontSize: "0.8rem",
                  letterSpacing: "0.1em",
                }}
              >
                click to close
              </p>
            </div>
          </div>
        )}

        <p className={styles.body}>
          <span className={styles.highlight}>Landscape images (16:9, 3:2)</span> are best for deep immersion and longer narrative passages.
          The wide frame lets you display substantial story text, complex choice sets, and detailed descriptions.
          Use landscape dimensions when you just want to give a glimpse or overland journeys, vast vistas, establishing moments.
        </p>

        <p className={styles.body}>
          <span className={styles.highlight}>Portrait images (1:1 Square, 2:3, 4:5)</span> prioritize the image itself.
          Portrait dimensions leave less room for story text and choice buttons, so the visual impression carries more weight.
          Use portrait dimensions for character moments, close-ups, intimate encounters, or when the image is the focal point and text is secondary.
        </p>

        <p className={styles.body}>
          Vary your aspect ratios throughout your addon to pace the visual and narrative rhythm — wide scenes create a sense of wonder and exploration,
          narrow scenes draw focus to character and emotion.
        </p>

        <p className={styles.body}>
          Images must be submitted as <span className={styles.code}>.jpg</span> or <span className={styles.code}>.webp</span> files,
          at a minimum resolution of <span className={styles.code}>600 × 340 px</span> (16:9 landscape).
          Portrait or square crops are accepted but landscape is preferred as it fills the scene frame without letterboxing.
          File size should not exceed <span className={styles.code}>400 KB</span> per image — compress before submitting.
          Name each file after its scene id, for example <span className={styles.code}>ruined-gate.jpg</span> for a scene
          with id <span className={styles.code}>ruined-gate</span>. This makes the link between scene and image unambiguous.
        </p>

        <p className={styles.body}>
          Images should match the tone of the world: dark, painterly, atmospheric. Avoid bright, saturated modern renders
          or photographs. Pencil illustrations, oil-style digital paintings, and desaturated fantasy art all work well.
          The platform applies a subtle grayscale pulse and vignette overlay to all scene images at runtime, so images
          that already lean dark and moody will read best. Avoid images with embedded text — all text is handled by the
          scene content, not the image.
        </p>

        <table className={styles.fieldTable}>
          <thead>
            <tr><th>Type</th><th>Value</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Format</td><td>.jpg / .webp / .gif</td><td>Other types not supported</td></tr>
            <tr><td>Min res.</td><td>600 × 340 px</td><td>16:9 landscape</td></tr>
            <tr><td>Max res.</td><td>1000 × 1250 px</td><td>4:5 portrait</td></tr>
            <tr><td>Max file size</td><td>400 KB</td><td>Compress before submitting</td></tr>
            <tr><td>Naming</td><td>scene.jpg / id.jpg</td><td>Must match the scene / id in your JSON.</td></tr>
            <tr><td>Style</td><td>Dark fantasy art</td><td>Painterly, desaturated, atmospheric</td></tr>
            <tr><td>Required</td><td>No</td><td>Images are optional per scene but at least one is strongly recommended.</td></tr>

          </tbody>
        </table>


        {/* 2b — CSS Style Preview */}
        <h3 className={styles.subHeading}>CSS Image Style Preview</h3>

        <p className={styles.body}>
          The following gallery shows all available <span className={styles.code}>image_style</span> presets
          applied to a sample set of scene images. Click any image to enlarge it. Click again to close. Use the 
          images filters below sparingly and intentionally to create mood and tone. A well-chosen image can make 
          a scene memorable, while a poorly chosen one can feel out of place or even break immersion.
        </p>

        <ImageGallery />

          </div>
        </details>

        <details ref={exampleRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "example"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "example" ? null : "example");
          }}>[ 3 Story example ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          Below is a complete minimal addon with three scenes. It demonstrates a starting scene with two choices,
          a deeper scene that leads either forward or back, and an escape route marked as a terminal ending.
          This structure is the smallest valid addon the platform will accept.
        </p>

        <button
          onClick={() => setExpandExample(!expandExample)}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          {expandExample ? "[ HIDE EXAMPLE JSON ]" : "[ SHOW EXAMPLE JSON ]"}
        </button>
        {expandExample && (
          <code className={styles.codeBlock}>{`
{
  "id":                "id-adv-grimwald-001",
  "title":             "The Ruined Gate",
  "author":            "Grimwald of Ashfen",
  "version":           "1.0.0",
  "polkadot_address":  "",
  "eth_address":       "",
  "adult":             false,
  "character":         ["m", "d", "f", "solo"],
  "tags":              ["dungeon", "ruins"],
  "requires":          [],

  "default_entry":     "approach",
  "emergency_exit":    "broken_ceiling",
  "escape_route":      "run_away",

  "comment": "array of scenes, each with a unique id, image, text, and choices" ,
  "scenes": [
    { 
      "id-scene":    "approach",
      "image":       "approach.jpg",
      "image_style": "deepocean",
      "text":        "After a few hours of travel, you stand at the lip of a yawning sinkhole, the air below smelling of damp stone and old rot.<br>You claimed down carefully into the pit, but the ground beneath you crumbles and gives way. You fall a short distance, scraping your arms and legs on the jagged rock.<br>At the bottom you see a narrow staircase carved into the rock descends into the dark — a cold draft sighs up from the depths.<br>Loose pebbles skitter underfoot. Far below, something moves that is not the wind.",
      "choices": [
        { "text": "Descend the carved steps",                  "to": "inner-court" },
        { "text": "You don't feel ready for this. Climb out",  "to": "forest-retreat" }
      ]
    },
    {
      "id-scene":    "inner-court",
      "image":       "inner-court.jpg",
      "image_style": "scanlines",
      "text":        "You step into a vaulted cavern where moulded pillars hold a ceiling low with mineral veins.<br>Water drips in slow, musical patterns. Ancient scratches mark a path toward a half-buried gate carved with symbols. The gate is broken and some metal pieces hang loose.<br>From somewhere deeper comes a metallic, distant clank.",
      "choices": [
        { "text": "Follow the scratched path",              "to": "inner-court" },
        { "text": "Grab a rusty metal bar and return home", "to": "return-home" },
        { "text": "Leave to get better equippment",         "to": "forest-retreat" }
      ]
    },
    {
      "id-scene":    "return-home",
      "image":       "peaceful-forest.jpg",
      "text":        "With effort, you grab one of the rusty metal poles and wrench it free. Clutching the dusty metal bar, you quickly run back to the surface and climb out of the sinkhole. The sun is warm on your face as you emerge, though the air tastes of dust and earth.<br>Still, you feel lucky to have returned with your prize.",
      "ending":       true
    },
    {
      "id-scene":    "forest-retreat",
      "image":       "forest-path.jpg",
      "text":        "You claw your way back to the surface and emerge from the sinkhole into a quiet forest. Sunlight filters through the canopy above, and the air is crisp with the scent of pine and earth.<br>You make your way home, vowing to return better equipped and ready to claim what the depths have guarded.",
      "ending":       true
    },
    {
      "id-scene":    "broken-ceiling",
      "image":       "broken-ceiling.jpg",
      "image_style": "apocalypse",
      "text":        "Suddenly an earthquake shakes the caverns. Dust falls like rain and a thunder of collapsing stone drowns the sound of your breath.<br>A fissure opens, dropping you into a fractured passage; rubble blocks the way you came. You must fight your way through the shifting dark toward any route that leads upward.<br>Debris underfoot threatens to give; the air tastes of iron and panic.",
      "ending":       false
    },
    {
      "id-scene":    "run_away",
      "image":       "forest-retreat.jpg",
      "text":        "You scramble up a narrow shaft and find a ragged slit of sky.<br>The surface is a maze of broken earth and toppled root, but above you, the world is open and the air warm.<br>You make your way back to the light, lungs burning and pockets full of dust, alive and changed.",
      "ending":       true
    }
  ],
  "comment": "end of scene array"
}
  `}</code>
        )}

        <p className={styles.body}>
          This example is intentionally spare. A published addon will typically contain between sixty and five hundred scenes,
          with multiple branching paths, several dead ends that loop back to earlier scenes, and at least two or three
          distinct endings depending on the choices the player made. The escape route will always be reachable from
          any scene. The escape route might be a short story in itself.
        </p>

          </div>
        </details>

        <div style={{ scrollMarginTop: "1rem", marginTop: "1.5rem", marginBottom: "1.5rem", padding: "1rem 2rem", background: "#0a0a0a", border: "1px solid #7a6a3a" }}>
          <p className={styles.body}>
            Here you find optional elements to enrich your stories. Only the active
            elements (marked with the <img src="/images/create/feature-active.png" alt="wax seal" title="active" style={{ height: "1.8rem", width: "auto", display: "inline", verticalAlign: "middle", marginLeft: "0.25rem", marginRight: "0.25rem" }} /> wax seal) are available for use in stories.
          </p>

          <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-active.png" alt="Active" title="active" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>none</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>-</span>
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid #3a3020", margin: "0" }} />

            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-progress.png" alt="Progress" title="progress" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Your Legend: Reputation</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Every deed is carved into the eternal record — your deeds shape how the world remembers you, from whispered legend to feared name</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-progress.png" alt="Progress" title="progress" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Echoes of the past</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Powerful figures bound to you by devotion and desire — lovers, rivals, sworn enemies in matters of passion</span>
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid #3a3020", margin: "0" }} />
            
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Creatures</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Monsters, beasts, and NPCs that inhabit your stories — enemies to face, allies to befriend, and characters that shape the narrative</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Prove Your Abilities</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Skill and crafting checks that separate the lucky from the truly capable</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Vital Status</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Track special conditions of characters throughout their journey</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Availablility</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Track character status with countdown timers in characer preview — free, ready, working, travelling, or imprisoned — showing when they are available again.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Forged together</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Legendary works built through cooperation, trust, and shared purpose — bridges, sky vessels, and sailships created by fellowships working together</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Carrying capacity</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Slot based inventory system allowing characters to carry a limited number of items.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Random Scene Choices</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Random scene selection can create unique and unpredictable experiences for players. 
                  Some events only happen rarely. Others create a unique flow through the narrative.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Market Trading</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Multiple choice buttons for item selection and trading in markets, allowing adventurers to buy, sell, and exchange goods</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Story Effects</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Local in-adventure values that exist only within the context of the running adventure, be it hunger, thirst, cold</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Magic</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Arcane forces, pagan rites, ancient spells, and forbidden lore waiting to reshape fate</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Saving Throws</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Moments of desperation where luck and will decide if you survive the impossible</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-idea.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Classes</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Distinct paths that define your character — warrior, scholar, rogue, or beyond</span>
              </div>
            </div>
          </div>

            <div className={styles.imageFrameClean}>
            <img
              src="/images/create/wudland-engine2.jpg"
              alt="The Wudlands Engine"
              className={styles.sectionImageClean}
            />
          </div>
        </div>

        <details id="the-legend" ref={storyimpactRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "storyimpact"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "storyimpact" ? null : "storyimpact");
          }}>[ Your Legend ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          Every decision leaves a mark that shapes how the world reads you.
          Your stats are not numbers on a sheet — they are the reputation players build,
          the bonds they forge, and the enemies they make. Every choice in your adventure leaves a mark that is permanently recorded.
          These marks are stored and carried forward into every adventure that follows, accumulating into social forces that allow you aboard a pirate ship or deny entry.
          The stats come with an opposing force: push too hard in one direction and the other diminishes into shadow.
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Stat</th>
              <th>Description</th>
              <th>In-story Use</th>
            </tr>
          </thead>
          <tbody>
            {STORY_STATS.map((row, index) => (
              <tr key={row.stat} data-pair={Math.floor(index / 2)} className={styles.statRow}>
                <td className={styles.statName}>{row.stat}</td>
                <td>{row.description}</td>
                <td>{row.storyUse}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className={styles.body}>
          Stats are moved by attaching the stat key straight to a choice, alongside its <span className={styles.code}>text</span> and <span className={styles.code}>to</span>.
          A positive value raises the stat, a negative value lowers it; since each stat has an opposing
          force, raising one gently pulls its opposite down. You are not required to touch a stat on
          every choice — only mark the ones where the decision should leave a lasting impression. The gap between two opposing stats is the measure of your reputation in that domain. A player with a high Fame and low Infamy is widely celebrated, while a player with low Fame and high Infamy is feared and revered.
        </p>

        <p className={styles.body}>
          Stats can also steer the story itself. A scene&apos;s <span className={styles.code}>text</span> can branch on a
          stat threshold, so the same location reads differently depending on what the player has built. A choice can
          likewise be gated behind <span className={styles.code}>show_if</span>, so it only appears once the player has
          earned — or sunk to — the reputation it requires.
        </p>

        <button
          onClick={() => setExpandStats(!expandStats)}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          {expandStats ? "[ HIDE STAT EXAMPLE ]" : "[ SHOW STAT EXAMPLE ]"}
        </button>
        {expandStats && (
          <code className={styles.codeBlock}>{`
{
  "scenes": [
    {
      "id-scene":  "tavern-boast",
      "text": "You recount your deeds before the crowded tavern, and the room falls quiet to listen.",
      "choices": [
        { "text": "Tell the truth of your victory", "to": "tavern-cheer", "stat.Fame": 2 },
        { "text": "Threaten the loudest heckler into silence", "to": "tavern-fear", "stat.Infamy": 3 }
      ]
    },
    {
      "id-scene": "city-gates",
      "comment": "text branches on the player's accumulated Fame",
      "text": {
        "stat.Fame>40": "The gate guards recognize you at once and wave you through with a salute.",
        "default": "The gate guards eye you like any other traveler and ask to pay a toll before entering the city."
      },
      "choices": [
        {
          "show_if": "stat.Fame>40",
          "show_if": "stat.Infamy>40",
          "comment": "only shown once the player has high enough fame",
          "text": "Greet the guard and walk through the main gate",
          "to": "city-square"
        },
        { 
          "show_if": "stat.Fame<=40",
          "text": "Greet and walk to the front gate", "to": "pay-toll-at-gate" },
        { 
          "show_if": "stat.Fame<=40",
          "text": "Walk to the west gate", "to": "city-west" 
        },
        {
          "show_if": "stat.Guildmember>30",
          "comment": "only shown once the player has high standing with local guild to know this route exists",
          "text": "Slip in through the smugglers' tunnel",
          "to": "city-underbelly"
        }
      ]
    }
  ],
  "comment": "end of scene array"
}
          `}</code>
        )}

        <p className={styles.body}>
          A leading <span style={{ color: "#c07a3a", fontWeight: "bold" }}>◆</span> marks any line of text or any choice
          that only appears because of a stat — always visible, no hover needed. A grey <span className={styles.glyphFade} style={{ color: "#6b6b6b", fontWeight: "bold" }}>◆</span> in
          the corner means other options exist here too, hidden until your stats qualify for them.
        </p>

        <h3 className={styles.subHeading}>Scene Preview: {LEGEND_PREVIEWS[legendSlide].heading}</h3>

        <div style={{ display: "grid", maxWidth: "500px", marginTop: "1.5rem" }}>
          {LEGEND_PREVIEWS.map((preview, i) => (
            <div
              key={preview.heading}
              aria-hidden={i !== legendSlide}
              style={{
                gridArea: "1 / 1",
                position: "relative",
                opacity: i === legendSlide ? 1 : 0,
                pointerEvents: i === legendSlide ? "auto" : "none",
                transition: "opacity 0.4s",
                border: "2px solid #7a6a3a",
                background: "#1a1a1a",
                padding: "2rem",
                color: "#d4c9a8",
                fontFamily: "Georgia, serif",
                lineHeight: "1.8"
              }}
            >
              {i === 0 && (
                <span
                  title="Other options exist but are hidden until your stats qualify"
                  className={styles.glyphFade}
                  style={{
                    position: "absolute",
                    bottom: "0.75rem",
                    left: "0.75rem",
                    color: "#6b6b6b",
                    fontWeight: "bold",
                    fontSize: "1.1rem"
                  }}
                >◆</span>
              )}

              <img
                src={preview.image}
                alt={preview.alt}
                style={{
                  width: "100%",
                  marginBottom: "1.5rem",
                  border: "1px solid #7a6a3a"
                }}
              />

              <p style={{ marginBottom: "1.5rem" }}>
                {preview.textGated && (
                  <span style={{ marginRight: "0.5em", color: "#c07a3a", fontWeight: "bold" }}>◆</span>
                )}
                {preview.text}
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                {preview.choices.map((choice) => (
                  <button
                    key={choice.label}
                    tabIndex={i === legendSlide ? 0 : -1}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#7a6a3a";
                      e.currentTarget.style.color = "#0a0a0a";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#2a2a2a";
                      e.currentTarget.style.color = "#d4c9a8";
                    }}
                    style={{
                      flex: preview.choices.length > 1 ? "1 1 45%" : 1,
                      padding: "1rem",
                      background: "#2a2a2a",
                      border: "2px solid #7a6a3a",
                      color: "#d4c9a8",
                      cursor: "pointer",
                      fontFamily: "Georgia, serif",
                      fontSize: "0.95rem",
                      transition: "all 0.2s"
                    }}
                  >
                    {choice.gated && (
                      <span style={{ marginRight: "0.5em", color: "#c07a3a", fontWeight: "bold" }}>◆</span>
                    )}
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem", maxWidth: "500px" }}>
          {LEGEND_PREVIEWS.map((preview, i) => (
            <span
              key={preview.heading}
              style={{
                width: "0.5rem",
                height: "0.5rem",
                borderRadius: "50%",
                background: i === legendSlide ? "#c07a3a" : "#3a3020"
              }}
            />
          ))}
        </div>

          </div>
        </details>

    <details id="echoes" ref={echoesRef} className={styles.group} open={openSection === "echoes"} style={{ scrollMarginTop: "1rem" }}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "echoes" ? null : "echoes");
          }}>[ Echoes of the Past ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          Every true relationship your character builds persists across adventures. 
          When your story introduces an <strong>important character</strong> — a pauper, 
          lord, sorceress, a villain, a temptress, a betrayer that might reappear in the future,
          you create them specifically. The platform will reach back into the player&apos;s history. 
          If they have already charmed, scorned, saved, or wronged someone of that standing, 
          those old feelings carry forward into your story, they arrive with a relationship already written. 
          If none is found the new proposed person is added to the player&apos;s history and will be 
          available for future stories.
        </p>

        <p className={styles.body}>
          Use this deliberately. A powerful figure who adores the player may offer shelter that should not exist, whisper secrets that change the shape of a scene, or step into danger on their behalf. One who despises them may close doors before they are reached, poison reputations, or arrive at the worst possible moment. If you want your story to feel connected to the broader world, lean on generic roles and let the player&apos;s history do the work. If you want a clean slate with no inherited baggage, name your character.
        </p>

        <p className={styles.body}>
          Allowing a person from a previous adventure to be reused is done by defining 
          small <strong>matching requirements</strong> — a set of criteria the known 
          person must satisfy before the platform considers them a valid match. 
          Each criterion can be stated as a 
          requirement (<span className={styles.code}>Standing: Legendary</span> means 
          the character must know someone of exactly that 
          level) or as an exclusion (<span className={styles.code}>!Shadow</span> means that 
          affiliation is ruled out, so the match may be Spiritual or Power but not Shadow). You 
          decide how many criteria must fit and how strict each one is. The more requirements 
          you define, the more specific the match — the fewer, the broader 
          the net. <strong>Any criterion left undefined accepts all values.</strong> A role with 
          no requirements at all will match the first relevant person in the 
          character&apos;s history regardless of their standing, affiliation, or faith. 
          If no match is found, the role is treated as a new person and added to 
          the character&apos;s list — ready to carry weight in adventures that follow.
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Levels</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Relationship</td>
              <td>
                <strong>Love</strong> — romantic devotion; shapes decisions through emotion and personal connection.<br />
                <strong>Magic</strong> — arcane knowledge and mystical power; rare, potent, and transformative in action.<br />
                <strong>Warfare</strong> — martial skill and combat proficiency; earned through shared battles and tested valor.<br />
                <strong>Economic</strong> — money moves mountains; convert riches into influence and exclusive paths.<br />
                <strong>Bloodline</strong> — family ties and hereditary bonds; legacy and blood obligation run deeper than choice.<br />
                <strong>Prophecy</strong> — bound by fate itself; a shared prophecy or mystical connection ties your futures together.<br />
                <strong>Knowledge</strong> — information, secrets, and insight; shapes decisions through understanding and foresight.
              </td>
            </tr>
            <tr>
              <td>Gender</td>
              <td>
                <strong>Male</strong> — chivalric rivalry, martial honour, political alliance through strength.<br />
                <strong>Female</strong> — courtly love, inheritance intrigue, social manipulation.<br />
                <strong>Other</strong> — ambiguous, magical, or outside convention; the world does not read them easily.
              </td>
            </tr>
            <tr>
              <td>Race</td>
              <td>
                The bloodline that defines your character. 
                Choose <strong>Common, Mystical, Mixed,</strong> or <strong>Giants</strong> — or 
                specify a particular race like <strong>Tiefling, Human, Goliath </strong> or <strong>Lizardfolk</strong>. Explore the full range 
                 in <a href="/characters#race" style={{ color: "#c07a3a", textDecoration: "underline" }}>
                 Races</a> on the Characters page.
              </td>
            </tr>
            <tr>
              <td>Morality</td>
              <td>
                <strong>Corrupt</strong> — love and hate are tools; acts only when it profits them.<br />
                <strong>Pragmatic</strong> — the feeling is real but so is caution; acts when the moment is right.<br />
                <strong>Bound</strong> — feeling translates directly into action; driven by code, oath, or unbreakable conviction.
              </td>
            </tr>
            <tr>
              <td>Wealth</td>
              <td>
                <strong>Poor</strong> — no material leverage; harm or help is personal and direct.<br />
                <strong>Comfortable</strong> — coin, shelter, skilled allies, minor bribes.<br />
                <strong>Rich</strong> — funds enemies, buys witnesses, hires soldiers, changes the player&apos;s circumstances entirely.
              </td>
            </tr>
            <tr>
              <td>Standing</td>
              <td>
                <strong>Commoner</strong> — local reach only.<br />
                <strong>Notable</strong> — guild officer, merchant, local lord; leverage across a town or province.<br />
                <strong>Legendary</strong> — noble, warlord, high clergy, royalty; their word reshapes the world.
              </td>
            </tr>
            <tr>
              <td>Affiliation</td>
              <td>
                <strong>Spiritual</strong> — church, arcane order, cult; wields faith and sacred authority.<br />
                <strong>Power</strong> — court, military, crown; commands soldiers, law, and political favour.<br />
                <strong>Shadow</strong> — guild, merchant network, criminal fraternity; controls trade, information, and coin.
              </td>
            </tr>
            <tr>
              <td>Faith</td>
              <td>
                <strong>Secular</strong> — religion plays no part in how they love or hate.<br />
                <strong>Observant</strong> — faith shapes judgement; doctrine justifies the feeling.<br />
                <strong>Fanatical</strong> — faith defines everything; can grant absolution or call for trial, exile, and holy war.
              </td>
            </tr>
          </tbody>
        </table>
        

        <h3 className={styles.subHeading}>VIP Example: Lady Isolde</h3>

        <p className={styles.body}>
          Below is a complete example of a VIP defined in JSON. Lady Isolde represents a <span className={styles.highlight}>Minne courtly love</span> —
          a noble woman whose affection must be earned through deeds, not words. Her matching requirements ensure she only appears to players 
          who have <strong>not</strong> previously encountered a notable female noble, creating continuity across adventures. &apos;new&apos; parameters will be used in 
          case no match is found in the character history. Allowing her to enter as a new person in the history of the player. 
          Visual description are optional, but recommended to give the player a sense of her appearance and presence in the world. 
          When <span className={styles.code}>{'{vip.id-isolde.formal}'}</span> is used, one of the formal sentences is 
          selected randomly and displayed to the player. Options in <span className={styles.code}>{'{ x | y | z }'}</span> vary each time. 
        </p>

        <button
          onClick={() => setExpandVIP(!expandVIP)}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          {expandVIP ? "[ HIDE VIP EXAMPLE ]" : "[ SHOW VIP EXAMPLE ]"}
        </button>
        {expandVIP && (
          <code className={styles.codeBlock}>{`
          {
            "comment": "array of vips",
            "vip": [ 
            {
              "id-vip": "id-isolde",
              "comment": "id used throughout the adventure even when this was loaded from character history",
              "match": { 
                "comment": "identifiers for this vip to find matches in player history",
                "pattern": {
                  "relationship": "Love",
                  "gender": "Female",
                  "race": "Common",
                  "comment": "morality is not defined, any is accepted",
                  "comment": "wealth is negated, so any poor person will be excluded from matching",
                  "wealth": "!Poor", 
                  "comment": "standing is negated, so any commoner will be excluded from matching",
                  "standing": "!Commoner",
                  "affiliation": "Power",
                  "faith": "Observant"
                }, 
                "comment": "in case no match is found, use this complete fallback entries to create a new person"
              },
              "new": {
                "comment": "in case no match is found, new vip char is created",
                "name.first": "Lady Isolde",
                "name.last": "of Ashenvale",
                "relationship": "Love",
                "race": "Elf",
                "morality": "Pragmatic",
                "wealth": "Rich",
                "standing": "Notable",
                "affiliation": "Power",
                "faith": "Observant",
                "comment": "the default starting love/hate rating for this NPC if no match is found",
                "rating_npc": 0,
                "comment": "visuals for the new person",
                "visuals": {
                  "formal_1": "She wears a {royal blue | deep purple | midnight black} {brocade gown | formal dress | coronet robe} adorned with intricate {gold | silver | bronze} embroidery.",
                  "formal_2": "Multiple {gemstones | pearls | jewels} are woven into the fabric, and she carries a {ceremonial fan | formal scepter | ornate staff} as a symbol of her station.",
                  "formal_3": "Her hair is swept into an elaborate {upswept style | jeweled crown | ornate headdress}, held with {gold pins | pearl clasps | silver combs}.",
                  "formal_4": "She sits upon a {high-backed chair | throne | dais}, surrounded by the {tapestries | heraldic banners | ceremonial symbols} of her house.",

                  "walk_1": "She wears a severe travelling coat of {charcoal | rust-brown | slate grey}, a {wooden staff | iron-tipped walking staff | carved walking stick} in her hand.",
                  "walk_2": "Her feet are shod in {leather riding boots | heavy wool boots | weathered travel boots}, and a {leather satchel | canvas pack | travel bag} rests across her shoulder.",
                  "walk_3": "Her hair is bound in a {tight braid | high knot | austere twist}.",
                  "walk_4": "She wears no jewelry, only a {rope belt | leather belt | cord cincher} at her waist.",
    
                  "dinner_1": "She wears a {simple linen gown | understated silk shift | modest wool dress} in {grey-blue | ash grey | pale dove}, seated at a table before a {goblet of wine | cup of mead | plate of bread}.",
                  "dinner_2": "The fabric carries minimal embroidery—a few threads at the cuffs—and a {silver spoon | bronze knife | pewter fork} rests beside her plate.",
                  "dinner_3": "Her hair is bound in a {tight braid | high knot | severe twist}.",
                  "dinner_4": "Candlelight flickers across her face from {tallow candles | oil lamps | wax candles} on the table.",

                  "flirt_1": "She wears a {crimson | deep wine | blood-red} {silk gown | satin robe | velvet dress} that clings to her skin like {rose petals | spilled wine | liquid shadow}, each breath she takes demanding the fabric's surrender.",
                  "flirt_2": "The fabric drapes loose and deliberate, unbuttoned at the throat to reveal the curve of her collarbone, while the scent of {rose petals | scattered silk scarves | perfumed oils} mingles with the warmth radiating from her skin.",
                  "flirt_3": "A {gold | silver | pearl} pendant hangs low at her collarbone, catching light from {multiple candles | brazier flames | hanging lanterns} and drawing your eye to where her pulse quickens.",
                  "flirt_4": "Her hair falls {unbound | loosely braided | tumbling past her shoulders}, damp at the nape, intertwined with {silk ribbons | golden threads | fresh flowers} that frame her face like an invitation.",

                  "sleep_1": "She wears a {dark wool | heavy linen | midnight blue} travelling cloak, lying upon a {straw mattress | bedroll | fur pelt}.",
                  "sleep_2": "Beside her rest a {dagger | short sword | hunting knife} and a {waterskin | clay jug | leather flask}.",
                  "sleep_3": "Her hair is loosely bound with a single cord, spread across a {stuffed pillow | cloth bag | rolled cloak}.",
                  "sleep_4": "A {dying fire | oil lamp | single candle} casts long shadows across her sleeping form.",

                  "battle_1": "She wears a {deep emerald | rich sapphire | midnight purple} {velvet gown | brocade dress | silk robe}, now stained with {dust | ash | dried blood}.",
                  "battle_2": "{Gold | Silver | Bronze}-threaded accents run along the sleeves, and a {sword | longsword | curved blade} is clasped in her hands.",
                  "battle_3": "Her hair is loose, falling freely past her shoulders, tangled with {sweat | debris | battle-dust}.",
                  "battle_4": "A {silver | gold | pearl-set} circlet rests upon her brow, dented from combat."
                } 
              },
              "comment": "end 1st vip"
            }, 
            {
              "id-vip": "id-warlock-of-the...",
              "comment": "end 2st vip"
            },
            {
              "id-vip": "id-traveler...",
              "comment": "end 3st vip"
            }], 
            "comment": "array end"
          }
          `}</code>
        )}

        <h3 className={styles.subHeading}>Using VIPs in Your Story</h3>

        <p className={styles.body}>
          To reference a VIP in your story scenes, use the VIP&apos;s identifier in your scene text or choices. The platform will look up the VIP definition, apply matching criteria, and display the appropriate visuals and relationship state.
        </p>

        <button
          onClick={() => setExpandUsage(!expandUsage)}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          {expandUsage ? "[ HIDE USAGE EXAMPLE ]" : "[ SHOW USAGE EXAMPLE ]"}
        </button>
        {expandUsage && (
          <code className={styles.codeBlock}>{`
          {
            "scenes": [
              {
                "id-scene": "camp-night",
                "image": "camp-night.jpg",
                "text": "You find {vip.id-isolde.name.full} by the dying embers of the campfire. {vip.id-isolde.sleep} She sleeps fitfully, her hand resting on a dagger nearby.<br>The night is cold and quiet around you.",
                "choices": [
                  { "text": "Watch over her until dawn", "to": "isolde-awakening" },
                  { "text": "Return to your own bedroll", "to": "camp-morning" }
                ]
              },
              {
                "id-scene": "isolde-awakening",
                "image": "camp-dawn.jpg",
                "text": "As the first light touches the camp, her eyes open.<br>{vip.id-isolde.name.full} sees you watching and rises slowly, her expression shifting from vulnerability to something deeper.<br>{vip.id-isolde.flirt} She moves closer, and for a moment, the world holds still.",
                "choices": [
                  { "text": "Reach for her hand", "to": "isolde-hand", "vip.id-isolde.rating": 3 },
                  { "text": "Step back respectfully", "to": "camp-morning", "vip.id-isolde.rating": -2 }
                ]
              }
            ],
            "comment": "end of scene array"
          }
          `}</code>
        )}

        <h3 className={styles.subHeading}>Scene Preview</h3>

        <div style={{
          border: "2px solid #7a6a3a",
          background: "#1a1a1a",
          padding: "2rem",
          maxWidth: "500px",
          color: "#d4c9a8",
          fontFamily: "Georgia, serif",
          lineHeight: "1.8",
          marginTop: "1.5rem"
        }}>
          <img
            src="/images/create/isolde.jpg"
            alt="Lady Isolde"
            style={{
              width: "100%",
              marginBottom: "1.5rem",
              border: "1px solid #7a6a3a"
            }}
          />

          <p style={{ marginBottom: "1rem" }}>As the first light touches the camp, her eyes open. 
            She sees you watching and rises slowly, Lady Isolde of Ashenvale expression shifting 
            from vulnerability to something deeper.</p>

          <p style={{
            background: "rgba(192,122,58,0.15)",
            borderLeft: "3px solid #c07a3a",
            padding: "1rem",
            margin: "1rem 0",
            fontStyle: "italic",
            fontSize: "0.95rem"
          }}>
            {randomFlirtLine}
          </p>

          <p style={{ marginBottom: "1.5rem" }}>She moves closer, and for a moment, the world holds still.</p>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#7a6a3a";
                e.currentTarget.style.color = "#0a0a0a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#2a2a2a";
                e.currentTarget.style.color = "#d4c9a8";
              }}
              style={{
                flex: 1,
                padding: "1rem",
                background: "#2a2a2a",
                border: "2px solid #7a6a3a",
                color: "#d4c9a8",
                cursor: "pointer",
                fontFamily: "Georgia, serif",
                fontSize: "0.95rem",
                transition: "all 0.2s"
              }}
            >Reach for her hand</button>

            <button
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#7a6a3a";
                e.currentTarget.style.color = "#0a0a0a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#2a2a2a";
                e.currentTarget.style.color = "#d4c9a8";
              }}
              style={{
                flex: 1,
                padding: "1rem",
                background: "#2a2a2a",
                border: "2px solid #7a6a3a",
                color: "#d4c9a8",
                cursor: "pointer",
                fontFamily: "Georgia, serif",
                fontSize: "0.95rem",
                transition: "all 0.2s"
              }}
            >Step back respectfully</button>
          </div>
        </div>

          </div>
        </details>

      </section>
    </div>
  );
}
