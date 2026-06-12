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
    name: "Pitch Black",
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
    name: "Deep Sepia",
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
    name: "Deep Ocean",
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
    name: "Golden Hour",
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
    name: "Neon Surge",
    meta: "css brightness(1.5) contrast(2.5) saturate(4)",
    filter: "brightness(1.5) contrast(2.5) saturate(4)",
  },
  {
    name: "Inverted",
    meta: "css invert(1)",
    filter: "invert(1)",
  },
  {
    name: "X-Ray",
    meta: "css invert(1) grayscale(1) contrast(1.15) brightness(1.05)",
    filter: "invert(1) grayscale(1) contrast(1.15) brightness(1.05)",
  },
  {
    name: "Dream",
    meta: "css blur(0.8px) brightness(1.15) saturate(1.4) contrast(0.85)",
    filter: "blur(0.8px) brightness(1.15) saturate(1.4) contrast(0.85)",
  },
  // ── Overlay sets ─────────────────────────────────────
  {
    name: "Scanlines",
    meta: "overlay — horizontal scanlines every 5px",
    overlay: "overlayScanlines",
  },
  {
    name: "Scanlines Dark",
    meta: "overlay scanlines + css brightness(0.5)",
    filter: "brightness(0.5)",
    overlay: "overlayScanlines",
  },
  {
    name: "Vertical Strips",
    meta: "overlay — vertical strips every 7px",
    overlay: "overlayStrips",
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
    name: "Flicker",
    meta: "warning in adventure description required, animation — erratic brightness flicker",
    animClass: "animFlicker",
  },
  {
    name: "Heat",
    meta: "animation — hue shift + saturation pulse, 2s cycle",
    animClass: "animHeat",
  },
];

export default function ImageGallery() {
  const [lightbox, setLightbox] = useState<{ src: string; filter?: string; transform?: string; overlay?: keyof typeof styles; animClass?: keyof typeof styles; lightboxAnimClass?: keyof typeof styles } | null>(null);

  return (
    <div className={styles.previewSection}>
      {SETS.map((set) => (
        <div key={set.name} className={styles.previewSet}>
          <p className={styles.previewSetTitle}>{set.name}</p>
          <p className={styles.previewSetMeta}>({set.meta})</p>

          <div className={styles.previewGrid}>
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
