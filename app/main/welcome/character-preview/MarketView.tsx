import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./CharacterTabs.module.css";
import market from "./Market.module.css";
import {
  CONDITION_LABEL,
  ItemIcon,
  conditionOf,
  getTierIndicator,
  postJson,
  type BlueprintTierInfo,
  type RawPlayerData,
} from "./VaultTab";
import { getItemCatalog } from "./catalogCache";
import { getPortraitCropImgStyle } from "@/app/lib/portraitCrop";
import type { ItemInstance, SlotCharacterSummary } from "../types";

/** What the home's selection bar hands over: the goods to offer. */
export type MarketSelection = { instanceIds: string[]; balances: Record<string, number> };

type OfferInstance = { instanceId: string; itemId: string; familyId?: string; quality: number | null };
type Goods = { items: OfferInstance[]; balances: Record<string, number> };
type AskLine = { itemId: string; qty: number; minCondition: number | null };
type Offer = {
  id: string;
  status: "open" | "taken" | "cancelled" | "expired";
  mine: boolean;
  sellerName: string;
  give: Goods;
  ask: AskLine[];
  createdAt: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  paid?: Goods;
  /** Own offers only (my-offers): the character that posted it. */
  seller?: {
    characterId: string;
    name: string;
    portraitUrl: string | null;
    portraitFaceArea: { x: number; y: number; width: number; height: number } | null;
  };
};

/** The posting character's face, cropped like the soul slots - its initial
 * when there's no portrait (or the character is gone). */
