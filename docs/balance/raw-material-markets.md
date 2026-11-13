# Raw materials: what the game needs and what foraging gives

Reference for designing city markets and the exchange of goods ("give me 20 reed, I give you an ore").
The imbalance between foraging and recipes is part of the design; trade is where players even it out.

First measured on 2026-11-12 from `backend/data/craft-recipes.json`; updated on 2026-11-13 for the foraging rules of that day:
the gear bonus comes on top of the site's find, mining light is burned per site unit, and torch, candle and oil are made
from interchangeable raws (see "Light"). Recipes or professions changing will shift the numbers.

**Not yet in the percentages below** (recipes changed later on 2026-11-13; the item table further down already
shows them): leather from 6 hide or skin, rope from leather or fiber, glass pane from sand or crystal, coal from
wood or monster parts, and stone instead of most refined ore in six stations (grinding stone, lapidary bench,
furnace, mortar & pestle, kiln, alchemy stand - 135 ore less for all six); arrows and bolts from bone, reed, stone and
other stand-ins (see "Ammo"). Expect less need for ore, skin, fiber
and sand, and more for stone, hide, crystal and monster parts; the need calculation still has to be rebuilt from
the recipes for exact figures.

## Needed against found

| Raw | Need | Equip once | Per adventure | Foraging, no gear | Foraging, full T1 | Supply / need | Units for 1 ore |
|---|---|---|---|---|---|---|---|
| ore | 31.6% | 49.3% | 15.4% | 3.2% | 8.0% | 0.3× | 1 |
| wood | 17.2% | 17.2% | 17.2% | 4.6% | 4.5% | 0.3× | 1 |
| fiber | 12.7% | 16.8% | 9.0% | 11.0% | 10.8% | 0.9× | 3 |
| herbs | 7.8% | 0.1% | 14.8% | 10.0% | 9.9% | 1.3× | 5 |
| sand | 6.2% | 1.0% | 10.8% | 4.6% | 3.8% | 0.6× | 2 |
| skin | 4.7% | 7.9% | 1.8% | 6.4% | 7.0% | 1.5× | 6 |
| harvest | 3.7% | 0.0% | 7.1% | 8.9% | 9.5% | 2.5× | 10 |
| feather | 3.0% | 1.6% | 4.2% | 8.2% | 9.6% | 3.2× | 13 |
| meat | 2.5% | 0.0% | 4.9% | 7.1% | 7.8% | 3.1× | 12 |
| fish | 1.8% | 0.0% | 3.5% | 3.4% | 1.6% | 0.9× | 4 |
| bone | 1.6% | 2.0% | 1.3% | 7.3% | 3.0% | 1.8× | 7 |
| crystal | 1.4% | 0.1% | 2.7% | 3.7% | 8.8% | 6.1× | 24 |
| monster_part | 1.1% | 0.9% | 1.3% | 6.4% | 7.3% | 6.6× | 26 |
| clay | 1.0% | 1.8% | 0.2% | 2.7% | 2.3% | 2.4× | 9 |
| reed | 0.7% | 0.2% | 1.1% | 2.7% | 0.0% | all burned | – |
| hide | 0.5% | 0.6% | 0.4% | 5.3% | 1.5% | 2.9× | 12 |
| stone | 0.2% | 0.4% | 0.0% | 4.6% | 4.5% | 23.4× | 93 |
| venom | 1.4% | 0.0% | 2.7% | stories only | stories only | – | – |
| essence | 0.8% | 0.0% | 1.6% | stories only | stories only | – | – |
| pigment | ~0% | 0.0% | 0.0% | stories only | stories only | – | – |
| clockwork | ~0% | 0.0% | 0.0% | stories only | stories only | – | – |

- **Need** is one character equipping once and then playing 20 adventures, as a share of all raw units used.
- **Foraging** is each raw's share of everything foraging brings home, with every profession picked equally often:
  - **no gear:** what the sites give; ore and crystal at half, as they are dug in the dark.
  - **full T1:** every material with its whole T1 gathering kit (weapon, items, light on ore and crystal), so the gear bonus comes on top, minus the raws burned as mining light (see "Light").
