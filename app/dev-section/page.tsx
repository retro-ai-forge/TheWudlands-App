import Link from "next/link";
import styles from "./page.module.css";
import ClickableImage from "./ClickableImage";

export default function DevSection() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>Developer Overview</h2>

        <p className={styles.body}>
          The Wudlands is an open, contributor-driven dark fantasy adventure platform. At its core it is a
          story engine — a system that loads externally authored adventure addons and runs them as live,
          interactive sessions for players. The platform is designed to be extended by two distinct groups:
          story contributors who write the adventures, and software developers who build and maintain the
          engine, tooling, and infrastructure that makes those adventures run.
        </p>

        <ClickableImage
          src="/images/dev-section/engine.jpg"
          alt="Software architecture diagram showing the relationship between the core engine and the story add-ons. The engine is a central hub that loads and runs the add-ons, which are separate modules containing story content and assets."
        />

        {/* ── Section 1: Story Contributors ─────────────────── */}
        <h2 className={styles.sectionHeading}>1. For Story Contributors</h2>

        <p className={styles.body}>
          If you want to contribute an adventure addon — a self-contained story with scenes, choices, images,
          and branching paths — you do not need to write any code. Adventures are defined in a structured
          JSON format and submitted alongside image assets. The engine handles everything else: loading,
          validation, session management, rendering, and player routing.
        </p>

        <p className={styles.body}>
          Everything you need to know about the addon format, image specifications, style presets, scene
          structure, dependencies, and submission requirements is documented in the{" "}
          <Link href="/contribute-stories" className={styles.code}>Contribute Stories</Link> section. Start there.
        </p>

        <p className={styles.body}>        
        This section is for the people building the platform itself.
        </p>

        {/* ── Section 2: Software Developers ────────────────── */}
        <h2 className={styles.sectionHeading}>2. For Software Developers</h2>

        <p className={styles.body}>
          The Wudlands platform is built on a Next.js frontend and a FastAPI backend. The frontend handles
          rendering, player interaction, wallet integration, and the display of scene content. The backend
          is responsible for session state, addon loading, player routing, play count tracking, and revenue
          share logic. Both layers are designed to run multiple player sessions concurrently without
          interference — each session is isolated, stateful, and independently routed through its addon&apos;s
          scene graph.
        </p>

        <h3 className={styles.subHeading}>The Addon Engine</h3>

        <p className={styles.body}>
          The core of the platform is the addon engine — the system that takes a contributor&apos;s JSON file
          and turns it into a live, interactive session. When a player enters an adventure, the engine loads
          the addon definition for that adventure, validates its structure against the platform schema, and
          initialises a session record tied to that player and that addon. From that point forward, every
          choice the player makes is a traversal instruction: move from the current scene id to the target
          scene id specified by the selected choice.
        </p>

        <p className={styles.body}>
          The scene graph is an addressable map of scene objects keyed by id. The engine looks up the
          requested scene id in that map on every player action. The adventure starts at the 
          <code className={styles.code}>default_entry</code>, which serves as the normal session starting point.
          If the scene exists, it is returned and rendered. If it does not exist — because of a broken link 
          in the addon, a missing node, or any
          other fault — the engine does not error or crash the session. Instead it falls back to the
          addon&apos;s <code className={styles.code}>emergency_exit</code> scene, a dedicated error-recovery
          scene required by schema to exist and to lead the player toward the addon&apos;s{" "}
          <code className={styles.code}>escape_route</code>. The session remains intact, the player 
          can exit gracefully, and the fault is logged server-side for the addon author to review. 
        </p>

        <h3 className={styles.subHeading}>Parallel Sessions</h3>

        <p className={styles.body}>
          The engine is stateless at the request level. Each player action arrives as an independent HTTP
          request carrying the player&apos;s session token, the addon id, and the target scene id. The backend
          resolves the session, validates the transition, and returns the next scene. No shared in-memory
          state is held between requests. This means any number of players can be running through the same
          addon — or different addons — simultaneously, with no coordination overhead between their sessions.
          Horizontal scaling is straightforward: additional backend instances can be added without any
          session affinity requirement, as long as session state is stored in a shared persistence layer.
        </p>

        <p className={styles.body}>
          Play counts are tracked per player per addon. When a player enters an adventure, the engine checks
          their remaining play count for that addon. If the count is zero, entry is refused until the player
          resets by paying the entry fee again. Play count decrements happen at session start, not at session
          end — a session that is abandoned mid-adventure still consumes a play. This mirrors the real-world
          model of paying for the seat, not the outcome.
        </p>

        <h3 className={styles.subHeading}>Addon Loading &amp; Validation</h3>

        <p className={styles.body}>
          Addons are loaded from storage on session initialisation and cached for the duration of active
          sessions using that addon. The engine validates every loaded addon against the platform schema
          before making it available to players. Validation checks include: presence of all required fields,
          existence of the <code className={styles.code}>default_entry</code> and{" "}
          <code className={styles.code}>escape_route</code> scenes within the scene map, validity of all{" "}
          <code className={styles.code}>to</code> targets in choice arrays, and correct boolean typing on{" "}
          <code className={styles.code}>ending</code> flags. Addons that fail validation are not published.
          Addons that were published and subsequently become invalid due to a platform schema update are
          flagged for review and removed from active rotation until corrected.
        </p>

        <h3 className={styles.subHeading}>Adventure Dependencies &amp; Unlocks</h3>

        <p className={styles.body}>
          Each addon may declare a list of prerequisite addon ids in its{" "}
          <code className={styles.code}>requires</code> field and a list of addon ids it unlocks in its{" "}
          <code className={styles.code}>unlocks</code> field. The engine resolves these at the player level:
          before a player can enter an addon, the backend checks whether all entries in that addon&apos;s{" "}
          <code className={styles.code}>requires</code> list appear in the player&apos;s completed adventure
          record. If they do not, the adventure is displayed as locked with the missing prerequisites listed.
          When a player completes an adventure, the engine marks it in their record and evaluates the{" "}
          <code className={styles.code}>unlocks</code> list, making newly accessible adventures available
          immediately.
        </p>

        <h3 className={styles.subHeading}>Blockchain &amp; Revenue Share</h3>

        <p className={styles.body}>
          The platform operates on a blockchain environment, currently targeting Polkadot with an optional
          Ethereum fallback address per contributor. When a player pays the entry fee for an adventure, the
          revenue split is applied at transaction time: 80% is routed to the wallet address declared in the
          addon&apos;s <code className={styles.code}>eth_address</code> field, and 20% is retained by the
          platform. If no wallet address is declared, the full amount is held by the platform until the
          contributor registers one. All contributor addresses and payout records are stored in a
          migration-safe format to support a potential future chain migration.
        </p>

        <h3 className={styles.subHeading}>Image Rendering &amp; Style Presets</h3>

        <p className={styles.body}>
          Each scene may reference a single image by filename. At runtime, the frontend loads the image
          from the addon&apos;s asset directory and applies the CSS filter and transform defined by the
          scene&apos;s <code className={styles.code}>image_style</code> preset. Presets are resolved
          client-side from a static lookup table — no server involvement is needed for filter application.
          Animated presets use CSS keyframe animations applied as class names. Overlay presets use
          positioned <code className={styles.code}>::after</code> pseudo-elements on the image wrapper.
          All presets are documented and previewed in the Story Contributor guidelines.
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Layer</th>
              <th>Responsibility</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Next.js Frontend</td>
              <td>Scene rendering, player input, wallet connection, image display, CSS filter application, adventure selection UI.</td>
            </tr>
            <tr>
              <td>FastAPI Backend</td>
              <td>Session management, addon loading and validation, scene graph traversal, play count tracking, dependency resolution, revenue split logic.</td>
            </tr>
            <tr>
              <td>Addon Engine</td>
              <td>Stateless per-request scene lookup. Falls back to default_entry on missing scene. Each player session is independently routed with no shared in-memory state.</td>
            </tr>
            <tr>
              <td>Scene Graph</td>
              <td>An id-keyed map of scene objects defined in the addon JSON. Traversed by player choice. N:M relationships, loops, and branches are all valid structures.</td>
            </tr>
            <tr>
              <td>Session State</td>
              <td>Stored in a shared persistence layer. Holds current scene id, play count, completed adventure record, and player identity.</td>
            </tr>
            <tr>
              <td>Addon Validation</td>
              <td>Schema-checked on load. Required fields, scene existence, choice targets, and ending flags are all verified before an addon is made available to players.</td>
            </tr>
            <tr>
              <td>Dependencies</td>
              <td>Resolved per player at adventure entry. Completed addons are recorded. Unlocks are evaluated on completion and made available immediately.</td>
            </tr>
            <tr>
              <td>Revenue Share</td>
              <td>Applied at transaction time. 80% to the contributor's declared wallet address, 20% to the platform. Polkadot primary, Ethereum fallback.</td>
            </tr>
            <tr>
              <td>Blockchain</td>
              <td>Currently Polkadot. Migration to another chain is supported; contributor addresses and payout records are migration-safe.</td>
            </tr>
          </tbody>
        </table>

      </section>
    </div>
  );
}
