import Link from "next/link";
import styles from "./page.module.css";
import ClickableImage from "./ClickableImage";

export default function DevSection() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>Developer Overview</h2>

        <p className={styles.body}>
          The Wudlands is an open source, contributor-driven dark fantasy adventure platform. At its core it is a
          story engine — a system that loads externally authored adventure addons and runs them as live,
          interactive sessions for players. The platform is designed to be extended by two distinct groups:
          story contributors who write the adventures, and software developers who build and maintain the
          engine, tooling, and infrastructure that makes those adventures run.
        </p>

        <p className={styles.body}>
          Connect with us and explore the project on our community platforms:
        </p>

        <div className={styles.socialLinks}>
          <div className={styles.socialItem}>
            <div className={styles.socialLabel}>Main repo<br />The Wudlands App</div>
            <a href="https://github.com/retro-ai-forge/TheWudlands-App" target="_blank" rel="noopener noreferrer">
              <img src="/icons/github-icon.webp" alt="GitHub" className={styles.socialIcon} />
            </a>
          </div>
          <div className={styles.socialItem}>
            <div className={styles.socialLabel}>News<br />FAQ channel</div>
            <a href="https://t.me/+GNokB3Y-FllhNjBi" target="_blank" rel="noopener noreferrer">
              <img src="/icons/telegram-icon.webp" alt="Telegram" className={styles.socialIcon} />
            </a>
          </div>
          <div className={styles.socialItem}>
            <div className={styles.socialLabel}>EVRLOOT<br />Porting repo</div>
            <a href="https://github.com/retro-ai-forge/TheWudlands-EVRLOOT-nfts" target="_blank" rel="noopener noreferrer">
              <img src="/icons/github-icon.webp" alt="GitHub NFTs" className={styles.socialIcon} />
            </a>
          </div>
        </div>

        <div id="roadmap" className={styles.roadmapSection}>
          <h3 className={styles.roadmapTitle}>Development Roadmap</h3>

          <div className={styles.timelineContainer}>
            <div className={styles.timelineLine}></div>

            <div className={styles.roadmapPhases}>
              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Beta 1.0 August 2026</div>
                <ul className={styles.phaseDetails}>
                  <li>Landing page review collection</li>
                  <li>Reward for constructive feedback</li>
                  <li>Wallet integration</li>
                  <li>No character creation</li>
                  <li>No persistent data storage</li>
                  <li>Fixed (selectable) characters</li>
                  <li>Complete session reset after logout</li>
                  <li>No stories in Beta &lt; 1.0 </li>
                  <li>Limited adventure content</li>
                  <li>Single-player mode</li>
                  <li>Free to play</li>
                </ul>
              </div>

              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Beta 2.0 October 2026</div>
                <ul className={styles.phaseDetails}>
                  <li>Progress <strong><span style={{fontSize: '1.3em'}}>loss</span></strong> on major upgrades!</li>
                  <li>Character creation system</li>
                  <li>Race selection</li>
                  <li>Character progress</li>
                  <li>First adventure addons</li>
                  <li>Off-chain database storage</li>
                  <li>Data migration to Alpha not guaranteed</li>
                  <li>Wallet connection integration</li>
                  <li>Free to play</li>
                </ul>
              </div>

              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Alpha 1.0 February 2027</div>
                <ul className={styles.phaseDetails}>
                  <li>DOT / WUD token payments</li>
                  <li>In-game currency system</li>
                  <li>Adventure entry fees</li>
                  <li>On-chain character progression</li>
                  <li>Persistent wallet integration</li>
                  <li>Character classes & professions</li>
                  <li>Production-grade data security</li>
                  <li>Revenue share distribution</li>
                </ul>
              </div>

              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Alpha 2.0 end of 2027</div>
                <ul className={styles.phaseDetails}>
                  <li>Group-player mode</li>
                  <li>The Wudlands NFT</li>
                  <li>WUD Universe show corner</li>
                  <li>Market for Wudland NFTs</li>
                  <li>Wudlands Mobile App</li>
                  <li>Ranking</li>
                </ul>
              </div>

            </div>
          </div>
        </div>

        <h2 className={styles.sectionHeading}>Call for Contributors</h2>

        <p className={styles.body}>
          The Wudlands is built by the community, for the community. We&apos;re actively recruiting contributors across multiple disciplines to help bring this dark fantasy world to life. Whether you&apos;re a writer, artist, developer, or designer, there are roles that match your skills and passion.
        </p>

        <p className={styles.body}>
          <strong>Story Writers</strong> craft the adventures that drive the platform. Your narratives are the foundation of player experiences — branching storylines, rich dialogue, and dark fantasy atmospheres that immerse players in the Wudlands universe.
        </p>

        <p className={styles.body}>
          <strong>Image Generators &amp; Visual Artists</strong> create the visual identity of every scene. From atmospheric character portraits to haunting environment artwork, your images bring the world to life and define the aesthetic of each adventure addon.
        </p>

        <p className={styles.body}>
          <strong>Creative Directors &amp; Game Designers</strong> shape the overall experience. You define the visual style, pacing, tone, and design language that unites all adventures into a cohesive dark fantasy world. Your vision sets the standard for quality and immersion.
        </p>

        <p className={styles.body}>
          <strong>Backend &amp; Engine Developers</strong> build and maintain the engine that powers the platform. You work on session management, addon validation, blockchain integration, player routing, and the infrastructure that keeps adventures running smoothly at scale.
        </p>

        <p className={styles.body}>
          <strong>Automation &amp; Tools Developers</strong> write tools and scripts that convert raw story content into playable scene-based adventures. You bridge the gap between narrative and engine, building the pipelines that allow non-technical contributors to publish their work.
        </p>

        <p className={styles.body}>
          <strong>Frontend &amp; UI/UX Developers</strong> design and implement the player-facing interface. You work on scene rendering, choice presentation, wallet integration, and the smooth interactions that players encounter during every adventure.
        </p>

        <p className={styles.body}>
          <strong>Audio Designers &amp; Composers</strong> add sonic depth to the experience. Sound effects, ambient music, and voice assets transform adventures from silent text into immersive multisensory journeys.
        </p>

        <p className={styles.body}>
          <strong>Community &amp; Content Managers</strong> foster collaboration and quality. You review submissions, provide feedback to contributors, moderate community discussions, and ensure the addon ecosystem stays vibrant and on-brand.
        </p>

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
          <Link href="/storyteller" className={styles.code}>Storyteller</Link> section. Start there.
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

         <ClickableImage
          src="/images/dev-section/engine.jpg"
          alt="Software architecture diagram showing the relationship between the core engine and the story add-ons. The engine is a central hub that loads and runs the add-ons, which are separate modules containing story content and assets."
        />

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
          existence of the <code className={styles.code}>default_entry</code>,{" "}
          <code className={styles.code}>emergency_exit</code>, and{" "}
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
              <td>Stateless per-request scene lookup. Falls back to <code className={styles.code}>emergency_exit</code> on missing scene. Each player session is independently routed with no shared in-memory state.</td>
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
              <td>Applied at transaction time. 80% to the contributor&apos;s declared wallet address, 20% to the platform. Polkadot primary, Ethereum fallback.</td>
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