- **Supply / need** (from the full T1 column) above 1 means foraging gives more than the game uses. Below 1 means the raw is scarce.
- **Units for 1 ore** is a starting point for exchange rates: how many units of a raw are worth one ore, by scarcity. For example, 3 fiber, 24 crystal or 7 bone buy 1 ore. Wood is as scarce as ore.
- **Off-scale raws:** stone is off the scale, because almost no recipe uses it. Markets probably want a floor price for it instead of the computed rate.
- **Reed** was useless before; now light burns all of it (see "Light"), so it has no rate of its own yet - it trades like hide, its fallback.
- **Story-only raws:** pigment, essence, venom and clockwork are never foraged; stories hand them out. Their price is for the stories and markets to set.

## Scale

- Equipping one character costs about **1,300 raw units**: weapon, armor set, shield, gear, essentials and two crafting stations.
- One adventure uses up about **70 raw units**: food, potions, arrows, lights and wear.
- A whole foraging pool, once per soul slot, is 180–270 site units, depending on the number of professions; with gear a character brings home more than that (about 1.4× on average with full T1 gear, up to about 3× at T6).

So foraging is a small source. Most raws have to come from adventures and trade.

## Light

Mining ore and crystal needs light: 1 hour per unit the site gives (the gear bonus on top needs none).
All ore and crystal sites of the 39 professions together need about 900 hours. Light is a sink for the raws
that overflow, because torch, candle and oil list their ingredients as options - crafting takes the first
one the crafter has enough of:

| Light (T1 hours) | Slot | Options, in order |
|---|---|---|
| torch (2h, +25%) | shaft | bone 1, wood 1 |
| | head | reed 1, hide 1, fiber 1 |
| candle (1h, +15%) | tallow | hide 1, monster part 1, meat 1, harvest 2 |
| | wick | reed 1, fiber 1 |
| oil (4h in a lantern, +35%) | fat | fish 1, monster part 1, meat 1 |
| | base | bone 1, harvest 1 |

Per hour at T1 a candle costs 2 raws, a torch 1 and lantern oil 0.5 (plus 30 raws once for the lantern), and the
bonus goes the other way - candle +15%, torch +25%, lantern +35% (+10% per tier each). With the first choices and a mix
of 60% torches, 20% candles and 20% oil (by hours), mining burns about 315 bone, 390 hide (200 of it where reed runs
out), 240 reed (all there is) and 45 fish. Before, the old torch (2 wood, 3 fiber, 3 meat) and the other lights
burned more wood, fiber and meat than foraging gives at all. Higher-tier lights burn twice as long per tier for the same recipe.

## Ammo

Arrows and bolts are used up on every adventure, so their wood and ore went on top of the two scarcest raws.
They now list each ingredient as options too (crafting takes the first one the crafter has enough of):

| Ammo | Slot | Options, in order |
|---|---|---|
| arrow | shaft | bone 1, reed 1, wood 1 |
| | fletching | feather 1, hide 1 |
| bolt | shaft | bone 1, wood 1 |
| | head | stone 1, monster part 1, crystal 1, ore 1 |

Bone and reed are also the first choices for torches and candles, so arrows compete with light for them. Bolt heads
take stone first, the most unused raw. For the profession groups, arrows still count as wood and feather and bolts as
wood and ore.

## Why ore and wood are short

- **Metal is expensive.** A metal bar is 125 ore and 33 wood (5 ore → refined ore, 5 refined ore + coal → ingot, 5 ingots → bar). Every metal weapon, shield, chainmail or iron armor piece and the anvil are built from bars.
- **Wood goes everywhere.** It's in coal for smelting, planks, beams, smoked food and the stations.
- **Few professions find ore.** Only 7 of 39 professions have ore sites (blacksmith, armorer, tinsmith, glassblower, jeweler, soldier, guard), and only 5 have wood (blacksmith, armorer, tinsmith, carpenter, cooper).
- **Many professions find little-used raws.** Artists (6 professions) and Rural (5) mostly find feather, bone, hide and harvest.
- **Fiber** is mostly tents (96 fiber) and bows (132).
- **Upkeep** is mostly potions (herbs, and 12 sand per glass bottle), arrows and rations. Lights now cost bone, reed, hide and fish; arrows and bolts take wood and ore only when the crafter has none of the other options (see "Ammo").

## Assumptions behind "need"

Adventures don't consume items yet, so these rates are design guesses. Change them and the shares move.

**Equip once (early tiers):**
- **Weapons:** one melee weapon (dagger, sickle, spear, short sword, sword, mace, axe or club, averaged), plus a bow and quiver for 3 in 10 characters, and 20 arrows.
- **Armor:** one head, chest and leg piece from cloth, leather, chainmail or iron, averaged; half a shield; half a cloth cloak.
- **Gear:** backpack, bedroll, tent, waterskin, tinderbox, 3 torches, rope, whetstone and hunter's charm; a fishing pole for 3 in 10 characters.
- **Essentials and stations:** 3 essentials and 2 crafting stations, averaged over all of them.

