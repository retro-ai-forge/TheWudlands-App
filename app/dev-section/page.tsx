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
                  <li>Single-player mode</li>
                  <li>Wallet login</li>
                  <li>Gathering feedback</li>
                  <li>Rewards for participation</li>
                  <li>Fixed characters</li>
                  <li>No character creation</li>
                  <li>No persistent data storage</li>
                  <li>Limited adventure content</li>
                  <li>Starting in Beta &gt; 1.0 </li>
                  <li>Reset after logout</li>
                  <li>Free to play</li>
                </ul>
              </div>

              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Beta 2.0 October 2026</div>
                <ul className={styles.phaseDetails}>
                  <li>Progress <strong><span style={{fontSize: '1.2em'}}>loss</span></strong> on major upgrades!</li>
                  <li>Character creation system</li>
                  <li>Gender selection</li>
                  <li>Race selection</li>
                  <li>Profession selection</li>
                  <li>Character progress</li>
                  <li>First adventure addons</li>
                  <li>Off-chain database storage</li>
                  <li>Data migration to Alpha not guaranteed</li>
                  <li>Free to play</li>
                </ul>
              </div>

              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Alpha 1.0 February 2027</div>
                <ul className={styles.phaseDetails}>
                  <li>DOT / WUD token payments</li>
                  <li>In-game currency system</li>
                  <li>Adventure entry fees</li>
                  <li>Revenue share distribution</li>
                  <li>On-chain character progression</li>
                  <li>Persistent wallet integration</li>
                  <li>Character classes via stories</li>
                  <li>Adventure statistics - ranking</li>
                </ul>
              </div>

              <div className={styles.roadmapPhase}>
                <div className={styles.phaseName}>Alpha 2.0 end of 2027</div>
                <ul className={styles.phaseDetails}>
                  <li>Adventure group mode</li>
                  <li>Adventure multiplayer</li>
                  <li>The Wudlands NFT</li>
                  <li>WUD Universe show corner</li>
                  <li>Market for Wudland items (nft)</li>
                  <li>Party Member Rentals</li>
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

        <h3 className={styles.subHeading}>1. Narrative Architects</h3>
        <p className={styles.body}>
          Write the stories and decide how the adventures should feel. You create branching storylines, rich dialogue, and set the mood for the entire dark fantasy world. Work together with other writers to weave The Wudlands' emerging main storyline — your adventures connect and bring players deeper into the world's larger tale. You define the style, pacing, and tone that brings everything together into one amazing experience.
        </p>

        <h3 className={styles.subHeading}>2. Visual &amp; Audio Creators</h3>
        <p className={styles.body}>
          Paint the world with images and sounds. Create character portraits, spooky environments, sound effects, and music that makes adventures come alive. Your art and audio turn words on a screen into something players can see and hear.
        </p>

        <h3 className={styles.subHeading}>3. Platform Engineers</h3>
        <p className={styles.body}>
          Build the machine that runs everything. You create the engine that loads adventures, handles player choices, displays scenes on screen, and keeps everything running smoothly. You also write tools that help story writers turn their ideas into playable adventures without needing to code.
        </p>

        <h3 className={styles.subHeading}>4. Community Stewards</h3>
        <p className={styles.body}>
          Keep the community happy and the quality high. You review what people make, give helpful feedback, answer questions, and make sure everything stays fun and fair for everyone.
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
          requested scene id in that map on every player action. The adventure starts at
           the <code className={styles.code}>default_entry</code>, which serves as the normal session starting point.
          If a scene exists, it is returned and rendered. If it does not exist — because of a broken link 
          in the addon, a missing node, or any
          other fault — the engine does not error or crash the session. Instead it falls back to the
          addon&apos;s <code className={styles.code}>emergency_exit</code> scene, a dedicated error-recovery
          scene required by schema to exist. The session remains intact, the player 
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
          resets by paying the entry fee again. Play count decrements happens 
          when the player reaches a scene with <code className={styles.code}>ending: true</code> or using 
          an <code className={styles.code}>escape_route</code>. 
          This mirrors the real-world model of paying for the seat, not the outcome.
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
          <code className={styles.code}>ending</code> scene flags. Addons that fail validation are not published.
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
          Ethereum fallback address per contributor. Please mark that Nova Wallets already feature both 
          addresses with a single seed. When a player pays the entry fee for an adventure, the
          revenue split is applied at transaction time: 80% is routed to the wallet address declared in the
          addon&apos;s <code className={styles.code}>polkadot_address</code> field, and 20% is retained by the
          platform.
        </p>

        <h3 className={styles.subHeading}>Image Rendering &amp; Style Presets</h3>

        <p className={styles.body}>
          Each scene may reference a single image by filename. At runtime, the frontend loads the 
          next scene as html site and applies CSS filters to the image based on the scene&apos;s 
          declared style preset. The scene text is displayed. Buttons will be rendered for each choice, 
          and the player can click checkboxes and radio buttons for extra interactivity. There will be 
          an escape button in the corner of the screen, backpack, character sheet and numbers of story 
          dependent stats like health, sanity, and gold. The exact layout and design of the UI is 
          still being iterated on, but the core functionality will be in place for Beta 1.0.
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
              <td>An id-keyed map of scene objects defined in the addon JSON. Traversed by player choice. Any relationships, loops, and branches are all valid structures. 
                Endless loops or completely separated story sections should be avoided and only used if the story calls for it. 
              </td>
            </tr>
            <tr>
              <td>Session State</td>
              <td>Stored in a shared persistence layer. Holds current scene id, play count, completed adventure record, and player identity.</td>
            </tr>
            <tr>
              <td>Addon Validation</td>
              <td>Schema-checked on contribution. Required fields, scene existence, choice targets, and ending flags are all verified before an addon is made available to players.</td>
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
              <td>Currently Polkadot. Migration to another chain might happen.</td>
            </tr>
          </tbody>
        </table>

      </section>
    </div>
  );
}
