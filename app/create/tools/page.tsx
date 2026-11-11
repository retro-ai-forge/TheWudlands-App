"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";
import styles from "../page.module.css";
import h from "@/app/styles/headings.module.css";
import ImageGallery from "../ImageGallery";

// The integrated Twine editor, served under /twine/ in both dev (Next proxies to
// the vite dev server started by `npm run dev`) and production (static build).
const STORY_EDITOR_URL = "/twine/";

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

// Your Legend: ten reputation axes, rows in pairs (the table frames each pair).
// Every name is a story variable $meta_<name in lower case>, 0-100. Both names
// of a pair can be used; except for Fame/Infamy the engine keeps a pair as one
// scale, so only one side of it is ever above 0.
const STORY_STATS = [
  { stat: "Fame",       description: "Known among the common folk as a hero: trusted, admired, celebrated", storyUse: "Strangers offer aid, villagers share food and secrets" },
  { stat: "Infamy",     description: "Known among the common folk as a threat: feared, cursed, whispered about", storyUse: "Doors close, prices rise, but the desperate seek you for dark deeds" },
  { stat: "Renown",     description: "Your tales travel far, even distant lands have heard of you", storyUse: "Guards recognise you, nobles know your name before you speak it" },
  { stat: "Obscurity",  description: "Unknown, forgotten, walking unseen through the world", storyUse: "Slip past guards unnoticed, enemies cannot find you" },
  { stat: "Faith",      description: "Devoted to a god or cosmic force, earning divine favour", storyUse: "Temples offer shelter, clergy grant healing, holy orders call on you" },
  { stat: "Heresy",     description: "Denounced by the faithful, touched by forbidden powers", storyUse: "Inquisitors hunt you, temples bar entry, dark shrines grant power" },
  { stat: "Honor",      description: "Oaths kept, truth told, fair fights fought", storyUse: "Your word is accepted as bond, duels are avoided through reputation" },
  { stat: "Shame",      description: "Broken oaths, lies and dishonest victories", storyUse: "Challenged constantly, no one takes your word" },
  { stat: "Loyalty",    description: "Bonds with allies and companions that hold", storyUse: "Allies risk their lives for you, secret aid flows freely" },
  { stat: "Treachery",  description: "Betrayed allies and abandoned companions", storyUse: "Ambushed by those who once knew you, help comes at a price" },
  { stat: "Mercy",      description: "Sparing the defeated, protecting the weak", storyUse: "Former foes repay you, the oppressed take your side" },
  { stat: "Cruelty",    description: "Tormenting the defeated, preying on the weak", storyUse: "Enemies surrender in terror, but no one pleads for you" },
  { stat: "Courage",    description: "Standing your ground when others flee", storyUse: "Soldiers follow you, champions accept your challenge" },
  { stat: "Cowardice",  description: "Fleeing when it mattered most", storyUse: "Mocked in taverns, left out of the great quests" },
  { stat: "Favour",     description: "Standing at court with kings, queens and vampire lords", storyUse: "Audiences granted, titles and courtly love within reach" },
  { stat: "Disgrace",   description: "Banished from court, out of royal grace", storyUse: "Court gates closed, the crown's agents watch you" },
  { stat: "Purity",     description: "Untouched by blood magic, curses and undeath", storyUse: "Holy relics answer you, the undead shy away" },
  { stat: "Corruption", description: "Tainted by dark powers, blood and cursed relics", storyUse: "Vampires call you kin, dark rites open, holy ground burns" },
  { stat: "Wildkin",    description: "Trusted by the wild, the fae and those who live off the land", storyUse: "Hidden paths open, druids and herbfolk share their lore" },
  { stat: "Despoiler",  description: "Plunderer of forests, fields and sacred groves", storyUse: "The wild turns against you, fae lead you astray" },
];

const LEGEND_PREVIEWS = [
  {
    heading: "No Reputation",
    image: "/images/create/legend-1.jpg",
    alt: "City gates, no stats",
    text: "The gate guards eye you like any other traveler and ask to pay a toll before entering the city.",
    choices: [
      { label: "Greet and walk to the front gate" },
      { label: "Walk to the west gate" },
    ],
  },
  {
    heading: "Obscurity known",
    image: "/images/create/legend-2.jpg",
    alt: "City gates, Obscurity known (Renown -30 or lower)",
    text: "The gate guards eye you like any other traveler and ask to pay a toll before entering the city.",
    choices: [
      { label: "Greet and walk to the front gate" },
      { label: "Walk to the west gate" },
      { label: "Slip in through the smugglers' tunnel" },
    ],
  },
  {
    heading: "Fame or Infamy known",
    image: "/images/create/legend-3.jpg",
    alt: "City gates, Fame or Infamy known (30 or higher)",
    text: "The gate guards recognize you at once and wave you through with a salute.",
    choices: [
      { label: "Greet the guard and walk through the main gate" },
    ],
  },
];

