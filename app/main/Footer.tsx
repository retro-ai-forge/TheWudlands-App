import Link from "next/link";
import styles from "./Footer.module.css";

// De-emphasised, secondary links — separated from the player-first primary nav.
const INTERNAL = [
  { label: "Home",       href: "/" },
  { label: "Developers", href: "/dev-section" },
  { label: "Terms",      href: "/gtc" },
];

const EXTERNAL = [
  { label: "Telegram", href: "https://t.me/+GNokB3Y-FllhNjBi" },
  { label: "GitHub",   href: "https://github.com/retro-ai-forge/TheWudlands-App" },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links}>
        {INTERNAL.map(({ label, href }) => (
          <Link key={href} href={href} className={styles.link}>
            {label}
          </Link>
        ))}
        {EXTERNAL.map(({ label, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {label}
          </a>
        ))}
      </nav>
      <p className={styles.copy}>The Wudlands</p>
    </footer>
  );
}
