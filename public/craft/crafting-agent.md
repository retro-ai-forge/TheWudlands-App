# Crafting diagram structure

Spec for how `recipes.drawio.xml` (and any future recipe diagram in this
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
materials. When that happens, the pulled-in node still uses whatever color
its own kind gets - yellow if it's a processed material, red if it's a
finished product - even though it's sitting in the Section 2 band. Since
yellow no longer splits into two shades (see the color legend above), a
pulled-in processed material now reads the same as any other yellow node;
only a pulled-in *finished product* (red) still visually flags "this came
from a bigger recipe elsewhere."

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

### Starter tool: removed

The Knife (a free starter tool, no build recipe, styled blue/dashed) used
to gate the earliest crafts (`club`, `sharpened_stick`, `hunters_charm`,
`dressed_meat`, `trimmed_pelt`, `fur_garment`, `trophy_charm`) before any
Section 2 tool existed. Removed by request - those 7 recipes are now true
bare-hand crafts (raw material(s) → product, no tool at all), which is
simpler than the Knife concept it replaces, not a downgrade: nothing
actually needed a blade specifically, "no tool yet" was the real
requirement all along. `enchanted_blade` still needs a `dagger` as an
ingredient for its own reasons, unrelated to this.

Note for later: `sword`/`greatsword`/`battle_axe`/etc. in Weapons, and
`club` here, are Valheim's actual early-tool precedent (stone axe before
metal tools exist) - if a "can't build your first tool without a tool"
bootstrapping problem ever resurfaces, that's the pattern to reach for
again, just not via a dedicated Knife node.

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
| Yellow | Processed material (Section 1 output, or a further-refined Section 3 intermediate that feeds other recipes - one color for both now, see below) |
| Blue, bold | Tool |
| Purple | Blueprint (required by every higher-level armor/weapon/tool recipe) |
| Red, bold | Section 3 end product |

Yellow used to split into two shades - Section 1 processed material vs. a
further-refined Section 3 intermediate - but that distinction lived in the
diagram's history (which section a recipe happened to be drawn in), not in
what the item actually *is*: both are "a processed material something else
consumes." Merged into one yellow. The color legend still separates *raw*
from *processed* from *finished product* (green/yellow/red), just not two
flavors of "processed."

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
Research and the pattern each now follows in `recipes.drawio.xml`:

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
Valheim's actual stone axe, the tool the "Starter tool: removed" section
above cites as precedent (its build recipe was lost at some point during
manual edits and got restored - see below). Its own product, `firewood`
(raw `wood` + Axe), is deliberately the simplest possible Axe recipe, the
same role
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

## Armor: 9 material tiers, each with a piece-template and a separate shield

Appended as its own clearly-labeled section at the diagram's end (not
inserted mid-file with a shift, unlike Weapons - by this point the file had
picked up enough manual edits outside this session that a full
insert-and-shift carried more risk than it was worth; append-with-a-label
was the safer call here).

Covers 9 materials in ascending rarity: `Cloth`, `Leather`, `Living Wood`,
`Chainmail`, `Iron`, `Ebony`, `Darksteel`, `Chitin`, `Meteoric Iron`. Two
existing recipes were reused rather than duplicated: `leather_armor` and
`chainmail` were relabeled in place into the new piece-template pattern
(same ingredients, same ids, new dashed style and name) rather than removed
and rebuilt. `armor_plate` was removed outright - it mixed metal + leather
+ monster_part in a way that didn't cleanly map to any single one of the 9
tiers, and its role is now split cleanly between `Iron` (pure metal_bar)
and `Chitin` (monster_part-based).

Every material follows the same two-recipe shape:

- **Piece** (`helmet`/`chest`/`legs`, one recipe, dashed-border template
  like Poisoned Weapon): crafting it produces *one* of the three slots,
  chosen at craft time, not a fixed single output - the same "pattern, not
  concrete recipe" concept, reused for a second thing that genuinely needs
  it (three near-identical armor pieces differing only in silhouette, not
  materials or process).
- **Shield**: always its own separate, concrete recipe (never templated
  with the other three) - a shield is a different shape of object end to
  end (flat/round, held not worn), not a size variant of the same garment
  the way helmet/chest/legs are.

Material sourcing reuses existing processed goods wherever the fit is
real, rather than inventing 9 new raw chains: `Cloth`→`woven_cloth`,
`Leather`→`leather`, `Chainmail`/`Iron`→`metal_bar`, `Ebony`→
`reinforced_frame` (already the "fancier wood" Section 1 material),
`Chitin`→raw `monster_part` + `leather` (binding), `Living Wood`→`plank` +
`herbal_extract` (nature magic animating timber). `Darksteel` and `Meteoric
Iron` both start from `metal_bar` but reach for a rarer second ingredient
to earn their higher tier - `clockwork_mechanism` (a tempered, precision-
reinforced steel) and raw `essence` (a truly rare sky-metal) respectively -
the same "make the higher tier cost more than just more of the base
material" logic `greatsword`/`warhammer` already used against `sword`/`mace`
in Weapons.

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

## Dismantle mechanic: every final item needs a real material floor

Final (red) items will get 3 states — new/used/broken — each dismantle-able
for a share of its original materials (80% new, 40% used, 10-20% broken).
That only works if a final item is built from enough raw units to begin
with: below ~10-15 raw units, "80% back" and "10% back" round to the same
handful of materials and the three states stop feeling different. Target:
every final item should trace back to at least 15 raw units, ideally more.