export default function Storyteller() {
  const [showImageDimensionsPopup, setShowImageDimensionsPopup] = useState(false);


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
      <section className={styles.guidelines}  style={{ maxWidth: "800px" }}>
        <h1 className={h.pageTitle}>Tools for Creators</h1>

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

        <div style={{ marginBottom: "1.5rem", padding: "1rem 1.5rem", background: "#1a0f0a", border: "1px solid #7a4a2a" }}>
          <p className={styles.body} style={{ margin: 0 }}>
            <strong style={{ color: "#e6a55a" }}>Note:</strong> the Story Editor is built for large screens.
            Create your adventure on a desktop or laptop — it is not suited to mobile devices.
          </p>
        </div>

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

        <div className={styles.ctaRow}>
          <a
            href={STORY_EDITOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.editorCta}
          >
            <span className={styles.ctaLabelFull}>Open the Story Editor</span>
            <span className={styles.ctaLabelSmall}>Open Editor on PC</span>
          </a>
          <Link href="/create/tutorial" className={styles.editorCta}>
            Tutorial
          </Link>
          <Link href="/create/review" className={styles.editorCta}>
            Submit Status
          </Link>
        </div>

        <p className={styles.body}>
          The sections below define the essential architecture: scenes, choices, images,
          and story structure — from your first scene to your final ending.
        </p>


        <div className={styles.imageFrame}>
          <img
            src="/images/create/engine-beyond.jpg"
            alt="The Wudlands Engine"
            className={styles.sectionImage}
          />
        </div>


        <details ref={guidelinesRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "guidelines"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "guidelines" ? null : "guidelines");
          }}>[ Story Guidelines ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          The Wudlands is a dark, story-driven fantasy adventure rooted in Fighting Fantasy gamebooks
          and old-school dungeon crawling. Anyone can contribute an addon — invent monsters, ancient ruins,
          secret factions, forbidden magic, cursed artefacts, and whatever horrors they imagine.
          The only rule is that everything must serve the story.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/create/createstory.jpg"
            alt="A magic book with a glowing red cover, open to a page with a quill pen poised above it. The text on the page reads: &apos;Create your own story in the Wudlands.&apos;"
            className={styles.sectionImage}
          />
        </div>

        <p className={styles.body}>
          No base-building. No permanent home. No safe corner of the world to retreat to.
          Temporary shelters exist within the story — a cave to weather a storm, a barricaded inn to hold against the night.
          Survival systems like hunger, thirst, and disease are welcome as long as they create tension, not busywork.
        </p>

        <p className={styles.body}>
          Stories do not have to be linear. Build branching paths, narrative loops, and convergent outcomes.
          What matters is that the story remains playable at every point — no dead ends, no broken loops,
          no scenes that leave the player stranded.
        </p>

        <p className={styles.body}>
          Adventures can depend on one another. Declare prerequisites clearly — they must be completable on their own terms,
          not exist solely as gates. The chain should feel like a natural progression, not an artificial lock.
        </p>

        <p className={styles.body}>
          Every addon must include at least one ending and a retreat. When a player is overwhelmed or lost,
          there must always be a valid path to retreat. A story without a retreat is an incomplete story.
        </p>

        <p className={styles.body}>
          If a scene cannot be found, the engine falls back to
          the <span className={styles.code}>LastResort</span> — a narrative dead end
          (collapsed tunnel, rockfall, ambush) that ends the story gracefully.
          A playthrough only counts if a scene with <span className={styles.code}>isEnding: true</span> was reached.
          The <span className={styles.code}>LastResort</span> does not consume one of the three replays.
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
              <td>The adventurer&apos;s reputation among the common folk — famed heroes earn trust and open doors, while infamous wanderers earn darker renown. Use Fame and Infamy to shape how NPCs react, what they know, and what stories follow the adventurer (see Your Legend).</td>
            </tr>
            <tr>
              <td>Renown</td>
              <td>How far the adventurer&apos;s reputation has travelled. Low renown means the tales stay local or the adventurer walks in obscurity; high renown means even distant lands have heard them. Creators use this to determine what NPCs already know.</td>
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
              <td>Default Entry</td>
              <td><span className={styles.code}>Start</span> is the scene id where every new session begins. It also acts as the non-error fallback when a requested scene cannot be resolved under normal conditions. It must exist in the scene map and must provide a path toward the retreat.</td>
            </tr>
            <tr>
              <td>Retreat</td>
              <td><span className={styles.code}>Retreat</span> is the primary voluntary exit. It can be a single scene marked <span className={styles.code}>$isEnding: true</span>, or a story of its own that branches into several scenes with several endings. It needs at least one ending and stays separate from the main story. Whether players can reach it is set by <span className={styles.code}>$meta_allowRunAway</span> (see Restricted).</td>
            </tr>
            <tr>
              <td>Combat Scenes</td>
              <td>In most combat scenes the player can still retreat, though the author may impose consequences — injury, lost items, narrative fallout — for choosing to flee. Taking the retreat away (see Restricted) is fair only when the story has clearly forewarned the danger through warnings, environmental cues, or an explicit threat of ambush, and the player had a chance to prepare or withdraw before the fight begins.</td>
            </tr>
            <tr>
              <td>Restricted</td>
              <td><span className={styles.code}>$meta_allowRunAway</span> controls the retreat button. It is required in <span className={styles.code}>StoryInit</span>, where <span className={styles.code}>$meta_allowRunAway: true</span> allows running away in every scene. A scene without a retreat sets <span className={styles.code}>$meta_allowRunAway: false</span>, and the scenes after it set <span className={styles.code}>$meta_allowRunAway: true</span> again, since a Twine variable keeps its value from scene to scene.</td>
            </tr>
            <tr>
              <td>Missing Scene Fallback</td>
              <td>If a scene cannot be found, the engine redirects to the addon&apos;s <span className={styles.code}>LastResort</span> scene. 
              It must be marked <span className={styles.code}>{`"isEnding": false`}</span>.</td>
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
          The Wudlands draws from 1980s and 1990s fantasy fiction — Fighting Fantasy, early D&amp;D modules, the illustrated
          gamebooks that shaped a generation. That tradition carried gender roles and romantic archetypes common to the era.
          Players returning to this style will recognise them. They are part of what makes it feel authentic to its roots.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/create/minne.jpg"
            alt="A knight kneels before a noble lady in a candlelit castle hall — courtly love in the tradition of Minne."
            className={`${styles.sectionImage} ${styles.imageNoFilter}`}
          />
        </div>

        <p className={styles.body}>
          Central to medieval fantasy is <span className={styles.highlight}>Minne</span>: the courtly love tradition
          of the Minnesingers. A wandering hero pledges devotion to a noble lady — often unattainable —
          and undertakes trials in her name. She holds power through honour, favour, and the withholding of affection.
          This dynamic recurs throughout The Wudlands. It is atmosphere, not instruction.
        </p>

        <p className={styles.body}>
          Content may reflect the gender dynamics and romantic conventions of 80s and 90s fantasy.
          Mysterious seductresses, lone adventurer archetypes, power imbalances rooted in class or magical allure —
          presented as <span className={styles.highlight}>vintage atmosphere</span>, the deliberate aesthetic of a genre
          that carries both charm and the limitations of its era.
        </p>

        <p className={styles.body}>
          Romantic storylines may include flirtation, seduction, courtly intrigue, and morally ambiguous power dynamics.
          Give romance weight — a kiss earned through three nights of danger means more than one handed out freely.
          Writers who prefer to avoid romance entirely are free to do so.
        </p>

          </div>
        </details>

        <details ref={writingRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "writing"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "writing" ? null : "writing");
          }}>[ 1 Story scenes ]</summary>

        {/* ── Story Elements ─────────────────────────────────────── */}
        <div className={styles.groupBody}>
          <p className={styles.body}>
            Every story is a <span className={styles.code}>.twee</span> file defining scenes and choices, plus images that give them visual presence. Submitted stories are listed as unapproved until they pass validation. Once approved, they go live worldwide.
          </p>

          <p className={styles.body}>
            Rules: A <span className={styles.code}>Retreat</span> can be a short story in itself but finally leads to a node with <span className={styles.code}>{`<<set $isEnding to true>>`}</span>.
            The <span className={styles.code}>LastResort</span> must be marked <span className={styles.code}>{`<<set $isEnding to false>>`}</span>. 
            Every other scene must contain <span className={styles.code}>[[jumpTo]]</span> decisions.
            A scene with <span className={styles.code}>{`<<set $meta_allowRunAway to false>>`}</span> has no retreat option.
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
          Each scene may reference one image, displayed above the scene text. Not required for every scene,
          but they strongly reinforce atmosphere.
        </p>

        <h3 className={`${h.sub} ${h.muted}`}>Image Dimensions and Story Design</h3>

        <p className={styles.body}>
          The aspect ratio affects how much space remains for text and choices. Choose dimensions based on each scene&apos;s pacing.
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
          <span className={styles.highlight}>Landscape (16:9, 3:2)</span> — best for narrative passages, complex choices, vast vistas.
          <span className={styles.highlight}> Portrait (1:1, 2:3, 4:5)</span> — prioritizes the image for character moments, close-ups, intimate encounters.
          Vary ratios throughout your addon to pace the visual rhythm.
        </p>

        <p className={styles.body}>
          Submit as <span className={styles.code}>.jpg, .png</span> or <span className={styles.code}>.webp</span>,
          min <span className={styles.code}>600 × 340 px</span>, max <span className={styles.code}>400 KB</span>.
          Name files after scene ids (e.g. <span className={styles.code}>ruined-gate.jpg</span>).
          Dark, painterly, atmospheric — avoid bright renders or photographs. No embedded text.
        </p>

        <table className={styles.fieldTable}>
          <thead>
            <tr><th>Type</th><th>Value</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Format</td><td>.jpg / .webp / .png</td><td>Other types not supported</td></tr>
            <tr><td>Width</td><td>600 px</td><td>any format</td></tr>
            <tr><td>Max file size</td><td>400 KB</td><td>compressed after submit</td></tr>
            <tr><td>Naming</td><td>scene_num.jpg / id.jpg</td><td>free naming choice</td></tr>
            <tr><td>Style</td><td>Dark fantasy art</td><td>Painterly, desaturated, atmospheric</td></tr>
            <tr><td>Required</td><td>No</td><td>Images are optional per scene but at least a title image is strongly recommended.</td></tr>
          </tbody>
        </table>


        {/* 2b — CSS Style Preview */}
        <h3 className={`${h.sub} ${h.muted}`}>CSS Image Style Preview</h3>

        <p className={styles.body}>
          Available <span className={styles.code}>image_style</span> presets applied to sample images.
          Click to enlarge. Use filters sparingly — a well-chosen image makes a scene memorable.
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
          A minimal addon with three scenes: a starting scene, a deeper scene, and a retreat ending.
          This is the smallest valid structure. Published addons typically contain 60–500 scenes with
          multiple branching paths and several distinct endings.
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
              <img src="/images/create/feature-active.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Carrying capacity</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Slot based inventory system allowing characters to carry a limited number of items.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-active.png" alt="Idea" title="idea" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Random Scene Choices</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Random scene selection can create unique and unpredictable experiences for players. 
                  Some events only happen rarely. Others create a unique flow through the narrative.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <img src="/images/create/feature-active.png" alt="Active" title="active" style={{ height: "2rem", width: "auto", flexShrink: 0 }} />
              <div>
                <strong>Foraging</strong><br /><span style={{ fontSize: "0.9rem", color: "#a09080" }}>Between adventures, characters go out to gather raw materials for crafting. Each soul has its own foraging sites that slowly run dry,
                  and nights outside bring weather, worn gear, and sometimes a surprise find.</span>
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

        </div>

        <img
          src="/images/create/wudland-engine2.jpg"
          alt="The Wudlands Engine"
          style={{ width: "100%", height: "auto", display: "block", border: "1px solid #7a6a3a", margin: "1.5rem 0", filter: "sepia(0.2) brightness(0.9)" }}
        />

        <details id="the-legend" ref={storyimpactRef} className={styles.group} style={{ scrollMarginTop: "1rem" }} open={openSection === "storyimpact"}>
          <summary className={styles.groupSummary} onClick={(e) => {
            e.preventDefault();
            setOpenSection(openSection === "storyimpact" ? null : "storyimpact");
          }}>[ Your Legend ]</summary>
          <div className={styles.groupBody}>

        <p className={styles.body}>
          Every decision leaves a permanent mark. Over many adventures each character forms a legend of its own:
          reputation, bonds and enemies, carried forward into every adventure that follows.
          Push too hard in one direction and its opposite diminishes into shadow.
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
                <td className={styles.statName}>{row.stat}<br /><span className={styles.code}>{"$meta_" + row.stat.toLowerCase()}</span></td>
                <td>{row.description}</td>
                <td>{row.storyUse}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className={styles.body}>
          The legend follows a few simple rules:
        </p>

        <ul className={styles.body}>
          <li><strong>Opposites share one scale.</strong> Mercy and Cruelty are two ends of the same scale, so a character is never both: raising Cruelty first wears Mercy down to 0. Every pair works this way, except Fame and Infamy.</li>
          <li><strong>Fame and Infamy pull against each other.</strong> They are two values from 0 to 100, so a hero to the villagers can still be a butcher to the bandits. Raising one lowers the other by half as much.</li>
          <li><strong>Some deeds echo.</strong> A quarter of a change carries over: Fame and Infamy raise Renown, Cruelty raises Infamy, Treachery brings Shame, Corruption brings Heresy, Courage brings Fame. An echo never echoes again.</li>
          <li><strong>One adventure, one step.</strong> An adventure changes each value by at most 10; review checks this. Foraging only touches Wildkin, by 1 per trip, and never past 25.</li>
          <li><strong>Out of sight, out of mind.</strong> Renown fades slowly, about one point every four weeks, unless new deeds feed it.</li>
          <li><strong>Bands, not numbers.</strong> 10 whispered, 30 known, 60 renowned, 90 legendary, on either side of a scale.</li>
          <li><strong>Running away has a price.</strong> The Retreat story decides what fleeing costs, for example Courage. If it sets none, one may be added after review.</li>
        </ul>

        <p className={styles.body}>
          Scenes read and change the values with <span className={styles.code}>$meta_</span> variables
          and can branch or gate choices on the bands. The <Link href="/create/tutorial#legend" className={styles.inlineLink}>tutorial</Link> shows how.
