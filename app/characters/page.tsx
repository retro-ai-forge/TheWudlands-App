"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import styles from "./characters.module.css";
import { GENDERS, racesByCategory, professionsByCategory, BODY_ATTRIBUTES, SOUL_ATTRIBUTES } from "@/app/lib/characterOptions";

// GET /api/auth/blueprint-categories - lore/reference data, not player-specific:
// every profession category's tool and item blueprint families (tiers 1-3).
type BlueprintCategoryItem = { id: string; name: string; tier: number; isBasic: boolean };
type BlueprintCategoryFamily = { familyId: string; kind: string; items: BlueprintCategoryItem[] };
type BlueprintCategoryEntry = { category: string; families: BlueprintCategoryFamily[] };

function getTierIndicator(tier: number): string {
  if (tier >= 4) {
    return "✨".repeat(tier - 3);
  }
  return "○".repeat(tier);
}

function getKindIcon(kind: string): string {
  switch (kind) {
    case "tool":
      return "🔧";
    case "weapon":
    case "armor":
    case "shield":
    case "equipment":
      return "📦";
    default:
      return "";
  }
}

// Past 19 letters a line (including its "T1:"/"S:" label, always 4 chars)
// gets crowded - if the display name's last word just repeats the family
// headline above it (e.g. "Master Butcher's Bangers" under the "bangers"
// family) or its kind badge (e.g. "Beetle Chitin Armor" under "ARMOR"), drop
// that word instead of wrapping.
function trimRedundantLastWord(
  label: string,
  displayName: string,
  familyHeadline: string,
  kind: string
): string {
  const lineLength = `${label}: ${displayName}`.length;
  if (lineLength <= 19) return displayName;
  const words = displayName.split(" ");
  const lastWord = words[words.length - 1].toLowerCase();
  const headlineWords = familyHeadline.toLowerCase().split(" ");
  const headlineLastWord = headlineWords[headlineWords.length - 1];
  const redundantWords = new Set([headlineLastWord, `${headlineLastWord}s`, kind.toLowerCase(), `${kind.toLowerCase()}s`]);
  if (!redundantWords.has(lastWord)) return displayName;
  const trimmed = words.slice(0, -1);
  const danglingConnectors = new Set(["of", "&", "and", "reinforced"]);
  while (danglingConnectors.has(trimmed[trimmed.length - 1]?.toLowerCase())) trimmed.pop();
  return trimmed.join(" ");
}

