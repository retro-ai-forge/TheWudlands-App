"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./SoulCreation.module.css";
import { GENDERS, racesByCategory, professionsByCategory } from "@/app/lib/characterOptions";

const PAGE_COUNT = 4;

export function SoulCreation({ onExit }: { onExit: () => void }) {
  const [page, setPage] = useState(0);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [race, setRace] = useState("");
  const [gender, setGender] = useState("");
  const [profession1, setProfession1] = useState("");
  const [profession2, setProfession2] = useState("");
  const [profession3, setProfession3] = useState("");

  // Starting age drives how many profession slots are unlocked: under 30 the
  // character has only had time to learn one trade, 30–42 two, 43+ three.
  const [char_age] = useState(28);
  const activeProfessionCount = char_age >= 43 ? 3 : char_age >= 30 ? 2 : 1;

  const isLastPage = page === PAGE_COUNT - 1;

  // The wizard is a fixed full-viewport overlay, but the page behind it
  // (header + welcomeScreen + footer) can still exceed 100vh and scroll
  // underneath it. Some browsers scroll the html element rather than body,
  // so both need to be locked while the wizard is mounted.
  useEffect(() => {
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  function handleContinue() {
    if (isLastPage) {
      onExit();
    } else {
      setPage((p) => p + 1);
    }
  }

  return (
    <div className={styles.wizard}>
      <div className={page === 1 ? `${styles.content} ${styles.contentTop}` : styles.content}>
        {page === 0 ? (
          <>
            <h1 className={styles.headline}>Shaping forces</h1>
            <p className={styles.introText}>
              Every character is shaped by three forces. Body and Soul share one reserve of points —
              strengthen one, and the other yields — those points will be distributed across your attributes.
            </p>

            <div className={styles.attributeRow}>
              <div className={styles.attributeItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.attributeIcon}
                  src="/images/soul-creation/equilize-body.png"
                  alt="Body"
                />
                <span className={styles.attributeLabel}>Body</span>
              </div>
              <div className={styles.attributeItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.attributeIcon}
                  src="/images/soul-creation/equilize-soul.png"
                  alt="Soul"
                />
                <span className={styles.attributeLabel}>Soul</span>
              </div>
              <div className={styles.attributeItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.attributeIcon}
                  src="/images/soul-creation/equilize-life.png"
                  alt="Life"
                />
                <span className={styles.attributeLabel}>Life</span>
              </div>
            </div>

            <p className={styles.introText}>
              Life Energy sets that reserve&apos;s size — more Energy means more points, but rises your starting age. Body and Soul each range from 5–100;
            </p>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.middleIllustration}
              src="/images/soul-creation/equilize-middle-illu.png"
              alt="The mystic triangle"
            />

            <p className={styles.introText}>
              Click continue to activate the mystic triangle to balance Body, Soul, and Life Energy.
            </p>

          </>
        ) : page === 1 ? (
          <>
            <h1 className={styles.headline}>Foundation</h1>
            <p className={styles.introText}>
              Select your{" "}
              <Link href="/characters" className={styles.inlineLink}>origins</Link>{" "}
              and shape your soul.
            </p>
            <div className={styles.nameRow}>
              <input
                className={styles.textInput}
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                className={styles.textInput}
                type="text"
                placeholder="Surname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </>
        ) : (
          <h1 className={styles.headline}>Page {page + 1}</h1>
        )}
      </div>

      {page === 1 && (
        <div className={styles.triangleGroup}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.medallion} ${styles.medallionBody}`}
            src="/images/soul-creation/equilize-body.png"
            alt="Body"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.medallion} ${styles.medallionSoul}`}
            src="/images/soul-creation/equilize-soul.png"
            alt="Soul"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={`${styles.medallion} ${styles.medallionLife}`}
            src="/images/soul-creation/equilize-life.png"
            alt="Life"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.triangleImg}
            src="/images/soul-creation/equilize-triangle.png"
            alt=""
          />

          <div className={styles.sideSelectsLeft}>
            <select
              className={styles.comboBox}
              value={race}
              onChange={(e) => setRace(e.target.value)}
            >
              <option value="" disabled>Race</option>
              {Object.entries(racesByCategory).map(([category, races]) => (
                <optgroup key={category} label={category}>
                  {races.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              className={styles.comboBox}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="" disabled>Gender</option>
              {GENDERS.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {page === 1 && (
        <div className={styles.sideSelectsRight}>
          <select
            className={styles.comboBox}
            disabled={activeProfessionCount < 1}
            value={profession1}
            onChange={(e) => setProfession1(e.target.value)}
          >
            <option value="" disabled>Profession 1</option>
            {Object.entries(professionsByCategory).map(([category, professions]) => (
              <optgroup key={category} label={category}>
                {professions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className={styles.comboBox}
            disabled={activeProfessionCount < 2}
            value={profession2}
            onChange={(e) => setProfession2(e.target.value)}
          >
            <option value="" disabled>Profession 2</option>
            {Object.entries(professionsByCategory).map(([category, professions]) => (
              <optgroup key={category} label={category}>
                {professions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className={styles.comboBox}
            disabled={activeProfessionCount < 3}
            value={profession3}
            onChange={(e) => setProfession3(e.target.value)}
          >
            <option value="" disabled>Profession 3</option>
            {Object.entries(professionsByCategory).map(([category, professions]) => (
              <optgroup key={category} label={category}>
                {professions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <button className={`${styles.navButton} ${styles.continue}`} onClick={handleContinue}>
        Continue
      </button>
    </div>
  );
}