</p>

        <p className={styles.body}>
          The preview shows the same city gate for three different legends. Without a reputation the guards
          ask for the toll. With Obscurity known, a hidden way in appears: the smugglers&apos; tunnel. With Fame or
          Infamy known, the guards recognise you and wave you through. A choice that needs a level simply does not
          show until the character reaches it.
        </p>

        <h3 className={`${h.sub} ${h.muted}`}>Scene Preview: {LEGEND_PREVIEWS[legendSlide].heading}</h3>

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
          Relationships persist across adventures. When your story introduces an <strong>important character</strong> —
          lord, sorceress, villain, temptress — the platform reaches back into the player&apos;s history.
          If they have already charmed, scorned, or wronged someone of that standing,
          those feelings carry forward. If none is found, a new person is added to their history.
        </p>

        <p className={styles.body}>
          A figure who adores the player may whisper secrets or step into danger on their behalf.
          One who despises them may close doors or arrive at the worst possible moment.
          Lean on generic roles to connect to the broader world. Name your character for a clean slate.
        </p>

        <p className={styles.body}>
          Define <strong>matching requirements</strong> to reuse characters from previous adventures.
          Each criterion is a requirement (<span className={styles.code}>Standing: Legendary</span>)
          or exclusion (<span className={styles.code}>!Shadow</span>). More requirements mean a more specific match.
          <strong> Any criterion left undefined accepts all values.</strong>
          No match found? The role becomes a new person in the player&apos;s history.
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
        

        <h3 className={`${h.sub} ${h.muted}`}>VIP Example: Lady Isolde</h3>

        <p className={styles.body}>
          Lady Isolde — a <span className={styles.highlight}>Minne courtly love</span> whose affection must be earned through deeds.
          Her matching requirements ensure continuity across adventures. &apos;new&apos; parameters apply when no match exists.
          Use <span className={styles.code}>{'{vip.id-isolde.formal}'}</span> for randomly selected formal sentences.
          Options in <span className={styles.code}>{'{ x | y | z }'}</span> vary each time.
        </p>

        <h3 className={`${h.sub} ${h.muted}`}>Scene Preview</h3>

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
      <PageVersionTag />
    </div>
  );
}
