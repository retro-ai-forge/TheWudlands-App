import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

export default function About() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>About The Wudlands</h2>

        <p className={styles.body}>
          The Wudlands is an old-school round-based <Link href="https://www.fightingfantasy.com/" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Fighting Fantasy</Link>-style adventure game inspired by <Link href="https://boardgamegeek.com/boardgame/199723/ultraquest-gold-ruhm-und-ehre" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>UltraQuest</Link>,{" "}
          <Link href="https://www.projectaon.org/en/Main/Home" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Lone Wolf Saga</Link>, <Link href="https://www.everquest.com/home" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>EverQuest</Link>, <Link href="https://goodman-games.com/dungeon-crawl-classics-rpg/" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Dungeon Crawl Classic</Link>, books from <Link href="https://en.wikipedia.org/wiki/Steve_Jackson_(British_game_designer)" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Steve Jackson</Link>, <Link href="https://en.wikipedia.org/wiki/Ian_Livingstone" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Ian Livingstone</Link>, and the{" "}
          <Link href="https://linktr.ee/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.externalLink}>GAVUN WUD meme</Link>, built as a browser-based fantasy RPG with scene-driven
          gameplay, pixel-art, ascii-art, narrative-driven adventures, and onchain
          character progression. The game will be built using a modular, plugin-based
          architecture that allows for easy extension and modification.
        </p>

        <section className={styles.wudSection}>
          <p className={styles.wudTitle}>— The Wud Legends —</p>
          <div className={styles.wudGrid}>
            <Link href="https://gavunwud.xyz//" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/gavun-wud-black.png" alt="Gavun the Wud" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Gavun of Wud</span>
            </Link>
            <Link href="https://x.com/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/20260609_084229.jpg" alt="Dark Lord of Polkadut" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Slayer of Polkadut</span>
            </Link>
            <Link href="https://linktr.ee/gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/20260609_084240.jpg" alt="The Beyr Slayr" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>The Beyr Slayr</span>
            </Link>
            <Link href="https://www.youtube.com/@gavunwud" target="_blank" rel="noopener noreferrer" className={styles.wudCard}>
              <Image src="/images/about/20260609_084257.jpg" alt="Warlord of the Wud" width={80} height={80} className={styles.wudIcon} />
              <span className={styles.wudName}>Warlord of the Wud</span>
            </Link>
          </div>
        </section>

        <h2 className={styles.heading}>The World</h2>

        <p className={styles.body}>
          The Wudlands is not a place that welcomes the faint of heart. It is a world of dark forests,
          crumbling dungeons, desperate choices, and things older than memory that do not wish to be disturbed.
          You will enter it as a wanderer with little more than your wits and whatever courage you can muster —
          and the world will test both without mercy. What you find, what you survive, and what stories are told
          of your passing are entirely yours to shape.
        </p>

        <h2 className={styles.heading}>Getting Started</h2>

        <p className={styles.body}>
          To step into the Wudlands, you will need a <strong>Polkadot wallet</strong> for login and to track your on-chain character progression.
          The following wallet extensions are supported: <strong>Nova Wallet</strong>, <strong>Polkadot.js</strong>, <strong>Talisman</strong>, and <strong>SubWallet</strong>.
          Install one of these compatible wallets on your <strong>mobile phone</strong> or browser to begin your adventure.
        </p>

        <h2 className={styles.heading}>Adventures</h2>

        <p className={styles.body}>
          The Wudlands is made up of adventures — self-contained stories written by contributors from across the world.
          Each adventure is its own corner of the Wudlands: a haunted tower, a cursed merchant road, a court intrigue,
          a dungeon that has swallowed three expeditions before yours. You choose which adventure to enter, read the
          opening scene, and from that moment every decision is yours. Where you go, who you trust, when you run —
          all of it matters. The world does not forget what you choose.
        </p>

        <p className={styles.body}>
          Some adventures are locked when you first arrive. A story may require that you have already survived another
          before its gates will open to you. This is not an obstacle — it is the shape of the world. Certain ruins
          cannot be understood without knowing what fell in the war that built them. Certain factions will not speak
          to you until you carry a name they recognise. Complete what lies before you, and the deeper roads will open.
          The platform will tell you plainly what stands between you and the next chapter.
        </p>

        <p className={styles.body}>
          Entering an adventure requires a small coin — an on-chain fee that grants you the right to explore it again and again,
          up to three times by default. Each adventure costs approximately $0.80 for three exploration attempts. Think of it less as a toll and more as the price
          of a seat at the storyteller&apos;s fire. If you have exhausted your plays and wish to return, you may
          pay the fee once more and your count is restored. The road is always open to those willing to walk it again.
        </p>

      </section>
    </div>
  );
}
