# Crafting diagram structure

Spec for how `test-recipes.drawio.xml` (and any future recipe diagram in this
folder) is organized. Follow this when adding or regenerating recipes so the
diagram stays readable as it grows.

## Layout: output centered below its inputs

A recipe's output node is x-positioned at the horizontal midpoint of its
inputs (materials + tool, when the tool sits among them rather than off to
one side) - never left-aligned to the first input or offset by a fixed slot
width. Centering keeps the converging edges roughly symmetric instead of
all leaning toward one side of the output, which reads as lopsided
especially on wider recipes (3-4 inputs). Applies everywhere a recipe has
more than one input, on top of - not instead of - the interior-input
y-staggering below.

## Layout: staggering 3+-input recipes

When a recipe has more than two inputs, drawing all of them on one flat row
crowds their orthogonal edges right above the output node. Fix: every
*interior* input (not the first, not the last, by x-position) is drawn half
a node-height higher (22px, for the standard 44px-tall node) than the first
and last. A 3-input recipe raises its middle input; a 4-input recipe raises
its two middle inputs. Endpoints and the tool (when it sits last, as usual)
stay on the base row. Applied throughout, including to every pre-existing
3+-input recipe (`clockwork_mechanism`, `ink`, `written_scroll`,
`distilled_essence`, `metal_ingot`, `metal_bar`, `sword`,
`armor_plate`, `wooden_shield`, `cart`, `glass_lantern`, `garment`), not just
new ones.

## Yield multipliers were dropped in favor of halved input costs

Recipes used to carry a `(yield Nx)` annotation on the output (`coal`,
`bone_shard`, `fired_brick`) meaning "this craft produces N units." That's a
second axis of variation on top of input quantity, and it's redundant: a
recipe that costs 6 wood and yields 2 coal has the exact same wood-per-coal
ratio as one that costs 3 wood and yields 1 coal. All three were rewritten
to the single-output form (`coal` now costs 3 wood, `bone_shard` 2 bone,
`fired_brick` 2 refined_clay) and the yield annotation removed. Every recipe
in this diagram now produces exactly one unit of its output; cost-per-craft
is the only thing that varies.

## Layout: new recipes wrap into their real section, never bolt on below everything

A section that gains new recipes after the fact must wrap *within its own
row band*, not get appended as a disconnected block under Section 3 - even
though every recipe there is technically self-contained regardless of where
it sits on the canvas, a chunk of "Section 1" floating below the whole
diagram reads as an unrelated appendix, not as Section 1. Concretely: when
Section 1 or Section 2 needs new rows, every row at or below the insertion
point (the rest of Section 1/2, all of Section 2/3) shifts down by however
much room the new rows need, so the new content lands in the gap it just
opened up instead of tacked on past the diagram's true end. Section 3, being
last, only ever needs to grow downward - but still directly below the rest
of Section 3, with the standard section gap, not after some other section's
own new content that happens to end at a smaller y.

## The one hard rule: no node has more than one outgoing edge

Every material or tool that appears as an ingredient is a **fresh, dedicated
copy** — never the same node instance feeding two different recipes. If two
recipes both need "T1 plank", draw "T1 plank" twice, each with its own single
outgoing edge. This is what keeps the diagram free of crossing/overlapping
lines: every node's edges are trivially local, because there's only ever one.

It's fine — expected — for the same label to appear dozens of times across
the diagram. Duplication is cheap; shared nodes are what make diagrams
unreadable at this scale.

## Three sections, top to bottom, each separated by a visual gap

### Section 1 — Raw → Processed
One or two **raw** materials combine into one **processed** result. No tool.
Nothing continues past the processed node within this section — it's a
closed leaf recipe, not a step in a longer visible chain.

- Most recipes are a single raw material (`ore → refined_ore`).
- Some should genuinely **combine multiple raw materials** into one output,
  the way EnderIO's Binder Composite mixes gravel + clay + sand into one
  intermediate, or a real alloy blends two ores in a fixed ratio (e.g.
  Tinkers' Construct's Aluminum Brass, 3 aluminum : 1 copper). Don't default
  every recipe to a single input just because it's simpler to draw.
- **Not everything belongs here.** If turning a raw material into its
  processed form realistically requires equipment — tanning hide needs a
  rack, cutting a gem needs a lapidary bench, EnderIO's alloy nuggets need a
  casting mold — that conversion is a Tier-3-style recipe (tool +
  material → product), not a Section 1 entry, even though the *output* still
  reads as a "processed material" that other recipes will later consume as
  an ingredient. Move it down.

