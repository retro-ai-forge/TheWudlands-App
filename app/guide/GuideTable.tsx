"use client";

import { useState } from "react";
import styles from "./GuideTable.module.css";

interface Row {
  key: string;
  value: React.ReactNode;
}

interface GuideTableProps {
  rows: Row[];
}

export default function GuideTable({ rows }: GuideTableProps) {
  const [open, setOpen] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <>
      {/* Desktop: normal table */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>What to Know</th>
            <th>How It Works in the Wudlands</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className={styles.key}>{row.key}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: collapsible rows */}
      <dl className={styles.list}>
        {rows.map((row, i) => (
          <div key={i} className={styles.item}>
            <dt
              className={styles.term}
              onClick={() => toggle(i)}
              aria-expanded={open.has(i)}
            >
              <span>{row.key}</span>
              <span className={styles.chevron}>{open.has(i) ? "▴" : "▾"}</span>
            </dt>
            {open.has(i) && <dd className={styles.desc}>{row.value}</dd>}
          </div>
        ))}
      </dl>
    </>
  );
}
