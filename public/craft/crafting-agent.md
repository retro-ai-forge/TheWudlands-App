# Crafting diagram structure

Spec for how `recipes.drawio.xml` (and any future recipe diagram in this
folder) is organized, plus the backend/frontend conventions that go with
it. Follow this when adding or regenerating recipes so the diagram stays
readable as it grows and the live app actually reflects what's drawn.

This file intentionally holds only durable rules and reusable patterns,
not a change log - the diagram, `backend/data/*.json`, and
`recipe-viewer.html` are themselves the source of truth for what currently
exists. Item/family names drift over time (renames, folds into bigger
systems); don't trust a specific name cited here without checking the
live data first.

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
stay on the base row. In practice, this diagram's own multi-input recipes
(`sword`, `short_sword`, `axe`, and others) have settled on 44px as the
de-facto interior-raise, not the 22px this rule technically cites - match
whatever offset your recipe's immediate neighbors already use over the
written default.

## One output per recipe: no yield multipliers

Every recipe in this diagram produces exactly **one** unit of its output;
cost-per-craft is the only thing that varies. Don't add a `(yield Nx)`
annotation as a second axis on top of input quantity - a recipe that costs
6 wood and yields 2 of something has the exact same per-unit ratio as one
that costs 3 wood and yields 1, so the multiplier is redundant complexity.
If a real-world craft produces multiple units, fold that into the input
quantity instead (rewrite to the single-output form).

## Layout: new recipes wrap into their real section, never bolt on below everything

A section that gains new recipes after the fact must wrap *within its own
row band*, not get appended as a disconnected block under whatever section
happens to be last - even though every recipe there is technically
self-contained regardless of where it sits on the canvas, a chunk of
"Section 1" floating below the whole diagram reads as an unrelated
appendix, not as Section 1. Concretely: when an earlier section needs new
rows, every row at or below the insertion point shifts down by however much
room the new rows need, so the new content lands in the gap it just opened
up instead of tacked on past the diagram's true end. The last section, by
definition, only ever needs to grow downward - but still directly below its
own existing content, with the standard section gap, not after some other
section's content that happens to end at a smaller y.

If, by the time you're making a change, the file already has enough
manual edits/history that a full insert-and-shift feels riskier than it's
worth, appending as its own clearly-labeled section at the diagram's end is
an acceptable fallback - just label it so it doesn't read as an
unstructured afterthought.

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
finished product - even though it's sitting in the Section 2 band.

### Section 3 — Tool + Processed (+ raw) → Product
A recipe here always ends in exactly one product and is never connected to
any other product's recipe. Inputs are fresh copies of processed materials
(and raw materials, where a recipe genuinely consumes something raw
directly rather than its Section‑1 refined form) plus one tool copy.

This section holds both:
- true end products (the kind a player equips or uses), and
- further-refined intermediate materials that themselves needed a tool to
  make (a metal bar, a cut gem, a machined component) — these are
  legitimate Section 3 entries too, and other Section 3 recipes (or Section
  2 tool builds) may then reference *fresh copies* of them as ingredients.

### No starter tool: bare-hand crafts are allowed

Don't invent a placeholder "starter tool" concept just to gate the
earliest, simplest crafts. A recipe with no realistic tool requirement
(raw material(s) → product, nothing else) should have `tool: null` and no
tool node at all - simpler than any starter-tool stand-in, and not a
downgrade: if nothing actually needs a blade/hammer/etc. specifically,
"no tool yet" is the real requirement, not "needs *a* tool, any tool."

Precedent worth reaching for if a genuine "can't build your first tool
without a tool" bootstrapping problem ever comes up: Valheim's stone axe
existing before any metal tool does, and this diagram's own early Weapons
entries following the same idea - a cheap, low-tier tool-role item that's
itself buildable bare-handed.

## Blueprints gate every higher-level armor, weapon, and tool

Plain materials/food/reagents and the simplest bare-hand crafts need
nothing but their ingredients and a tool. Everything past that - every
Section 2 tool build, and every Section 3 recipe whose result is armor, a
weapon, or a tool - additionally needs a **Blueprint**, a recipe-specific
reagent (`Blueprint: Furnace`, `Blueprint: Sword`, ...) drawn purple, one
fresh copy per recipe like any other ingredient. It's the classic "learn
the schematic before you can build it" gate (crafting scrolls/schematics in
countless RPGs), and it's *why* the line is drawn at armor/weapon/tool
specifically: those are the results worth gating behind found/earned
knowledge, while a stew or a trimmed pelt isn't.

