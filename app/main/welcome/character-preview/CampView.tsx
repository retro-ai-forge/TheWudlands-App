import { useEffect, useState } from "react";
import styles from "./CharacterTabs.module.css";
import {
  BACKPACK_ACTION_ICON,
  HoldActionPopup,
  ItemGrid,
  VAULT_ACTION_ICON,
  computeBackpackContents,
  postJson,
  type BlueprintTierInfo,
  type RawPlayerData,
  type ResourceTierInfo,
} from "./InventoryTab";
import type { SlotCharacterSummary } from "../SoulSlotGrid";
import { useSound } from "../../SoundProvider";

const CAMP_ITEMS_SOUND = "/sounds/campfire_west_wolf.mp3";
// Ambient loop while camp is empty (hasCampItems false) - swapped in for
// CAMP_ITEMS_SOUND above, same loop/mute/cleanup behavior either way
// (see the shared useEffect below), just a quieter night-wind backdrop
// instead of the crackling campfire.
const CAMP_EMPTY_SOUND = "/sounds/camp_night_wind.mp3";

// A fixed placeholder height for the campfire art at the bottom of the
// screen - reserved out of ItemGrid's own fill-to-bottom measurement (see
// its reserveBottomPx prop) so the two never fight over the same space.
// camp.png stands in for a real campfire gif until one exists (see
// BodyTab.tsx's own camp button, which opens this view) - same icon, just
// shown much larger here as the screen's own centerpiece instead of a
// small button.
const CAMPFIRE_AREA_PX = 220;

/** Opened by clicking the camp button on the Body tab - this character's
 * own gear.itemBalances.camp (finished goods owned but not yet packed into
 * a backpack/saddlepack) plus any gear.items instances sitting at
 * location:"camp" (e.g. dropped there by unequip_item mid-adventure),
 * styled like the Inventory tab's Vault grid, with a campfire centerpiece
 * filling the lower part of the screen below it. */
