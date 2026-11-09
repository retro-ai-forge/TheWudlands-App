import styles from "./CharacterTabs.module.css";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import { RACES, PROFESSIONS, BIRTHSIGNS, PROFESSION_RESOURCE_FAMILIES } from "@/app/lib/characterOptions";
import { getDisplayedAge } from "@/app/lib/ageScaling";
import { useEffect, useState } from "react";
import { formatRemainingCompactLong, useCraftCountdown } from "../craftTimer";
import type { SlotCharacterSummary } from "../types";
import { IdList } from "./VaultTab";
import type { BlueprintTierInfo, RawPlayerData } from "./VaultTab";
import { getBlueprintCatalog } from "./catalogCache";

import baseLevelsData from "../../../../backend/data/base-levels.json";
const XP_LEVELS = baseLevelsData.levels;


const BODY_ATTRS = [
  ["migh", "Might"],
  ["agil", "Agility"],
  ["endu", "Endurance"],
  ["prec", "Precision"],
] as const;

const SOUL_ATTRS = [
  ["will", "Will"],
  ["insi", "Insight"],
  ["lore", "Lore"],
  ["pres", "Presence"],
] as const;

function raceName(id: string): string {
  return RACES.find((r) => r.id === id)?.name ?? id;
}

function professionName(id: string): string {
  if (!id || id === "none") return "";
  return PROFESSIONS.find((p) => p.id === id)?.name ?? id;
}

function professionDescription(id: string): string {
  if (!id || id === "none") return "";
  return PROFESSIONS.find((p) => p.id === id)?.description ?? "";
}

