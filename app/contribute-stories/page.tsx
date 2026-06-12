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
          The only rule is that everything must serve the story.
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
          Instead it falls back to the addon&apos;s defined default exit point, which must redirect the player toward the
          escape route or a stable fallback path. Addon creators are responsible for defining this default exit and ensuring
          it leads somewhere meaningful. A robust story is one that stays playable no matter what the engine encounters.
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
              <td>Escape Route</td>
              <td>Every addon must include a default ending or fallback route. Players must always have a way to retreat, recover, or conclude.</td>
            </tr>
            <tr>
              <td>Missing Scene Fallback</td>
              <td>If a scene cannot be found, the engine redirects to the addon&apos;s default exit. That exit must lead toward the escape path.</td>
            </tr>
            <tr>
              <td>Survival</td>
              <td>Hunger, thirst, exhaustion, wounds, disease, and harsh weather may be used to deepen tension. They must serve the story.</td>
            </tr>
            <tr>
              <td>Building</td>
              <td>No permanent player-owned structures are available at the beta stage. Temporary camps, shelters, and story-driven locations are allowed. 
                The Wudlands might add locations that can be claimed as possible homes. Those have to be found in storylines. A place where the 
                adventurer can retreat. 
              </td>
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
  "escape_route":  "string  — scene id of the retreat / fallback ending",

  "scenes": {
    "<scene_id>": {
      "title":   "string  — optional short label for the scene",
      "text":    "string  — narrative prose shown to the player. Supports \\n for line breaks.",
      "image":   "string  — optional. filename of the scene image, e.g. ruined-gate.jpg",
      "image_style": "string  — optional. display preset applied to the image. available styles:",
               //   origin        — no filter, image shown as-is (default when field is omitted)",
               //   darkened      — heavy shadow, very gloomy atmosphere",
               //   pitchblack    — near total darkness, only outlines remain",
               //   bright        — lifted and warmed, rare daylight or hope",
               //   blackwhite    — full desaturation, all colour removed",
               //   vintage       — aged, parchment-like tone",
               //   deepsepia     — full sepia burn, old photograph feel",
               //   cold          — icy blue shift, ghostly and frozen",
               //   moonlight     — deep cold contrast, pale silver light",
               //   crimson       — dark blood-red wash, dread and danger",
               //   copper        — warm metallic orange, firelit scenes",
               //   deepocean     — submerged blue-green darkness",
               //   poison        — sickly green hue, cursed or toxic places",
               //   infrared      — alien colour inversion, heat-map look",
               //   goldenhour    — warm amber sunset glow",
               //   apocalypse    — scorched high-contrast ruin",
               //   neonsurge     — blown-out electric colour overload",
               //   inverted      — full colour inversion, uncanny and unsettling",
               //   xray          — white-on-black skeletal exposure",
               //   dream         — soft blur with lifted saturation",
               //   mirror        — horizontally flipped image",
               //   mirrorcrimson — flipped with crimson blood-red wash",
               //   scanlines     — soft horizontal scanline overlay",
               //   scanlinesdark — scanlines over darkened image",
               //   verticalstrips — soft vertical strip overlay",
               //   emerge        — animated: fades in from black to full brightness",
               //   colorpulse    — animated: cycles between greyscale and full colour (6s)",
               //   flicker       — animated: erratic rapid brightness flicker",
               //   heat          — animated: slow hue and saturation pulse (2s)",
      "ending":   false,   // boolean — true marks this as a terminal scene (no choices needed)",
      "choices": [
        {
          "text": "string  — the choice label the player sees",
          "to":   "string  — target scene id"
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
  "escape_route":  "forest-retreat",

  "scenes": {

    "approach": {
      "title":       "The Gate",
      "text":        "You stand before a shattered arch of black stone.\\nMoss chokes the carved serpents above the lintel.\\nThe darkness beyond the gate breathes cold air onto your face.\\nYou hear nothing. That is worse than hearing something.",
      "image":       "approach.jpg",
      "image_style": "moonlight",
      "ending":       false,
      "choices": [
        { "text": "Step through the gate",          "to": "inner-court" },
        { "text": "Retreat into the forest",        "to": "forest-retreat" }
      ]
    },

    "inner-court": {
      "title":       "The Inner Court",
      "text":        "Cracked flagstones. A dry fountain. Something has scratched marks into every surface —\\nnot writing you recognise, but deliberate. Repeated. Urgent.\\nAt the far end, a door stands ajar. Light moves behind it.",
      "image":       "inner-court.jpg",
      "image_style": "scanlines",
      "ending":       false,
      "choices": [
        { "text": "Approach the moving light",      "to": "inner-court" },
        { "text": "This was a mistake — run",       "to": "forest-retreat" }
      ]
    },

    "forest-retreat": {
      "title":       "The Forest Road",
      "text":        "You turn and walk back into the trees.\\nThe gate watches you leave. You do not look back.\\nWhatever is inside the ruin, it is not yours to face today.\\nThe forest road is long, but it is safe. You are still alive.",
      "image":       "forest-retreat.jpg",
      "image_style": "origin",
      "ending":       true,
      "choices": []
    }

  }
}`}</code>

        <p className={styles.body}>
          This example is intentionally spare. A published addon will typically contain between sixty and five hundred scenes,
          with multiple branching paths, several dead ends that loop back to earlier scenes, and at least two or three
          distinct endings depending on the choices the player made. The escape route should always be reachable from
          any scene within no more than three choices. If a player cannot find the exit within a handful of steps,
          the story is too deep without a safety net.
        </p>

      </section>
    </div>
  );
}
