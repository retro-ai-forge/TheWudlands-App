"use client";

import { useState } from "react";
import styles from "./page.module.css";

const IMAGES = [
  "css-dragonstairs.jpg",
  "css-dungeonstairs.jpg",
  "css-ice.jpg",
  "css-lady.jpg",
  "css-largetree.jpg",
  "css-market.jpg",
  "css-oasis.jpg",
  "css-pub.jpg",
  "css-rainy.jpg",
  "css-ship.jpg",
  "css-tomb.jpg",
  "css-wanderer.jpg",
];

type SetConfig = {
  name: string;
  meta: string;
  filter?: string;
  transform?: string;
  animClass?: keyof typeof styles;
  lightboxAnimClass?: keyof typeof styles;
  overlay?: keyof typeof styles;
};

const SETS: SetConfig[] = [
  // ── Original ──────────────────────────────────────────
  {
    name: "Original",
    meta: "no filter applied",
  },
  {
    name: "MirrorH",
    meta: "css transform scaleX(-1)",
    transform: "scaleX(-1)",
  },
  {
    name: "MirrorV",
    meta: "css transform scale(-1)",
    transform: "scaleY(-1)",
  },
  // ── Brightness / Darkness ─────────────────────────────
  {
    name: "Darkened",
    meta: "css brightness(0.55)",
    filter: "brightness(0.55)",
  },
  {
    name: "PitchBlack",
    meta: "css brightness(0.35) contrast(1.2)",
    filter: "brightness(0.35) contrast(1.2)",
  },
  {
    name: "Bright",
    meta: "css brightness(1.3) saturate(1.2)",
    filter: "brightness(1.3) saturate(1.2)",
  },
  // ── Colour Shifts ─────────────────────────────────────
  {
    name: "Blackwhite",
    meta: "css grayscale(1)",
    filter: "grayscale(1)",
  },
  {
    name: "Vintage",
    meta: "css sepia(0.55) contrast(1.1)",
    filter: "sepia(0.55) contrast(1.1)",
  },
  {
    name: "DeepSepia",
    meta: "css sepia(1) contrast(1.2)",
    filter: "sepia(1) contrast(1.2)",
  },
  {
    name: "Cold",
    meta: "css hue-rotate(200deg) saturate(0.7) brightness(0.9)",
    filter: "hue-rotate(200deg) saturate(0.7) brightness(0.9)",
  },
  {
    name: "Moonlight",
    meta: "css hue-rotate(220deg) brightness(0.75) saturate(0.4) contrast(1.3)",
    filter: "hue-rotate(220deg) brightness(0.75) saturate(0.4) contrast(1.3)",
  },
  {
    name: "Crimson",
    meta: "css sepia(1) hue-rotate(-50deg) saturate(3) brightness(0.8)",
    filter: "sepia(1) hue-rotate(-50deg) saturate(3) brightness(0.8)",
  },
  {
    name: "Copper",
    meta: "css sepia(1) hue-rotate(330deg) saturate(2.5) brightness(0.85)",
    filter: "sepia(1) hue-rotate(330deg) saturate(2.5) brightness(0.85)",
  },
  {
    name: "DeepOcean",
    meta: "css hue-rotate(180deg) saturate(1.8) brightness(0.8) contrast(1.2)",
    filter: "hue-rotate(180deg) saturate(1.8) brightness(0.8) contrast(1.2)",
  },
  {
    name: "Poison",
    meta: "css hue-rotate(90deg) saturate(1.5) brightness(0.8)",
    filter: "hue-rotate(90deg) saturate(1.5) brightness(0.8)",
  },
  {
    name: "Infrared",
    meta: "css hue-rotate(140deg) saturate(2.5) contrast(1.2) brightness(0.9)",
    filter: "hue-rotate(140deg) saturate(2.5) contrast(1.2) brightness(0.9)",
  },
  {
    name: "GoldenHour",
    meta: "css sepia(0.4) saturate(2.5) brightness(1.15) hue-rotate(350deg)",
    filter: "sepia(0.4) saturate(2.5) brightness(1.15) hue-rotate(350deg)",
  },
  // ── Contrast / Extremes ───────────────────────────────
  {
    name: "Apocalypse",
    meta: "css sepia(0.9) contrast(1.6) brightness(0.65)",
    filter: "sepia(0.9) contrast(1.6) brightness(0.65)",
  },
  {
    name: "NeonSurge",
    meta: "css brightness(1.5) contrast(2.5) saturate(4)",
    filter: "brightness(1.5) contrast(2.5) saturate(4)",
  },
  {
    name: "Inverted",
    meta: "css invert(1)",
    filter: "invert(1)",
  },
  {
    name: "XRay",
    meta: "css invert(1) grayscale(1) contrast(1.15) brightness(1.05)",
    filter: "invert(1) grayscale(1) contrast(1.15) brightness(1.05)",
  },
  // ── Animated sets ─────────────────────────────────────
  {
    name: "Emerge",
    meta: "looping preview but one-time ingame, animation — brightness(0) → brightness(1)",
    animClass: "animEmerge",
    lightboxAnimClass: "animEmergeOnce",
  },
  {
    name: "ColorPulse",
    meta: "animation — grayscale ↔ full colour, 6s cycle",
    animClass: "animPulse",
  },
  {
    name: "Heat",
    meta: "animation — hue shift + saturation pulse, 2s cycle",
    animClass: "animHeat",
  },
  // ── Overlay sets ─────────────────────────────────────
  {
    name: "Fog",
    meta: "overlay — radial mist veil + brightness(1.1) contrast(0.72) saturate(0.55)",
    filter: "brightness(1.1) contrast(0.72) saturate(0.55)",
    overlay: "overlayFog",
  },
  {
    name: "Rain",
    meta: "overlay — animated diagonal rain streaks + brightness(0.8) saturate(0.65)",
    filter: "brightness(0.8) saturate(0.65)",
    overlay: "overlayRain",
  },
  {
    name: "Snow",
    meta: "overlay — animated falling snowflakes + brightness(0.95) saturate(0.8)",
    filter: "brightness(0.95) saturate(0.8)",
    overlay: "overlaySnow",
  },
  {
    name: "Lightning",
    meta: "overlay — periodic lightning flashes, overexpose and fade",
    overlay: "overlayLightning",
  },
  {
    name: "Scanlines",
    meta: "overlay — horizontal scanlines every 5px",
    overlay: "overlayScanlines",
  },
  {
    name: "ScanlinesDark",
    meta: "overlay scanlines + css brightness(0.5)",
    filter: "brightness(0.5)",
    overlay: "overlayScanlines",
  },
  {
    name: "VerticalStrips",
    meta: "overlay — vertical strips every 7px",
    overlay: "overlayStrips",
  },
  {
    name: "Drunk",
    meta: "css blur(0.6px) brightness(1.15) saturate(1.4) contrast(0.85)",
    filter: "blur(0.6px) brightness(1.15) saturate(1.4) contrast(0.85)",
    animClass: "animDrunk",
  },
  {
    name: "Flicker",
    meta: "warning in adventure description required, animation — erratic brightness flicker",
    animClass: "animFlicker",
  },
];