### Section 2 — Processed (+ raw, + existing products) → Tool
Tools are built, not consumed. Each tool's build recipe uses fresh copies of
whatever it needs — mostly processed materials, but a raw material alongside
them is fine (a wooden tool frame plus a raw fiber binding, say).

Don't make every tool a cheap single-ingredient recipe. Real crafting
systems gate their better tools behind earlier ones:

- Tinkers' Construct's Tool Forge (the upgraded tool station) is built from
  a Tool Station + iron blocks + seared brick — an existing tool as a
  prerequisite, not just raw ingredients.
- EnderIO's Dark Steel Anvil needs Dark Steel blocks *and* Dark Steel
  ingots — multiple processed materials, not one.

So: an advanced tool's build recipe can require an existing **product**
copied in from Section 3 (e.g. a metal bar), not only Section‑1‑level
materials. When that happens, the pulled-in node still uses its Section‑3
color (tier3/final), even though it's sitting in the Section 2 band — that
color is what signals "this ingredient is itself the output of a bigger
recipe," at a glance.

### Section 3 — Tool + Processed (+ raw) → Product
A recipe here always ends in exactly one product and is never connected to
any other product's recipe. Inputs are fresh copies of processed materials
(and raw materials, where a recipe genuinely consumes something raw
directly rather than its Section‑1 refined form) plus one tool copy.

This section holds both:
- true end products (sword, garment, glass_lantern — the kind a player
  equips or uses), and
- further-refined intermediate materials that themselves needed a tool to
  make (metal_bar, cut_crystal, a clockwork mechanism) — these are
  legitimate Section 3 entries too, and other Section 3 recipes (or Section
  2 tool builds) may then reference *fresh copies* of them as ingredients.

### Starter tool: the Knife

Every character now begins with a Knife already in hand - the one tool in
this diagram with no build recipe of its own; it never appears as a
recipe's *output*, only as an ingredient. Everywhere else a Section 3
recipe needs "a tool," that tool was itself built in Section 2. The Knife
is the deliberate exception: real survival/crafting games gate their
*very* first crafts behind a tool you either start with or make from bare
hands before anything else exists to build it with (Valheim's earliest
tools - the club, then the stone axe - exist for exactly this reason: the
game can't require a tool to make your first tool). Giving every character
a Knife for free plays the same role here without an awkward "hands only"
Section 0: it's what turns `trophy_charm` + `bone_shard` (raw monster/bone
byproducts nothing else consumed - see below) and a plain raw log into
usable output on turn one, before any Section 2 tool has been built.

Knife recipes are drawn like any other Section 3 entry (tool + processed
(+raw) → product) and follow the same fresh-copy rule - if two recipes both
need the Knife, it's drawn twice. It's styled as a tool (blue, bold) but
with a dashed border and the label `Knife (starter, no recipe)`, so it
reads unambiguously as "granted, not crafted" even in a plain-text export.

Real cutting/slicing/whittling actions are the Knife's whole domain, and it
now covers most of them where nothing else already implies a blade: `club`
(raw wood - Valheim's actual first weapon, the precedent already cited
above), `sharpened_stick`, `hunters_charm`, `dressed_meat` (raw `meat`,
butchered before it can be cooked - see Hearth below), `trimmed_pelt` (raw
`hide`, cut to shape without tanning - `hide` is kept whole per its own
section below, unlike `skin`), and `fur_garment` (a second Knife pass over
`trimmed_pelt`, the fur equivalent of woven `garment`). Recipes that already
consume a `dagger` as an ingredient (`enchanted_blade`) don't also need a
Knife - the blade requirement is already satisfied by the dagger itself.

## Blueprints gate every higher-level armor, weapon, and tool

Knife-tier basics (`club`, `sharpened_stick`, `hunters_charm`, `dressed_meat`,
`trimmed_pelt`, `fur_garment`, `firewood`) and plain materials/food/reagents
need nothing but their ingredients and a tool. Everything past that - every
Section 2 tool build, and every Section 3 recipe whose result is armor, a
weapon, or a tool - additionally needs a **Blueprint**, a recipe-specific
reagent (`Blueprint: Furnace`, `Blueprint: Sword`, `Blueprint: Chainmail`,
...) drawn purple, one fresh copy per recipe like any other ingredient. It's
the classic "learn the schematic before you can build it" gate (crafting
scrolls/schematics in countless RPGs), and it's *why* the line is drawn at
armor/weapon/tool specifically: those are the results worth gating behind
found/earned knowledge, while a stew or a trimmed pelt isn't.

