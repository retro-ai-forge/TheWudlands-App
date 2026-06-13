import styles from "./page.module.css";
import ImageGallery from "./ImageGallery";

export default function ContributeStories() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>Story &amp; Adventure Addon Guidelines</h2>

        <p className={styles.body}>
          The Wudlands is a dark, story-driven fantasy adventure rooted in the tradition of Fighting Fantasy gamebooks
          and old-school dungeon crawling. It is a world of desperate choices, hidden dangers, and hard-earned survival.
          Anyone can contribute an adventure addon — a self-contained story that players can enter, explore, and struggle through.
          Addon creators are free to shape their own corner of the Wudlands: invent monsters, ancient ruins, secret factions,
          forbidden magic, cursed artefacts, weather-battered wilderness, and whatever strange wonders or horrors they imagine.
          The only rule is that everything must serve the story. In the future we will add more content like Sci-Fi, Cthulhu 
          1920 horror, and more, but for now we are focused on the core fantasy experience.
        </p>

        <p className={styles.body}>
          The Wudlands is not a sandbox. There is no base-building, no permanent home, no safe corner of the world to retreat to.
          Temporary shelters, makeshift camps, collapsed forts, and story-driven structures are allowed when the narrative calls for them —
          a cave to weather a storm, a barricaded inn to hold against the night, a ruined tower that becomes a brief refuge.
          These places exist within the story, not as persistent player-owned properties.
          Survival systems such as hunger, thirst, exhaustion, wounds, disease, and harsh weather are welcome additions
          as long as they create tension, push decisions, and deepen the sense of danger rather than functioning as mechanical
          busywork disconnected from the plot.
        </p>

         <img
          src="/images/contribute-stories/createstory.jpg"
          alt="A magic book with a glowing red cover, open to a page with a quill pen poised above it. The text on the page reads: &apos;Create your own story in the Wudlands.&apos;"
          className={styles.sectionImage}
        />

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
          Every addon must include a default ending or escape route. This is not optional. When a player is overwhelmed,
          badly wounded, out of resources, or simply lost, there must always be a valid path they can take to retreat,
          recover, or reach some form of conclusion. This fallback path should work as a short, complete adventure on its own —
          not a punishment for failure, but an honest exit that respects the player&apos;s experience.
          A story without an escape route is an incomplete story.
        </p>

        <p className={styles.body}>
          The engine that runs addon stories is built to handle missing or undefined scenes gracefully. If a requested node,
          scene, or encounter cannot be found in the addon data, the system will not crash or break the session.
          Instead it falls back to the addon&apos;s <span className={styles.code}>emergency_exit</span> scene — a dedicated
          error-recovery scene that must lead the player toward the <span className={styles.code}>escape_route</span>. 
          The description of the emergency scene should contain a description of something unusual, unforeseen, blocking
          the way forward — a collapsed tunnel, a sudden rockfall, an ambush by bandits,
          a magical trap, or any other narrative obstacle that fits the tone of the story. 
          Addon creators are responsible for defining this scene and ensuring it leads somewhere meaningful.
          A play through only counts 
          against the limit of 3 replays, if any scene with <span className={styles.code}>ending: true</span> was encountered. 
          Several endings should be available. Being redirected to the escape route through 
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
              <td>Fame is a measure of the path the adventurer has chosen — not merely of deeds done, but of how the world chooses to remember them. It runs in two directions. A famed hero earns the warmth of crowds, the trust of strangers, and the kind of stories that are told in daylight: ballads, toasts, whispered admiration in the market square. An infamous wanderer earns something else — a darker renown that makes even kings lower their voices before sending for them. Courts still negotiate with the infamous; they simply bolt their doors afterwards. Creators are encouraged to let fame shape how NPCs react, what doors open, and what rumours follow the adventurer into the next town. The stories of the famed are told openly, embellished with honour. The stories of the infamous are told at night, around the campfire, by those who survived knowing them.</td>
            </tr>
            <tr>
              <td>Notoriety</td>
              <td>Where fame measures the nature of an adventurer&apos;s reputation, notoriety measures its reach — how far the tales have travelled, how many ears they have found. A wanderer of low notoriety may be celebrated or feared within a single village, yet step one valley over and be a complete stranger. High notoriety means the name has crossed borders: merchants recognise it, gatekeepers have heard the stories, and even distant lords know whether to set an extra place at the table or double the guard. Creators may use notoriety to determine what a character already knows about the adventurer before they speak a word, and how far ahead of the player their reputation walks.</td>
            </tr>
            <tr>
              <td>Story Structure</td>
              <td>Branching paths, loops, and N:M scene relationships are allowed and encouraged. Stories do not need to be linear.</td>
            </tr>
            <tr>
              <td>Adventure Dependencies</td>
              <td>Addons may require other adventures to be completed first. Finishing one adventure can unlock one or more others, as declared by the creator.</td>
            </tr>
             <tr>
              <td>Combat Scenes</td>
              <td>Combat scenes may disable the escape route only when the story has clearly forewarned the player of the danger — through audible warnings, environmental cues, or an explicit threat of ambush. The player must always have a fair opportunity to prepare or withdraw before the fight begins. In all other combat scenes the escape route remains available, though the author may impose consequences — injury, lost items, narrative fallout — for choosing to flee.</td>
            </tr>
            <tr>
              <td>Default Entry</td>
              <td>The <span className={styles.code}>default_entry</span> is the scene id where every new session begins. It also acts as the non-error fallback when a requested scene cannot be resolved under normal conditions. It must exist in the scene map and must provide a path toward the escape route.</td>
            </tr>
            <tr>
              <td>Missing Scene Fallback</td>
              <td>If a scene cannot be found, the engine redirects to the addon&apos;s <span className={styles.code}>emergency_exit</span> scene. That scene must lead toward 
              the <span className={styles.code}>escape_route</span>. Only one scene of this should be provided.</td>
            </tr>
            <tr>
              <td>Escape Route</td>
              <td>Every addon must include one default retreat route. 
                Characters must always have a chance to run away, recover, or conclude. The escape route can be a short 
                adventure in itself. Though there is not escape route from here. Dangerous content should be avoided.</td>
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

        {/* ── Story Elements ─────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Romantic Storyline &amp; Minne</h2>

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
          src="/images/agb/agb-minne.jpg"
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
          may extend into explicit erotic territory under the rules described in Section 5 of the AGBs.
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

        {/* ── Story Elements ─────────────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Story Elements</h2>

        <p className={styles.body}>
          Every addon submitted to The Wudlands is made up of two core elements: JSON file that defines the structure and 
          flow of the story, images that give scenes a visual presence. Those addons will be listed as 
          unapproved until they meet the platform requirements and pass the validation checks. Once approved, they 
          become available to players worldwide. Below are the detailed specifications for each element, 
          along with an example of a complete addon at the end.
        </p>

        {/* 1 — Storyline in JSON */}
        <h3 className={styles.subHeading}>1. Storyline in JSON</h3>

        <p className={styles.body}>
          The story itself is defined in a single JSON file. This file describes every scene, every choice, every
          connection between scenes, and the metadata the engine needs to run the addon correctly. The file must be
          valid JSON and must pass the platform schema validation before it can be published. Below is the full
          structure with all available fields.
        </p>

        <code className={styles.codeBlock}>{`{
  "id":            "string  — unique addon id, lowercase, hyphens only. e.g. the-black-tower",
  "title":         "string  — display name shown to players",
  "author":        "string  — your name or handle",
  "version":       "string  — semver format, e.g. 1.0.0",
  "eth_address":   "string  — optional. your ETH address for revenue share",
  "adult":          false,   // boolean — true if addon contains adult content",
  "tags":          ["array of strings — e.g. dungeon, horror, romance, survival"],
  "requires":      ["array of addon ids, one must be completed before this one is accessible"],
  "unlocks":       ["array of addon ids that become accessible after this one is completed"],

  "default_entry": "string  — scene id used as start point AND missing-scene fallback",
  "emergency_exit": "string  — scene id used on errors to lead to the escape route",
  "escape_route":  "string  — scene id of the retreat / fallback ending",

  "scenes": {
    "<scene_id>": {
      "title":   "string  — optional short label for the scene",
      "text":    "string  — narrative prose shown to the player. Supports \\n for line breaks.",
      "image":   "string  — optional. filename of the scene image, e.g. ruined-gate.jpg",
      "image_style": "string  — optional. display preset applied to the image. available styles:",
               //   origin         — no filter, image shown as-is (default when field is omitted)",
               //   mirrorh        — horizontally flipped image",
               //   mirrorv        — vertically flipped image",
               //   darkened       — heavy shadow, very gloomy atmosphere",
               //   pitchblack     — near total darkness, only outlines remain",
               //   bright         — lifted and warmed, rare daylight or hope",
               //   blackwhite     — full desaturation, all colour removed",
               //   vintage        — aged, parchment-like tone",
               //   deepsepia      — full sepia burn, old photograph feel",
               //   cold           — icy blue shift, ghostly and frozen",
               //   moonlight      — deep cold contrast, pale silver light",
               //   crimson        — dark blood-red wash, dread and danger",
               //   copper         — warm metallic orange, firelit scenes",
               //   deepocean      — submerged blue-green darkness",
               //   poison         — sickly green hue, cursed or toxic places",
               //   infrared       — alien colour inversion, heat-map look",
               //   goldenhour     — warm amber sunset glow",
               //   apocalypse     — scorched high-contrast ruin",
               //   neonsurge      — blown-out electric colour overload",
               //   inverted       — full colour inversion, uncanny and unsettling",
               //   xray           — white-on-black skeletal exposure",
               //   drunk          — soft blur with lifted saturation",
               //   fog            — pale mist veil, washed-out and desaturated",
               //   rain           — animated diagonal rain streaks, cold blue-grey wash",
               //   drunk          — animated: slow irregular sway and rotation (5s)",
               //   emerge         —  emerges once from black to full brightness",
               //   colorpulse     — animated: cycles between greyscale and full colour (6s)",
               //   heat           — animated: slow hue and saturation pulse (2s)",
               //   scanlines      — soft horizontal scanline overlay",
               //   scanlinesdark  — scanlines over darkened image",
               //   verticalstrips — soft vertical strip overlay",
               //   flicker        — animated: erratic rapid brightness flicker",
      "ending":   true, // marks this as a terminal scene — reaching it counts as completing the addon."  
                        // false is also a terminal scene, but does not deduct from the 3 playthroughs."
                        // normal or entry scene do not have this field.
      "choices": [
        {
          "text": "string  — the choice label the player sees",
          "to":   "string  — target <scene id>"
        }
      ]
    }
  }
}`}</code>

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

        {/* 2 — Images */}
        <h3 className={styles.subHeading}>2. Images</h3>

        <p className={styles.body}>
          Each scene in your addon may reference one image. Images are not required for every scene and can be used 
          for several scenes, but they strongly reinforce atmosphere and help players orient themselves within the 
          world. The image is displayed above the scene text when the player enters that scene. 
        </p>

        <p className={styles.body}>
          Images must be submitted as <span className={styles.code}>.jpg</span> or <span className={styles.code}>.webp</span> files,
          at a minimum resolution of <span className={styles.code}>1024 × 576 px</span> (16:9 landscape).
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
            <tr><th>Property</th><th>Value</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>Format</td><td>.jpg / .webp</td><td>PNG accepted but not preferred — file sizes are larger.</td></tr>
            <tr><td>Min resolution</td><td>1024 × 576 px</td><td>16:9 landscape is the native display ratio.</td></tr>
            <tr><td>Max resolution</td><td>1200 × 700 px</td><td>Images larger than this will be scaled down by the engine.</td></tr>
            <tr><td>Max file size</td><td>400 KB</td><td>Compress before submitting. Large files slow scene loading.</td></tr>
            <tr><td>Naming</td><td>scene-id.jpg</td><td>Must match the scene id in your JSON exactly.</td></tr>
            <tr><td>Style</td><td>Dark fantasy art</td><td>Painterly, desaturated, atmospheric. No embedded text.</td></tr>
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

        {/* 3 — Example */}
        <h3 className={styles.subHeading}>3. Example</h3>

        <p className={styles.body}>
          Below is a complete minimal addon with three scenes. It demonstrates a starting scene with two choices,
          a deeper scene that leads either forward or back, and an escape route marked as a terminal ending.
          This structure is the smallest valid addon the platform will accept.
        </p>

        <code className={styles.codeBlock}>{`{
  "id":            "the-ruined-gate",
  "title":         "The Ruined Gate",
  "author":        "Grimwald of Ashfen",
  "version":       "1.0.0",
  "eth_address":   "",
  "adult":          false,
  "tags":          ["dungeon", "ruins", "solo"],
  "requires":      [],
  "unlocks":       [],

  "default_entry": "approach",
  "emergency_exit": "broken-ceiling",
  "escape_route":  "forest-retreat",

  "scenes": {

    "approach": {
      "title":       "Collapsing Mouth",
      "text":        "You stand at the lip of a yawning sinkhole, the air below smelling of 
                      damp stone and old rot.\\nA narrow staircase carved into the rock 
                      descends into the dark — a cold draft sighs up from the depths.\\nLoose 
                      pebbles skitter underfoot. Far below, something moves that is not the 
                      wind.",
      "image":       "approach.jpg",
      "image_style": "deepocean",
      "choices": [
        { "text": "Descend the carved steps",       "to": "inner-court" },
        { "text": "Climb back to the surface",      "to": "forest-retreat" }
      ]}
    },

    "inner-court": {
      "title":       "The Lower Vault",
      "text":        "You step into a vaulted cavern where moulded pillars hold a ceiling 
                      low with mineral veins.\\nWater drips in slow, musical patterns. 
                      Ancient scratches mark a path toward a half-buried gate carved 
                      with symbols.\\nFrom somewhere deeper comes a metallic, distant clank.",
      "image":       "inner-court.jpg",
      "image_style": "scanlines",
      "choices": [
        { "text": "Follow the scratched path",              "to": "inner-court" },
        { "text": "Grab a rusty metal bar and return home", "to": "travel-home" },
        { "text": "Flee upward toward the light",           "to": "forest-retreat" }
      ]
    },

      "forest-retreat": {
      "title":       "Climb to Daylight",
      "text":        "You scramble up a narrow shaft and find a ragged slit of sky.\\nThe 
                      surface is a maze of broken earth and toppled root, but above you, 
                      the world is open and the air warm.\\nYou make your way back to the 
                      light, lungs burning and pockets full of dust, alive and changed.",
      "image":       "forest-retreat.jpg",
      "image_style": "origin",
      "ending":       true,
      "choices": []
    },

      "return-home": {
      "title":       "Run home with trophy",
      "text":        "You quickly run back to the surface and climb out of the sinkhole, 
                      clutching the rusty metal bar you found in the vault. \\nThe sun 
                      is warm on your face, but the air tastes of dust and regret.\\nYou",
      "image":       "peaceful-forest.jpg",
      "image_style": "origin",
      "ending":       true,
      "choices": []
    },

    "broken-ceiling": {
      "title":       "Broken Ceiling",
      "text":        "Suddenly an earthquake shakes the caverns. Dust falls like rain and a 
                      thunder of collapsing stone drowns the sound of your breath.\\nA fissure 
                      opens, dropping you into a fractured passage; rubble blocks the way you 
                      came. You must fight your way through the shifting dark toward any route 
                      that leads upward.\\nDebris underfoot threatens to give; the air tastes of 
                      iron and panic. Move quickly. Finally you reach the fresh air and walk home, 
                      shaken but alive.",
      "image":       "broken-ceiling.jpg",
      "image_style": "apocalypse",
      "ending":       false,
      "choices": [
        { "text": "Clamber toward the faint light above", "to": "forest-retreat" },
        { "text": "Wedge yourself into a narrow crevice and wait it out", "to": "inner-court" }
      ]
    }

  }
}`}</code>

        <p className={styles.body}>
          This example is intentionally spare. A published addon will typically contain between sixty and five hundred scenes,
          with multiple branching paths, several dead ends that loop back to earlier scenes, and at least two or three
          distinct endings depending on the choices the player made. The escape route will always be reachable from
          any scene. The escape route might be a short story in itself.
        </p>
      </section>
    </div>
  );
}
