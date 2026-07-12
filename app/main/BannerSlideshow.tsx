"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

const SLIDES = [
  "/images/banner/slide00.jpg",
  "/images/banner/slide01.jpg",
  "/images/banner/slide02.jpg",
  "/images/banner/slide03.jpg",
  "/images/banner/slide04.jpg",
  "/images/banner/slide05.jpg",
  "/images/banner/slide06.jpg",
  "/images/banner/slide07.jpg",
  "/images/banner/slide08.jpg",
  "/images/banner/slide09.jpg",
  "/images/banner/slide10.jpg",
  "/images/banner/slide11.jpg",
  "/images/banner/slide12.jpg",
  "/images/banner/slide13.jpg",
  "/images/banner/slide14.jpg",
  "/images/banner/slide15.jpg",
  "/images/banner/slide16.jpg",
  "/images/banner/slide17.jpg",
  "/images/banner/slide18.jpg",
  "/images/banner/slide19.jpg",
  "/images/banner/slide20.jpg",
  "/images/banner/slide21.jpg",
  "/images/banner/slide22.jpg",
  "/images/banner/slide23.jpg",
];

export default function BannerSlideshow() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.slideshow}>
      {SLIDES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          className={`${styles.slide} ${i === index ? styles.slideActive : ""}`}
        />
      ))}
      <div className={styles.slideshowOverlay} />
    </div>
  );
}
