import Link from "next/link";
import styles from "./Header.module.css";

const NAV = [
  { label: "The Wudlands",       href: "/" },
  { label: "Contribute Stories", href: "/contribute-stories" },
  { label: "Dev Section",        href: "/dev-section" },
  { label: "Characters",         href: "/characters" },
  { label: "Guide",              href: "/guide" },
  { label: "AGB",                href: "/agb" },
];

export default function Header() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        {NAV.map(({ label, href }) => (
          <Link key={href} href={href} className={styles.link}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