Concretely: in the Weapons section, `club` and `sharpened_stick`
(Knife-tier, no forge involved) are the only two of the sixteen weapons
without a Blueprint - every Anvil/Table/Enchanter's-Table weapon in that
same section has one. Same shape on the armor_plate/beam/wooden_shield row:
`beam` (a construction part, not equipment) is the one recipe left without
one.

## Color legend

| Style | Meaning |
|---|---|
| Green | Raw material |
| Yellow | Section 1 processed material |
| Blue, bold | Tool |
| Blue, bold, dashed | Starter tool (every character has one; no build recipe) |
| Purple | Blueprint (required by every higher-level armor/weapon/tool recipe) |
| Orange | Section 3 intermediate (further-refined, feeds other recipes) |
| Red, bold | Section 3 end product |

## Base catalog only holds raw materials, never crafted goods

Two families got caught doing this and were fixed the same way — worth
checking for whenever a new family is proposed:

- **`leather`** — its tier-1 item was `tanned_leather`, an already-tanned
  good sitting at the base tier of its own family, directly grantable to
  players via professions. That contradicted this diagram's own `leather`
  recipe, which needs a raw material to tan. Fixed by removing `leather`
  from `base-resource-items.json` entirely (it's not a base/raw family) and
  adding **`skin`** (raw pelt) in its place — `skin` tans into `leather` via
  the Tanning Rack (Section 3), and `leather` now only exists as that
  recipe's output, never a starting resource. `CraftStone` also needed a
  real stone family (it had been using `ore` as a workaround), so the freed
  catalog slot became **`stone`** instead of a second pelt family.

  `hide` was deliberately left untouched through all of this — it's a
  separate, distinct raw family reserved for winter-wear/insulation use
  (fur kept whole, not tanned). Don't reuse `hide` for tanning inputs;
  that's `skin`'s job. It's since been built out (see "Cooking, and the
  last two raw families" below): `trimmed_pelt` (`hide` + Knife, no
  tanning — cut to shape, fur kept whole, exactly the distinction this
  paragraph draws) feeds `fur_garment`, the fur equivalent of the woven
  `garment` `skin`/`leather` already had.

- **`cloth`** — same shape of problem: its items (`Burlap Cloth`, `Cotton
  Cloth`, `Wool Cloth`, `Silk Cloth`...) already describe *finished, woven*
  fabric, yet this diagram was treating raw `cloth` as what gets spun into
  thread. Real fiber (flax, raw wool, raw silk) is what's spun; cloth is
  what a Loom weaves from thread — matching this diagram's own
  `woven_cloth` step. Fixed by replacing `cloth` with **`fiber`**
  (hemp_fiber → moon_fiber) in `base-resource-items.json`; `fiber` now
  feeds the Spinning Wheel's `thread` recipe (Section 3), and `cloth` no
  longer exists in the base catalog at all — `woven_cloth` is the only
  "cloth" concept now, and it's correctly a crafted good, not a raw one.

- **`parchment`** — same problem again: real parchment/vellum is scraped
  and stretched animal skin (vellum specifically means calfskin), not
  something gathered raw. Fixed by replacing `parchment` with **`reed`**
  (river_reed → worldreed) — a genuinely raw, harvestable plant material
  distinct from `wood`/`fiber` — rather than overloading `skin` with a
  third meaning (it already covers both tanning and, arguably, vellum-style
  stretching, so a dedicated `reed` family keeps scribes' raw material
  distinct). `reed` now feeds `written_scroll` directly (Section 3, via the
  Quill); the reed-into-parchment pressing step is folded into that one
  recipe rather than modeled as its own Section 1/3 step.

## Profession categories need a real family fit, not a workaround

Same underlying issue as above but the other direction: a category using an
unrelated family just because nothing better existed. `CraftStone` used to
grant `ore` (fixed by adding `stone`, see above). `Food` (baker, butcher,
brewmaster, cook, pastry, apiarist, barkeep, server — 8 professions, the
largest category) was granting `herbs, bone, wood` — none of them actual
food ingredients (wood is fuel, bone is at best broth stock). Fixed by
adding two real families and swapping them in:

