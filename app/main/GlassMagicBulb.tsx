"use client";

import React, { useId, useMemo } from "react";
import styles from "./GlassMagicBulb.module.css";

type GlassMagicBulbProps = {
  fillPercent: number;    // 0 - 100
  color?: string;         // e.g. "#8b5cf6" (magic) or "#ff5a1f" (life)
  size?: number;
  animated?: boolean;
  showPercent?: boolean;
  className?: string;
  label?: string;
};

/* ── color helpers ─────────────────────────────────────────── */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function hexToRgb(hex: string) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function mixHex(a: string, b: string, t: number) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(lerp(ca.r, cb.r, t), lerp(ca.g, cb.g, t), lerp(ca.b, cb.b, t));
}

// strongest motion at 50% fill, softer near empty/full
function motionIntensity(fillPercent: number) {
  const p = clamp(fillPercent, 0, 100);
  return 1 - Math.abs(p - 50) / 50;
}

// deterministic per-instance randomness (stable across SSR/hydration)
function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Build a sine wave surface using a fixed wavelength so the shape can be
   scrolled sideways by exactly one wavelength for a seamless flow loop.
   Body version closes down to the bottom so it can be filled as liquid. */
function buildWave(
  surfaceY: number,
  amp: number,
  wavelength: number,
  phase: number,
  x0: number,
  x1: number,
  bottomY?: number
) {
  const step = 6;
  let d = "";
  for (let x = x0; x <= x1; x += step) {
    const y = surfaceY + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp;
    d += `${x === x0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(2)} `;
  }
  if (bottomY !== undefined) {
    d += `L ${x1} ${bottomY} L ${x0} ${bottomY} Z`;
  }
  return d;
}

// A small starfield for the empty glass region (cosmic look)
const STARS = [
  { x: 150, y: 150, r: 1.6, o: 0.5 },
  { x: 196, y: 122, r: 1.1, o: 0.35 },
  { x: 232, y: 148, r: 1.4, o: 0.45 },
  { x: 286, y: 128, r: 1.0, o: 0.3 },
  { x: 330, y: 158, r: 1.5, o: 0.4 },
  { x: 360, y: 200, r: 1.1, o: 0.32 },
  { x: 172, y: 196, r: 1.0, o: 0.3 },
  { x: 312, y: 184, r: 0.9, o: 0.28 },
  { x: 256, y: 108, r: 1.2, o: 0.38 },
];

