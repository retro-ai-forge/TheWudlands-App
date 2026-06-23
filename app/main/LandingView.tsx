import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../page.module.css";
import { EnterWudlandsButton } from "./EnterWudlandsButton";

interface LandingViewProps {
  status: string;
  joining: boolean;
  onEnter: (address: string) => void;
  onError: (error: string) => void;
}

const STEPS = [
  {
    num: "1",
    title: "Pick an adventure",
    text: "Choose a self-contained story — a haunted tower, a cursed merchant road, a dungeon that swallowed three expeditions before yours.",
  },
  {
    num: "2",
    title: "Make choices that matter",
    text: "Read the scene, then decide. Where you go, who you trust, when you run — every choice has consequences, and the world does not forget.",
  },
  {
    num: "3",
    title: "Your deeds are saved forever",
    text: "Your character and the legend you build are kept and carried with you — your progress is yours to keep, adventure after adventure.",
  },
];

export function LandingView({ status, joining, onEnter, onError }: LandingViewProps) {
  const [heroOpacity, setHeroOpacity] = useState(1);
  const [showWalletHint, setShowWalletHint] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const opacity = Math.max(0, 1 - window.scrollY / 400);
      setHeroOpacity(opacity);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const statusLine = showWalletHint ? (
    <p className={styles.status}>
      New to wallets? <Link href="/guide" className={styles.trustLink}>Set one up →</Link>
    </p>
  ) : (
    <p className={styles.status}>{status}</p>
  );

  const cta = (
    <div className={styles.ctaGroup}>
      {statusLine}
      <EnterWudlandsButton onEnter={onEnter} onError={onError} onNoWallet={() => setShowWalletHint(true)} disabled={joining} />
    </div>
  );

  return (
    <div className={styles.landing}>
      {/* 1 — HERO (above the fold) */}
      <section className={styles.hero}>
        <div className={styles.heroCta} style={{ opacity: heroOpacity, transition: "opacity 0.1s" }}>
          {cta}
          <span className={styles.scrollHint}>▾ what is the wudlands</span>
        </div>
      </section>

      {/* 2 — WHAT IS THE WUDLANDS */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>What is the Wudlands?</h2>
        <p className={styles.sectionBody}>
          An old-school, round-based adventure in the tradition of Fighting Fantasy and the
          Lone Wolf saga — a world of dark forests, crumbling dungeons, and desperate choices.
        </p>
        <p className={styles.sectionBody}>
          You enter as a wanderer with little more than your wits, and every decision is yours.
          Played in your browser, with character progression that is yours to keep.
        </p>
      </section>

      {/* 3 — HOW IT WORKS */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>How it works</h2>
        <ol className={styles.steps}>
          {STEPS.map((s) => (
            <li key={s.num} className={styles.step}>
              <span className={styles.stepNum}>{s.num}</span>
              <span className={styles.stepTitle}>{s.title}</span>
              <span className={styles.stepText}>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 4 — TRUST / STATUS */}
      <section className={styles.trust}>
        <p className={styles.trustLine}>
          Free to play in beta · No coins spent before alpha
        </p>
        <Link href="/dev-section#roadmap" className={styles.trustLink}>
          View the roadmap →
        </Link>
      </section>

      {/* 5 — FINAL CTA */}
      <section className={styles.finalCta}>
        <h2 className={styles.sectionHeading}>Step into the Wudlands</h2>
        {cta}
      </section>
    </div>
  );
}
