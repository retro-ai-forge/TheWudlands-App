"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Props = {
  src: string;
  alt: string;
};

export default function ClickableImage({ src, alt }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={styles.sectionImage}
        style={{ cursor: "zoom-in" }}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div className={styles.lightboxOverlay} onClick={() => setOpen(false)}>
          <img
            src={src}
            alt={alt}
            className={styles.lightboxImg}
            style={{ cursor: "zoom-out" }}
          />
        </div>
      )}
    </>
  );
}
