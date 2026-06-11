import styles from "./page.module.css";

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
          narrative loops, and N:m relationships between scenes and outcomes. A single choice may open into several possible
          scenes. Several entirely different choices may converge back to the same location, encounter, or conclusion.
          Players may revisit places, retrace steps, or circle back through the world in ways that feel natural rather than forced.
          What matters is that the story remains clear and playable at every point — no dead ends, no broken loops,
          no scenes that leave the player stranded without any path forward.
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
          Instead it falls back to the addon&apos;s defined default entry point, which must redirect the player toward the
          escape route or a stable fallback path. Addon creators are responsible for defining this default entry and ensuring
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
              <td>Story Structure</td>
              <td>Branching paths, loops, and N:m scene relationships are allowed and encouraged. Stories do not need to be linear.</td>
            </tr>
            <tr>
              <td>Escape Route</td>
              <td>Every addon must include a default ending or fallback route. Players must always have a way to retreat, recover, or conclude.</td>
            </tr>
            <tr>
              <td>Missing Scene Fallback</td>
              <td>If a scene cannot be found, the engine redirects to the addon&apos;s default entry. That entry must lead toward the escape path.</td>
            </tr>
            <tr>
              <td>Survival</td>
              <td>Hunger, thirst, exhaustion, wounds, disease, and harsh weather may be used to deepen tension. They must serve the story.</td>
            </tr>
            <tr>
              <td>Building</td>
              <td>No permanent player-owned structures. Temporary camps, shelters, and story-driven locations are allowed.</td>
            </tr>
            <tr>
              <td>Addon Freedom</td>
              <td>Creators may invent anything — monsters, factions, magic systems, strange worlds — as long as it serves the adventure.</td>
            </tr>
            <tr>
              <td>Rule of Thumb</td>
              <td>If it does not strengthen the story, the tension, or the atmosphere, it should not be in the addon.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
