# Crafting diagram structure

Spec for how `test-recipes.drawio.xml` (and any future recipe diagram in this
folder) is organized. Follow this when adding or regenerating recipes so the
diagram stays readable as it grows.

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

## Color legend

| Style | Meaning |
|---|---|
| Green | Raw material |
| Yellow | Section 1 processed material |
| Blue, bold | Tool |
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
  (fur kept whole, not tanned), not yet built out. Don't reuse `hide` for
  tanning inputs; that's `skin`'s job.

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
  **Alchemy Stand** tool and `poisoned_dagger` (existing `dagger` product +
  raw venom + Alchemy Stand) — coating an already-forged weapon, not
  crafting venom into a new base item.

- **`essence`** — parked as `distilled_essence` (raw essence + Alchemy
  Stand) for now: a plain refined form with no consumer yet, mirroring how
  WoW's enchanting essences and ESO's runes exist purely as reagents for a
  *later* system (enchanting/glyphs) we haven't modeled here. Revisit once
  there's an actual "make an item magical" mechanic to feed.

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