export function CampView({
  character,
  onPlayerDataUpdated,
  onExitCamp,
}: {
  character: SlotCharacterSummary;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  /** The lower-right exit.webp button's own handler - takes the player
   * back to the Body tab. CharacterPreview.tsx hides its own fixed
   * footer bar (tab row + its own exit.webp close button) while this
   * view is open, so this is the only way out of it once opened. */
  onExitCamp: () => void;
}) {
  const { muted } = useSound();

  // Which camp-wide bulk action popup is open, if any - the lit campfire
  // opens "burn" (HoldActionPopup's own Burn All), the dropped-items icon
  // opens "moveAll" (Move all to backpack), the chopping block opens
  // "chop" (ChopBlockPopup's own bulk recycle). The fire/dropped icons
  // aren't clickable at all unless hasCampItems (see their own render
  // guards below); the chopping block is always clickable (its own
  // preview list is simply empty when there's nothing recyclable), so
  // there's nothing to gate here beyond which of the three was clicked.
  const [campAction, setCampAction] = useState<"burn" | "moveAll" | "chop" | null>(null);

  // Same item-catalog fetch BodyTab.tsx/InventoryTab.tsx each already do
  // independently for their own tierInfo - no shared ancestor state to
  // lift this into without a larger prop-threading change.
  const [itemCatalogTierInfo, setItemCatalogTierInfo] = useState<BlueprintTierInfo>({});
  useEffect(() => {
    fetch("/api/auth/item-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (
          data: Array<{
            id: string;
            name: string;
            familyId: string;
            tier: number;
            kind: string[];
            qualityMax: number | null;
            icon: string;
            stackSize: number;
            description: string;
            sizeClass: string;
            equipSlots: string[][];
            backpackable: boolean;
            gatheringBonuses: string[];
          }>
        ) => {
          const map: BlueprintTierInfo = {};
          for (const item of data) {
            map[item.id] = {
              tier: item.tier,
              familyId: item.familyId,
              kind: item.kind[0] ?? "",
              name: item.name,
              qualityMax: item.qualityMax,
              icon: item.icon,
              stackSize: item.stackSize,
              description: item.description,
              sizeClass: item.sizeClass,
              equipSlots: item.equipSlots,
              backpackable: item.backpackable,
              gatheringBonuses: item.gatheringBonuses,
            };
          }
          setItemCatalogTierInfo(map);
        }
      )
      .catch(() => setItemCatalogTierInfo({}));
  }, []);

  // Same resource-catalog fetch InventoryTab.tsx already does independently
  // for its own resourceTierInfo - needed here too now that a camp-located
  // backpack's popup can show packed raw/processed materials (see
  // packedItems below), not just packed items.
  const [resourceTierInfo, setResourceTierInfo] = useState<ResourceTierInfo>({});
  useEffect(() => {
    fetch("/api/auth/resource-catalog")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (
          data: Array<{
            id: string;
            name: string;
            familyId: string;
            tier: number;
            resourceFamily: string;
            category: "raw" | "processed";
          }>
        ) => {
          const map: ResourceTierInfo = {};
          for (const item of data) {
            map[item.id] = { tier: item.tier, family: item.resourceFamily, category: item.category, name: item.name };
          }
          setResourceTierInfo(map);
        }
      )
      .catch(() => setResourceTierInfo({}));
  }, []);

  // Checked by familyId, not by "Back"/"Side" in slotRef - see BodyTab.tsx's
  // identical check for why (other families can occupy those slot names
  // too). Also counts a camp-located backpack, not just a worn one - see
  // BodyTab's identical check for why.
  const hasBackpackEquipped = character.gear.items.some(
    (instance) => (instance.location === "body" || instance.location === "camp") && instance.familyId === "backpack"
  );
  const hasSaddlepackEquipped = character.gear.items.some(
    (instance) => instance.location === "body" && instance.familyId === "saddlepack"
  );

  // Camp holds two different kinds of things, same split as the Vault
  // tab's own combining logic (see InventoryTab.tsx's playerItemsCombined):
  // flat-count crafted goods (gear.itemBalances.camp) and individually-
  // tracked item instances sitting at location:"camp" - e.g. whatever
  // unequip_item just dropped here because this character is out on an
  // adventure. Without folding the instances in too, anything unequipped
  // mid-adventure would be correctly stored but never show up here.
  const campBalances = character.gear.itemBalances.camp;
  const campInstances = character.gear.items.filter((instance) => instance.location === "camp");
  const campInstanceLookupIds: Record<string, string> = {};
  const campInstanceRowBalances: Record<string, number> = {};
  const campInstanceQuality: Record<string, number | null> = {};
  // Every row shown here - instance or flat-balance alike - is at
  // location:"camp" by construction (this whole view only ever reads
  // items/itemBalances.camp), so ItemDetailPopup's location-gated action
  // buttons (e.g. "Move to backpack") work the same regardless of which
  // kind of row was clicked. Balance ids are filled in below alongside
  // campCombined, once both id sets are known.
  const campLocations: Record<string, "camp"> = {};
  for (const instance of campInstances) {
    campInstanceLookupIds[instance.instanceId] = instance.itemId;
    campInstanceRowBalances[instance.instanceId] = 1;
    campInstanceQuality[instance.instanceId] = instance.quality;
    campLocations[instance.instanceId] = "camp";
  }
  const campCombined: Record<string, number> = { ...campBalances, ...campInstanceRowBalances };
  const campIds = Object.keys(campCombined).filter((id) => campCombined[id] > 0);
  for (const id of Object.keys(campBalances)) {
    campLocations[id] = "camp";
  }

  // Raw/processed materials sitting loose at camp - e.g. the backpack-full
  // fallback of check_out_resource_to_backpack, or an explicit "move to
  // camp" out of the backpack (see ResourcePopup's own "camp" destination).
  const campResourceBalances = character.gear.resources.camp;
  const hasCampResources = Object.values(campResourceBalances).some((qty) => qty > 0);

  // dropped.png (lower-left flavor icon), the campfire lit/unlit swap, the
  // tent's own dimming, and the ambient sound below all treat camp as
  // "active" the moment it holds EITHER kind of thing sitting here -
  // itemBalances/instances (campIds) or raw/processed materials
  // (campResourceBalances) - not just the former. Same emptiness check the
  // grid's own emptyLabel falls back to for campIds specifically, so that
  // and this stay in agreement (both react live to the last thing leaving
  // camp, or to opening an already-empty camp).
  const hasCampItems = campIds.length > 0 || hasCampResources;

  // Tracks hasCampItems live, not just at open - one ambient loop or the
  // other is always playing (CAMP_ITEMS_SOUND with something here,
  // CAMP_EMPTY_SOUND's night wind otherwise), switching the moment
  // hasCampItems itself flips (the last item leaving camp, or the first
  // one landing while already standing here - same trigger dropped.png/
  // campfire_lit.png already react to), same trigger CampView unmounting
  // outright (leaving camp) already stops it on too. Only re-runs when
  // hasCampItems/muted actually flip, not on every render where
  // quantities change but camp's emptiness doesn't - useEffect's own
  // dependency comparison already skips re-firing when hasCampItems
  // stays the same boolean across renders.
  useEffect(() => {
    if (muted) return;
    const audio = new Audio(hasCampItems ? CAMP_ITEMS_SOUND : CAMP_EMPTY_SOUND);
    audio.loop = true;
    // The night-wind loop reads as a lot more present than the campfire
    // one at the same volume - toned down on its own rather than
    // touching CAMP_ITEMS_SOUND's own level.
    if (!hasCampItems) audio.volume = 0.5;
    audio.play().catch(() => {
      // Autoplay can still be blocked without a preceding user gesture in
      // some browsers - opening camp is itself a click, so this should
      // normally succeed, but fail silently either way rather than an
      // unhandled promise rejection.
    });
    return () => {
      audio.pause();
    };
  }, [hasCampItems, muted]);

  // A family:"backpack" instance sitting unequipped in camp (e.g. this
  // character unequipped it here, still holding whatever was packed in it
  // - see Character.gear's own docstring on why storage is character-
  // level, not tied to a specific instance) can be opened the same way
  // the worn one can on the Body tab - see ItemGrid's identical props.
  const packedItems = {
    tierInfo: itemCatalogTierInfo,
    resourceTierInfo,
    ...computeBackpackContents(character),
  };

  return (
    <div className={styles.panel}>
      <ItemGrid
        ids={campIds}
        emptyLabel="Nothing sitting at camp right now."
        tierInfo={itemCatalogTierInfo}
        balances={campCombined}
        lookupIds={campInstanceLookupIds}
        instanceQuality={campInstanceQuality}
        instanceLocations={campLocations}
        source="character"
        hasBackpackEquipped={hasBackpackEquipped}
        hasSaddlepackEquipped={hasSaddlepackEquipped}
        inAdventure={character.availability.inAdventure}
        characterId={character.id}
        onPlayerDataUpdated={onPlayerDataUpdated}
        reserveBottomPx={CAMPFIRE_AREA_PX}
        hideScrollbar
        packedItems={packedItems}
        backpackSlotsUsed={character.gear.backpackSlotsUsed}
        backpackCapacity={character.gear.backpackCapacity}
        resourceBalances={campResourceBalances}
        resourceTierInfo={resourceTierInfo}
        resourceDestinations={[
          ...(hasBackpackEquipped
            ? [{ key: "backpack", icon: BACKPACK_ACTION_ICON, label: "Backpack", endpoint: "stow" }]
            : []),
          ...(!character.availability.inAdventure
            ? [{ key: "vault", icon: VAULT_ACTION_ICON, label: "Vault", endpoint: "check-in-camp" }]
            : []),
        ]}
      />
      <div className={styles.campfireStage} style={{ height: CAMPFIRE_AREA_PX }}>
        {/* Fire's position/size are relative to THIS group (i.e. to the
            tent itself - see .campfireStageFireIcon), not to .campfireStage's
            own corner, so moving/resizing the tent carries the fire along
            with it instead of the two drifting apart. */}
        <div className={styles.campTentGroup}>
          {/* Lit/unlit toggle, same idea as dropped.png below (though this
              one never disappears, just swaps art) - lit whenever camp
              actually holds something, unlit when hasCampItems is false.
              Only the lit state is clickable (opens the "Burn All" popup) -
              nothing to burn while it's unlit, so that version stays
              purely decorative (see .campfireStageFireIconLit's own
              pointer-events:auto, the base rule keeps pointer-events:none). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hasCampItems ? "/images/character/campfire_lit.png" : "/images/character/campfire_unlit.png"}
            alt=""
            role={hasCampItems ? "button" : undefined}
            tabIndex={hasCampItems ? 0 : undefined}
            title={hasCampItems ? "Burn everything in camp" : undefined}
            aria-label={hasCampItems ? "Burn everything in camp" : undefined}
            onClick={hasCampItems ? () => setCampAction("burn") : undefined}
            onKeyDown={
              hasCampItems
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") setCampAction("burn");
                  }
                : undefined
            }
            className={
              hasCampItems
                ? `${styles.campfireStageFireIcon} ${styles.campfireStageFireIconLit}`
                : `${styles.campfireStageFireIcon} ${styles.campfireStageFireIconUnlit}`
            }
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/camp.png"
            alt=""
            className={
              hasCampItems
                ? styles.campfireStageIcon
                : `${styles.campfireStageIcon} ${styles.campfireStageIconEmpty}`
            }
          />
          {/* Bound to the tent group itself (like .campfireStageFireIcon
              above), not the screen edge - sits right of the tent, easing
              only a little further out on wider screens instead of
              tracking the actual viewport edge. Opens ChopBlockPopup's
              own bulk-recycle popup - always clickable, even with
              nothing currently recyclable (that popup's own list is just
              empty then). Dims the same way the tent itself does
              (.campfireStageIconEmpty) while camp is empty. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/character/chopping_block.png"
            alt=""
            role="button"
            tabIndex={0}
            title="Refine everything in camp"
            aria-label="Refine everything in camp"
            onClick={() => setCampAction("chop")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setCampAction("chop");
            }}
            className={
              hasCampItems
                ? styles.campChoppingBlockIcon
                : `${styles.campChoppingBlockIcon} ${styles.campChoppingBlockIconEmpty}`
            }
          />
        </div>
        {hasCampItems && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/character/dropped.png"
            alt=""
            role="button"
            tabIndex={0}
            title="Move everything to backpack"
            aria-label="Move everything to backpack"
            onClick={() => setCampAction("moveAll")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setCampAction("moveAll");
            }}
            className={styles.campDroppedIcon}
          />
        )}
        {campAction === "burn" && (
          <HoldActionPopup
            headline="Burn All"
            label="Hold to BURN ALL"
            icon="/images/character/campfire_lit.png"
            tone="destroy"
            onConfirm={() => postJson(`/api/auth/me/characters/${character.id}/camp/burn-all`)}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setCampAction(null)}
          />
        )}
        {campAction === "moveAll" && (
          <HoldActionPopup
            headline="Move all to backpack"
            label="Hold to MOVE ALL"
            icon="/images/character/dropped.png"
            tone="recycle"
            onConfirm={() => postJson(`/api/auth/me/characters/${character.id}/camp/move-all-to-backpack`)}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setCampAction(null)}
          />
        )}
        {campAction === "chop" && (
          <ChopBlockPopup
            characterId={character.id}
            onPlayerDataUpdated={onPlayerDataUpdated}
            onClose={() => setCampAction(null)}
          />
        )}
        <button
          type="button"
          className={styles.campExitButton}
          title="Back to Body"
          aria-label="Back to Body"
          onClick={onExitCamp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/character/exit.webp" alt="" className={styles.campExitIcon} />
        </button>
      </div>
    </div>
  );
}

/** One recyclable camp item instance/itemBalance, as GET
 * .../camp/refine-preview returns it - what recycling ALL of it would
 * hand back, not yet actually recycled. */
type ChopBlockRow = {
  id: string;
  kind: "instance" | "balance";
  name: string;
  tier: number;
  owned: number;
  recovered: { id: string; name: string; qty: number }[];
};

/** The chopping block's own bulk-recycle popup (see CampView's own
 * onClick on chopping_block.png) - a HoldActionPopup whose extra
 * `children` content is a scrollable checklist of every recyclable camp
 * item/itemBalance, all checked by default (see ChopBlockRow/toggle
 * below). Holding the icon recycles every still-checked row at once,
 * crediting recovered materials straight into camp - see
 * backend.players.refine_camp. */
function ChopBlockPopup({
  characterId,
  onPlayerDataUpdated,
  onClose,
}: {
  characterId: string;
  onPlayerDataUpdated?: (data: RawPlayerData) => void;
  onClose: () => void;
}) {
  // null while the preview fetch is in flight - distinct from [] (fetch
  // resolved, nothing recyclable), so the hold icon stays disabled until
  // there's actually something to act on either way.
  const [rows, setRows] = useState<ChopBlockRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/me/characters/${characterId}/camp/refine-preview`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: ChopBlockRow[] } | null) => {
        if (cancelled) return;
        const loaded = data?.rows ?? [];
        setRows(loaded);
        // Every row starts checked - the player unchecks whatever they
        // don't want swept up, rather than having to opt every row in.
        setSelected(new Set(loaded.map((row) => row.id)));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <HoldActionPopup
      headline="Refine All"
      label="Hold to REFINE ALL"
      icon="/images/character/chopping_block.png"
      tone="recycle"
      disabled={rows === null || selected.size === 0}
      onConfirm={() =>
        postJson(`/api/auth/me/characters/${characterId}/camp/refine-all`, { selected: [...selected] })
      }
      onPlayerDataUpdated={onPlayerDataUpdated}
      onClose={onClose}
    >
      {rows === null ? (
        <p className={styles.recycleResultText}>Checking what can be refined…</p>
      ) : rows.length === 0 ? (
        <p className={styles.recycleResultText}>Nothing in camp can be refined right now.</p>
      ) : (
        // Scrolls on its own (see .chopBlockList) once the list is too
        // tall to fit - the hold bar/icon below it stays on screen either
        // way, never pushed off by a long list.
        <div className={styles.chopBlockList}>
          {rows.map((row) => (
            <label key={row.id} className={styles.chopBlockRow}>
              <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
              <span className={styles.chopBlockRowName}>
                {row.name}
                {row.owned > 1 ? ` x${row.owned}` : ""}
              </span>
              <span className={styles.chopBlockRowRecovered}>
                {row.recovered.map((line) => `${line.qty}x ${line.name}`).join(", ")}
              </span>
            </label>
          ))}
        </div>
      )}
    </HoldActionPopup>
  );
}
