import { useCallback, useEffect, useState } from "react";
import styles from "./ForagingSection.module.css";
import { formatRemainingCompactLong, useCraftCountdown } from "../craftTimer";
import { getResourceCatalog } from "./catalogCache";
import { ItemTile, ResourcePopup, ResourceTiles, type ResourceTierInfo } from "./VaultTab";
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
const pct = (n: number) => `+${Number.isInteger(n) ? n : n.toFixed(1)}%`;

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
  const blocked = unready.length ? (
    <p className={styles.gearHint}>
      {unready.map((b) => `${b.name} needs: ${b.missing.map(label).join(", ")}`).join(" · ")}
    </p>
  ) : null;
  if (gear && pieces.length > 0) {
    return (
      <>
        <p className={styles.gearLine}>
          <span className={styles.gearPercent}>{pct(gear.percent)}</span>{" "}
          {pieces.map((piece) => `${piece.name} ${pct(piece.percent)}`).join(", ")}
        </p>
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
  const [catalog, setCatalog] = useState<ResourceTierInfo>({});
  // Which found resource's detail popup is open (info only - no moves).
  const [popupId, setPopupId] = useState<string | null>(null);

  const inAdventure = character.availability.inAdventure;
  const name = character.firstName || "This character";
  const active = state?.activeForage ?? null;
  const remainingSeconds = useCraftCountdown(active?.readyAt);
  const isBack = active !== null && remainingSeconds === 0;

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

  const act = async (path: "start" | "finish", body?: object) => {
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
          {isBack ? (
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
          {lastResult.night?.vitalStatus && (
            <p className={styles.lostLine}>
              {name} is now {lastResult.night.vitalStatus}.
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
                  qualityFraction={lastResult.oldGear.quality / lastResult.oldGear.qualityMax}
                />
              </div>
            </>
          )}
          {(() => {
            // One plain line of what the trip cost: ammo shot, light burned, quality worn, gear broken.
            const ammoByFamily: Record<string, number> = {};
            for (const [id, n] of [
              ...Object.entries(lastResult.ammoUsed ?? {}),
              ...Object.entries(lastResult.lightUsed ?? {}),
            ]) {
              const family = id.replace(/_\d+$/, "");
              ammoByFamily[family] = (ammoByFamily[family] ?? 0) + n;
            }
            const lost = [
              ...Object.entries(lastResult.night?.lost ?? {}).map(([key, n]) => `${ATTR_NAMES[key] ?? key} −${n}`),
              ...Object.entries(ammoByFamily).map(([family, n]) => `${n} ${label(family)}${n === 1 ? "" : "s"}`),
              ...(lastResult.gear ?? [])
                .filter((g) => g.wear > 0 && !g.destroyed)
                .map((g) => `${g.name} −${g.wear} quality`),
              ...(lastResult.broken ?? []).map((name) => `${name} (broken)`),
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
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => act("start", { missionId: site.mission!.id })}
                    disabled={disabled}
                  >
                    Go &middot; {formatTripLength(state.durationMinutes)}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {actionError && <p className={styles.error} role="status">{actionError}</p>}

      {popupId && lastResult && (
        <ResourcePopup
          resourceId={popupId}
          tierInfo={catalog}
          owned={lastResult.found[popupId] ?? 0}
          characterId={character.id}
          destinations={[]}
          onClose={() => setPopupId(null)}
        />
      )}
    </section>
  );
}
