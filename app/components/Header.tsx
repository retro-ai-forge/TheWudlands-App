"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Header.module.css";

const NAV = [
  { label: "The Wudlands",       href: "/" },
  { label: "Guide",              href: "/guide" },
  { label: "Characters",         href: "/characters" },
  { label: "Contribute Stories", href: "/contribute-stories" },
  { label: "Dev Section",        href: "/dev-section" },
  { label: "AGB",                href: "/agb" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        {NAV.map(({ label, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
