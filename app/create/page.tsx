"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageVersionTag } from "../main/PageVersionTag";
import styles from "./page.module.css";

export default function Create() {
  // Pick one of three fixed layouts by viewport width — bubbles keep a fixed
  // size within each layout (no zooming), only the count and spacing change.
  const [viewportWidth, setViewportWidth] = useState(1024);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Fresh random scatter each page load (set after mount to avoid SSR mismatch).
  const [seed, setSeed] = useState(1337);

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1e9));
  }, []);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.guidelines} style={{ maxWidth: "800px" }}>
        <h2 className={styles.heading}>Call for Artists &amp; Writers</h2>

        <p className={styles.authorIntro}>
          <strong>Imagine a world, create an immersive experience.</strong> Write
          interactive stories for The Wudlands and earn from every wanderer who
          plays them. We are starting with <strong>dark fantasy</strong> — and it is
          a wide, open genre. Get creative.
        </p>

        <div className={styles.imageFrame}>
          <img
            src="/images/create/share-writers-80percent.jpg"
            alt="Revenue share: 80% goes to writers and creators, 20% covers admin and platform costs."
            className={styles.sectionImage}
          />
        </div>

        <div className={styles.ctaRow}>
          <a
            href="/twine/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.editorCta}
          >
            <span className={styles.ctaLabelFull}>Open the Story Editor</span>
            <span className={styles.ctaLabelSmall}>Open Editor on PC</span>
          </a>
          <Link href="/create/tutorial" className={styles.editorCta}>
            Tutorial
          </Link>
          <Link href="/create/review" className={styles.editorCta}>
            Review Status
          </Link>
        </div>

        <div style={{ marginBottom: "1.5rem", padding: "2rem", background: "#0a0a0a", border: "1px solid #7a6a3a" }}>
          <p className={styles.body}>
            <strong>80% is yours.</strong> You keep 80% of the revenue your
            adventure generates — only 20% covers admin and platform costs. Write
            the story, add the images, submit for review. Once approved, it goes
            live to players worldwide.
          </p>
        </div>

        <div className={styles.imageFrame}>
          <img
            src="/images/create/createstory.jpg"
            alt="A magic book with a glowing red cover, open to a page with a quill pen poised above it. The text reads: 'Create your own story in the Wudlands.'"
            className={styles.sectionImage}
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <p className={styles.body} style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <strong>Dark fantasy can include:</strong>
          </p>
          {(() => {
            // tier: lowest layout a bubble appears in.
            //   0 = 330–400px, 1 = 401–600px, 2 = 601px and up.
            const genres = [
              { lines: ["Travel"], size: 7, top: 12, left: 20, tier: 0, glow: "#3a6a6a" },
              { lines: ["Quests"], size: 5, top: 10, left: 52, tier: 0, glow: "#8a6a2a" },
              { lines: ["Secret", "cults"], size: 5.5, top: 14, left: 82, tier: 0, glow: "#5a3a6a" },
              { lines: ["Cursed", "artefacts"], size: 6, top: 28, left: 12, tier: 0, glow: "#6a2a3a" },
              { lines: ["Combat"], size: 6, top: 26, left: 42, tier: 0, glow: "#8a3a2a" },
              { lines: ["Forbidden", "magic"], size: 6.5, top: 30, left: 72, tier: 0, glow: "#6a3a7a" },
              { lines: ["Dragons"], size: 5.5, top: 44, left: 24, tier: 0, glow: "#a0502a" },
              { lines: ["Uncovering", "old history"], size: 7, top: 46, left: 56, tier: 1, glow: "#7a5a2a" },
              { lines: ["Legendary", "creatures"], size: 7, top: 42, left: 88, tier: 0, glow: "#3a6a3a" },
              { lines: ["Lycanthropy"], size: 6, top: 56, left: 84, tier: 1, glow: "#4a5a2a" },
              { lines: ["Fallen", "kingdoms"], size: 6.5, top: 62, left: 14, tier: 2, glow: "#4a4a5a" },
              { lines: ["Betrayal", "& intrigue"], size: 6, top: 60, left: 46, tier: 0, glow: "#5a2a3a" },
              { lines: ["Plague", "& disease"], size: 6, top: 64, left: 78, tier: 0, glow: "#4a6a2a" },
              { lines: ["Greek", "mythology"], size: 6.5, top: 78, left: 26, tier: 0, glow: "#3a5a6a" },
              { lines: ["Necromancy"], size: 6, top: 76, left: 58, tier: 1, glow: "#4a3a6a" },
              { lines: ["Ancient", "ruins"], size: 6, top: 80, left: 90, tier: 0, glow: "#6a5a3a" },
              { lines: ["Revolutions", "& uprisings"], size: 6.5, top: 90, left: 14, tier: 1, glow: "#8a3a3a" },
              { lines: ["Exploration"], size: 5.5, top: 92, left: 40, tier: 1, glow: "#3a6a5a" },
              { lines: ["Vampires"], size: 6, top: 90, left: 66, tier: 0, glow: "#7a2a3a" },
              { lines: ["Ghosts &", "hauntings"], size: 6, top: 90, left: 90, tier: 2, glow: "#3a5a5a" },
            ];
            // Three fixed layouts chosen by viewport width. Within a layout the
            // bubble size (px per size-unit) is fixed, so bubbles never zoom —
            // only the count and the box proportions change between layouts.
            const layout =
              viewportWidth <= 400
                ? { tier: 0, maxWidth: 400, unit: 12, heightFactor: 1.05 }
                : viewportWidth <= 600
                ? { tier: 1, maxWidth: 600, unit: 12.5, heightFactor: 0.8 }
                : { tier: 2, maxWidth: 800, unit: 14, heightFactor: 0.6 };

            const shown = genres.filter((g) => g.tier <= layout.tier);
            const hf = layout.heightFactor;

            // Random — but deterministic — distribution. A seeded PRNG keeps the
            // same scatter across re-renders (no reshuffle on resize), and each
            // bubble is dropped where it avoids overlapping those already placed.
            const W = layout.maxWidth;
            const H = W * hf;
            const rng = (() => {
              let s = seed + layout.tier * 977;
              return () => {
                s = (s + 0x6d2b79f5) | 0;
                let t = Math.imul(s ^ (s >>> 15), 1 | s);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
              };
            })();
            const placed: { x: number; y: number; r: number }[] = [];
            const coords = new Array<{ x: number; y: number }>(shown.length);
            // Place larger bubbles first for a tighter pack.
            shown
              .map((g, i) => ({ i, r: (g.size * layout.unit) / 2 }))
              .sort((a, b) => b.r - a.r)
              .forEach(({ i, r }) => {
                const pad = r + 2;
                let best = { x: W / 2, y: H / 2 };
                let bestGap = -Infinity;
                for (let k = 0; k < 400; k++) {
                  const x = pad + rng() * (W - 2 * pad);
                  const y = pad + rng() * (H - 2 * pad);
                  let gap = Infinity;
                  for (const p of placed) {
                    gap = Math.min(gap, Math.hypot(x - p.x, y - p.y) - (r + p.r));
                  }
                  if (gap > bestGap) {
                    bestGap = gap;
                    best = { x, y };
                  }
                  if (gap >= 2) break; // comfortable spacing found — take it
                }
                placed.push({ x: best.x, y: best.y, r });
                coords[i] = best;
              });

            // Constellation: connect each bubble to its 2 nearest neighbours so the
            // genres read as one living, interconnected web of stories. SVG viewBox
            // coords (px / W * 100) line up with the % bubble positions.
            const pts = coords.map((c) => ({ x: (c.x / W) * 100, y: (c.y / W) * 100 }));
            const edgeKeys = new Set<string>();
            const edges: { a: number; b: number }[] = [];
            pts.forEach((p, i) => {
              pts
                .map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 }))
                .filter((o) => o.j !== i)
                .sort((a, b) => a.d - b.d)
                .slice(0, 2)
                .forEach(({ j }) => {
                  const a = Math.min(i, j);
                  const b = Math.max(i, j);
                  const key = `${a}-${b}`;
                  if (!edgeKeys.has(key)) {
                    edgeKeys.add(key);
                    edges.push({ a, b });
                  }
                });
            });

            return (
              <div
                style={{
                  position: "relative",
                  width: `min(94vw, ${layout.maxWidth}px)`,
                  aspectRatio: `1 / ${layout.heightFactor}`,
                  margin: "0 auto",
                }}
              >
                <svg
                  aria-hidden
                  viewBox={`0 0 100 ${100 * hf}`}
                  preserveAspectRatio="none"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none", overflow: "visible" }}
                >
                  <defs>
                    <radialGradient id="sparkGlow">
                      <stop offset="0%" stopColor="#ff6a4a" stopOpacity="1" />
                      <stop offset="30%" stopColor="#c01818" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#8a0d0d" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {edges.map(({ a, b }, k) => (
                    <line
                      key={`l${k}`}
                      x1={pts[a].x}
                      y1={pts[a].y}
                      x2={pts[b].x}
                      y2={pts[b].y}
                      stroke="#7a6a3a"
                      strokeWidth={0.2}
                      strokeOpacity={0.35}
                    />
                  ))}
                  {/* Traveling sparks: light pulses run bubble -> bubble, so the
                      connected stories feel alive and interacting. */}
                  {!reducedMotion &&
                    edges.map(({ a, b }, k) => {
                      if (k % 2 !== 0) return null; // spark on every other thread
                      const rev = k % 4 === 0; // alternate travel direction
                      const from = rev ? b : a;
                      const to = rev ? a : b;
                      const dur = 3.2 + (k % 5) * 0.7;
                      const begin = (k * 0.9) % 6;
                      return (
                        <circle key={`s${k}`} r={1.8} fill="url(#sparkGlow)" cx={pts[from].x} cy={pts[from].y} opacity={0}>
                          <animate attributeName="cx" values={`${pts[from].x};${pts[to].x}`} dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
                          <animate attributeName="cy" values={`${pts[from].y};${pts[to].y}`} dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
                        </circle>
                      );
                    })}
                </svg>
                {shown.map((g, i) => {
                  const diameter = g.size * layout.unit;
                  // Font fills the (fixed) bubble, so it is always readable.
                  const maxChars = Math.max(...g.lines.map((l) => l.length));
                  const inner = diameter * 0.82;
                  const fontByWidth = inner / (maxChars * 0.6);
                  const fontByHeight = inner / (g.lines.length * 1.25);
                  const fontPx = Math.min(fontByWidth, fontByHeight);
                  return (
                    <span
                      key={i}
                      style={{
                        position: "absolute",
                        zIndex: 1,
                        top: `${(coords[i].y / H) * 100}%`,
                        left: `${(coords[i].x / W) * 100}%`,
                        transform: "translate(-50%, -50%)",
                        width: `${diameter}px`,
                        height: `${diameter}px`,
                        borderRadius: "50%",
                        border: "1px solid #7a6a3a",
                        background: "#141410",
                        boxShadow: `inset 0 0 ${diameter * 0.35}px ${diameter * 0.04}px ${g.glow}`,
                        color: "#d4c9a8",
                        fontFamily: "'Courier New', Courier, monospace",
                        fontSize: `${fontPx}px`,
                        lineHeight: 1.25,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: `${diameter * 0.08}px`,
                        boxSizing: "border-box",
                      }}
                    >
                      {g.lines.map((line, j) => (
                        <span key={j} style={{ whiteSpace: "nowrap" }}>{line}</span>
                      ))}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className={styles.ctaRow} style={{ marginTop: "2.5rem" }}>
          <Link href="/create/tools" className={styles.editorCta}>
            Creator Tools
          </Link>
          <Link href="/create/tutorial" className={styles.editorCta}>
            Tutorial
          </Link>
        </div>
      </section>
      <PageVersionTag />
    </div>
  );
}