export default function ImageGallery() {
  const [lightbox, setLightbox] = useState<{ src: string; filter?: string; transform?: string; overlay?: keyof typeof styles; animClass?: keyof typeof styles; lightboxAnimClass?: keyof typeof styles } | null>(null);
  const [collapsedSets, setCollapsedSets] = useState<Set<string>>(new Set(SETS.map((s) => s.name)));
  const [expandAll, setExpandAll] = useState(false);

  const toggleSet = (setName: string) => {
    const newCollapsed = new Set(collapsedSets);
    if (newCollapsed.has(setName)) {
      newCollapsed.delete(setName);
    } else {
      newCollapsed.add(setName);
    }
    setCollapsedSets(newCollapsed);
  };

  const handleExpandAll = () => {
    setExpandAll(!expandAll);
  };

  return (
    <div className={styles.previewSection}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={handleExpandAll}
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "#1a1a1a",
            color: "#d4c9a8",
            border: "2px solid #7a6a3a",
            cursor: "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#7a6a3a";
            e.currentTarget.style.color = "#0a0a0a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#d4c9a8";
          }}
        >
          {expandAll ? "[ HIDE IMAGE STYLES ]" : "[ VIEW IMAGE STYLES ]"}
        </button>
      </div>

      {SETS.map((set) => (
        <div key={set.name} className={styles.previewSet} style={{ display: expandAll ? "block" : "none" }}>
          <button
            onClick={() => toggleSet(set.name)}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              background: "#0f0f0f",
              color: "#c07a3a",
              border: "1px solid #7a6a3a",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              marginBottom: collapsedSets.has(set.name) ? "0" : "1rem",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1a1208";
              e.currentTarget.style.borderColor = "#c07a3a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#0f0f0f";
              e.currentTarget.style.borderColor = "#7a6a3a";
            }}
          >
            <span style={{ marginRight: "0.5rem", fontSize: "0.8rem" }}>
              {(expandAll || !collapsedSets.has(set.name)) ? "▼" : "▶"}
            </span>
            <span style={{ fontSize: "0.9rem", letterSpacing: "0.12em" }}>{set.name}</span>
          </button>

          <div className={styles.previewGrid} style={{ display: collapsedSets.has(set.name) ? "none" : "grid" }}>
            {IMAGES.map((img) => {
              const src = `/images/preview-css/${img}`;
              const alt = img.replace("css-", "").replace(/\.(jpg|webp)$/, "");
              const imgStyle: React.CSSProperties = {
                cursor: "pointer",
                ...(set.filter    && { filter:    set.filter }),
                ...(set.transform && { transform: set.transform }),
              };
              const imgClass = [
                styles.previewImg,
                set.animClass ? styles[set.animClass] : "",
              ].filter(Boolean).join(" ");

              const img_el = (
                <img
                  key={img}
                  src={src}
                  alt={alt}
                  className={imgClass}
                  style={imgStyle}
                  onClick={() => setLightbox({ src, filter: set.filter, transform: set.transform, animClass: set.animClass, lightboxAnimClass: set.lightboxAnimClass })}
                />
              );

              return set.overlay ? (
                <div
                  key={img}
                  className={[styles.previewImgWrapper, styles[set.overlay]].join(" ")}
                  onClick={() => setLightbox({ src, filter: set.filter, transform: set.transform, overlay: set.overlay, animClass: set.animClass, lightboxAnimClass: set.lightboxAnimClass })}
                >
                  <img
                    src={src}
                    alt={alt}
                    className={imgClass}
                    style={{ ...imgStyle, cursor: "pointer" }}
                  />
                </div>
              ) : img_el;
            })}
          </div>
        </div>
      ))}

      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          {(() => {
            const lbAnimClass = lightbox.lightboxAnimClass ?? lightbox.animClass;
            const lbClass = [styles.lightboxImg, lbAnimClass ? styles[lbAnimClass] : ""].filter(Boolean).join(" ");
            const lbStyle: React.CSSProperties = {
              ...(lightbox.filter    && { filter:    lightbox.filter }),
              ...(lightbox.transform && { transform: lightbox.transform }),
            };
            return lightbox.overlay ? (
              <div className={[styles.lightboxImgWrapper, styles[lightbox.overlay]].join(" ")}>
                <img src={lightbox.src} alt="enlarged preview" className={lbClass} style={lbStyle} />
              </div>
            ) : (
              <img src={lightbox.src} alt="enlarged preview" className={lbClass} style={lbStyle} />
            );
          })()}
        </div>
      )}
    </div>
  );
}