- **`meat`** (rabbit_meat → dragon_meat) — the butcher/cook's raw
  ingredient, mirroring Minecraft's animal-meat-then-cooked pattern.
- **`harvest`** (grain → ambrosia, one family covering grain for
  brewing/baking, root vegetables, `wild_mushroom` — Minecraft's
  easiest/most potent food source — orchard fruit, and honeycomb for the
  apiarist) — one family deliberately spans several professions' needs
  rather than fragmenting into a family per crop type.

`Food` is now `["meat", "harvest", "herbs"]` — `herbs` stayed, since spices
are a genuine culinary use unlike the two it replaced.

When a category's grant doesn't actually serve its professions, that's the
signal to add a proper family rather than keep reaching for a stand-in.

## Underused resource families

The base catalog (`backend/data/base-resource-items.json`) has 4 families
that exist but aren't wired into any profession's starting kit:
`venom`, `pigment`, `essence`, `clockwork` — deliberately loot/gameplay-only
(see `backend/data/profession-resource-families.json`). They're fair game
for recipes, same as any other family, not just decoration for loot tables.
Research and the pattern each now follows in `test-recipes.drawio.xml`:

- **`clockwork`** — TerraFirmaCraft's Clockwork Gear (chisel + brass disc)
  and RuneScape's clockwork (steel bar at a Clockmaker's bench) both treat
  it as a tool-made component that then gates a *more advanced* build, not
  a raw drop you use directly. Create mod's Precision Mechanism is the same
  shape: a component that unlocks the next tier of machine. We follow this
  with `clockwork_mechanism` (raw clockwork + refined_ore + Anvil, Section
  3) feeding into the Loom's own build recipe (Section 2) — a tool that
  needs a tool-made component to exist.

- **`pigment`** — the survival-crafting game *Nightingale* has an exact,
  reusable pattern: a mortar crushes plant matter into pigment, and
  "pigment + glass → ink," also at the mortar. We copied this directly: a
  new **Mortar & Pestle** tool grinds raw `pigment` into `ground_pigment`,
  then `ground_pigment + glass_pane` (our existing Section‑3 product) makes
  `ink` at the same tool — which then feeds `written_scroll` alongside the
  new **Quill** tool. Real-world pigment-making (grinding minerals/plant
  matter with a mortar and pestle, per heritage-crafts sources) backs up
  "this needs a grinding tool" as the right call, not a bare raw→processed
  Section 1 entry.

- **`venom`** — real venom is collected from a creature's fangs/glands
  (matches our `monster_part` family conceptually) and is applied to a
  weapon rather than crafted into something standalone — poison-tipped
  arrows/blades are the classic use, and modded Minecraft antivenom recipes
  (spider eye + sugar + fermented spider eye) confirm venom-handling wants
  its own dedicated equipment rather than being hand-mixed. We added an
  **Alchemy Stand** tool and `dagger_poisoned` (existing `dagger` product +
  raw venom + Alchemy Stand) — coating an already-forged weapon, not
  crafting venom into a new base item. The poisoner profession now also
  gets a standalone toxin: `venomous_extract` (Section 1, herbs + venom, no
  tool) reduces down to `venom_vial` (Alchemy Stand) — a tradeable poison
  that doesn't require already owning a dagger, unlike `dagger_poisoned`.

- **`essence`** — no longer parked. `distilled_essence` (raw essence +
  monster_part + Alchemy Stand) now feeds `enchanted_blade` (existing
  `dagger` product + `distilled_essence` + `arcane_dust` + the new
  **Enchanter's Table**) — the "make an item magical" mechanic the essence
  family was reserved for, mirroring WoW's enchanting essences and ESO's
  runes as reagents consumed by an enchanting system, and directly
  patterned on Minecraft's Enchanting Table (an existing item + a
  consumable reagent, lapis lazuli, at a dedicated station) for "imbue an
  already-crafted item with magic" as the right shape for this recipe.
  `arcane_dust` (Section 1, crystal + essence, no tool) is `essence`'s
  other new consumer — a raw magical reagent standing in for lapis, built
  from two of the three families the Alchemy category already grants
  (`crystal`) plus one of the loot-only ones (`essence`).

## Closing the remaining dead ends: alchemist, and the Knife

Two more Section 1 outputs had no consumer at all before this pass:

- **`herbal_extract`** (herbs, no tool) — the alchemist's actual flavor is
  "vials and reagents, potions and poisons," yet nothing in the diagram
  produced a potion. Fixed with `medicinal_paste` (Section 1, herbs +
  harvest, no tool — honey/honeycomb as a real-world salve binder, the same
  role it plays in traditional herbalism) feeding `healing_potion`
  (`herbal_extract` + `medicinal_paste` + Alchemy Stand) — Potion Craft and
  Vintage Story's alchemy both start potions from ground plant matter at a
  simple bench-tier station, which is exactly this shape: no forge, no
  advanced tool, just herbs plus a binder at the Alchemy Stand the poisoner
  and enchanter recipes already justified building.

- **`bone_shard`** and **`trophy_charm`** — both raw hunting byproducts
  (bone, monster_part) with nowhere to go. Rather than invent two more
  single-purpose trinkets, one recipe uses both: `hunters_charm`
  (`trophy_charm` + `bone_shard` + Knife) — a hunter/trapper's carved
  amulet, the kind of thing a Knife alone is realistically enough to make.
  `sharpened_stick` and `club` (raw `wood` + Knife, nothing else) sit
  alongside it as the simplest possible crafts in the whole diagram — the
  literal first things a new character can make, with only what they start
  with and whatever they can pick up off the ground, the same bootstrap
  role Minecraft's stick and Valheim's club play before any tool station
  exists - except here it's a real recipe, not just a precedent cited in
  prose.

## Cooking, and the last two raw families: `stone` and `meat`

Two raw families were sitting in the base catalog with no recipe anywhere
consuming them, `stone` and `meat` (the third, `hide`, is covered by
`trimmed_pelt`/`fur_garment` above) - and Food (baker, butcher, brewmaster,
cook, pastry, apiarist, barkeep, server) is the single largest profession
category yet had zero recipes of its own before this pass, despite already
granting `meat` and `harvest` as starting resources.

Fixed with a new **Hearth** tool (Section 2, `stone` + `plank` - a stone
fire-ring with a wooden frame, the simplest possible campfire, needing
nothing more advanced than what Section 1 already produces) and a small
cooking chain: `dressed_meat` (raw `meat` + Knife, butchered before it's
cooked - the same cut/slice step real cooking always starts with) and
`baked_harvest` (raw `harvest` + Hearth) are the two basic dishes, and
`hearty_stew` (fresh copies of `cooked_meat` + `baked_harvest` + Hearth)
is a proper combined meal built from both of them, the same "assemble two
already-finished components into a bigger dish" shape `garment` and
`glass_lantern` already use for their own final assembly step.

`glass_bottle` (`glass_pane` + Kiln) rounds out the Kiln's own output list
alongside `fired_brick` and `glass_pane` itself, and gives the glassblower
a container product in its own right - but its real job is fixing a gap in
the two Alchemy Stand recipes that came before it: `venom_vial` and
`healing_potion` are, by name, a bottled poison and a bottled potion, yet
neither one actually consumed a bottle. Both recipes now pull in a fresh
`glass_bottle` alongside their reagents.

## Wrench and Axe: tools built from raw materials (and one from a tool)

Section 2 gained two more additions. **Wrench** (`refined_ore` + an
existing **Table**, pulled in as an ingredient) is the diagram's second use
of the Tinkers' Construct Tool Forge pattern already named in "Other
real-crafting-system patterns" below (build a new tool at/from an existing
one, not just raw materials), after Enchanter's Table's own `cut_crystal`
pull-in. `tinkered_gearbox` (`clockwork_mechanism` + `refined_ore` +
Wrench) is its Section 3 product - a tinsmith's assembled mechanical
component, giving `clockwork_mechanism` a second consumer beyond the Loom
and giving CraftMetal's tinsmith profession a recipe of its own to reach
for.

**Axe** (raw `wood` + raw `stone`, no tool needed to bind them) is
Valheim's actual stone axe, the tool the "Starter tool: the Knife" section
above cites as precedent but hadn't, until now, actually been a recipe -
club was that stand-in. Its own product, `firewood` (raw `wood` + Axe), is
deliberately the simplest possible Axe recipe, the same role
`sharpened_stick` plays for the Knife.

## Two armor tiers: `leather_armor` and `chainmail`

`armor_plate` was already Anvil-tier heavy armor, but nothing existed
between "no armor" and it. `leather_armor` (`leather` + `reinforced_frame`
at the Table - padding under stitched leather, no forge needed) and
`chainmail` (`metal_bar` at the Anvil - many rings, no leather or
monster_part needed, unlike the heavier `armor_plate`) fill the light/
medium gap, giving CraftGarment's leatherworker and CraftMetal's
blacksmith each a second product beyond `garment`/`sword` respectively.