export default function GlassMagicBulb({
  fillPercent,
  color = "#8b5cf6",
  size = 280,
  animated = true,
  showPercent = true,
  className,
  label = "Magic Bulb",
}: GlassMagicBulbProps) {
  const uid = useId().replace(/:/g, "");
  const fill = clamp(fillPercent, 0, 100);
  const intensity = motionIntensity(fill);

  const palette = useMemo(() => {
    const base = color;
    const bright = mixHex(color, "#ffffff", 0.35);
    const deep = mixHex(color, "#05060b", 0.55);
    const glow = mixHex(color, "#ffffff", 0.65);
    return { base, bright, deep, glow };
  }, [color]);

  const ids = {
    orbClip: `orbClip-${uid}`,
    glassGrad: `glassGrad-${uid}`,
    glassRim: `glassRim-${uid}`,
    sphere: `sphere-${uid}`,
    liquidGrad: `liquidGrad-${uid}`,
    liquidBack: `liquidBack-${uid}`,
    surfaceGlow: `surfaceGlow-${uid}`,
    fog: `fog-${uid}`,
    flow: `flow-${uid}`,
    soft: `soft-${uid}`,
    moteGlow: `moteGlow-${uid}`,
  };

  // Interior bounds (circle is cx256 cy256 r176 → spans 80..432)
  const innerTop = 90;
  const innerBottom = 424;
  const surfaceY = innerBottom - (fill / 100) * (innerBottom - innerTop);

  // Long, broad wave — broader (calmer) at higher fill. The wave is drawn
  // wider than the circle so it can slosh left↔right without exposing gaps.
  const WAVELENGTH = 240 + intensity * 140;
  const WX0 = -60;
  const WX1 = 572;
  const BOTTOM = 470;

  const ampFront = 4 + intensity * 3.5;
  const ampBack = 3 + intensity * 2.5;

  // left→right→back travel distance & speed. Keep it gentle and, at high
  // fill (peak intensity), make it slower and steadier rather than livelier.
  const flowAmp = 12 + intensity * 8;
  const flowDurA = (6.5 + intensity * 4).toFixed(2) + "s";
  const flowDurB = (8.5 + intensity * 4).toFixed(2) + "s";

  // Golden motes orbiting a vertical axis at x=256 (the bulb's centre). Seen
  // from the front, each crosses left→right while near, then dims and wraps
  // around the back to reappear on the left — as if the liquid slowly rotates.
  const MOTE_STEPS = 18;
  const moteAnim = (radius: number, phase: number, baseOp: number) => {
    const xs: string[] = [];
    const ops: string[] = [];
    for (let i = 0; i <= MOTE_STEPS; i++) {
      const th = (i / MOTE_STEPS) * Math.PI * 2 + phase;
      xs.push(`${(radius * Math.sin(th)).toFixed(1)},0`);
      const depth = (Math.cos(th) + 1) / 2; // 0 = behind axis, 1 = in front
      ops.push((baseOp * (0.16 + 0.84 * depth)).toFixed(3));
    }
    return { x: xs.join(";"), o: ops.join(";") };
  };
  // Motes orbit the central vertical axis (x=256). `spread` = fraction of the
  // available half-width used at the mote's height, so orbits get wider where
  // the bulb is wider (the middle) and tighter near the narrow bottom.
  // `t` = vertical position within the mote band (0..1), `begin` = negative
  // start offset so each is mid-cycle on load (varied brightness + position).
  const motesPool = [
    { spread: 0.85, phase: 0.5, t: 0.10, baseOp: 0.55, dur: 15, begin: -3, halo: 5.6, core: 2.3, gold: "#ffcf4d" },
    { spread: 0.60, phase: 1.7, t: 0.72, baseOp: 0.48, dur: 18.5, begin: -11, halo: 4.8, core: 2.0, gold: "#ffdd74" },
    { spread: 0.95, phase: 2.9, t: 0.34, baseOp: 0.5, dur: 13.5, begin: -7, halo: 5.2, core: 2.2, gold: "#ffc93a" },
    { spread: 0.50, phase: 4.1, t: 0.92, baseOp: 0.44, dur: 21, begin: -17, halo: 4.4, core: 1.8, gold: "#ffe08a" },
    { spread: 0.75, phase: 5.3, t: 0.50, baseOp: 0.46, dur: 16.5, begin: -5, halo: 5.0, core: 2.1, gold: "#ffd257" },
    { spread: 0.90, phase: 0.9, t: 0.22, baseOp: 0.50, dur: 14.5, begin: -9, halo: 5.2, core: 2.2, gold: "#ffd257" },
    { spread: 0.65, phase: 3.6, t: 0.60, baseOp: 0.46, dur: 19, begin: -14, halo: 4.6, core: 1.9, gold: "#ffdd74" },
    { spread: 0.55, phase: 2.2, t: 0.44, baseOp: 0.44, dur: 17, begin: -2, halo: 4.4, core: 1.8, gold: "#ffcf4d" },
    { spread: 0.80, phase: 5.9, t: 0.82, baseOp: 0.48, dur: 12.5, begin: -6.5, halo: 5.0, core: 2.1, gold: "#ffc93a" },
  ];
  // More motes at higher fill (≈4 at 15% → 9 at 100%).
  const moteCount = clamp(Math.round(3 + (fill / 100) * 6), 3, motesPool.length);
  const motes = motesPool.slice(0, moteCount);

  // Per-bulb random starting-phase offsets so no two bulbs swirl alike.
  const rng = mulberry32(hashString(uid));
  const phaseOffsets = motesPool.map(() => rng() * Math.PI * 2);

  // Band the motes occupy: from just above the bottom up to the middle of the
  // current fill height — so they always stay inside the liquid. A little
  // margin below the surface keeps the halos from poking through.
  const moteBottomY = innerBottom - 6;
  const moteTopY = Math.max((surfaceY + innerBottom) / 2, surfaceY + 12);
  const moteVis = 0.85 + clamp((fill - 15) / 85, 0, 1) * 0.6;

  return (
    <div
      className={[styles.wrapper, className].filter(Boolean).join(" ")}
      style={
        {
          width: size,
          height: size,
          ["--flow-amp" as any]: `${flowAmp}px`,
          ["--flow-dur-a" as any]: flowDurA,
          ["--flow-dur-b" as any]: flowDurB,
          ["--magic-glow" as any]: palette.glow,
        } as React.CSSProperties
      }
      role="img"
      aria-label={`${label}: ${Math.round(fill)}%`}
    >
      <svg viewBox="0 0 512 512" width="100%" height="100%" className={styles.svg}>
        <defs>
          {/* lens curvature: light at top, dark at bottom */}
          <radialGradient id={ids.glassGrad} cx="50%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#1a2036" stopOpacity="0.9" />
            <stop offset="46%" stopColor="#0b0e1a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#04050a" stopOpacity="1" />
          </radialGradient>

          {/* rim reflection */}
          <radialGradient id={ids.glassRim} cx="50%" cy="50%" r="50%">
            <stop offset="82%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="94%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#aecbff" stopOpacity="0.14" />
          </radialGradient>

          {/* spherical shading: gentle highlight upper-left → shadow toward
              the lower-right & edges, so the whole bulb reads as a 3D sphere */}
          <radialGradient id={ids.sphere} cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="32%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#02030a" stopOpacity="0.55" />
          </radialGradient>

          {/* liquid body: bright near surface → deep at bottom */}
          <linearGradient id={ids.liquidGrad} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.bright} stopOpacity="0.98" />
            <stop offset="24%" stopColor={palette.base} stopOpacity="0.96" />
            <stop offset="70%" stopColor={palette.deep} stopOpacity="0.98" />
            <stop offset="100%" stopColor="#0b0512" stopOpacity="1" />
          </linearGradient>

          {/* darker back-layer liquid */}
          <linearGradient id={ids.liquidBack} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.base} stopOpacity="0.9" />
            <stop offset="60%" stopColor={palette.deep} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#08040f" stopOpacity="1" />
          </linearGradient>

          {/* glow that sits just under the surface */}
          <radialGradient id={ids.surfaceGlow} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={palette.glow} stopOpacity="0.55" />
            <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
          </radialGradient>

          {/* glossy fog: bright at the surface, fading upward */}
          <linearGradient id={ids.fog} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={mixHex(palette.glow, "#ffffff", 0.5)} stopOpacity="0" />
            <stop offset="100%" stopColor={mixHex(palette.glow, "#ffffff", 0.5)} stopOpacity="0.4" />
          </linearGradient>

          <clipPath id={ids.orbClip}>
            <circle cx="256" cy="256" r="176" />
          </clipPath>

          {/* inner flow: animated turbulence displacement */}
          <filter id={ids.flow} x="-35%" y="-35%" width="170%" height="170%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={animated ? "0.012" : "0.009"}
              numOctaves="2"
              seed="7"
              result="noise"
            >
              {animated ? (
                <animate
                  attributeName="baseFrequency"
                  dur="12s"
                  values="0.010;0.016;0.011;0.015;0.010"
                  repeatCount="indefinite"
                />
              ) : null}
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={animated ? 5 + intensity * 4 : 4}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          <filter id={ids.soft} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>

          {/* wide soft blur for the glow around each mote */}
          <filter id={ids.moteGlow} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* ═══════════════════════════════════════════════════ */}
        {/* STEP 1 — GLASS BULB (lens + reflections)            */}
        {/* ═══════════════════════════════════════════════════ */}
        <g clipPath={`url(#${ids.orbClip})`}>
          {/* dark glass base */}
          <circle cx="256" cy="256" r="176" fill="#05060b" />
          <circle cx="256" cy="256" r="176" fill={`url(#${ids.glassGrad})`} />

          {/* faint starfield in the empty region */}
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dfe9ff" opacity={s.o} />
          ))}
        </g>

        {/* ═══════════════════════════════════════════════════ */}
        {/* STEP 2 — LIQUID (fill + left-right flow + inner flow)*/}
        {/* ═══════════════════════════════════════════════════ */}
        {fill > 0 && (
          <g clipPath={`url(#${ids.orbClip})`}>
            <g filter={`url(#${ids.flow})`}>
              {/* back wave — scrolls one way */}
              <path
                className={animated ? styles.flowB : undefined}
                d={buildWave(surfaceY + 6, ampBack, WAVELENGTH, Math.PI, WX0, WX1, BOTTOM)}
                fill={`url(#${ids.liquidBack})`}
                opacity="0.85"
              />

              {/* front wave — scrolls the other way */}
              <path
                className={animated ? styles.flowA : undefined}
                d={buildWave(surfaceY, ampFront, WAVELENGTH, 0, WX0, WX1, BOTTOM)}
                fill={`url(#${ids.liquidGrad})`}
              />
            </g>

            {/* golden motes orbiting a vertical axis — the liquid slowly
                rotating in itself. Blurred glow + halo + sharp shiny core.
                The group fades in shortly after load to avoid a bright flash. */}
            {animated && (
              <g opacity="0">
                <animate
                  attributeName="opacity"
                  values="0;1"
                  dur="1.6s"
                  begin="0.3s"
                  fill="freeze"
                />
                {motes.map((m, i) => {
                  const y = lerp(moteBottomY, moteTopY, m.t);
                  // available half-width of the glass at this height
                  const halfWidth = Math.sqrt(Math.max(0, 176 * 176 - (y - 256) ** 2));
                  // orbit radius scales with width; keep the halo inside the glass
                  const orbitR = Math.max(6, m.spread * (halfWidth - m.halo - 5));
                  const a = moteAnim(orbitR, m.phase + phaseOffsets[i], m.baseOp * moteVis);
                  return (
                    <g key={i}>
                      <animateTransform
                        attributeName="transform"
                        type="translate"
                        values={a.x}
                        dur={`${m.dur}s`}
                        begin={`${m.begin}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values={a.o}
                        dur={`${m.dur}s`}
                        begin={`${m.begin}s`}
                        repeatCount="indefinite"
                      />
                      {/* wide soft glow around the mote */}
                      <circle
                        cx={256}
                        cy={y}
                        r={m.halo * 2}
                        fill={m.gold}
                        opacity="0.3"
                        filter={`url(#${ids.moteGlow})`}
                      />
                      {/* blurred golden halo */}
                      <circle
                        cx={256}
                        cy={y}
                        r={m.halo}
                        fill={m.gold}
                        opacity="0.6"
                        filter={`url(#${ids.soft})`}
                      />
                      {/* shiny core */}
                      <circle cx={256} cy={y} r={m.core} fill="#fff6d2" />
                    </g>
                  );
                })}
              </g>
            )}

            {/* glow pooled just beneath the surface */}
            <ellipse
              cx="256"
              cy={surfaceY + 40}
              rx="150"
              ry={60 + intensity * 20}
              fill={`url(#${ids.surfaceGlow})`}
              opacity={0.4 + intensity * 0.3}
              filter={`url(#${ids.soft})`}
            />

            {/* glossy fog hovering just above the surface */}
            <path
              className={animated ? styles.flowA : undefined}
              d={
                buildWave(surfaceY, ampFront, WAVELENGTH, 0, WX0, WX1) +
                ` L ${WX1} ${surfaceY - (34 + intensity * 12)} L ${WX0} ${surfaceY - (34 + intensity * 12)} Z`
              }
              fill={`url(#${ids.fog})`}
              opacity={0.6}
              filter={`url(#${ids.soft})`}
            />

            {/* ── glossy illuminated surface (scrolls with the front wave) ── */}
            {/* soft wide glow bloom sitting on the surface */}
            <path
              className={animated ? styles.flowA : undefined}
              d={buildWave(surfaceY, ampFront, WAVELENGTH, 0, WX0, WX1)}
              fill="none"
              stroke={palette.glow}
              strokeOpacity={0.5 + intensity * 0.3}
              strokeWidth="9"
              strokeLinecap="round"
              filter={`url(#${ids.soft})`}
            />
            {/* main coloured glow line */}
            <path
              className={animated ? styles.flowA : undefined}
              d={buildWave(surfaceY, ampFront, WAVELENGTH, 0, WX0, WX1)}
              fill="none"
              stroke={palette.glow}
              strokeOpacity={0.7 + intensity * 0.3}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* bright white gloss core */}
            <path
              className={animated ? styles.flowA : undefined}
              d={buildWave(surfaceY, ampFront, WAVELENGTH, 0, WX0, WX1)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.85}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* thin specular sheen just above the surface */}
            <path
              className={animated ? styles.flowA : undefined}
              d={buildWave(surfaceY - 3, ampFront, WAVELENGTH, 0, WX0, WX1)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.3 + intensity * 0.2}
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* GLASS OVER-LAYER — reflections sit on top of liquid */}
        {/* ═══════════════════════════════════════════════════ */}
        <g clipPath={`url(#${ids.orbClip})`}>
          {/* spherical shading over the whole bulb for a 3D rounded feel */}
          <circle
            cx="256"
            cy="256"
            r="176"
            fill={`url(#${ids.sphere})`}
            pointerEvents="none"
          />

          {/* soft top-left highlight */}
          <ellipse
            cx="188"
            cy="158"
            rx="82"
            ry="132"
            fill="#ffffff"
            opacity="0.05"
            transform="rotate(-18 188 158)"
          />
          {/* bright specular streak */}
          <path
            d="M 150 118 C 178 96, 214 82, 254 78"
            stroke="#ffffff"
            strokeOpacity="0.16"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          {/* small secondary glint */}
          <circle cx="196" cy="140" r="4" fill="#ffffff" opacity="0.18" />

          {/* rim reflection */}
          <circle cx="256" cy="256" r="176" fill={`url(#${ids.glassRim})`} />

          {/* percent readout */}
          {showPercent && (
            <text
              x="256"
              y="366"
              textAnchor="middle"
              className={styles.percent}
              fill="#ffffff"
            >
              {Math.round(fill)}%
            </text>
          )}
        </g>

        {/* crisp outer edge */}
        <circle
          cx="256"
          cy="256"
          r="176"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
