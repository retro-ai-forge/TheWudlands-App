import { useCallback, useEffect, useState } from "react";
import styles from "./ForagingSection.module.css";
import { formatRemainingCompactLong, useCraftCountdown } from "../craftTimer";
import { getResourceCatalog } from "./catalogCache";
import { ItemTile, ResourcePopup, ResourceTiles, conditionOf, type QualityState, type ResourceTierInfo } from "./VaultTab";
import type { ForageGear, ForagingState, SlotCharacterSummary } from "../types";

// Foraging lives on the Stories tab: like an adventure, a trip takes the
// character away from home, and the two exclude each other (see
// backend/foraging.py). One trip at a time - pick a site, wait out the
// timer, then collect. The finds go to the character's home storage.

function formatTripLength(minutes: number): string {
  if (minutes >= 60) return `${Math.round((minutes / 60) * 10) / 10}h`;
  return `${Math.max(1, Math.round(minutes))}m`;
}

const label = (familyId: string) => familyId.replace(/_/g, " ");
const ATTR_NAMES: Record<string, string> = {
  migh: "Might", agil: "Agility", endu: "Endurance", prec: "Precision",
  will: "Will", insi: "Insight", lore: "Lore", pres: "Presence",
};
const pct = (n: number) => `${n < 0 ? "−" : "+"}${Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(1)}%`;

/** "+35% · Miner's Pickaxe +25%, Cart +5%" - or, without gear, which
 * weapon/item families would help here. */
function GearLine({ gear, helpfulWeapons, helpfulItems }: {
  gear: ForageGear | undefined;
  helpfulWeapons?: string[];
  helpfulItems?: string[];
}) {
  const pieces = gear ? [...(gear.weapon ? [gear.weapon] : []), ...gear.items] : [];
  // e.g. "Hunting Bow needs: quiver, arrow" - only while no other weapon
  // counts; "Torch needs: tinderbox" - only while no light counts.
  const unready = [
    ...(!gear?.weapon ? gear?.blockedWeapons ?? [] : []),
    ...(gear?.blockedLights ?? []),
    ...(gear?.blockedItems ?? []),
  ];
  // Ore without a light: a smaller find, the risk of an accident or of
  // getting lost.
  const dark = gear?.dark ? (
    <p className={styles.darkHint}>
      No light: {pct(gear.darkPercent ?? 0)}, you can have accidents or get lost.
    </p>
  ) : null;
  const blocked = unready.length || dark ? (
    <>
      {unready.length > 0 && (
        <p className={styles.gearHint}>
          {unready.map((b) => `${b.name} needs: ${b.missing.map(label).join(", ")}`).join(" · ")}
        </p>
      )}
      {dark}
    </>
  ) : null;
  if (gear && pieces.length > 0) {
    return (
      <>
        <p className={styles.gearLine}>
          <span className={styles.gearPercent}>{pct(gear.percent)}</span>{" "}
          {pieces.map((piece) => `${piece.name} ${pct(piece.percent)}`).join(", ")}
        </p>
        {/* Each unit dug needs 1h of light - what's left over is dug without it. */}
        {gear.light && (
          // Green: lasts even the biggest dig; yellow: may run out within the
          // range; red: runs out even on the smallest (site cards only).
          <p
            className={`${styles.gearLine} ${gear.light.cover ? styles[`light_${gear.light.cover}`] : ""}`}
            title={gear.light.needMax !== undefined ? `This trip needs ${gear.light.needMin}–${gear.light.needMax}h` : undefined}
          >
            Light for {gear.light.hours}h
          </p>
        )}
        {blocked}
      </>
    );
  }
  const helpers = [...(helpfulWeapons ?? []), ...(helpfulItems ?? [])];
  if (helpers.length === 0) return blocked;
  return (
    <>
      <p className={styles.gearHint}>
        No gathering gear. Helps here: {helpers.map(label).join(", ")}
      </p>
      {blocked}
    </>
  );
}

