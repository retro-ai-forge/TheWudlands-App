import styles from "./page.module.css";

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

      </section>
    </div>
  );
}