The lowest-tier, no-forge-involved basics in each category (a starter club,
a starter sharpened stick, etc.) are the usual exception - check the live
data (`craft-recipes.json`'s `blueprintFamilyId`) rather than assuming
every weapon/tool has one; a handful of intentionally blueprint-free
basics exist by design.

## Color legend

| Style | Meaning |
|---|---|
| Green | Raw material |
| Yellow | Processed material (an intermediate that feeds other recipes) |
| Blue, bold | Tool |
| Purple | Blueprint (required by every higher-level armor/weapon/tool recipe) |
| Red, bold | Section 3 end product |

## Before adding a new family, check it doesn't already half-exist

Two repeatable classes of mistake to check for whenever a new
raw-material or tool family is proposed:

- **A "raw" family that's secretly already a crafted good.** E.g. a
  catalog entry whose item names describe an already-tanned/woven/
  processed thing (tanned leather, woven cloth, pressed parchment) sitting
  in the *raw* resource catalog, contradicting the diagram's own recipe for
  turning a genuine raw input into that same good. Fix is always the same
  shape: replace the mislabeled "raw" family with a real raw precursor
  (a pelt, a fiber, a reed), and let the already-existing (or newly added)
  Section 3 recipe be the only place the finished-good family exists.
- **A new tool that duplicates an existing one.** Before inventing a new
  `base-tools.json` family, grep for one that already covers the same
  real-world action (grinding, cutting, heating) under a different name -
  two similar-but-not-identical tools sitting side by side is a sign one
  of them should just be renamed/merged into the other instead of kept as
  a second option.

## Profession categories need a real family fit, not a workaround

If a profession category's starting-kit grant doesn't actually serve the
professions in it (e.g. a cooking category granted a fuel material and a
broth ingredient but nothing anyone would call food), that's the signal to
add a proper resource family and swap it in - not keep reaching for
whatever stand-in family happened to be available. Check
`backend/data/profession-resource-families.json` against what each
profession in a category actually needs.

## Naming collisions to watch for

A few families in this diagram share a real-world name with something
else on purpose, because they're genuinely different objects/roles:
`axe_stone` (a weapon, the reclassified Stone Axe), the plain `axe` family
(a metal-and-wood Anvil-tier weapon), and `battle_axe` (its own heavier
weapon line) are three distinct families that all happen to be "an axe."
Don't assume a bare mention of "axe" in a request refers to any one of
them specifically - check which family id is actually meant.

## Other real-crafting-system patterns worth reusing later

- **EnderIO** (`enderio-base/.../config/recipes/materials.xml`): multi-raw
  composites (Binder Composite = gravel + clay + sand), and casting alloy
  nuggets through a mold (a tool-gated raw→processed conversion) — the
  precedent for keeping a tool-gated conversion out of Section 1.
- **Tinkers' Construct**: Tool Forge (upgraded tool station) requires the
  *existing* Tool Station plus iron blocks and seared brick — the precedent
  for Section 2 tools needing a Section‑3 product as one of their own
  ingredients.
- **Potion Craft / Vintage Story**: potions starting from ground plant
  matter at a simple bench-tier station (no forge, no advanced tool) - the
  shape to reach for when a profession's flagship product should feel
  low-tech/early-accessible rather than gated behind smithing.
- **Nightingale**: mortar-crushes-plant-matter-into-pigment, then
  pigment+glass→ink at the same tool - a reusable "grind, then combine
  with a Section 3 product, same station" shape.
- **Minecraft's Enchanting Table**: an existing item + a consumable
  reagent, at a dedicated station - the shape for any "imbue an
  already-crafted item with magic/poison/etc." recipe.

## Dismantle mechanic: every final item needs a real material floor

Final (red) items get 3 states — new/used/broken — each dismantle-able for
a share of its original materials (80% new, 40% used, 10-20% broken). That
only works if a final item is built from enough raw units to begin with:
below ~10-15 raw units, "80% back" and "10% back" round to the same
handful of materials and the three states stop feeling different. Target:
every final item should trace back to at least 15 raw units, ideally more.

A blanket "multiply every edge by N" does **not** achieve this — quantities
compound multiplicatively through chain depth, so a flat multiplier sends
already-deep chains into the tens of thousands while barely moving
genuinely shallow recipes. The fix has to be per-item: deep chains that
already clear the floor are left untouched; shallow recipes get their own
top-level quantities bumped, or gain a genuine intermediate step, until
they clear it independently. A handful of items are exempt by design (a
deliberately cheap early throwaway tool-proxy, or a tool rather than a
dismantle-able final item) - check with the user before assuming a specific
family should or shouldn't be exempt. When a final/red item is itself
consumed as an ingredient in another recipe, it counts as 1 atomic unit and
is not decomposed into its own sub-materials for this calculation.

When a recipe is priced partly in raw ore/wood but also anchored to a
processed intermediate with a *fixed* raw-cost-per-unit (e.g. this
diagram's `metal_bar`, always exactly 125 ore + 33 wood), you generally
can't land on an arbitrary target total using only whole units of that
intermediate. Two established levers, both keep the intermediate as the
recipe's anchor rather than abandoning it:
- **Top up with a direct pull-in** of the intermediate's own component
  (e.g. `refined_ore`) alongside it, for a target that's *close to* but not
  a multiple of the intermediate's fixed cost.
- **Drop the intermediate entirely** and use a scaled quantity of its raw
  component directly, when the target is far enough from any multiple of
  the intermediate's cost that a same-recipe swap (see below) fits better.
- **Same-recipe swap**: when a family's existing node already reads
  `qty × refined_material`, relabeling in place (recolor + rename the node,
  change the edge's quantity) needs no rewiring - the diagram doesn't care
  which specific family a slot's edge points to, only that the slot exists.

Side effect worth flagging explicitly before applying: swapping a fixed
intermediate like `metal_bar` in or out of a recipe changes which upstream
*tools* the recipe transitively needs (e.g. dropping `metal_bar` can drop
a Furnace dependency that existed only to smelt it; pulling in a
tool-gated intermediate can add one). The recipe viewer's tool-collection
walks the whole ingredient tree, not just the top-level `tool` field, so
this shows up automatically once the data changes - but it's a real
gameplay consequence, not just bookkeeping, so call it out to the user
before making the swap.

## Tool/ingredient alternatives: "own one of several options," one array instead of duplicated recipes

When a recipe should accept more than one valid tool (or an unconsumed
"must own one of these" ingredient), don't duplicate the recipe per option.
`craft-recipes.json`'s `tool` field accepts either a single familyId or an
array of alternatives, any one of which satisfies the requirement; an
ingredient slot can do the same with `{"alternatives": [...]}`, a list of
option objects (each with its own `category`/`qty`/`consumed`) in place of
a single ingredient object. Both shapes flatten the same way for any
downstream code that needs to iterate every option (a small
`flatten`/`toolIds`-style helper), and both display in the recipe viewer as
one combined "🔨 id or id" tag, checked against ownership with an "owns
*any* alternative" helper - never render/require them as if they were two
separate, independently-satisfied requirements.

**In the diagram**, there's no drawn convention for "either this or that"
(every edge is an AND). The established fix: relabel the single pulled-in
tool-role node to `T1 id_a or id_b [or id_c]`, one node, one edge, styled
like whatever category that item actually belongs to (a weapon-red
`axe_stone`-based tag stays red even when used as a stand-in tool) - not a
new two-edges-plus-OR-label convention.

**Rejected designs worth remembering**, from when this pattern was first
built (an ingredient-level "consumed OR unconsumed" alternative):
1. *Multiple full recipes per output family* - rejected as unnecessary
   complexity; would require every consumer (backend catalog resolution,
   recipe-viewer search/rendering) to handle a list of variants per family
   instead of one recipe per family.
2. *Two genuinely separate output families* for the same end item, one per
   crafting path - rejected because the alternative path isn't a different
   *item*, just a different way to make the same one; splitting the
   family multiplies bookkeeping for no real distinction.
3. *One recipe, ingredient-level alternative* - what shipped, and the
   right shape whenever this need comes up again: the required ingredient
   stays a plain object; only the *option slot* becomes an
   `alternatives` list.

When deciding which alternatives actually make sense for a given recipe,
weigh the real physical fit rather than blanket-copying the same
alternative set everywhere a tool-role slot exists — e.g. a bladed tool
substitutes fine for delicate/whittling work but not for chopping wood, so
a wood-cutting recipe and a whittling recipe reaching for the same base
tool don't necessarily want the same substitute list.

## Adding a new craftable item: touch both the diagram and the backend

The diagram (`recipes.drawio.xml`) and the live in-app crafting viewer are
**not** the same data source - the viewer is generated by
`public/craft/build-recipe-viewer.py` purely from `backend/data/*.json`
(`craft-recipes.json` plus the various `base-*.json` catalogs), and never
reads the diagram at all. A new recipe drawn in the diagram will not show
up in the app until the same information is duplicated into the backend
files and the generator is re-run.

It's an accepted, deliberate pattern in this project to add a brand-new
diagram item as diagram-only first and backport it later (or not at all,
if it's still speculative) - check the live backend data rather than
assuming a diagram addition is automatically live. When a new item *is*
meant to go live, the full checklist is:

1. `backend/data/base-items-weapon.json` (or whichever category catalog
   fits) - one entry per tier, `{id, name, familyId, tier}`.
2. `backend/data/base-blueprint.json` - same shape, one entry per tier,
   `familyId` prefixed `blueprint_`, if the item needs a blueprint gate.
3. `backend/data/craft-recipes.json` - the recipe itself: `ingredients`,
   `tool`, `blueprintFamilyId`.
4. `public/data/blueprint-id-mapping.json` - each tier's blueprint id →
   its blueprint family, if step 2 applies.
5. `public/data/blueprint-raw-materials.json` - the blueprint family's
   underlying raw-material types (fetched at runtime by the Soul Creation
   wizard to highlight relevant resources).
6. Re-run `python3 public/craft/build-recipe-viewer.py` and check the
   output for the new family/recipe before calling it done.

A multi-tier family's *tier display names* (T1's humble name through T6's
legendary one) are independent of its `familyId`/`id` - renaming the
`familyId` later (a purely internal grouping key) doesn't require touching
the tier names or ids at all.