export default function Characters() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openRaceCategory, setOpenRaceCategory] = useState<string | null>(null);
  const [openProfessionCategory, setOpenProfessionCategory] = useState<string | null>(null);
  const [openAttributeCategory, setOpenAttributeCategory] = useState<string | null>(null);
  const [openGender, setOpenGender] = useState<string | null>(null);
  const [openBlueprintCategory, setOpenBlueprintCategory] = useState<string | null>(null);
  const [blueprintCategories, setBlueprintCategories] = useState<BlueprintCategoryEntry[]>([]);

  useEffect(() => {
    fetch("/api/auth/blueprint-categories")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BlueprintCategoryEntry[]) => setBlueprintCategories(data ?? []))
      .catch(() => setBlueprintCategories([]));
  }, []);

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
        <Image
          src="/images/character/char_placeholder_silhouette.png"
          alt="A placeholder silhouette of your character"
          width={500}
          height={750}
          className={styles.introImage}
        />
        <p className={styles.introText}>
          A class is not something you are born with. A blacksmith master
          notices the way your hands know iron. A guild recognizes the cut of
          your work. A mentor sees something worth teaching. This is how you
          become more than you were.
        </p>
      </section>

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

        {/* ── Blueprints ─────────────────────────────────────── */}
        <div className={styles.accordionItem}>
          <button
            className={styles.accordionHeader}
            onClick={() => toggleSection("blueprints")}
          >
            <span>[ Blueprints ]</span>
            <span className={styles.accordionChevron}>{openSection === "blueprints" ? "▴" : "▾"}</span>
          </button>
          {openSection === "blueprints" && (
            <div className={styles.accordionBody}>
              <p className={styles.sectionIntro}>
                A trade leaves you with more than know-how — it leaves you with the plans to build its
                tools and wares. What your professions unlock here is what you may carry into the world
                at creation.
              </p>
              <p className={styles.sectionIntro}>
                <strong>Legend:</strong>
                <br />
                <strong>🔧</strong> = Tool | <strong>📦</strong> = Item (weapon, armor, shield, special equipment)
                <br />
                <strong>○</strong> = Mundane (Tier 1) | <strong>○○</strong> = Mundane (Tier 2) | <strong>○○○</strong> = Mundane (Tier 3)
                <br />
                <strong>✨</strong> = Enchantable (Tier 4) | <strong>✨✨</strong> = Enchantable (Tier 5) | <strong>✨✨✨</strong> = Enchantable (Tier 6)
              </p>
              {blueprintCategories.map((entry) => (
                <div key={entry.category} className={styles.subAccordionItem}>
                  <button
                    className={styles.subAccordionHeader}
                    onClick={() =>
                      setOpenBlueprintCategory(openBlueprintCategory === entry.category ? null : entry.category)
                    }
                  >
                    <span>
                      {entry.category} ({entry.families.length})
                    </span>
                    <span className={styles.accordionChevron}>
                      {openBlueprintCategory === entry.category ? "▴" : "▾"}
                    </span>
                  </button>
                  {openBlueprintCategory === entry.category && (
                    <div className={styles.subAccordionBody}>
                      {entry.families.length === 0 ? (
                        <div className={styles.raceEntry}>
                          <p className={styles.raceDescription}>
                            No blueprint family belongs to {entry.category} yet.
                            {entry.category === "Rural" &&
                              " This mostly reflects how many Rural items just don't need a blueprint at all — e.g. the fishing pole is craftable straight from raw wood and fiber, no unlock required."}
                          </p>
                        </div>
                      ) : (
                        entry.families.map((family) => (
                          <div key={family.familyId} className={styles.raceEntry}>
                            <p className={styles.raceName}>
                              {getKindIcon(family.kind)} {family.familyId.replace(/_/g, " ")}{" "}
                              <span className={styles.blueprintKind}>{family.kind}</span>
                            </p>
                            <div className={styles.raceDescription}>
                              {family.items.map((item) => {
                                const label = item.isBasic ? "S" : getTierIndicator(item.tier);
                                const displayName = trimRedundantLastWord(
                                  label,
                                  item.name.replace("Blueprint: ", ""),
                                  family.familyId.replace(/_/g, " "),
                                  family.kind
                                );
                                return (
                                  <p key={item.id} className={styles.blueprintItemLine}>
                                    {label} {displayName}
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Attributes ─────────────────────────────────────── */}
        <div className={styles.accordionItem}>
          <button
            className={styles.accordionHeader}
            onClick={() => toggleSection("attributes")}
          >
            <span>[ Attributes ]</span>
            <span className={styles.accordionChevron}>{openSection === "attributes" ? "▴" : "▾"}</span>
          </button>
          {openSection === "attributes" && (
            <div className={styles.accordionBody}>
              <p className={styles.sectionIntro}>
                Every character is shaped by two forces, Body and Soul, and both draw
                from the same well. Strengthen one and the other yields — there is no
                character who is strong everywhere. Four attributes make up each half,
                and together the eight decide what comes naturally to you and what
                costs you effort.
              </p>
              {([
                ["Body", BODY_ATTRIBUTES],
                ["Soul", SOUL_ATTRIBUTES],
              ] as const).map(([category, attributes]) => (
                <div key={category} className={styles.subAccordionItem}>
                  <button
                    className={styles.subAccordionHeader}
                    onClick={() => setOpenAttributeCategory(openAttributeCategory === category ? null : category)}
                  >
                    <span>{category}</span>
                    <span className={styles.accordionChevron}>{openAttributeCategory === category ? "▴" : "▾"}</span>
                  </button>
                  {openAttributeCategory === category && (
                    <div className={styles.subAccordionBody}>
                      {attributes.map((attr) => (
                        <div key={attr.id} className={styles.raceEntry}>
                          <p className={styles.raceName}>{attr.name}</p>
                          <p className={styles.raceDescription}>{attr.description}</p>
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