A blanket "triple every edge" does **not** achieve this — quantities compound
multiplicatively through chain depth, so tripling sends already-deep chains
(`sword`, `greatsword`, most metal/armor gear) into the tens of thousands
while barely moving genuinely shallow recipes (a 1-input bare-hand craft
goes from 1 to 3, still nowhere near 15). The fix has to be per-item:
deep chains (`sword`=320, `greatsword`=640, most armor/shields=300-650)
already clear the floor and are left untouched; shallow recipes get their
own top-level quantities bumped, or gain a genuine intermediate step,
until they clear it independently. `dagger` and `Axe` are exempt from this
floor by design (dagger is deliberately a cheap, early throwaway tool-proxy;
Axe is a tool, not a dismantle-able final item). When a final/red item is
itself consumed as an ingredient in another recipe (e.g. `dagger` inside
`sharpened_stick`/`Quill`, or the `Weapon (any, template)` stand-in inside
`Weapon (poisoned, template)`), it counts as 1 atomic unit and is not
decomposed into its own sub-materials for this calculation.

First pass (raise everything below 15 to at least 5, matching a first
"needs a real second look" bar): `club`, `firewood`, `Quill` got simple
quantity bumps (more raw material per recipe, same shape). `sharpened_stick`
got a genuine new step instead — `hardened_stick` (wood + Hearth) now sits
between raw wood and the final sharpen step, illustrating the "add a step"
option the quantity-bump option can't express (a stick hardened over fire,
then sharpened, is a materially different recipe from just "more wood").

Second pass (raise a batch of 8-23-cost items to 22-25+, the real
dismantle-ready range): `Chitin Shield`(22), `Chitin Armor Piece`(23),
`bow`(22), `fur_garment`(25), `magic_staff`(22), `hunters_charm`(22),
`set_of_bolts`(22), `Ebony Armor Piece`(25), `Ebony Shield`(22),
`Weapon (poisoned, template)`(22), `Wood Shield`(22), `quiver_of_arrows`(24)
— all via quantity bumps on existing ingredients, except `Ebony Shield`,
which also picked up a small second ingredient (`bone_shard` ×1) since its
single-ingredient recipe could only move in steps of 5. `hearty_stew`(22)
and `Leather Armor Piece`(23) were already inside the target range and were
left as-is.

Third pass: re-tiering the Armor category and two outliers, once the floor
numbers made the *relative* pricing across tiers look wrong rather than
just low.

- `Chitin`/`Leather`/`Ebony Armor Piece` were still priced like their own
  Shields (22-25) even though a full body-piece should cost meaningfully
  more than a shield of the same material — every metal tier already had
  that gap (`Iron Armor Piece` 474 vs `Iron Shield` 320), the organic tiers
  didn't. Raised via quantity bumps on existing ingredients to ~150 each
  (`Chitin Armor Piece`=152, `Leather Armor Piece`=150,
  `Ebony Armor Piece`=150). Their Shields were left untouched — only the
  Armor Piece side was flagged as underpriced.
- `Chainmail`/`Iron Armor Piece` were the opposite problem: 474 each, almost
  entirely just `3× metal_bar`, and barely distinguishable from
  `Darksteel`/`Meteoric Iron Armor Piece` (475-488) even though those are
  meant to be the premium tier (`metal_bar` + a rare second ingredient).
  Cut to `2× metal_bar` = 316 each, which reopens a real gap below
  Darksteel/Meteoric and above the newly-raised organic tier.
  `Iron Shield` was brought down in step (`2× metal_bar`→`1×`, 320→162) so
  Armor Piece still costs visibly more than Shield in the same material —
  Chainmail has no separate Shield item in this diagram, so only Iron's was
  touched. Darksteel and Meteoric Iron (armor and shield) were left exactly
  as-is: with Chainmail/Iron pulled down, they're now unambiguously the
  most expensive tier, which is the point of being the top tier.
- `bow` (22) got the "add a step in between" treatment instead of another
  quantity bump: it now spends `fiber` on the existing `thread` intermediate
  (6× fiber, Spinning Wheel) rather than raw fiber directly, at ×22 —
  reusing an intermediate that already existed elsewhere in the diagram
  rather than inventing a new one. New cost: 152.
- `greatsword`/`warhammer` (640 each) were judged too expensive relative to
  everything else once the rest of the ladder moved — cut from `4× metal_bar`
  to `3×` (with `plank` bumped 2→3 to compensate slightly), landing both at
  486. `sword` (320) was explicitly left unchanged throughout all three
  passes.

## `short_sword`: a 17th Weapon, and the metal_bar-granularity problem

Added as the 17th recipe in the Weapons row-band, appended to the end of
Row A (after `warhammer`, same +740 output-spacing pattern the row already
uses) rather than inserted mid-row, since Row A had room to extend right
without displacing anything.

The design target was a lighter blade costing 220 raw units total (180 ore +
40 wood) — but every other Anvil weapon in this section is priced in whole
`metal_bar` units, and `metal_bar` cost is fixed at 125 ore + 33 wood per
unit (via its own `metal_ingot`/`coal`/`refined_ore` chain). 125 doesn't
divide 180, so no whole-`metal_bar` recipe lands on exactly 180/40.

