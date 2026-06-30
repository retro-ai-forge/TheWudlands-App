"use client";

import { useState } from "react";
import styles from "./GuideTable.module.css";

interface Row {
  key: string;
  value: React.ReactNode;
}

interface GuideTableProps {
  rows: Row[];
  accordion?: boolean;
}

export default function GuideTable({ rows, accordion = false }: GuideTableProps) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [openSingle, setOpenSingle] = useState<number | null>(null);

  const toggle = (i: number) => {
    if (accordion) {
      setOpenSingle(prev => prev === i ? null : i);
    } else {
      setOpen((prev) => {
        const next = new Set(prev);
        next.has(i) ? next.delete(i) : next.add(i);
        return next;
      });
    }
  };

  const isOpen = (i: number) => accordion ? openSingle === i : open.has(i);

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
              aria-expanded={isOpen(i)}
            >
              <span>{row.key}</span>
              <span className={styles.chevron}>{isOpen(i) ? "▴" : "▾"}</span>
            </dt>
            {isOpen(i) && <dd className={styles.desc}>{row.value}</dd>}
          </div>
        ))}
      </dl>
    </>
  );
}