function siteRichness(remaining: number, initial: number, yieldMax: number): { label: string; tone: "rich" | "thin" | "last" } {
  if (yieldMax <= 1) return { label: "Nearly gone", tone: "last" };
  if (remaining * 2 < initial) return { label: "Thinning", tone: "thin" };
  return { label: "Plentiful", tone: "rich" };
}

export function ForagingSection({
  character,
  isCrafting,
  onCharacterChanged,
}: {
  character: SlotCharacterSummary;
  isCrafting: boolean;
  /** Re-fetch the character after a trip starts or is collected, so the
   * rest of the preview (and Start Adventure's own check) sees it. */
  onCharacterChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<ForagingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The site whose "Forget site" was clicked - the popup asks first.
  const [forgetting, setForgetting] = useState<ForagingState["sites"][number] | null>(null);
  const [catalog, setCatalog] = useState<ResourceTierInfo>({});
  // Which found resource's detail popup is open (info only - no moves).
  const [popupId, setPopupId] = useState<string | null>(null);
  const [oldGearOpen, setOldGearOpen] = useState(false);

  const inAdventure = character.availability.inAdventure;
  const name = character.firstName || "This character";
  const active = state?.activeForage ?? null;
  const remainingSeconds = useCraftCountdown(active?.readyAt);
  // Lost in the dark: past the planned return, but not back - and when
  // they will be is the server's secret.
  const isLost = !!active?.lost;
  const isBack = active !== null && remainingSeconds === 0 && !isLost;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/foraging`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? "Couldn't load foraging");
      setState(await res.json());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load foraging");
    }
  }, [character.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getResourceCatalog().then(setCatalog).catch(() => {});
  }, []);

  const act = async (path: "start" | "finish" | "forget", body?: object) => {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/auth/me/characters/${character.id}/foraging/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.detail ?? "Something went wrong");
        await load();
        return;
      }
      setState(path === "finish" ? data.state : data);
      await onCharacterChanged();
    } finally {
      setPending(false);
    }
  };

  const lastResult = state?.lastResult ?? null;
  const headlines = state?.groups.map((g) => g.headline) ?? [];

  return (
    <section className={styles.section} aria-labelledby="foraging-heading">
      <h3 id="foraging-heading" className={styles.heading}>Foraging</h3>
      {headlines.length > 0 && <p className={styles.headlines}>{headlines.join(" · ")}</p>}

      {loadError && <p className={styles.error}>{loadError}</p>}
      {!state && !loadError && <p className={styles.note}>Looking around&hellip;</p>}

      {state && active && (
        <div className={`${styles.card} ${styles.activeCard}`}>
          <span className={styles.activity}>{active.activity}</span>
          <span className={styles.missionName}>{active.name}</span>
          <p className={styles.flavor}>{active.text}</p>
          <GearLine gear={active.gear} />
          {isLost ? (
            <p className={styles.darkHint}>
              {name} should have been back by now. Lost in the dark &ndash; no word yet.
            </p>
          ) : isBack ? (
            <button
              type="button"
              className={`${styles.button} ${styles.collectButton}`}
              onClick={() => act("finish")}
              disabled={pending}
            >
              {pending ? "Unpacking…" : `Collect ${name}'s finds`}
            </button>
          ) : (
            <p className={styles.countdown}>
              Back in{" "}
              <span className={styles.timer}>
                {remainingSeconds !== null ? formatRemainingCompactLong(remainingSeconds) : "…"}
              </span>
            </p>
          )}
        </div>
      )}

      {state && lastResult && !active && (
        <div className={`${styles.card} ${styles.resultCard} ${styles[`result_${lastResult.outcome}`]}`}>
          <span className={styles.activity}>Last return &middot; {lastResult.name}</span>
          <p className={styles.message}>{lastResult.message}</p>
          {lastResult.night?.message && <p className={styles.message}>{lastResult.night.message}</p>}
          {(lastResult.darkUnits ?? 0) > 0 && (lastResult.litUnits ?? 0) > 0 && (
            <p className={styles.darkHint}>
              The light ran out after {lastResult.lightHours}h &ndash; the last {lastResult.darkUnits}{" "}
              {label(lastResult.familyId)} came out of the dark.
            </p>
          )}
          {lastResult.accident?.message && <p className={styles.message}>{lastResult.accident.message}</p>}
          {(lastResult.accident?.vitalStatus ?? lastResult.night?.vitalStatus) && (
            <p className={styles.lostLine}>
              {name} is now {lastResult.accident?.vitalStatus ?? lastResult.night?.vitalStatus}.
            </p>
          )}
          <p className={styles.amount}>
            Found {lastResult.total} {label(lastResult.familyId)}
            {lastResult.gearPercent ? ` (gear ${pct(lastResult.gearPercent)})` : ""}
          </p>
          {lastResult.total > 0 && (
            // Same tiles as the inventory (icon, tier and count badges);
            // a tap opens the item's detail popup.
            <div className={styles.foundTiles}>
              <ResourceTiles balances={lastResult.found} tierInfo={catalog} onSelect={(id) => setPopupId(id)} />
            </div>
          )}
          {lastResult.surpriseMessage && Object.keys(lastResult.surprise ?? {}).length > 0 && (
            <>
              <p className={styles.message}>{lastResult.surpriseMessage}</p>
              <div className={styles.foundTiles}>
                <ResourceTiles balances={lastResult.surprise ?? {}} tierInfo={catalog} onSelect={(id) => setPopupId(id)} />
              </div>
            </>
          )}
          {lastResult.oldGear && lastResult.oldGearMessage && (
            <>
              <p className={styles.message}>{lastResult.oldGearMessage}</p>
              <div className={styles.foundTiles}>
                <ItemTile
                  icon={lastResult.oldGear.icon}
                  name={lastResult.oldGear.name}
                  tier={lastResult.oldGear.tier}
                  condition={(lastResult.oldGear.condition as QualityState | undefined) ?? conditionOf(lastResult.oldGear.quality)}
                  onClick={() => setOldGearOpen(true)}
                />
              </div>
            </>
          )}
          {(() => {
            // One plain line of what the trip cost: ammo shot, light burned, gear worn a level, gear lost.
            const ammoByFamily: Record<string, number> = {};
            for (const [id, n] of [
              ...Object.entries(lastResult.ammoUsed ?? {}),
              ...Object.entries(lastResult.lightUsed ?? {}),
            ]) {
              const family = id.replace(/_\d+$/, "");
              ammoByFamily[family] = (ammoByFamily[family] ?? 0) + n;
            }
            const lost = [
              ...Object.entries(
                [lastResult.night?.lost, lastResult.accident?.lost].reduce<Record<string, number>>((sum, part) => {
                  for (const [key, n] of Object.entries(part ?? {})) sum[key] = (sum[key] ?? 0) + n;
                  return sum;
                }, {}),
              ).map(([key, n]) => `${ATTR_NAMES[key] ?? key} −${n}`),
              ...Object.entries(ammoByFamily).map(([family, n]) => `${n} ${label(family)}${n === 1 ? "" : "s"}`),
              // Only entries with a condition level: results from before the
              // condition rework recorded wear as points, which no longer
              // match the item (it was converted to a level afterwards).
              ...(lastResult.gear ?? [])
                .filter((g) => g.wear > 0 && !g.destroyed && g.condition)
                .map((g) => `${g.name} → ${g.condition}`),
              // Gone for good (dropped below broken, or a stacked piece used up)
              // - "lost", since "broken" is now a condition that still works.
              ...(lastResult.broken ?? []).map((name) => `${name} (lost)`),
            ];
            return lost.length > 0 ? <p className={styles.lostLine}>Lost: {lost.join(" · ")}</p> : null;
          })()}
        </div>
      )}

      {state && !active && (
        <>
          {inAdventure && (
            <p className={styles.note}>
              {name} is out on an adventure. Foraging waits until the story ends.
            </p>
          )}
          {!inAdventure && isCrafting && (
            <p className={styles.note}>{name} is busy crafting. Foraging can start once the craft is done.</p>
          )}
          {!state.hasPool && (
            <p className={styles.note}>{name} has no foraging grounds.</p>
          )}
          {state.hasPool && state.sites.length === 0 && (
            <p className={styles.note}>
              Every site near {name} is picked clean. New adventures may reveal better gathering places.
            </p>
          )}

          <div className={styles.siteGrid}>
            {state.sites.map((site) => {
              if (!site.mission) return null;
              const richness = siteRichness(site.remaining, site.initial, site.yieldMax);
              const disabled = pending || inAdventure || isCrafting;
              return (
                <div key={site.familyId} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.activity}>{site.mission.activity}</span>
                    <span className={`${styles.richness} ${styles[`richness_${richness.tone}`]}`}>{richness.label}</span>
                  </div>
                  <span className={styles.missionName}>{site.mission.name}</span>
                  <p className={styles.flavor}>{site.mission.text}</p>
                  <p className={styles.yield}>
                    {site.yieldMin === site.yieldMax
                      ? `Finds about ${site.yieldMin}`
                      : `Finds ${site.yieldMin}–${site.yieldMax}`}{" "}
                    {label(site.familyId)}
                  </p>
                  <GearLine gear={site.gear} helpfulWeapons={site.helpfulWeapons} helpfulItems={site.helpfulItems} />
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.forgetButton}
                      onClick={() => setForgetting(site)}
                      disabled={pending}
                    >
                      Forget site
                    </button>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => act("start", { missionId: site.mission!.id })}
                      disabled={disabled}
                    >
                      Go &middot; {formatTripLength(state.durationMinutes)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {actionError && <p className={styles.error} role="status">{actionError}</p>}

      {forgetting && (
        // A site lasts until it's empty - forgetting is the way out of one
        // that only gives a unit a trip. Gone for the slot, so ask first.
        <div className={styles.confirmOverlay} onClick={() => setForgetting(null)}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmText}>
              Forget {forgetting.mission?.name ?? "this site"}?
            </p>
            <p className={styles.confirmNote}>
              The {label(forgetting.familyId)} still there is lost for good &ndash; for {name} and every soul
              after in this slot.
            </p>
            <div className={styles.confirmButtons}>
              <button
                type="button"
                className={styles.confirmForget}
                onClick={() => {
                  const familyId = forgetting.familyId;
                  setForgetting(null);
                  act("forget", { familyId });
                }}
              >
                Forget
              </button>
              <button type="button" className={styles.confirmKeep} onClick={() => setForgetting(null)} autoFocus>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}

      {popupId && lastResult && (
        <ResourcePopup
          resourceId={popupId}
          tierInfo={catalog}
          owned={(lastResult.found[popupId] ?? 0) + (lastResult.surprise?.[popupId] ?? 0)}
          characterId={character.id}
          destinations={[]}
          onClose={() => setPopupId(null)}
        />
      )}
      {oldGearOpen && lastResult?.oldGear && (
        // Same info popup as the raw finds (icon, tier, name, description) - no quality.
        <ResourcePopup
          resourceId={lastResult.oldGear.itemId}
          tierInfo={{
            [lastResult.oldGear.itemId]: {
              tier: lastResult.oldGear.tier,
              family: lastResult.oldGear.familyId,
              category: "processed",
              name: lastResult.oldGear.name,
              icon: lastResult.oldGear.icon,
              description: lastResult.oldGear.description,
            },
          }}
          owned={1}
          characterId={character.id}
          destinations={[]}
          onClose={() => setOldGearOpen(false)}
        />
      )}
    </section>
  );
}