`alloy_dust` (Section 1, ore + crystal + essence — three raw materials,
where every other Section 1 recipe combines at most two) rounds out the
new Section 1 batch: a magically-infused ore dust that reads as `ore`'s own
entry point into the enchanting chain, not just another `arcane_dust`
duplicate, and demonstrates that Section 1 recipes aren't capped at two
inputs just because most of them happen to use two.

Between these and the venom/essence work above, alchemist, poisoner, and
enchanter each now have a flagship product reachable from their granted
`herbs`/`crystal`/`monster_part` starting kit plus loot-only reagents:
`healing_potion`, `venom_vial`, and `enchanted_blade` respectively. (Poisoner
also has the general poisoned-weapon pattern below, now that it's no longer
dagger-specific.)

## A dedicated Weapons section, and generalizing poisoned weapons

The diagram's four sections are now, top to bottom: raw→processed, tool
builds, **Weapons**, then everything else Section 3 holds (armor, food,
alchemy, magic items, ...) shifted down to make room - inserted at the same
y that used to be Section 3's start, per "Layout: new recipes wrap into
their real section" above, not bolted onto the diagram's end.

Weapons covers 16 recipes, following a specific list: `dagger`, `sickle`,
`sword`, `greatsword`, `battle_axe`, `mace`, `warhammer`, `sharpened_stick`,
`spear`, `bow`, `quiver_of_arrows`, `crossbow`, `set_of_bolts`,
`magic_staff`, `wand`, `club`. Four of these already existed elsewhere in
the diagram (`dagger`, `sword`, `club`, `sharpened_stick`) and were
relocated here wholesale - not duplicated, the originals were removed and
recreated in this section, since they were terminal (nothing consumed
their output, so nothing needed patching). The other 12 are new, each
following the established weight/material logic: heavier weapons
(`greatsword`, `warhammer`) cost roughly double a comparable lighter one
(`sword`, `mace`) in `metal_bar`; `bow`/`crossbow`/staves reach for `Table`
or `Enchanter's Table` instead of `Anvil`, since they're not primarily
forged; `quiver_of_arrows` and `set_of_bolts` exist as their own Section 3
products (ammunition, not consumables baked into the bow/crossbow recipe
itself) since real archery always separates the launcher from its ammo.
`battle_axe` is a deliberately different id from the Section 2 `Axe` tool
(wood + stone, used to make `firewood`) - same real-world object, two
different roles in this diagram, so they can't share a name.

Poisoning a weapon used to be `dagger_poisoned` specifically (`dagger` +
`venom` + Alchemy Stand + its own Blueprint) - removed, since gating this
per weapon type would mean 16 near-identical recipes. Replaced with one
generic template right after Weapons: `Weapon (any, template)` +
`venom_extract` + Alchemy Stand + `Blueprint: Poison Weapon (template)` →
`Weapon (poisoned, template)`, styled with a dashed border (matching the
Knife's "granted, not concrete" visual language) to mark it explicitly as a
pattern, not a real recipe - the actual per-weapon versions (or a properly
generic implementation) are still to be defined.

The template takes `venom_extract` (Section 1, `venom` → `venom_extract`,
no tool), not raw `venom` directly - coating a blade calls for a
concentrated dose, not the crude gland extract, so it costs less per use
(2 vs. the raw amount) once processed. `venomous_extract` (herbs + venom,
the poisoner's standalone-toxin ingredient feeding `venom_vial`) stays a
separate recipe from `venom_extract` - one is a herbal poison compound, the
other is venom refined on its own; they read as different things and stay
as different Section 1 nodes.

## Other real-crafting-system patterns worth reusing later

- **EnderIO** (`enderio-base/.../config/recipes/materials.xml`): multi-raw
  composites (Binder Composite = gravel + clay + sand), and casting alloy
  nuggets through a mold (a tool-gated raw→processed conversion) — the
  precedent for moving `leather`/`cut_crystal`/`ground_pigment` into
  Section 3 instead of Section 1.
- **Tinkers' Construct**: Tool Forge (upgraded tool station) requires the
  *existing* Tool Station plus iron blocks and seared brick — the precedent
  for Section 2 tools needing a Section‑3 product (Anvil ← metal_bar,
  Loom ← clockwork_mechanism, Quill ← dagger).
