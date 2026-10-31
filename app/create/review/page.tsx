"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";

// A story stays in review for 7 days from its last submission. Resubmitting a
// story refreshes submittedAt on the backend, which restarts this countdown.
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ReviewEntry {
  storyId: string;
  name?: string;
  lastUpdate?: string;
  submittedAt?: string;
  status?: string;
  address: string;
}

function shortAddress(a: string): string {
  if (!a) return "—";
  return a.length <= 10 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function shortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function pad2(n: number): string {
  // Pad with a non-breaking space (not "0") so widths line up without a
  // visible leading zero. nbsp isn't collapsed by HTML whitespace handling.
  return String(n).padStart(2, " ");
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "elapsed";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad2(d)}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
}

const gold = "#7a6a3a";
const parchment = "#d4c9a8";
const mono = "'Courier New', Courier, monospace";

export default function ReviewStatus() {
  const [entries, setEntries] = useState<ReviewEntry[] | null>(null);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/twine-reviews");
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        setEntries(await res.json());
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cell: React.CSSProperties = {
    padding: "0.6rem 0.8rem",
    borderBottom: `1px solid ${gold}`,
    fontFamily: mono,
    color: parchment,
    fontSize: "0.9rem",
    textAlign: "left",
    verticalAlign: "top",
  };
  const headCell: React.CSSProperties = {
    ...cell,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "0.75rem",
    color: gold,
    borderBottom: `2px solid ${gold}`,
  };

  // Narrow-screen card styles (<700px).
  const cardStyle: React.CSSProperties = {
    border: `1px solid ${gold}`,
    background: "#141410",
    padding: "0.9rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
  };
  const cardName: React.CSSProperties = {
    fontFamily: mono,
    color: parchment,
    fontSize: "1.05rem",
    fontWeight: 700,
    wordBreak: "break-word",
  };
  const cardTimer: React.CSSProperties = {
    fontFamily: mono,
    fontSize: "1.3rem",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
  };
  const cardMeta: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "0.2rem 0.75rem",
    marginTop: "0.2rem",
    fontFamily: mono,
    fontSize: "0.8rem",
  };
  const cardMetaLabel: React.CSSProperties = {
    color: gold,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontSize: "0.7rem",
  };
  const cardMetaValue: React.CSSProperties = {
    color: parchment,
    wordBreak: "break-all",
  };

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1rem", background: "#0a0a0a" }}>
      <section style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: mono,
            color: parchment,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontSize: "1.3rem",
          }}
        >
          Review Status
        </h2>
        <p style={{ fontFamily: mono, color: gold, fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Herein lie all tales submitted for judgement. Each is granted seven days' grace — revise as you will, and the hourglass turns anew. When the last grain falls, the tale passes to the reviewers.
        </p>

        {error && (
          <p style={{ fontFamily: mono, color: "#c55865" }}>{error}</p>
        )}

        {!error && entries === null && (
          <p style={{ fontFamily: mono, color: parchment }}>Loading…</p>
        )}

        {entries !== null && entries.length === 0 && (
          <p style={{ fontFamily: mono, color: parchment, fontStyle: "italic" }}>
            No stories submitted for review yet.
          </p>
        )}

        {entries !== null && entries.length > 0 && (() => {
          const rows = entries.map((e) => {
            const anchor = e.lastUpdate || e.submittedAt;
            const started = anchor ? new Date(anchor).getTime() : 0;
            const remaining = started ? started + REVIEW_WINDOW_MS - now : 0;
            const color = !started
              ? parchment
              : remaining <= 0
              ? "#c55865"
              : remaining < 86400000
              ? "#d4a24a"
              : parchment;
            const label = started ? formatRemaining(remaining) : "—";
            return { e, color, label };
          });

          if (narrow) {
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                {rows.map(({ e, color, label }) => (
                  <div key={e.storyId} style={cardStyle}>
                    <div style={cardName}>{e.name || "Untitled"}</div>
                    <div style={{ ...cardTimer, color }}>{label}</div>
                    <div style={cardMeta}>
                      <span style={cardMetaLabel}>Author</span>
                      <span style={cardMetaValue} title={e.address}>
                        {shortAddress(e.address)}
                      </span>
                      <span style={cardMetaLabel}>ID</span>
                      <span style={cardMetaValue} title={e.storyId}>
                        {shortId(e.storyId)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={headCell}>Story</th>
                    <th style={headCell}>ID</th>
                    <th style={headCell}>Author</th>
                    <th style={headCell}>Time Left</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ e, color, label }) => (
                    <tr key={e.storyId}>
                      <td style={cell}>{e.name || "Untitled"}</td>
                      <td style={cell} title={e.storyId}>
                        {shortId(e.storyId)}
                      </td>
                      <td style={cell} title={e.address}>
                        {shortAddress(e.address)}
                      </td>
                      <td
                        style={{
                          ...cell,
                          color,
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        <div style={{ marginTop: "2.5rem" }}>
          <Link
            href="/create"
            style={{
              fontFamily: mono,
              color: gold,
              textDecoration: "none",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontSize: "0.85rem",
            }}
          >
            &larr; Back to Create
          </Link>
        </div>
      </section>
      <PageVersionTag />
    </div>
  );
}
