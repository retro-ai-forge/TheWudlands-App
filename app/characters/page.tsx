"use client";

import { useState, useEffect } from "react";
import styles from "./characters.module.css";
import GlassMagicBulb from "@/app/main/GlassMagicBulb";
import { GENDERS, racesByCategory, professionsByCategory } from "@/app/lib/characterOptions";

export default function Characters() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openRaceCategory, setOpenRaceCategory] = useState<string | null>(null);
  const [openProfessionCategory, setOpenProfessionCategory] = useState<string | null>(null);
  const [openGender, setOpenGender] = useState<string | null>(null);

  // Temporary Magic Bulb playground controls (top-left bulb)
  const [demoColor, setDemoColor] = useState("#a3c62d");
  const [demoFill, setDemoFill] = useState(50);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "race") {
      setOpenSection("race");
      setTimeout(() => {
        const element = document.getElementById("race");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, []);

  const toggleSection = (id: string) => {
    setOpenSection(prev => (prev === id ? null : id));
  };

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.title}>[ Origins ]</p>
        <p className={styles.divider}>— — — — — — — — — — — — — — — — —</p>
      </header>

      <section className={styles.intro}>
        <p className={styles.introText}>
          You were born into the Wudlands with bare hands. Your blood marks
          you — the race that flows through your veins. Your upbringing shaped
          you — the stone you broke, the words you wrote, the apprenticeships
          you served, the trade your hands learned. This is who you are, before
          the road.
        </p>
        <p className={styles.introText}>
          A class is not something you are born with. A blacksmith master
          notices the way your hands know iron. A guild recognizes the cut of
          your work. A mentor sees something worth teaching. This is how you
          become more than you were.
        </p>
      </section>

      {/* ── TEMPORARY: Glass Magic Bulb Testing ─────────────────────────────────────────── */}
      <section style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.9rem", color: "#c07a3a", marginBottom: "1.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Glass Magic Bulb (Temporary Test)
        </p>
        {/* top row — 2 */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "2rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ position: "relative", width: 240, height: 240 }}>
              <GlassMagicBulb fillPercent={demoFill} color={demoColor} size={240} showPercent={false} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/character/frame-lens-nr-plate.png" alt="" aria-hidden="true"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", transform: "translate(-1px, 5px)" }} />
              {/* percent shown on the frame's name plate */}
              <div style={{ position: "absolute", left: "3%", right: 0, top: "91.0%", transform: "translateY(-50%)", textAlign: "center", pointerEvents: "none", fontFamily: 'Georgia, "Times New Roman", serif', fontSize: "18px", fontWeight: 600, letterSpacing: "0.06em", color: "#1a1008", textShadow: "0 0 6px rgba(255,240,200,1), 0 0 14px rgba(255,240,200,0.85)" }}>
                {demoFill}%
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "left" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#a89968" }}>
                Color
                <input
                  type="color"
                  value={demoColor}
                  onChange={(e) => setDemoColor(e.target.value)}
                  style={{ width: "56px", height: "32px", padding: 0, border: "1px solid #3a3020", background: "#0a0a0a", cursor: "pointer" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#a89968" }}>
                Fill %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={demoFill}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDemoFill(Number.isNaN(v) ? 0 : Math.max(0, Math.min(100, v)));
                  }}
                  style={{ width: "80px", padding: "0.35rem 0.5rem", border: "1px solid #3a3020", background: "#0a0a0a", color: "#ead9b0", fontSize: "0.9rem" }}
                />
              </label>
            </div>
          </div>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            <GlassMagicBulb fillPercent={50} color="#8b5cf6" size={240} showPercent={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/character/frame-lens-nr-plate-dark.png" alt="" aria-hidden="true"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", transform: "translate(-1px, 5px)" }} />
            {/* percent shown on the frame's name plate */}
            <div style={{ position: "absolute", left: "3%", right: 0, top: "91.0%", transform: "translateY(-50%)", textAlign: "center", pointerEvents: "none", fontFamily: 'Georgia, "Times New Roman", serif', fontSize: "17px", fontWeight: 600, letterSpacing: "0.06em", color: "#e7c477", textShadow: "0 3px 6px rgba(0,0,0,1), 0 6px 14px rgba(0,0,0,0.85)" }}>
              50%
            </div>
          </div>
        </div>

        {/* middle row — 3, each bulb embedded in an ornate lens frame */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2rem", marginBottom: "2rem" }}>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            <GlassMagicBulb fillPercent={5} color="#a3c62d" size={240} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/character/frame-lens-gold.png" alt="" aria-hidden="true"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          </div>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            <GlassMagicBulb fillPercent={50} color="#8b5cf6" size={240} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/character/frame-lens-silver.png" alt="" aria-hidden="true"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          </div>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            <GlassMagicBulb fillPercent={90} color="#d9c48c" size={240} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/character/frame-lens-chrome.png" alt="" aria-hidden="true"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          </div>
        </div>

        {/* below row — 2 */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2rem" }}>
          <GlassMagicBulb fillPercent={5} color="#ff7a1f" size={240} />
          <GlassMagicBulb fillPercent={95} color="#1e6b34" size={240} />
        </div>
      </section>
      {/* ── END TEMPORARY TESTING ─────────────────────────────────────────── */}

      <div className={styles.panels}>
        <div className={styles.panel}>
          <p className={styles.panelLabel}>Foundation</p>
          <p className={styles.panelTitle}>Race</p>
          <p className={styles.panelText}>
            Your race determines your natural aptitudes, resistances, and how
            the world perceives you before you have said a word. It is the
            ground you stand on — not a ceiling, but a starting point that
            quietly influences everything else.
          </p>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Background</p>
          <p className={styles.panelTitle}>Former Profession</p>
          <p className={styles.panelText}>
            Before adventure, there was a life. A craft learned, a trade
            practiced, a way of moving through the world. That knowledge does
            not vanish when you pick up a weapon or a travelling cloak — it
            travels with you, shaping what comes naturally and what costs you
            effort.
          </p>
          <p className={styles.panelNote}>
            A former blacksmith still knows how iron behaves. A former herbalist
            still reads the forest floor.
          </p>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Earned in Play</p>
          <p className={styles.panelTitle}>Class</p>
          <p className={styles.panelText}>
            There are no classes at creation. A class is something you grow
            into — discovered in a guild hall, taught by a wandering master,
            or unlocked through deeds that draw the right eyes to you. Until
            then, you are simply who you are.
          </p>
          <p className={styles.panelNote}>
            Seek out teachers, join guilds, find mentors. The path will open.
          </p>
        </div>
      </div>

      <div className={styles.sectionWrap}>

        {/* ── Gender ─────────────────────────────────────────── */}
        <div className={styles.accordionItem}>
          <button
            className={styles.accordionHeader}
            onClick={() => toggleSection("gender")}
          >
            <span>[ Gender ]</span>
            <span className={styles.accordionChevron}>{openSection === "gender" ? "▴" : "▾"}</span>
          </button>
          {openSection === "gender" && (
            <div className={styles.accordionBody}>
              <p className={styles.sectionIntro}>
                Love is not a side note in the Wudlands — it is one of its deepest currents.
                You may lose your heart to a warlord who should be your enemy. A noblewoman
                may risk her title for a single night in your company. A bond forged in
                darkness may outlast every sword and oath. These are not small things.
                They are the moments that define a life in the Wudlands.
                Gender is the key that unlocks them. It is what the world reads before you
                have spoken a word — and what story writers use to craft immersive, believable
                relationships that feel earned. A great love story needs to know who it is written
                for. Most adventures are crafted to welcome <strong>M</strong> and <strong>D</strong>,
                or <strong>F</strong> and <strong>D</strong> alike. Some, rarer ones, are written
                for a single kind. What you carry here shapes every story that reaches for you.
              </p>
              {GENDERS.map((g) => (
                <div key={g.id} className={styles.subAccordionItem}>
                  <button
                    className={styles.subAccordionHeader}
                    onClick={() => setOpenGender(openGender === g.id ? null : g.id)}
                  >
                    <span>{g.symbol} {g.name}</span>
                    <span className={styles.accordionChevron}>{openGender === g.id ? "▴" : "▾"}</span>
                  </button>
                  {openGender === g.id && (
                    <div className={styles.subAccordionBody}>
                      <div className={styles.raceEntry}>
                        <p className={styles.raceDescription}>{g.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Race ───────────────────────────────────────────── */}
        <div className={styles.accordionItem} id="race">
          <button
            className={styles.accordionHeader}
            onClick={() => toggleSection("race")}
          >
            <span>[ Race ]</span>
            <span className={styles.accordionChevron}>{openSection === "race" ? "▴" : "▾"}</span>
          </button>
          {openSection === "race" && (
            <div className={styles.accordionBody}>
              <p className={styles.sectionIntro}>
                Your blood marks you — choose the foundation of who you are.
              </p>
              {Object.entries(racesByCategory).map(([category, races]) => (
                <div key={category} className={styles.subAccordionItem}>
                  <button
                    className={styles.subAccordionHeader}
                    onClick={() => setOpenRaceCategory(openRaceCategory === category ? null : category)}
                  >
                    <span>{category}</span>
                    <span className={styles.accordionChevron}>{openRaceCategory === category ? "▴" : "▾"}</span>
                  </button>
                  {openRaceCategory === category && (
                    <div className={styles.subAccordionBody}>
                      {races.map((race) => (
                        <div key={race.id} className={styles.raceEntry}>
                          <p className={styles.raceName}>{race.name}</p>
                          <p className={styles.raceDescription}>{race.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Profession ─────────────────────────────────────── */}
        <div className={styles.accordionItem}>
          <button
            className={styles.accordionHeader}
            onClick={() => toggleSection("profession")}
          >
            <span>[ Profession ]</span>
            <span className={styles.accordionChevron}>{openSection === "profession" ? "▴" : "▾"}</span>
          </button>
          {openSection === "profession" && (
            <div className={styles.accordionBody}>
              <p className={styles.sectionIntro}>
                Your craft and upbringing shape what comes naturally to you.
              </p>
              {Object.entries(professionsByCategory).map(([category, professions]) => (
                <div key={category} className={styles.subAccordionItem}>
                  <button
                    className={styles.subAccordionHeader}
                    onClick={() => setOpenProfessionCategory(openProfessionCategory === category ? null : category)}
                  >
                    <span>{category}</span>
                    <span className={styles.accordionChevron}>{openProfessionCategory === category ? "▴" : "▾"}</span>
                  </button>
                  {openProfessionCategory === category && (
                    <div className={styles.subAccordionBody}>
                      {professions.map((profession) => (
                        <div key={profession.id} className={styles.raceEntry}>
                          <p className={styles.raceName}>{profession.name}</p>
                          <p className={styles.raceDescription}>{profession.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Classes ────────────────────────────────────────── */}
        <div className={styles.accordionItem}>
          <button
            className={styles.accordionHeader}
            onClick={() => toggleSection("classes")}
          >
            <span>[ Classes ]</span>
            <span className={styles.accordionChevron}>{openSection === "classes" ? "▴" : "▾"}</span>
          </button>
          {openSection === "classes" && (
            <div className={styles.accordionBody}>
              <p className={styles.sectionIntro}>
                A class is not given — it is earned through stories and recognition.
              </p>
              <p className={styles.sectionIntro}>
                You begin with craft. Your hands know stone, or fire, or steel, or words. But craft
                alone does not make you a Master of those hands. A blacksmith swinging a hammer for thirty
                years is still a blacksmith. A farmer tilling the same fields their whole life is still
                a farmer. To reach a class—Paladin, Ranger, Rogue, Cleric—you need something more than
                skill. You need <strong>a story that recognizes your growth.</strong>
              </p>
              <p className={styles.sectionIntro}>
                Every class begins when someone notices you. A guild master sees the way you move.
                A wandering mentor hears your name in taverns and comes looking. A god or calling
                speaks and you answer. But being noticed requires a story. Without stories woven into
                the Wudlands — without <strong>story writers and narrators building the world
                around you</strong> — no one ever notices. No guilds exist to find you. No mentors
                come. No miracles happen. You remain what you were at birth: skilled hands,
                capable mind, a person living a life.
              </p>
              <p className={styles.sectionIntro}>
                The path to mastery requires doors to open. And doors only open when someone writes
                them. This is why we need story writers. Without them, there are only craftspeople,
                not classes. Without narrative, there is only skill, not destiny. Your journey to
                something greater depends on the world choosing to witness it, and that choice
                belongs to those who tell the stories the Wudlands lives by.
              </p>
            </div>
          )}
        </div>

      </div>

      <p className={styles.footer}>— character creation in beta 1.0 —</p>
    </main>
  );
}