function professionResourceFamilies(id: string): string {
  if (!id || id === "none") return "";
  const category = PROFESSIONS.find((p) => p.id === id)?.category;
  const families = category ? PROFESSION_RESOURCE_FAMILIES[category] : undefined;
  if (!families) return "";
  return families
    .map((family) => family.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
    .join(", ");
}

function birthsignName(id: string): string {
  return BIRTHSIGNS.find((b) => b.id === id)?.name ?? id;
}

/** Green at full, red while reduced. */
function attrTone(now: number, max: number): string {
  return now < max ? styles.attrReduced : styles.attrFull;
}

/** "3/5" - the current value over the maximum. */
function AttrValue({ now, max }: { now: number; max: number }) {
  return <span className={`${styles.attrDisplayValue} ${attrTone(now, max)}`}>{now}/{max}</span>;
}

function sumAttrs(
  keys: readonly (readonly [keyof SlotCharacterSummary["attr"], string])[],
  attr: SlotCharacterSummary["attr"]
): number {
  return keys.reduce((total, [key]) => total + attr[key], 0);
}

/** Preview page: face portrait, identity, and the full attribute/profession sheet. */
export function StatsTab({
  character,
  onEditPortrait,
  onOpenBirthsign,
  onPlayerDataUpdated,
}: {
  character: SlotCharacterSummary;
  onEditPortrait?: () => void;
  onOpenBirthsign?: () => void;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
}) {
  const birthsignInfo = BIRTHSIGNS.find((b) => b.id === character.birthsign) ?? null;

  const craftRemainingSeconds = useCraftCountdown(character.crafting.activeCraft?.readyAt);
  // Out foraging (see ForagingSection) - counts down to the trip's return;
  // 0 means back but not yet collected.
  const forageRemainingSeconds = useCraftCountdown(character.foraging?.activeForage?.readyAt);
  // Temporary attribute losses (backend.condition): current vs maximum.
  const attrNow = character.attrNow ?? character.attr;
  const healSeconds = useCraftCountdown(character.nextHealAt);
  const hasLoss = Object.values(character.attrLost ?? {}).some((n) => (n ?? 0) > 0);
  const inAdventure = character.availability.inAdventure;

  const [blueprintTierInfo, setBlueprintTierInfo] = useState<BlueprintTierInfo>({});
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);

  useEffect(() => {
    getBlueprintCatalog().then(setBlueprintTierInfo).catch(() => setBlueprintTierInfo({}));
  }, []);

  // --- Profession / prime state ---

  const [settingPrime, setSettingPrime] = useState(false);
  const [xpOverlay, setXpOverlay] = useState<{
    slot: "prof1" | "prof2" | "prof3";
    lvl: number;
    top: number;
    right: number;
  } | null>(null);
  const [descOverlay, setDescOverlay] = useState<{
    slot: "prof1" | "prof2" | "prof3";
    name: string;
    description: string;
    isPrime: boolean;
    top: number;
    left: number;
  } | null>(null);
  const [birthsignOverlay, setBirthsignOverlay] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [carryOverlay, setCarryOverlay] = useState<{ top: number; left: number } | null>(null);
  const openXpOverlay = (
    p: { slot: "prof1" | "prof2" | "prof3"; lvl: number },
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (p.lvl >= 30) return;
    setDescOverlay(null);
    if (xpOverlay?.slot === p.slot) { setXpOverlay(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setXpOverlay({ slot: p.slot, lvl: p.lvl, top: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right });
  };
  const openDescOverlay = (
    p: { slot: "prof1" | "prof2" | "prof3"; name: string; description: string; isPrime: boolean },
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    setXpOverlay(null);
    if (descOverlay?.slot === p.slot) { setDescOverlay(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setDescOverlay({ slot: p.slot, name: p.name, description: p.description, isPrime: p.isPrime, top: window.innerHeight - rect.top + 6, left: rect.left });
  };
  const setPrimeProfession = async (slot: "prof1" | "prof2" | "prof3") => {
    if (settingPrime) return;
    setSettingPrime(true);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/profession/prime`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      if (res.ok) {
        const data: RawPlayerData = await res.json();
        onPlayerDataUpdated?.(data);
      }
    } catch {
      // Best-effort - the row just stays clickable to try again.
    } finally {
      setSettingPrime(false);
    }
  };

  const effectivePrime = ["prof1", "prof2", "prof3"].includes(character.profession.prime)
    ? character.profession.prime
    : "prof1";

  const professions = (
    [
      {
        slot: "prof1" as const,
        name: professionName(character.profession.prof1),
        description: professionDescription(character.profession.prof1),
        lvl: character.profession.lvl1,
        exp: character.profession.exp1,
        resourceFamilies: professionResourceFamilies(character.profession.prof1),
      },
      {
        slot: "prof2" as const,
        name: professionName(character.profession.prof2),
        description: professionDescription(character.profession.prof2),
        lvl: character.profession.lvl2,
        exp: character.profession.exp2,
        resourceFamilies: professionResourceFamilies(character.profession.prof2),
      },
      {
        slot: "prof3" as const,
        name: professionName(character.profession.prof3),
        description: professionDescription(character.profession.prof3),
        lvl: character.profession.lvl3,
        exp: character.profession.exp3,
        resourceFamilies: professionResourceFamilies(character.profession.prof3),
      },
    ]
      .filter((p) => p.name)
      .map((p) => ({ ...p, isPrime: p.slot === effectivePrime }))
      .sort((a, b) => (a.isPrime === b.isPrime ? 0 : a.isPrime ? -1 : 1))
  );

  const classes = [
    { name: character.classes.class1, lvl: character.classes.lvl1 },
    { name: character.classes.class2, lvl: character.classes.lvl2 },
  ].filter((c) => c.name && c.name !== "none");

  return (
    <div className={styles.panel}>
      <div className={styles.statsLayout}>
        <div className={styles.portraitStatsGroup}>
          <button
            type="button"
            className={styles.faceFrame}
            onClick={onEditPortrait}
            title="Edit portrait"
            aria-label="Edit portrait"
          >
            {character.portraitUrl && character.portraitUrl !== "empty" ? (
              character.portraitFaceArea ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.portraitUrl}
                  alt={character.firstName}
                  style={getPortraitCropImgStyle(character.portraitFaceArea)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.portraitUrl}
                  alt={character.firstName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )
            ) : (
              <span className={styles.noPortraitPlaceholder} aria-label="No portrait">
                no
                <br />
                portrait
              </span>
            )}
          </button>

          <div className={styles.characterStatsFrame}>
            {(() => {
              const f = character.stats?.adventureFinished ?? 0;
              const r = character.stats?.adventureRunAway ?? 0;
              const total = f + r;
              const fPct = total > 0 ? (f / total) * 100 : 100;
              const rPct = total > 0 ? (r / total) * 100 : 0;
              return (
                <>
                  <div className={styles.characterStatsHeading}>
                  {fPct >= 50 ? (
                    <><span>Stalwart</span><span className={styles.stalwartPct}>{Math.round(fPct)}%</span></>
                  ) : (
                    <><span>Craven</span><span className={styles.cravenPct}>{Math.round(rPct)}%</span></>
                  )}
                </div>
                  <div className={styles.storyBar}>
                    <div
                      className={styles.storyBarFinished}
                      style={{ width: `${fPct}%` }}
                    >
                      <span className={styles.storyBarLabel}>STOOD</span>
                    </div>
                    <div
                      className={styles.storyBarRunAway}
                      style={{ width: `${rPct}%` }}
                    >
                      <span className={styles.storyBarLabel}>RUN</span>
                    </div>
                  </div>
                  <div className={styles.miniStatsGrid}>
                    <span>Adventures</span><span>{total}</span>
                    <span>Crafted</span><span>0</span>
                    <span>Blueprints</span><span>{character.blueprints?.length ?? 0}</span>
                    <span>Items</span><span>{character.gear?.items?.length ?? 0}</span>
                    <span>Slain</span><span>0</span>
                    <span>Deaths</span><span>0</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className={styles.identityColumn}>
          <div className={styles.identityRow}>
            <span>Race</span>
            <span>{raceName(character.race)}</span>
          </div>
          <div className={styles.identityRow}>
            <span>Age</span>
            <span>{getDisplayedAge(character.age_month, character.race)} years</span>
          </div>
          {birthsignInfo ? (
            <div className={styles.identityRow}>
              <button
                type="button"
                className={styles.birthsignLabelBtn}
                onClick={(e) => {
                  if (birthsignOverlay) { setBirthsignOverlay(null); return; }
                  const rect = e.currentTarget.getBoundingClientRect();
                  setBirthsignOverlay({ top: window.innerHeight - rect.top + 6, left: rect.left });
                }}
              >
                Birthsign
              </button>
              <button
                type="button"
                className={styles.birthsignNameBtn}
                onClick={onOpenBirthsign}
              >
                {birthsignInfo.name}
              </button>
            </div>
          ) : (
            <div className={styles.identityRow}>
              <span>Birthsign</span>
              <span>{birthsignName(character.birthsign)}</span>
            </div>
          )}
          <div className={styles.identityRow}>
            <span>Vital</span>
            <span>{character.vitalStatus}</span>
          </div>
          <div className={styles.identityRow}>
            <span>
              {craftRemainingSeconds
                ? "Crafting"
                : forageRemainingSeconds !== null
                ? "Foraging"
                : inAdventure
                ? "ON THE ROAD"
                : "Ready"}
            </span>
            <span
              className={
                craftRemainingSeconds || forageRemainingSeconds
                  ? styles.readyTimerValue
                  : forageRemainingSeconds === 0
                  ? styles.readyNowValue
                  : inAdventure
                  ? styles.readyAwayValue
                  : styles.readyNowValue
              }
            >
              {craftRemainingSeconds
                ? formatRemainingCompactLong(craftRemainingSeconds)
                : forageRemainingSeconds
                ? formatRemainingCompactLong(forageRemainingSeconds)
                : forageRemainingSeconds === 0
                ? "back"
                : inAdventure
                ? "away"
                : "now"}
            </span>
          </div>
          <button
            type="button"
            className={`${styles.identityRow} ${styles.carryCapacityRow} ${
              character.gear.encumbranceState === "immobile"
                ? styles.carryOverloaded
                : character.gear.encumbranceState === "encumbered"
                ? styles.carryEncumbered
                : styles.carryNormal
            }`}
            onClick={(e) => {
              if (carryOverlay) { setCarryOverlay(null); return; }
              const rect = e.currentTarget.getBoundingClientRect();
              setCarryOverlay({ top: window.innerHeight - rect.top + 6, left: rect.left });
            }}
          >
            <span>Burden {character.gear.encumbranceState === "immobile" ? "— Crushed" : character.gear.encumbranceState === "encumbered" ? "— Encumbered" : "— Light"}</span>
            <span>{character.gear.carryWeightUsed ?? 0}/{character.gear.carryWeightCapacity ?? (10 + Math.floor((character.attr.migh + character.attr.endu) / 3))}</span>
          </button>
          <div className={styles.professionDivider} />
          {classes.map((c) => (
            <div className={styles.professionRow} key={c.name}>
              <div className={styles.professionRowMain}>
                <span>{c.name}</span>
                <span>Level {c.lvl}</span>
              </div>
            </div>
          ))}
          {professions.map((p, i) => (
            <div className={`${styles.professionRow}${i === professions.length - 1 ? ` ${styles.professionRowLast}` : ""}`} key={p.name}>
              <div className={styles.professionRowSplit}>
                <button
                  type="button"
                  className={styles.professionLeftZone}
                  onClick={(e) => openDescOverlay(p, e)}
                  disabled={settingPrime}
                  title={p.isPrime ? undefined : "Click to make this the prime profession"}
                >
                  <span className={p.isPrime ? styles.professionPrime : undefined}>
                    {p.name}
                    {p.isPrime && <span className={styles.professionPrimeTag}> (prime)</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.professionRightZone}${xpOverlay?.slot === p.slot ? ` ${styles.professionRightZoneActive}` : ""}`}
                  onClick={(e) => openXpOverlay(p, e)}
                  title="View XP table"
                >
                  Lvl {p.lvl} — {p.exp.toLocaleString()} XP
                </button>
              </div>
              {p.resourceFamilies && (
                <span className={styles.professionResourceFamilies}>{p.resourceFamilies}</span>
              )}
            </div>
          ))}

          <div className={styles.attrColumns}>
            <table className={styles.attrTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.attrGroupName}>Body</th>
                  <th scope="col" className={styles.attrValueCell}>
                    <span className={`${styles.attrGroupTotal} ${attrTone(sumAttrs(BODY_ATTRS, attrNow), sumAttrs(BODY_ATTRS, character.attr))}`}>
                      {sumAttrs(BODY_ATTRS, attrNow)}/{sumAttrs(BODY_ATTRS, character.attr)}
                    </span>
                  </th>
                  <th className={styles.attrGapCell} aria-hidden="true" />
                  <th scope="col" className={styles.attrGroupName}>Soul</th>
                  <th scope="col" className={styles.attrValueCell}>
                    <span className={`${styles.attrGroupTotal} ${attrTone(sumAttrs(SOUL_ATTRS, attrNow), sumAttrs(SOUL_ATTRS, character.attr))}`}>
                      {sumAttrs(SOUL_ATTRS, attrNow)}/{sumAttrs(SOUL_ATTRS, character.attr)}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {BODY_ATTRS.map(([key, label], i) => {
                  const [sKey, sLabel] = SOUL_ATTRS[i];
                  return (
                    <tr key={key}>
                      <th scope="row" className={attrNow[key] <= 0 ? `${styles.attrLabel} ${styles.attrReduced}` : styles.attrLabel}>{label}</th>
                      <td className={styles.attrValueCell}>
                        <AttrValue now={attrNow[key]} max={character.attr[key]} />
                      </td>
                      <td className={styles.attrGapCell} aria-hidden="true" />
                      <th scope="row" className={attrNow[sKey] <= 0 ? `${styles.attrLabel} ${styles.attrReduced}` : styles.attrLabel}>{sLabel}</th>
                      <td className={styles.attrValueCell}>
                        <AttrValue now={attrNow[sKey]} max={character.attr[sKey]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {character.nextHealAt && healSeconds !== null && (
              <p className={styles.attrHealNote}>
                Next point heals in {formatRemainingCompactLong(healSeconds)}
              </p>
            )}
            {!character.nextHealAt && hasLoss && character.vitalStatus === "alive" && (
              <p className={styles.attrHealNote}>Heals only while free (not foraging, crafting or adventuring).</p>
            )}
          </div>

          {(character.blueprints?.length ?? 0) > 0 && (
            <div className={`${styles.accordionItem} ${styles.accordionItemWide}`}>
              <button className={styles.accordionHeader} onClick={() => setBlueprintsOpen(!blueprintsOpen)}>
                <span>Blueprints</span>
                <span className={styles.accordionChevron}>{blueprintsOpen ? "▴" : "▾"}</span>
              </button>
              {blueprintsOpen && (
                <div className={styles.accordionBody}>
                  <IdList
                    ids={character.blueprints}
                    emptyLabel=""
                    tierInfo={blueprintTierInfo}
                    sortByTier
                    textColor="#7eb8ff"
                    dividerClassName={styles.toolsResourceDivider}
                  />
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {xpOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setXpOverlay(null)} />
          <div
            className={styles.xpOverlayPanel}
            style={{ bottom: xpOverlay.top, right: xpOverlay.right }}
          >
            {XP_LEVELS.filter((l) => l.level >= xpOverlay.lvl - 2 && l.level <= xpOverlay.lvl + 2).map((entry) => (
              <div
                key={entry.level}
                className={`${styles.xpOverlayRow}${entry.level === xpOverlay.lvl ? ` ${styles.xpOverlayCurrentRow}` : ""}`}
              >
                Lvl {entry.level} — {entry.XP.toLocaleString()} XP
              </div>
            ))}
          </div>
        </>
      )}
      {descOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setDescOverlay(null)} />
          <div
            className={styles.descOverlayPanel}
            style={{ bottom: descOverlay.top, left: descOverlay.left }}
          >
            <div className={styles.descOverlayHeader}>
              <div className={styles.descOverlayName}>{descOverlay.name}</div>
              {descOverlay.isPrime ? (
                <span className={styles.descOverlayPrimeTag}>(prime)</span>
              ) : (
                <button
                  type="button"
                  className={styles.descOverlayMakePrimeBtn}
                  disabled={settingPrime}
                  onClick={() => { setPrimeProfession(descOverlay.slot); setDescOverlay(null); }}
                >
                  (make prime)
                </button>
              )}
            </div>
            <div className={styles.descOverlayText}>{descOverlay.description}</div>
          </div>
        </>
      )}
      {carryOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setCarryOverlay(null)} />
          <div
            className={styles.descOverlayPanel}
            style={{ bottom: carryOverlay.top, left: carryOverlay.left }}
          >
            <div className={styles.descOverlayText}>
              {character.gear.carryWeightCapacity ?? (10 + Math.floor((character.attr.migh + character.attr.endu) / 3))} = 10 + (might {character.attr.migh} + endur {character.attr.endu})/3
            </div>
          </div>
        </>
      )}
      {birthsignOverlay && (
        <>
          <div className={styles.xpOverlayBackdrop} onClick={() => setBirthsignOverlay(null)} />
          <div
            className={styles.descOverlayPanel}
            style={{ bottom: birthsignOverlay.top, left: birthsignOverlay.left }}
          >
            <div className={styles.descOverlayText}>
              Your birth sign is permanent once chosen. It grants one charge per adventure — rare
              events like death and revival, or regaining a lost soul, may grant a second or third
              charge.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