**Per adventure:**
- **Consumables:** 2 meals, one light (torch 60%, candle 20%, oil 20%, each made from its first options), 3 arrows and 1 bolt, and half a potion.
- **Wear:** a melee weapon every 40 adventures; each armor piece and the shield every 80; tent and bedroll 2% each; backpack, waterskin, rope and essentials a little; and station wear from crafting.

**How recipes are counted:**
- Every ingredient a recipe uses up counts, fuel such as coal included.
- A kept tool that can stand in for a used-up part counts as the tool. For example, a dagger is used instead of a bone blade for meat and fish, so no bone is spent.

## Raw units per item

Same for every tier: the output tier follows the ingredients, the amounts don't change.

| Item | Raw units | Made of |
|---|---|---|
| **Weapons** | | |
| club | 5 | wood 5 |
| sharpened_stick | 6 | meat 3, bone 2, wood 1 |
| wand | 7 | wood 4, crystal 3 |
| axe_stone | 8 | wood 3, meat 3, stone 2 |
| wrench | 20 | ore 20 |
| magic_staff | 22 | wood 16, crystal 6 |
| quiver | 22 | wood 16, ore 5, skin 1 |
| bolt_girdle | 24 | wood 12, skin 12 |
| bow | 152 | fiber 132, wood 20 |
| dagger | 158 | ore 125, wood 33 |
| pickaxe | 160 | ore 125, wood 35 |
| sickle | 162 | ore 125, wood 37 |
| spear | 166 | ore 125, wood 41 |
| crossbow | 171 | ore 75, wood 60, fiber 36 |
| short_sword | 197 | ore 150, wood 47 |
| axe | 229 | ore 180, wood 49 |
| sword, mace | 320 | ore 250, wood 70 |
| battle_axe | 478 | ore 375, wood 103 |
| greatsword, warhammer | 486 | ore 375, wood 111 |
| **Armor (each of head / chest / leg)** | | |
| cloth | 72 | fiber 72 |
| leather | 150 | skin 120, wood 18, bone 12 |
| chainmail | 258 | ore 225, wood 33 |
| iron | 316 | ore 250, wood 66 |
| chitin | 314 | skin 144, pigment 80, herbs 48, monster_part 30, wood 12 |
| ebony | 340 | wood 132, bone 80, pigment 80, herbs 48 |
| meteoric_iron | 350 | crystal 140, ore 120, essence 90 |
| darksteel | 361 | ore 300, wood 33, clockwork 28 |
| cloth_cloak / fur_cloak / quilted_cloak | 24–25 | fiber 25 / hide 24 / feather 24 |
| **Shields** | | |
| wooden_shield | 28 | wood 16, skin 12 |
| iron_shield | 162 | ore 125, wood 37 |
| reinforced_wooden_shield | 170 | ore 125, wood 45 |
| meteoric_iron_shield | 215 | crystal 86, ore 75, essence 54 |
| darksteel_shield | 245 | ore 200, wood 33, clockwork 12 |
| chitin_shield | 507 | pigment 240, herbs 144, skin 72, wood 36, monster_part 15 |
| ebony_shield | 530 | pigment 240, herbs 144, wood 96, bone 50 |
| **Crafting stations** | | |
| smokehouse | 9 | hide 4, meat 3, harvest 2 |
| oven | 13 | wood 8, stone 5 |
| spinning_wheel | 25 | wood 23, bone 2 |
| mortar_and_pestle | 20 | clay 12, stone 4, sand 4 |
| alchemy_stand | 31 | clay 18, sand 6, ore 5, stone 2 |
| tanning_rack | 34 | wood 24, ore 10 |
| workbench | 37 | wood 30, bone 4, reed 1, feather 1, skin 1 |
| enchanters_table | 42 | wood 30, crystal 6, bone 4, herbs 1, monster_part 1 |
| loom | 62 | wood 46, fiber 12, bone 4 |
| grinding_stone | 51 | clay 24, stone 14, sand 8, ore 5 |
| lapidary_bench | 54 | clay 24, stone 12, ore 10, sand 8 |
| scriptorium | 79 | wood 42, herbs 12, sand 12, fiber 5, feather 4, bone 4 |
| kiln | 86 | clay 60, sand 20, stone 6 |
| furnace | 74 | clay 36, stone 16, sand 12, ore 10 |
| anvil | 376 | ore 310, wood 66 |
| **Adventuring gear** | | |
| whetstone | 2 | stone 2 |
| tinderbox | 3 | stone 2, wood 1 |
| waterskin | 3 | skin 3 |
| fishing_pole | 4 | wood 3, fiber 1 |
| quill | 4 | feather 4 |
| parchment | 4 | reed 4 |
| bedroll | 5 | hide 3, fiber 2 |
| candle | 2 | hide 1, reed 1 (or monster part / meat / 2 harvest; fiber) |
| torch | 2 | bone 1, reed 1 (or wood; hide / fiber) |
| backpack | 10 | skin 6, hide 4 |
| starlight_catcher | 17 | sand 12, crystal 3, reed 2 |
| ink | 18 | wood 6, herbs 6, sand 6 |
| hunters_charm | 22 | monster_part 12, bone 10 |
| glass_lantern | 28 | sand 12, ore 10, crystal 3, meat 3 |
| tent | 99 | fiber 96, wood 3 |
| **Essentials** | | |
| chalk, signal_whistle | 2 | stone 2 / bone 2 |
| merchants_scale | 4 | wood 2, stone 2 |
| rope | 6 | 1 leather (6 hide or skin), or fiber 6 |
| hourglass | 7 | sand 7 |
| ladder | 8 | wood 6, fiber 2 |
| spyglass | 8 | ore 5, crystal 3 |
| holy_symbol | 9 | skin 6, crystal 3 |
| crowbar, lock_and_key | 10 | ore 10 |
| net | 14 | fiber 12, wood 2 |
| iron_spikes, manacles | 15 | ore 15 |
| mirror | 17 | sand 12, ore 5 |
| chain | 20 | ore 20 |
| grappling_hook | 21 | ore 15, fiber 6 |
| shovel | 33 | ore 25, wood 8 |
| monster_trap | 39 | ore 30, fiber 6, wood 3 |
| **Mount gear** | | |
| bridle | 23 | fiber 13, hide 8, meat 2 |
| cart | 32 | wood 32 |
| saddle | 37 | skin 24, hide 8, wood 3, bone 2 |
| barding_iron | 38 | ore 20, skin 12, meat 4, fiber 2 |
| saddlepack | 44 | skin 18, fiber 18, hide 8 |
| barding_leather | 58 | skin 36, hide 12, monster_part 10 |
| **Food** | | |
| cooked_fish | 2 | fish 2 |
| salt_horse | 3 | meat 3 |
| grilled_fish_skewer | 4 | fish 4 |
| squirrel_hoard, wizened_figs | 4 | harvest 4 / harvest 3, herbs 1 |
| smoked_fish | 7 | wood 5, fish 2 |
| smoked_salt_horse | 8 | wood 5, meat 3 |
| roast_haunch | 9 | meat 9 |
| smoked_squirrel_hoard, smoked_wizened_figs | 9 | wood 5, harvest 4 / harvest 3, herbs 1 |
| bangers | 12 | meat 6, herbs 5, monster_part 1 |
| fish_chowder | 13 | harvest 6, herbs 5, fish 2 |
| hearty_stew | 14 | harvest 6, herbs 5, meat 3 |
| pickled_fish | 14 | sand 12, fish 2 |
| fishermans_ration | 25 | fiber 10, fish 6, wood 5, harvest 3, herbs 1 |
| iron_ration | 36 | wood 15, fiber 10, harvest 7, meat 3, herbs 1 |
| **Potions** | | |
| venom_vial | 33 | herbs 12, sand 12, venom 9 |
| healing_potion | 42 | herbs 26, sand 12, harvest 4 |
| mana_potion | 42 | crystal 15, sand 12, essence 9, monster_part 6 |
| antidote_potion | 44 | herbs 26, sand 12, venom 6 |
| **Processed (for reference)** | | |
| arrow, bolt | 2 | bone 1, feather 1 / bone 1, stone 1 (first options; see "Ammo") |
| oil | 2 | fish 1, bone 1 (or monster part / meat; harvest) |
| coal | 3 | wood 3, or monster_part 3 |
| plank | 4 | wood 4 |
| leather | 6 | hide 6 or skin 6 |
| glass_bottle | 12 | sand 12 |
| woven_cloth | 24 | fiber 24 |
| metal_ingot | 31 | ore 25, wood 6 |
| metal_bar | 158 | ore 125, wood 33 |