Resolved by keeping `metal_bar` as the recipe's anchor ingredient (staying
consistent with every sibling weapon) and topping up the remainder with a
direct `refined_ore` pull-in, the same "pull in a processed material
directly" pattern the Wrench tool already established:

`short_sword` = 1× `metal_bar` + 11× `refined_ore` + 2× `plank` + `Anvil` +
`Blueprint: Short Sword` → 125 + 55 = 180 ore, 33 + 8 = 41 wood (221 total,
1 wood off the 220 target — the closest whole-unit fit that still reads as
"a metal_bar weapon" rather than an outlier built from raw-adjacent
materials alone).

This is also the first 5-input recipe in the Weapons section (vs. the
standard 4: material+material+tool+blueprint). Per "Layout: staggering
3+-input recipes," the three interior inputs (`refined_ore`, `plank`,
`Anvil`) are all raised together, matching the 44px offset this section's
4-input recipes already use (not the 22px figure the general rule cites,
which the section's own `sword`/`spear`/`mace`/etc. never actually followed
— 44px is the de facto standard here, so `short_sword` matches its
immediate neighbors over the written default).

## `Stone Axe`: reclassified from tool to weapon (diagram only)

`axe_stone` used to live purely as a Section 2 tool: a `wood`(3) +
`stone`(2) → Stone Axe build recipe (no blueprint, blue tool styling),
with 6 fresh copies pulled in as the `tool` field elsewhere (`club`,
`plank`, `firewood`, `ladder`, `fishing_pole`) plus one more pulled in as a
`final`-category ingredient (`sharpened_stick`) — 7 node instances total,
one of them (the wood+stone build) being the sole canonical recipe.

Reclassified as a weapon by request. Diagram-only change — `base-tools.json`
and every recipe still referencing `axe_stone` as `"tool": "axe_stone"`
(club/plank/firewood/ladder/fishing_pole) are untouched, so this is
presently a diagram/backend split, same shape as the `metal_bar`
discrepancies already documented elsewhere in this file. Concretely:

- All 7 `T1 Stone Axe` node instances recolored blue→red and relabeled to
  the lowercase-familyId convention every other weapon output uses
  (`T1 Stone Axe` → `T1 axe_stone`), per the color-legend rule that a
  pulled-in node "uses whatever color its own kind gets" regardless of
  where it's consumed — since `axe_stone` is now a weapon everywhere it
  appears, not just at its own build recipe.
- Added `Blueprint: Stone Axe`, gating the build recipe the same way every
  other weapon/armor/tool blueprint does.
- The build recipe itself (`wood`×3, `stone`×2, now +`Blueprint: Stone Axe`)
  moved from its old Section-2-area position into the Weapons row-band, as
  an 18th recipe appended to the end of Row B (after `wand`, x+450). Its
  3 inputs follow the same stagger convention as `wand`/the rest of Row B:
  endpoints (`wood`, `Blueprint: Stone Axe`) on the base row, the interior
  input (`stone`) raised 44px.
- The 6 pulled-in copies were recolored/relabeled in place, not moved —
  they still sit wherever their consuming recipe (`club`, `plank`, etc.)
  already lives, since only the recipe *listing* was asked to move, not
  every place the item gets referenced.

Two things this change deliberately does *not* do (raised, not resolved,
during this pass): `axe_stone` keeping a dual tool/weapon role would need a
decision on whether an engine "tool" reference can point at a
weapon-cataloged item; and wiring `axe_stone` into other weapon recipes as
an ingredient (e.g. a future `dagger` variant) is a separate follow-up, not
implied by the recolor.

## `sharpened_stick`: blueprint removed, `hardened_stick`→`firewood`

Two follow-up changes, backend this time (not diagram-only like the Stone
Axe recolor above):