function SellerFace({ seller, active }: { seller: NonNullable<Offer["seller"]>; active: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = seller.portraitUrl && seller.portraitUrl !== "empty" && !failed ? seller.portraitUrl : null;
  return (
    <span className={`${market.face} ${active ? market.faceActive : ""}`} title={seller.name}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={seller.name}
          style={seller.portraitFaceArea ? getPortraitCropImgStyle(seller.portraitFaceArea) : { width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={market.faceInitial}>{seller.name.charAt(0) || "?"}</span>
      )}
    </span>
  );
}

// The amounts an offer can ask for (buttons in New offer).
const ASK_AMOUNTS = [1, 2, 5, 10, 20, 50, 100];

const CONDITION_CHOICES: { level: number; label: string }[] = [
  { level: 4, label: "New" },
  { level: 3, label: "Used" },
  { level: 2, label: "Damaged" },
  { level: 1, label: "Broken" },
];

const STATUS_LABEL: Record<Offer["status"], string> = {
  open: "open",
  taken: "sold",
  cancelled: "cancelled",
  expired: "expired",
};

/** Time an offer has left, in its largest unit only: "6d", "17h", "43m". */
function timeLeft(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ending";
  const minutes = Math.floor(ms / 60_000);
  if (minutes >= 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.max(1, minutes)}m`;
}

/** The popup's full time left: "6d 4h 12m", "4h 12m" or "12m". */
function timeLeftFull(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ending";
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Ids of a family from `tier` up - the tiers that can pay an ask
 * (backend.market: asked tier or higher, exact first). */
function payingIds(catalog: BlueprintTierInfo, itemId: string): string[] {
  const asked = catalog[itemId];
  if (!asked) return [itemId];
  return Object.entries(catalog)
    .filter(([, e]) => e.familyId === asked.familyId && e.tier >= asked.tier)
    .sort(([, a], [, b]) => a.tier - b.tier)
    .map(([id]) => id);
}

function canPay(catalog: BlueprintTierInfo, line: AskLine, items: ItemInstance[], balances: Record<string, number>): boolean {
  const ids = new Set(payingIds(catalog, line.itemId));
  if (line.minCondition != null) {
    const min = line.minCondition;
    return items.filter((i) => ids.has(i.itemId) && (i.quality ?? 4) >= min).length >= line.qty;
  }
  let have = 0;
  for (const id of ids) have += balances[id] ?? 0;
  return have >= line.qty;
}

/** One good: icon, count, name, tier (and condition for a tracked piece). */
function GoodChip({ catalog, itemId, qty, quality, minCondition }: {
  catalog: BlueprintTierInfo;
  itemId: string;
  qty: number;
  quality?: number | null;
  minCondition?: number | null;
}) {
  const entry = catalog[itemId];
  const condition = conditionOf(quality);
  const minLabel = minCondition != null ? CONDITION_CHOICES.find((c) => c.level === minCondition)?.label : null;
  return (
    <span className={market.good}>
      {entry && <span className={market.goodTier}>{getTierIndicator(entry.tier)}</span>}
      <span className={market.goodQty}>{qty}×</span>
      <ItemIcon icon={entry?.icon} alt={entry?.name ?? itemId} className={market.goodIcon} />
      <span className={market.goodName}>{entry?.name ?? itemId}</span>
      {condition && <span className={market.goodCondition}>{CONDITION_LABEL[condition]}</span>}
      {minLabel && minLabel !== "Broken" && (
        <span className={market.goodCondition}>{minLabel === "New" ? "New" : `${minLabel} or better`}</span>
      )}
    </span>
  );
}

/** A search over item families (by name) - picks a family id. */
function FamilySearch({ catalog, placeholder, onPick }: {
  catalog: BlueprintTierInfo;
  placeholder: string;
  onPick: (familyId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const families = useMemo(() => {
    const byFamily = new Map<string, { name: string; icon?: string; tier: number }>();
    for (const e of Object.values(catalog)) {
      const seen = byFamily.get(e.familyId);
      if (!seen || e.tier < seen.tier) byFamily.set(e.familyId, { name: e.name ?? e.familyId, icon: e.icon, tier: e.tier });
    }
    return byFamily;
  }, [catalog]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { familyId: string; name: string; icon?: string }[] = [];
    for (const [familyId, f] of families) {
      const pretty = familyId.replace(/_/g, " ");
      if (f.name.toLowerCase().includes(q) || pretty.includes(q)) out.push({ familyId, name: pretty, icon: f.icon });
      if (out.length >= 8) break;
    }
    return out;
  }, [families, query]);
  return (
    <div className={market.search}>
      <input
        className={market.input}
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <ul className={market.searchList}>
          {matches.map((m) => (
            <li key={m.familyId}>
              <button
                type="button"
                className={market.searchItem}
                onClick={() => { onPick(m.familyId); setQuery(""); }}
              >
                <ItemIcon icon={m.icon} alt="" className={market.goodIcon} />
                <span>{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One good in an offer line: "6× item icon" - the row's tier icon sits
 * in front of the whole cell (RowGoods), details in the popup. */
function MiniGood({ catalog, itemId, qty }: {
  catalog: BlueprintTierInfo;
  itemId: string;
  qty: number;
}) {
  const entry = catalog[itemId];
  return (
    <span className={market.mini}>
      <span className={market.goodQty}>{qty}×</span>
      <ItemIcon icon={entry?.icon} alt={entry?.name ?? itemId} className={market.goodIcon} />
    </span>
  );
}

/** Instances of the same item and condition shown together as "2×". */
function groupedGoods(goods: Goods): { itemId: string; qty: number; quality: number | null }[] {
  const rows = new Map<string, { itemId: string; qty: number; quality: number | null }>();
  for (const i of goods.items) {
    const key = `${i.itemId}|${i.quality ?? ""}`;
    const row = rows.get(key);
    if (row) row.qty += 1;
    else rows.set(key, { itemId: i.itemId, qty: 1, quality: i.quality });
  }
  for (const [itemId, qty] of Object.entries(goods.balances)) rows.set(itemId, { itemId, qty, quality: null });
  return [...rows.values()];
}

// Goods shown per offer row; the rest only in the popup ("2+").
const ROW_GOODS = 2;

/** At most ROW_GOODS goods, then "n+" for the ones only the popup lists. */
function RowGoods({ catalog, rows: unsorted }: {
  catalog: BlueprintTierInfo;
  rows: { itemId: string; qty: number; quality?: number | null }[];
}) {
  // The biggest amounts first, so the row shows what the offer is mostly about.
  const rows = [...unsorted].sort((a, b) => b.qty - a.qty);
  const hidden = rows.length - ROW_GOODS;
  // One tier icon in front: the highest tier among all of the cell's goods.
  const topTier = Math.max(0, ...rows.map((g) => catalog[g.itemId]?.tier ?? 0));
  return (
    <span className={market.lineGoods}>
      {topTier > 0 && getTierIndicator(topTier)}
      {rows.slice(0, ROW_GOODS).map((g) => (
        <MiniGood key={`${g.itemId}|${g.quality}`} catalog={catalog} itemId={g.itemId} qty={g.qty} />
      ))}
      {hidden > 0 && <span className={market.more}>{hidden}+</span>}
    </span>
  );
}

/** Offers as a table - given | → | asked (| time left / status for your
 * own) - so the arrows line up in one column. A row opens the popup. */
function OfferTable({ catalog, offers, showStatus, activeCharacterId, onOpen }: {
  catalog: BlueprintTierInfo;
  offers: Offer[];
  showStatus: boolean;
  /** My offers: the open character - its rows' faces get a gold ring. */
  activeCharacterId?: string;
  onOpen: (offer: Offer) => void;
}) {
  return (
    // One line per offer; on a very narrow screen the table scrolls sideways
    // rather than wrapping.
    <div className={market.tableScroll}>
      <table className={market.table}>
        <tbody>
          {offers.map((offer) => {
            const sold = offer.status === "taken" && offer.paid;
            return (
              <tr
                key={offer.id}
                className={`${market.tableRow} ${offer.status !== "open" ? market.offerClosed : ""}`}
                tabIndex={0}
                role="button"
                aria-label="Show offer details"
                onClick={() => onOpen(offer)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(offer); }
                }}
              >
                {offer.seller && (
                <td className={market.cellFace}>
                  <SellerFace seller={offer.seller} active={offer.seller.characterId === activeCharacterId} />
                </td>
              )}
              <td className={`${market.cellGoods} ${market.cellGive}`}>
                  <RowGoods catalog={catalog} rows={groupedGoods(offer.give)} />
                </td>
                <td className={market.cellArrow}>→</td>
                <td className={market.cellGoods}>
                  {sold ? (
                    <RowGoods catalog={catalog} rows={groupedGoods(offer.paid as Goods)} />
                  ) : (
                    <RowGoods catalog={catalog} rows={offer.ask} />
                  )}
                </td>
                {showStatus && (
                  <td className={market.cellStatus}>
                    {/* A cancelled row is only greyed out - its popup says so. */}
                    {offer.status === "open"
                      ? timeLeft(offer.expiresAt)
                      : offer.status === "cancelled" ? null : STATUS_LABEL[offer.status]}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A full detail row: icon, count and name, then tier and condition spelled out. */
function DetailRow({ catalog, itemId, qty, tierText, conditionText }: {
  catalog: BlueprintTierInfo;
  itemId: string;
  qty: number;
  tierText: string;
  conditionText: string | null;
}) {
  const entry = catalog[itemId];
  return (
    <li className={market.detailRow}>
      {entry && getTierIndicator(entry.tier)}
      <span className={market.goodQty}>{qty}×</span>
      <ItemIcon icon={entry?.icon} alt={entry?.name ?? itemId} className={market.detailIcon} />
      <span className={market.detailText}>
        <span>{entry?.name ?? itemId}</span>
        <span className={market.detailSub}>
          {tierText}
          {conditionText && <> · {conditionText}</>}
        </span>
      </span>
    </li>
  );
}

function OfferPopup({ catalog, offer, payable, busy, onAccept, onCancel, onDelete, onClose }: {
  catalog: BlueprintTierInfo;
  offer: Offer;
  payable: boolean;
  busy: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const tierOf = (itemId: string) => catalog[itemId]?.tier;
  const goodsRows = (goods: Goods) =>
    groupedGoods(goods).map((g) => {
      const condition = conditionOf(g.quality);
      return (
        <DetailRow
          key={`${g.itemId}|${g.quality}`}
          catalog={catalog}
          itemId={g.itemId}
          qty={g.qty}
          tierText={`Tier ${tierOf(g.itemId) ?? "?"}`}
          conditionText={condition ? `Condition: ${CONDITION_LABEL[condition]}` : null}
        />
      );
    });
  const askRows = offer.ask.map((a) => {
    const min = a.minCondition != null ? CONDITION_CHOICES.find((c) => c.level === a.minCondition) : null;
    return (
      <DetailRow
        key={a.itemId}
        catalog={catalog}
        itemId={a.itemId}
        qty={a.qty}
        tierText={`Tier ${tierOf(a.itemId) ?? "?"} or higher`}
        conditionText={
          !min ? null
            : min.level === 4 ? "Condition: New"
            : min.level === 1 ? "Any condition"
            : `Condition: ${min.label} or better`
        }
      />
    );
  });
  const sold = offer.status === "taken" && offer.paid;
  return (
    // Any click closes the popup - on the card, next to it, or on a button
    // (Trade / Cancel offer do their work first, then it closes too).
    <div className={styles.craftConfirmOverlay} onClick={onClose}>
      <div className={`${styles.craftConfirmCard} ${market.popup}`} role="dialog" aria-modal="true">
        <p className={styles.craftConfirmText}>
          {offer.status === "cancelled"
            ? "Cancelled"
            : offer.mine
              ? `Your offer${offer.seller ? ` · ${offer.seller.name}` : ""}`
              : `Offer from ${offer.sellerName}`}
          {offer.status !== "cancelled" && (
            <span className={market.popupMeta}>
              {offer.status === "open" ? timeLeftFull(offer.expiresAt) : STATUS_LABEL[offer.status]}
            </span>
          )}
        </p>
        <p className={market.label}>{offer.mine ? "You give" : "You get"}</p>
        <ul className={market.detailList}>{goodsRows(offer.give)}</ul>
        <p className={market.label}>{offer.mine ? (sold ? "You got" : "You want") : "You pay"}</p>
        <ul className={market.detailList}>{sold ? goodsRows(offer.paid as Goods) : askRows}</ul>
        {!offer.mine && offer.status === "open" && !payable && (
          <p className={market.hint}>Not enough of what&apos;s asked at home.</p>
        )}
        {offer.mine && offer.status !== "open" ? (
          // A closed offer (sold, cancelled, expired): only Delete, lower right - frees its slot.
          <div className={`${styles.craftConfirmButtons} ${market.buttonsRight}`}>
            <button type="button" className={market.danger} disabled={busy} onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : (
        <div className={styles.craftConfirmButtons}>
          {!offer.mine && offer.status === "open" && (
            <button type="button" className={`${styles.craftConfirmCraft} ${market.tradeBtn}`} disabled={busy || !payable} onClick={onAccept}>
              Trade
            </button>
          )}
          {offer.mine && offer.status === "open" && (
            <button type="button" className={market.danger} disabled={busy} onClick={onCancel}>
              Cancel offer
            </button>
          )}
          <button type="button" className={styles.craftConfirmCancel} onClick={onClose}>
            Close
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

export function MarketView({
  character,
  selection,
  onSelectionUsed,
  onPlayerDataUpdated,
  onExit,
}: {
  character: SlotCharacterSummary;
  selection: MarketSelection;
  onSelectionUsed: () => void;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onExit: () => void;
}) {
  const [catalog, setCatalog] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    let alive = true;
    getItemCatalog().then((c) => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, []);

  const homeItems = useMemo(
    () => character.gear.items.filter((i) => i.location === "home"),
    [character.gear.items]
  );
  const homeBalances = useMemo(() => character.gear.itemBalances?.home ?? {}, [character.gear.itemBalances]);

  // ── New offer ──────────────────────────────────────────────────────────
  const giveItems = useMemo(
    () => homeItems.filter((i) => selection.instanceIds.includes(i.instanceId)),
    [homeItems, selection.instanceIds]
  );
  const [giveAmounts, setGiveAmounts] = useState<Record<string, number>>(selection.balances);
  useEffect(() => setGiveAmounts(selection.balances), [selection.balances]);
  const hasSelection = giveItems.length > 0 || Object.keys(selection.balances).length > 0;

  const [askFamily, setAskFamily] = useState<string | null>(null);
  const [askTier, setAskTier] = useState(1);
  const [askQty, setAskQty] = useState(1);
  // The minimum condition asked for a tracked item - New unless changed.
  const [askMinCondition, setAskMinCondition] = useState(4);
  const askTiers = useMemo(
    () => Object.entries(catalog)
      .filter(([, e]) => e.familyId === askFamily)
      .sort(([, a], [, b]) => a.tier - b.tier),
    [catalog, askFamily]
  );
  const askItemId = askTiers.find(([, e]) => e.tier === askTier)?.[0] ?? askTiers[0]?.[0] ?? null;
  const askTracked = askItemId ? !!catalog[askItemId]?.tracked : false;
  const pickAskFamily = (familyId: string) => {
    setAskFamily(familyId);
    setAskMinCondition(4);
    const tiers = Object.values(catalog).filter((e) => e.familyId === familyId).map((e) => e.tier);
    setAskTier(Math.min(...tiers));
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Lists ──────────────────────────────────────────────────────────────
  const [offers, setOffers] = useState<Offer[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [filterFamily, setFilterFamily] = useState<string | null>(null);
  // Tiers of the offered goods to show (none = all), like the vault's T1-T6 buttons.
  const [filterTiers, setFilterTiers] = useState<number[]>([]);
  const toggleTier = (tier: number) =>
    setFilterTiers((prev) => (prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier].sort()));
  const [mine, setMine] = useState<Offer[]>([]);
  // Most open offers a player may have (backend market-rules.json maxOpenOffers).
  const [maxOpen, setMaxOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOffers = useCallback(async (after: string | null) => {
    const params = new URLSearchParams();
    if (filterFamily) params.set("familyId", filterFamily);
    if (filterTiers.length) params.set("tiers", filterTiers.join(","));
    if (after) params.set("after", after);
    const data = await getJson<{ offers: Offer[]; next: string | null }>(`/api/auth/market/offers?${params}`);
    if (!data) return;
    setOffers((prev) => (after ? [...prev, ...data.offers] : data.offers));
    setNext(data.next);
  }, [filterFamily, filterTiers]);

  const loadMine = useCallback(async () => {
    const data = await getJson<{ offers: Offer[]; maxOpen?: number }>("/api/auth/market/my-offers");
    if (data) {
      setMine(data.offers);
      if (data.maxOpen) setMaxOpen(data.maxOpen);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOffers(null), loadMine()]).finally(() => setLoading(false));
  }, [loadOffers, loadMine]);

  const afterWrite = async (r: Awaited<ReturnType<typeof postJson>>) => {
    if (r.ok) {
      setError(null);
      onPlayerDataUpdated?.(r.data);
    } else {
      setError(r.detail ?? "Something went wrong - please try again.");
    }
    await Promise.all([loadOffers(null), loadMine()]);
    return r.ok;
  };

  const postOffer = async () => {
    if (!askItemId || busy) return;
    setBusy(true);
    const r = await postJson(`/api/auth/me/characters/${character.id}/market/offers`, {
      instanceIds: giveItems.map((i) => i.instanceId),
      balances: Object.fromEntries(Object.entries(giveAmounts).filter(([, q]) => q > 0)),
      ask: { itemId: askItemId, qty: askQty, minCondition: askTracked ? askMinCondition : null },
    });
    if (await afterWrite(r)) {
      setAskFamily(null);
      onSelectionUsed();
    }
    setBusy(false);
  };

  // The offer whose details popup is open (Accept / Cancel live there).
  const [opened, setOpened] = useState<Offer | null>(null);
  const accept = async (offer: Offer) => {
    setOpened(null);
    if (busy) return;
    setBusy(true);
    await afterWrite(await postJson(`/api/auth/me/characters/${character.id}/market/offers/${offer.id}/accept`));
    setBusy(false);
  };
  const cancel = async (offer: Offer) => {
    setOpened(null);
    if (busy) return;
    setBusy(true);
    await afterWrite(await postJson(`/api/auth/market/offers/${offer.id}/cancel`));
    setBusy(false);
  };
  // Clears a closed offer (sold, cancelled, expired) from "My offers", freeing its slot -
  // only its record, the goods were delivered when it closed.
  const remove = async (offer: Offer) => {
    setOpened(null);
    if (busy) return;
    setBusy(true);
    const r = await postJson(`/api/auth/market/offers/${offer.id}/delete`);
    setError(r.ok ? null : r.detail ?? "Something went wrong - please try again.");
    await loadMine();
    setBusy(false);
  };


  return (
    <div className={styles.panel}>
      <div className={market.page}>
        {error && <p className={market.error}>{error}</p>}

        {hasSelection && (
          <section className={market.box}>
            <h2 className={market.heading}>New offer</h2>
            <table className={market.giveTable}>
              <tbody>
                {giveItems.map((i) => {
                  const entry = catalog[i.itemId];
                  const condition = conditionOf(i.quality);
                  return (
                    <tr key={i.instanceId}>
                      <td className={market.giveTier}>{entry && getTierIndicator(entry.tier)}</td>
                      <td><ItemIcon icon={entry?.icon} alt="" className={market.goodIcon} /></td>
                      <td className={market.giveName}>{entry?.name ?? i.itemId}</td>
                      <td className={market.giveAmount}>{condition ? CONDITION_LABEL[condition] : "1"}</td>
                    </tr>
                  );
                })}
                {Object.entries(selection.balances).map(([id, max]) => {
                  const entry = catalog[id];
                  return (
                    <tr key={id}>
                      <td className={market.giveTier}>{entry && getTierIndicator(entry.tier)}</td>
                      <td><ItemIcon icon={entry?.icon} alt="" className={market.goodIcon} /></td>
                      <td className={market.giveName}>{entry?.name ?? id}</td>
                      <td className={market.giveAmount}>
                        <span className={market.giveSlider}>
                          <input
                            type="range"
                            className={market.slider}
                            min={1}
                            max={max}
                            step={1}
                            value={Math.max(1, giveAmounts[id] ?? max)}
                            disabled={max <= 1}
                            aria-label={`Amount of ${entry?.name ?? id} to give`}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(max, Math.floor(Number(e.target.value) || 1)));
                              setGiveAmounts((prev) => ({ ...prev, [id]: v }));
                            }}
                          />
                          <span className={market.giveOf}>{Math.max(1, giveAmounts[id] ?? max)}/{max}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className={market.label}>You want</p>
            {askFamily && askItemId ? (
              <div className={market.askEditor}>
                <div className={market.amountRow} role="radiogroup" aria-label="How many you want">
                  {ASK_AMOUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={askQty === n}
                      className={`${market.chip} ${market.amountBtn} ${askQty === n ? market.chipActive : ""}`}
                      onClick={() => setAskQty(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className={market.askLine}>
                  <GoodChip catalog={catalog} itemId={askItemId} qty={askQty} minCondition={askTracked ? askMinCondition : null} />
                  <button type="button" className={market.linkButton} onClick={() => setAskFamily(null)}>change</button>
                </div>
                <div className={market.askTierRow}>
                  <div className={market.tierFilter}>
                    {askTiers.map(([id, e]) => (
                      <button
                        key={id}
                        type="button"
                        className={`${styles.vaultFilterBtn} ${e.tier === askTier ? styles.vaultFilterBtnActive : ""}`}
                        title={`Tier ${e.tier}`}
                        aria-pressed={e.tier === askTier}
                        onClick={() => setAskTier(e.tier)}
                      >
                        {getTierIndicator(e.tier)}
                      </button>
                    ))}
                  </div>
                  {/* Posting needs an asked item, so it sits with its tiers. */}
                  <button
                    type="button"
                    className={`${market.primary} ${market.postBtn}`}
                    disabled={busy || !askItemId || (giveItems.length === 0 && !Object.values(giveAmounts).some((q) => q > 0))}
                    onClick={postOffer}
                  >
                    Post offer
                  </button>
                </div>
                {askTracked && (
                  <div className={market.row}>
                    <span className={market.label}>At least</span>
                    {CONDITION_CHOICES.map((c) => (
                      <button
                        key={c.level}
                        type="button"
                        className={`${market.chip} ${askMinCondition === c.level ? market.chipActive : ""}`}
                        onClick={() => setAskMinCondition(c.level)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <FamilySearch catalog={catalog} placeholder="Search what you want…" onPick={pickAskFamily} />
            )}
          </section>
        )}

        <section className={market.box}>
          <div className={market.headingRow}>
            <h2 className={market.heading}>Offers</h2>
            <div className={market.tierFilter}>
              {[1, 2, 3, 4, 5, 6].map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={`${styles.vaultFilterBtn} ${filterTiers.includes(tier) ? styles.vaultFilterBtnActive : ""}`}
                  title={`Offers of tier ${tier}`}
                  aria-pressed={filterTiers.includes(tier)}
                  onClick={() => toggleTier(tier)}
                >
                  {getTierIndicator(tier)}
                </button>
              ))}
            </div>
          </div>
          <div className={market.row}>
            {filterFamily ? (
              <>
                <span className={market.filter}>{filterFamily.replace(/_/g, " ")}</span>
                <button type="button" className={market.linkButton} onClick={() => setFilterFamily(null)}>show all</button>
              </>
            ) : (
              <FamilySearch catalog={catalog} placeholder="Filter by item…" onPick={setFilterFamily} />
            )}
          </div>
          {loading ? (
            <p className={market.hint}>Loading…</p>
          ) : offers.length === 0 ? (
            <p className={market.hint}>No offers right now.</p>
          ) : (
            <OfferTable catalog={catalog} offers={offers} showStatus={false} onOpen={setOpened} />
          )}
          {next && (
            <button type="button" className={market.linkButton} onClick={() => loadOffers(next)}>
              Show more
            </button>
          )}
        </section>

        <section className={market.box}>
          <div className={market.headingRow}>
            <h2 className={market.heading}>My offers</h2>
            {maxOpen != null && (
              <span className={market.openCount} title="Your offers, open or closed / most you can have">
                {mine.length}/{maxOpen}
              </span>
            )}
          </div>
          {mine.length === 0 ? (
            <p className={market.hint}>
              No offers. Select goods at home and press the market button to post one.
            </p>
          ) : (
            <OfferTable catalog={catalog} offers={mine} showStatus activeCharacterId={character.id} onOpen={setOpened} />
          )}
        </section>
      </div>

      {opened && (
        <OfferPopup
          catalog={catalog}
          offer={opened}
          payable={opened.ask.every((a) => canPay(catalog, a, homeItems, homeBalances))}
          busy={busy}
          onAccept={() => accept(opened)}
          onCancel={() => cancel(opened)}
          onDelete={() => remove(opened)}
          onClose={() => setOpened(null)}
        />
      )}

      {busy && (
        <div className={styles.batchLoadingOverlay}>
          <div className={styles.batchSpinner} />
        </div>
      )}

      <button type="button" className={styles.homeExitButton} title="Back" aria-label="Back" onClick={onExit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/character/char-preview-close.png" alt="" className={styles.homeExitIcon} />
      </button>
    </div>
  );
}