- **Blueprint removed.** `sharpened_stick`'s `craft-recipes.json` entry had
  `blueprintFamilyId: "blueprint_sharpened_stick"` even though the diagram
  never drew a blueprint gate for it (it's one of the two Knife-tier basics
  explicitly called out as blueprint-free in "Blueprints gate every
  higher-level armor, weapon, and tool" above — the other being `club`).
  Removed the 6 tier entries from `base-blueprint.json`
  (`blueprint_pine_sharpened_stick` → `blueprint_worldroot_sharpened_stick`),
  set `blueprintFamilyId` to `null` on the recipe, and cleaned the stale
  `blueprint_sharpened_stick` entries out of the three precalculated Soul
  Creation data files — the same backend/diagram-mismatch shape the Stone
  Axe blueprint removal fixed, just already-diagram-correct this time.

- **`hardened_stick` → `firewood`.** `sharpened_stick` used to consume
  `hardened_stick` (`wood`×4 + **Hearth**). Swapped for `firewood`
  (`wood`×5 + **Stone Axe**) instead — removes Hearth from this recipe's
  tool chain entirely, and reuses Stone Axe, which `sharpened_stick`
  already depends on via its `axe_stone` final-category ingredient. In the
  diagram, this needed no rewiring: the pulled-in `T1 hardened_stick` copy
  feeding `sharpened_stick` had no drawn upstream (a bare stand-in, same as
  many pulled-in copies), so relabeling it `T1 firewood` in place was
  sufficient — same yellow processed-material styling, same edge, same
  qty label.

  `hardened_stick`'s own build recipe (`wood`×4 + Hearth, Section 3) is now
  an orphan with no consumer, in both the diagram and `craft-recipes.json`
  — left in place rather than deleted, since removing a recipe family
  outright wasn't asked for here and is a separate cleanup decision.

## `crossbow`: less ore, more fiber, same total-raw ballpark

Rebalanced by request — more fiber, less ore, total raw kept close to the
original. Same `metal_bar`-granularity problem `short_sword` hit: ore only
enters this recipe through `metal_bar` (a fixed 125-ore/33-wood block), so
there's no way to trim ore gradually while `metal_bar` stays in the recipe.

Resolved the same way: dropped `metal_bar` entirely and replaced it with a
scaled `refined_ore` quantity (5 ore/unit, no wood tax) for the crossbow's
metal fittings/lock. Three ratios were sketched (50/80/40, 75/60/35,
30/80/60 ore/wood/fiber, all landing at 170 total) and the middle one
picked - keeps more metal in the design (a real trigger mechanism, not
just a token fitting) while still cutting ore well below the original.

`crossbow` = 15× `refined_ore` + 15× `plank` + 35× `fiber` (raw), Anvil,
`Blueprint: Bended Crossbow` → 75 ore + 60 wood + 35 fiber = **170 total**
(was 125 ore + 45 wood + 1 fiber = 171). Diagram update was a pure
relabel + edge-value change: the existing `T1 metal_bar` node became
`T1 refined_ore` (same yellow processed styling — no rewiring needed),
and the three ingredient edges' quantities changed to 15/15/35.

Side effect: `crossbow` no longer needs **Furnace** as a processing tool
(that only existed to smelt `metal_bar`) — it now only needs **Stone Axe**
upstream (for `plank`), on top of its own **Anvil**.

### Follow-up: `fiber`→`thread`, matching `bow`'s Spinning Wheel step

`bow` never touches raw `fiber` directly — it always spends it as `thread`
(`fiber`×6 via **Spinning Wheel**), which reads as a properly spun string
rather than loose fiber. `crossbow`'s raw `fiber`×35 was the odd one out.

Swapped for `thread`×6 (36 fiber - the closest clean multiple to the
previous 35, keeping the total nearly unchanged). `crossbow` is now:
15× `refined_ore` + 15× `plank` + 6× `thread`, Anvil, `Blueprint: Bended
Crossbow` → 75 ore + 60 wood + 36 fiber = **171 total** (was 170).

Diagram change was a pure recolor + relabel: the `T1 fiber` node feeding
`crossbow` switched from raw-green to processed-yellow and its value
changed to `T1 thread` (same node, no rewiring), and its edge's quantity
changed from 35 to 6. `crossbow` picks up **Spinning Wheel** as a second
processing tool alongside **Stone Axe**, the same pairing `bow` already
has.

## Tool alternatives: `axe_stone` OR `dagger`, one array instead of duplicated recipes

By request: every recipe that needed `axe_stone` specifically as its tool
should also accept `dagger` as a substitute - "a knife works too" - without
duplicating the recipe per tool option.

**Schema.** `craft-recipes.json`'s `tool` field now accepts either a single
familyId (unchanged for every recipe not touched here) or an array of
alternatives, any one of which satisfies the requirement. Applied to the
5 recipes that used `axe_stone` as their tool: `club`, `plank`, `firewood`,
`ladder`, `fishing_pole` → `"tool": ["axe_stone", "dagger"]`. No live
crafting-execution backend code reads this field yet (checked first -
`craft_catalog.py`'s few "tool" references are about catalog-source
classification, unrelated to recipe execution), so this was a safe,
non-breaking schema extension.

Deliberately excluded: `sharpened_stick`'s `axe_stone` ingredient is a
`final`-category ingredient (you must own one, unconsumed - see
"Blueprints gate..." above), not its `tool` field. "Tool alternative"
doesn't apply there; that's a different kind of requirement.

**Recipe viewer.** `recipe.tool` is read in 4 places (search-by-tool, the
per-node tool tag, `computeTotals`'s tool-collection, the "Tools Used"
summary) - all 4 updated via two new helpers, `toolIds()` (normalizes
either shape to an array) and `ownsAnyTool()` (true if the player owns
*any* alternative, mirroring `ownsFamily`'s single-tool check). Multiple
tools display joined as `"axe_stone or dagger"`; a tag is marked missing
only if *none* of the alternatives are owned. The "Tools Used" summary
groups a recipe's full alternative set behind one combined key (joined
with `|`) so `club`'s tool renders as one tag, not two independent ones
that would misread as "you need both."

**Diagram.** No existing convention drew "either this tool or that one" -
every edge into a recipe meant a required ingredient (AND), never an
alternative (OR). Rather than invent a two-edges-plus-OR-label convention
diagram-wide, went with the simplest fix that matches what the schema
actually says: relabeled each of the 5 pulled-in `T1 axe_stone` tool
copies (feeding `club`, `plank`, `firewood`, `ladder`, `fishing_pole`) to
`T1 axe_stone or dagger` - one node, one edge, same weapon-red styling,
same position. The two `axe_stone` nodes NOT touched: the canonical build
recipe (no outgoing edge - it's "the item itself," not a tool usage) and
`sharpened_stick`'s pulled-in `final`-ingredient copy (a different kind of
requirement, per above).

## `carcass`: a new byproduct material, replacing `meat` in non-food recipes

New family added by request: `carcass` (`meat`×3 + `bone_blade`×1, no tool
- structurally identical to `dressed_meat`, just the "leftover animal
material" half of butchering instead of the "consumable" half). Added
6 tier entries to `base-processed.json` (Rabbit/Boar/Venison/Bear/Wyvern/
Dragon Carcass, mirroring `dressed_meat`'s tier names) and the recipe
itself to `craft-recipes.json`.

**The split.** Every recipe consuming raw `meat` was checked against
whether it produces food:

- **Food (kept on `meat`):** `dressed_meat` (feeds `cooked_meat`/
  `bangers`/`hearty_stew`), `iron_ration` (a food item itself).
- **Non-food (swapped to `carcass`):** `axe_stone` (hide/sinew binding
  for the haft), `sharpened_stick` (same), `torch` (tallow/fat fuel),
  `glass_lantern` (fat/grease component) - none of these are edible, so
  spending prime `meat` on them never made sense once a byproduct
  material existed to cover it.

Swapped `meat`→`carcass` (qty unchanged, category raw→processed to
match) in all 4 non-food recipes. Real cost impact: since `carcass`
itself costs `meat`×3 + `bone_blade`×1 (which itself costs `bone`×2),
these 4 recipes got measurably more expensive and picked up a new `bone`
dependency they didn't have before (e.g. `axe_stone`'s full raw trace
went from 3 wood/2 stone/1 meat to 3 wood/2 stone/3 meat/2 bone) - an
expected consequence of routing through an intermediate rather than
consuming the raw material directly, not a separate balancing pass.

**Diagram.** All 4 non-food recipes were already missing their `meat`
input in the diagram before this change (a pre-existing gap, not
something this pass introduced) - so instead of "swapping" a drawn edge,
each got a fresh `T1 carcass` node added as a genuinely new input.
`axe_stone`, `sharpened_stick`, and `torch` went from 2→3 inputs and
picked up the standard interior-raise stagger (the newly-3rd input
raised 44px, matching every other multi-input recipe in this diagram).
`glass_lantern` went from 4→5 inputs: its two already-staggered interior
inputs stayed put, its former last input (`Kiln`) moved into the
interior row since it's no longer an endpoint, and `carcass` became the
new last/endpoint. All 4 outputs were re-centered to the horizontal
midpoint of their (now one-more) inputs, per the standing centering rule.

## `carcass`/`dressed_meat`: an ingredient-level alternative (`bone_blade` or `dagger`)

Added by request: either recipe can be satisfied with a `bone_blade`
(consumed, the original path) *or* a `dagger` (used but not consumed - you
keep it). This went through a few designs before landing here, worth
recording since the rejected ones are real traps for next time:

1. **Multiple full recipes per output family** (`craft-recipes.json` allows
   2+ entries for one `familyId`) - rejected as "a lot of extra fuzz." Would
   have required `build-recipe-viewer.py`'s `build_recipes()` to group into
   arrays instead of a single dict, and the recipe viewer to carry a
   per-node variant switcher through `buildInteractiveNode`, `computeTotals`,
   and search. Implemented once, then reverted whole - never shipped.
2. **Two genuinely separate output families** (e.g. `carved_carcass` next to
   `carcass`) - rejected too: "why do we need two families?" The dagger
   path isn't a different *item*, just a different way to make the same one.
3. **One recipe, ingredient-level alternative** - what shipped. `meat`×3
   stays a plain required ingredient; the cutting-implement slot becomes
   `{"alternatives": [...]}`, a list of options each with its own
   category/qty/consumed, instead of a single ingredient object:

   ```json
   {"category": "raw", "familyId": "meat", "qty": 3, "consumed": true},
   {"alternatives": [
     {"category": "processed", "familyId": "bone_blade", "qty": 1, "consumed": true},
     {"category": "final", "familyId": "dagger", "qty": 1, "consumed": false}
   ]}
   ```

**Consumers of `ingredients` updated to flatten `alternatives`:**
- `backend/craft_catalog.py`: new `_iter_ingredients()` helper, used by both
  `_resolve_raw_family_hits` and `_recipe_categories` - a plain ingredient
  yields itself, an `alternatives` slot yields all its options. Blueprint
  category derivation was already skipping `final` ingredients (like
  `dagger`) for raw-material scoring, so flattening changes nothing about
  `carcass`/`dressed_meat`'s resolved categories - `bone_blade`→`bone` is
  still the only raw hit either way.
- `recipe-viewer.template.html`: new `flattenIngredients()` (mirrors
  `_iter_ingredients`) used by the search-by-ingredient scan. `computeTotals`
  and the interactive tree's child-rendering loop both take the **first**
  alternative only (the default/bone_blade path) for whichever family the
  slot belongs to - counting every alternative would double up a single
  ingredient requirement. The tree additionally appends the *other*
  alternative(s) as a small informational `or 1x dagger (not consumed)` tag
  next to the rendered ingredient - not interactive, just visible.

**Diagram.** The two clusters drawn for each item (bone_blade-based and
dagger-based) got merged back into one per the backend's actual shape: kept
the original `meat`+`bone_blade`→output cluster for each, relabeled its
`T1 bone_blade` node to `T1 bone_blade or dagger` (same "combine into one
labeled node" move already used for `axe_stone or dagger`), and deleted the
now-redundant second cluster (`meat`+`dagger`→output) entirely, including
its now-orphaned `meat`/`dagger` copies.

## Searching a tool by name lists what it crafts, not the tool itself

Tools are searchable items in their own right (`catOrder` includes `"tool"`,
so e.g. `anvil` is a normal family with its own build recipe) - which meant
typing "anvil" hit the plain by-name match first and stopped there, showing
only the Anvil item itself. The much more useful result - every recipe you
can actually make *with* an Anvil - never ran, since the existing
ingredient/tool reverse-lookup only kicked in when the name search found
*nothing at all*.

Fixed by giving tool-name matches their own first-class path in
`populateSelect`, checked before the normal by-name scan: if the filter
text matches a tool family's name (`groups["tool"]`, same substring check
as everywhere else), the dropdown is populated with every recipe whose
`tool` field includes that tool's familyId (via `toolIds()`, so this also
catches recipes with an alternative-tool list like `axe_stone`/`dagger`),
grouped and sorted the normal way, across every category. `<select>`'s own
default of pre-selecting its first option does the rest - the first tool-
using recipe renders immediately, no extra selection logic needed. Falls
through to the normal by-name search only if the matched tool has zero
recipes using it yet (so the dropdown never ends up empty).

Typing "anvil" now surfaces 30+ recipes (armor, shields, weapons,
`clockwork_mechanism`, even `wrench`'s own build) instead of just the
Anvil item; a broader match like "table" correctly pools recipes from both
`writers_table` and `enchanters_table` together.

**Follow-up: the tool itself belongs in the results too, and preselected.**
The first version above dropped the matched tool's own entry entirely -
searching "anvil" showed only what you can forge *with* one, not how to
build one in the first place. Fixed by giving the matched tool(s) their
own leading optgroup (labeled plainly `tool`, ahead of every `<cat> (uses
anvil)` group), and setting `select.value` to the first matched tool
directly - overriding the usual "restore the previous selection" behavior,
since the whole point of searching a tool's name is to land on that tool.
Searching "anvil" now opens straight onto the Anvil's own build recipe
(`refined_ore`×12 + `metal_bar`×2, gated by `blueprint_anvil`), with every
recipe that uses an Anvil still one dropdown click away.

**Follow-up: generalized from tools to any uniquely-named item.** The
dual-view (preselect + "used in") only applied to the `tool` category -
searching "carcass" (a processed material) still just matched it by name
and stopped, same original problem one category over. Rewrote
`populateSelect` around one rule instead of a tool-specific special case:
compute every family that matches the search text by name across *all* of
`catOrder` first; if the search names **exactly one** item (any category -
tool, processed, raw, even a final item), also list every recipe that uses
it - via `recipeUses()`, checking `flattenIngredients()` (so an
ingredient-alternatives slot like `carcass`'s counts) and `toolIds()`
(so a tool-alternatives list like `axe_stone`/`dagger` counts) - and
preselect the matched item itself, same as the tool case always did.

A search matching **more than one** item (e.g. "sword" - matches `sword`,
`greatsword`, and two blueprints) deliberately skips the dual-view and
falls back to plain browsing, restoring the previous selection if it's
still among the results - otherwise refining a broad search would keep
yanking the selection back to whatever's alphabetically first every
keystroke. The one-name-only condition is what tells "anvil"/"carcass"
(a specific lookup) apart from "sword" (a browse).

Searching "carcass" now opens on its own recipe (`meat`×3 + the
`bone_blade`-or-`dagger` alternative) with `axe_stone`, `sharpened_stick`,
`glass_lantern`, and `torch` listed right below as "misc/weapon/tool (uses
carcass)".

## Darksteel and Meteoric Iron no longer share `metal_bar`

Both armor materials, and their shields, were built on `metal_bar` (3x for
armor, 2x for shields), differentiated only by a second ingredient
(`clockwork_mechanism` for Darksteel, `essence`+`alloy_dust` for Meteoric
Iron). Since `metal_bar` resolves to raw `ore`, and both are Tier 6 items,
that ore is specifically Star Metal Ore either way - two "distinct
legendary materials" were mechanically identical at the base.

Redesigned both to drop `metal_bar` (and therefore its `Furnace`
dependency - a real point of differentiation, not just flavor) and lean
into their existing second ingredient instead:

- **Darksteel** → `refined_ore` + heavier `clockwork_mechanism`. Armor:
  30× refined_ore + 15× clockwork_mechanism (was 3× metal_bar + 4×
  clockwork_mechanism). Shield: 20× refined_ore + 10× clockwork_mechanism
  (was 2× metal_bar + 3× clockwork_mechanism). Raw trace:
  `ore`×300 + `clockwork`×60 = 360 (armor), no `wood` at all anymore
  (that came from `metal_bar`'s own `coal` step) - reads as pure
  metal-and-machinery, fitting "dwarven-forged dark mythril" without
  introducing dwarven mythril as an actual new material (kept in scope to
  existing ingredients, per explicit request).
- **Meteoric Iron** → heavier `alloy_dust` + `essence`, `metal_bar`
  dropped entirely (no direct `ore` at all - the only ore left is the 3×
  baked into each `alloy_dust` unit). Armor: 40× alloy_dust + 10× essence
  (was 3× metal_bar + 1× essence + 5× alloy_dust). Shield: 25× alloy_dust
  + 5× essence (was 2× metal_bar + 1× essence + 5× alloy_dust). Raw
  trace: `essence`×50 + `ore`×120 + `crystal`×80 = 250 (armor) - reads as
  a found meteorite refined down, not mined and smelted.

Both totals dropped from their old metal_bar-inflated numbers (armor:
530→360 Darksteel, 505→250 Meteoric Iron) - a real consequence of
removing a 375-405-ore block, not a rebalancing pass in its own right.
Flag for a follow-up if the tier-6 armors should cost more in absolute
terms; the point of this pass was differentiation, not pricing.

**Diagram.** For both Armor Piece templates and both Shields: relabeled
the `metal_bar` node to `refined_ore` for Darksteel (2 nodes, 4 edge
values updated), and deleted the `metal_bar` node and its edge entirely
for Meteoric Iron (2 nodes + 2 edges removed), updating the `essence` and
`alloy_dust` edge values in place. No restaggering was done for Meteoric
Iron's now-4-input layout (was 5) - the remaining nodes kept their
existing positions rather than being pixel-perfectly recentered, a
pragmatic call given the piece-template nodes already predate this
diagram's per-recipe positioning conventions.

## Follow-up balance pass: Chainmail down, Meteoric Iron up, Chitin down

Requested after seeing the redesigned totals - three more targeted
adjustments, all via quantity changes on existing ingredients (no new
materials this round):

- **Chainmail** (was 316, `metal_bar`×2 only) → **258**. Split into
  `metal_bar`×1 + `refined_ore`×20 (125+100=225 ore, 33 wood unchanged) -
  the same "swap part of a metal_bar block for loose refined_ore" lever
  used for `short_sword` and `crossbow` earlier, needed here because
  `metal_bar` is a fixed 125-ore unit with no way to trim it gradually on
  its own. Side effect: Chainmail and Iron were tied at 316/316 before
  this - they're now properly differentiated (258 vs 316).
- **Meteoric Iron** (was 250) → **350** (armor), gained a genuinely new
  processed ingredient: `arcane_dust` (`crystal`×3 + `essence`×2, no
  tool - already existed in the catalog, just unused here before). Armor:
  +20× arcane_dust; shield: +12× (scaled to the armor:shield 40:25 ratio
  already in place, 20×25/40≈12). Keeps the "no mined ore beyond what
  `alloy_dust` already carries" identity from the metal_bar removal -
  `arcane_dust` adds `crystal`+`essence` only, zero new ore.
- **Chitin** (was 372, armor; 536, shield) → **314** (armor), **507**
  (shield). Cut `cured_chitin` and `leather_lining` by 25% each (armor
  8→6, shield 4→3) - the two ingredients driving the bulk of the cost
  (`leather_lining`'s `skin`×24/unit alone was 192 of the armor's 372).
  `lacquer` left untouched at its existing quantity in both (1 for armor,
  3 for shield), so the shield's cut is smaller in relative terms (536→507,
  ~5%) since `lacquer` was already its dominant cost and wasn't touched.

Diagram: `refined_ore` node added alongside Chainmail's existing (now
qty-1) `metal_bar` node; Chitin's existing `cured_chitin`/`leather_lining`
edge values updated in place (armor and shield); a new `arcane_dust` node
added to both Meteoric Iron clusters, positioned near the existing
`essence` node in each.

## Darksteel: refined_ore reverted back to metal_bar (Furnace returns)

By request - undoes half of the earlier metal_bar removal. `refined_ore`
was swapped back for `metal_bar` in both Darksteel recipes, which brings
the **Furnace** dependency back (Darksteel now needs Anvil + Furnace
again, same as Iron/Chainmail) - flagged explicitly before making the
change, since it reverses the differentiation `metal_bar`'s removal had
specifically bought.

Since `metal_bar` is a fixed 125-ore/33-wood block (no way to trim it
gradually), hitting "keep the total about the same" required also
retuning `clockwork_mechanism`'s quantity, not just swapping the ore
ingredient 1:1:

- **Armor**: `metal_bar`×1 + `clockwork_mechanism`×15 (unchanged) → `ore`
  275 + `wood` 33 + `clockwork` 60 = **368** (was 360 with refined_ore,
  +2%).
- **Shield**: `metal_bar`×1 + `clockwork_mechanism`×6 (down from 10 - a
  straight 1:1 substitution alone would have pushed the shield from
  240→298, since `metal_bar` is proportionally a much bigger chunk
  relative to the shield's smaller base) → `ore` 185 + `wood` 33 +
  `clockwork` 24 = **242** (was 240, +1%).

Diagram: relabeled both `T1 refined_ore` nodes back to `T1 metal_bar`
(armor and shield), updated their edge values to 1, and reduced the
shield's `clockwork_mechanism` edge value to 6.

## Search fix: "used in" needed to survive more than one name match

Searching "refined" matched exactly two families by name (`refined_ore`,
`refined_clay` - both processed materials with a "Refined X" tier-1
name), so the search-viewer's `totalNameMatches === 1` gate for showing
"what is this used in" never fired - the dropdown listed both items with
no reverse-lookup at all, even though 29 real recipes consume one or the
other.

Widened the gate from "exactly one match" to "10 or fewer matches",
computing the "used in" list against the **union** of every matched
family instead of just a single one. Preselecting the matched item stays
gated at exactly one match, unchanged - a multi-match search still keeps
the previous selection rather than jumping, so a genuine browse (e.g.
"sword", 4 matches: `sword`, `greatsword`, and their two blueprints)
isn't hijacked. The 10-match cap exists to keep this cheap and the
results meaningful for a search broad enough to match many unrelated
items, where a merged "used in" list would be noise, not signal.

Searching "refined" now surfaces all 29 consumers across armor (`chainmail_*`),
9 tools, 3 weapons, 2 misc, 8 adventuring-gear items, and 4 further
processed materials (`clockwork_mechanism`, `fired_brick`,
`metal_ingot`, `tinkered_gearbox`).

## The `alt-ingredient` note now flags a missing unconsumed alternative

The "or 1x dagger (not consumed)" note appended next to `carcass`'s
`bone_blade` child (see the ingredient-alternatives section above) was
purely informational - it never checked whether the player actually owns
that alternative, unlike every other unconsumed reference in the tree
(tools, blueprints).

An unconsumed alternative plays the exact same "own it, don't use it up"
role a tool does, so it's checked the same way: `ownsFamily(ownedTools,
alt.familyId, tier)`. If the player owns none of it, the tag gets the
same `missing` class the tool/blueprint tags use - `.tag.missing` is
declared after `.tag.alt-ingredient` in the stylesheet with equal
selector specificity, so it wins the cascade and renders red. Only
applies to *unconsumed* alternatives (`!alt.consumed`) - a consumed
alternative like `bone_blade` itself isn't a "do you own it" check, it's
"do you have enough," which is what the raw-materials side panel already
covers.

## `sharpened_stick`'s axe_stone requirement also accepts a dagger now

Follow-up to the tool-alternatives work: `sharpened_stick` needs to *own*
an `axe_stone` (unconsumed, `final` category) to craft - explicitly
excluded from the earlier `axe_stone`-or-`dagger` pass since that was a
`tool`-field change and this is a `final`-ingredient one, "a different
kind of requirement" as recorded at the time. By request, it's now
covered too - and the ingredient-alternatives schema built for
`carcass`/`dressed_meat` turned out to be exactly the right shape for it,
so no new code was needed:

```json
{"alternatives": [
  {"category": "final", "familyId": "axe_stone", "qty": 1, "consumed": false},
  {"category": "final", "familyId": "dagger", "qty": 1, "consumed": false}
]}
```

Both options are unconsumed here (unlike `carcass`'s consumed-`bone_blade`
-vs-unconsumed-`dagger` split) - the recipe viewer's existing "or ..."
note and the missing-check added just above both apply unchanged, since
neither cared which specific option was consumed, only whether an
alternative *is*.

Diagram: relabeled the single pulled-in `T1 axe_stone` copy feeding
`sharpened_stick` to `T1 axe_stone or dagger`, same as the 5 tool-role
copies already carry that label. The canonical `axe_stone` build recipe
and its `Blueprint`-less status are untouched - this only concerns how
`sharpened_stick` consumes it.

## Recipe viewer: an all-unconsumed ingredient slot renders as a "held
## item" tag, not a tree node

Turned out the "unchanged" call above was wrong. In the interactive tree,
`sharpened_stick`'s `axe_stone`-or-`dagger` slot was rendering as a full
expandable child node - "1x Crude Stone Axe [final]" plus an "or 1x Rusty
Dagger (not consumed)" note - as if it were a real ingredient with a
quantity. It isn't: owning *either* one, uninvolved in quantity, is
exactly what a `"tool": ["axe_stone", "dagger"]` field already means
elsewhere (`club`, `plank`, `firewood`, `ladder`, `fishing_pole`) - it just
couldn't be expressed as `tool` here because `sharpened_stick` also needs
to *reference* the item by family (a real crafted weapon, not an abstract
tool slot). The same shape existed unnoticed on two other recipes: `quill`
and `trimmed_pelt`, both needing an unconsumed `dagger`.

Fix, in `buildInteractiveNode()`: any ingredient slot (plain or
`alternatives`) where *every* option has `consumed: false` is now skipped
in the child-node loop and instead rendered as a tag directly on the
parent item's own row - same "🔨 id or id" format and missing-ownership
check (`ownsAnyTool`) as the real `tool` tag, just sourced from the
ingredient list instead of `recipe.tool`. `sharpened_stick` now shows "🔨
axe_stone or dagger" right next to its own name, same place `firewood`
shows its `tool` tag one level down - both read the same way at a glance.
`quill` and `trimmed_pelt` now show "🔨 dagger" the same way. Mixed slots
like `carcass`'s (`bone_blade` consumed *or* `dagger` not-consumed) are
unaffected - not every option is unconsumed there, so it keeps rendering
as a real child node with the existing "or ... (not consumed)" note.
`computeTotals()` is untouched - it already only reads `.consumed` per
option, not how the tree draws it, so the Final Items side panel still
lists `axe_stone`/`dagger`/etc. as before.

## Follow-up: `carcass`/`dressed_meat`'s unconsumed alt-option gets the same
## compact tag

`carcass` and `dressed_meat` are a *mixed* slot (`bone_blade` consumed,
`dagger` not) so the primary (`bone_blade`) still renders as a real child
node - only the non-primary alternative changed. It used to read "or 1x
Rusty Dagger (not consumed)"; now it's just "🔨 dagger", same compact
"icon id" tag as the all-unconsumed case above, dropping the quantity
since owning one is all that matters. A future *consumed* alternative
(none exist today) still falls back to the old "or Nx Name" wording,
since that one genuinely needs a quantity. Since `carcass`/`dressed_meat`
are single recipe entries shared by all 6 tiers, this applies uniformly
across Rabbit/Boar/Elk/Griffin/Wyvern/Dragon - not just T1.
