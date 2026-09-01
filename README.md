# The Wudlands
An old-school round-based Fighting Fantasy-style adventure game inspired by UltraQuest, Lone Wolf Saga, EverQuest, Dungeon Crawl Classic, books from Steve Jackson, Ian Livingstone, and the GAVUN WUD meme, built as a browser-based fantasy RPG with scene-driven gameplay, pixel-art, ascii-art, narrative-driven adventures, and onchain character progression. The game will be built using a modular, plugin-based architecture that allows for easy extension and modification. 

Visit [The Wudlands](https://thewudlands.eu/) to explore the game.

Want to run the project locally? See [SETUP.md](SETUP.md) for the full setup instructions.

## Call for Contributors

The Wudlands is built by the community, for the community. We're actively recruiting contributors across multiple disciplines to help bring this dark fantasy world to life. Whether you're a writer, artist, developer, or designer, there are roles that match your skills and passion.

### 1. Narrative Architects

Write the stories and decide how the adventures should feel. You create branching storylines, rich dialogue, and set the mood for the entire dark fantasy world. Work together with other writers to weave The Wudlands' emerging main storyline — your adventures connect and bring players deeper into the world's larger tale. You define the style, pacing, and tone that brings everything together into one amazing experience.

### 2. Visual & Audio Creators

Paint the world with images and sounds. Create character portraits, spooky environments, sound effects, and music that makes adventures come alive. Your art and audio turn words on a screen into something players can see and hear.

### 3. Platform Engineers

Build the machine that runs everything. You create the engine that loads adventures, handles player choices, displays scenes on screen, and keeps everything running smoothly. You also write tools that help story writers turn their ideas into playable adventures without needing to code.

### 4. Community Stewards

Keep the community happy and the quality high. You review what people make, give helpful feedback, answer questions, and make sure everything stays fun and fair for everyone.

## Game Engine

This repo is the core engine to host and run several adventures in parallel for users. It tracks the current position of an adventurer, game specific variables and status.

### Class & Profession Level Progression

Character classes and crafting professions level from 1 to 30, using a shared XP curve that starts cheap and escalates steadily rather than exploding: each level costs roughly 1.2× the previous one's XP, so early levels come fast while level 30 asks for real investment. The table below is the reference progression chart — `Total XP` is the cumulative XP needed to reach that level, `Diff` is how much more that level costs than the one before it.

Profession level also governs what happens when a craft fails: at low levels a failed craft can lose few of the ingredients, while higher levels let the crafter salvage and save back some of the material, softening the risk as mastery grows.

| Level | Total XP | Diff to previous |
|-------|----------|-------------------|
| 1  | 0       | —      |
| 2  | 100     | 100    |
| 3  | 220     | 120    |
| 4  | 360     | 140    |
| 5  | 540     | 180    |
| 6  | 740     | 200    |
| 7  | 1,000   | 260    |
| 8  | 1,300   | 300    |
| 9  | 1,600   | 300    |
| 10 | 2,100   | 500    |
| 11 | 2,600   | 500    |
| 12 | 3,200   | 600    |
| 13 | 4,000   | 800    |
| 14 | 4,800   | 800    |
| 15 | 5,900   | 1,100  |
| 16 | 7,200   | 1,300  |
| 17 | 8,700   | 1,500  |
| 18 | 11,000  | 2,300  |
| 19 | 13,000  | 2,000  |
| 20 | 15,000  | 2,000  |
| 21 | 19,000  | 4,000  |
| 22 | 23,000  | 4,000  |
| 23 | 27,000  | 4,000  |
| 24 | 33,000  | 6,000  |
| 25 | 39,000  | 6,000  |
| 26 | 47,000  | 8,000  |
| 27 | 57,000  | 10,000 |
| 28 | 68,000  | 11,000 |
| 29 | 82,000  | 14,000 |
| 30 | 100,000 | 18,000 |

### Crafting Recipes by Profession Category

Each of the 12 profession categories draws from 3 raw-material resource families (see `backend/data/profession-resource-families.json`). A recipe isn't scoped to a single category — it belongs to whichever category supplies the most of its raw-material inputs (resolved recursively through any processed ingredients), and ties count toward more than one.

| Category | Professions | Resource Families | Recipes | Notes |
|-------|---|---|-------:|---|
| CraftMetal | blacksmith, armorer, tinsmith | ore, wood, sand | 81 | Weapons and armor aren't going to grow on trees; material and time costs will keep them scarce. |
| CraftWood | carpenter, cooper | wood, hide, bone | 47 | The clean, undisputed wins here are the ebony armor/shield set and crafting furniture (workbench, tables, etc.) |
| CraftGlass | glassblower, jeweler | sand, crystal, ore | 34 | |
| CraftGarment | leatherworker, tanner, weaver, dyer | skin, fiber, herbs | 31 | |
| Military | soldier, guard | ore, fiber, monster_part | 29 | |
| Artists | painter, acrobat, clown, firespitter, storyteller, actor | feather, fiber, bone | 26 | |
| Alchemy | alchemist, poisoner, enchanter | herbs, crystal, monster_part | 20 | Planned to grow substantially once more items are introduced across the game. |
| Food | baker, butcher, brewmaster, cook, pastry, apiarist, barkeep, server | meat, harvest, herbs | 18 | Planned perk: these professions need less food to eat, and get it cheaper. |
| Rural | farmer, herder, hunter, fisher, miner, forager | hide, meat, harvest, fish | 11 | Foragers are planned to earn a bonus yield on gathered resources, raising Rural's output without needing more recipes. |
| CraftStone | mason, stonemason, potter | clay, stone, crystal | 11 | Their expertise is stone construction — underground building, traps, and doors — a naturally smaller domain, expected to stay limited relative to the other craft categories. |
| Aristocratic | scribe, clerk, scholar | reed, feather, skin | 11 | Planned to grow through magic scroll recipes, once is introduced. |
| Trade | merchant, trader | harvest, stone, monster_part | 11 | Planned to lean on a marketplace discount mechanic (traders paying less for goods) rather than more recipes. |

The four lowest-count categories — Rural, CraftStone, Aristocratic, and Trade — are expected to expand later, through new mechanics (foraging yield, marketplace pricing) as well as new recipes, once those systems and the resources they depend on are designed.

## Crafting Recipe Viewer

An interactive tool to explore all crafting recipes, search by item name or ingredient, and see detailed breakdowns of raw materials needed. Download to enlarge.

![Crafting Recipes](/public/craft/crafting-260901.jpg)

## For Story Contributors

If you want to contribute an adventure addon — a self-contained story with scenes, choices, images, and branching paths — you do not need to write any code. Adventures are defined in a structured JSON format and submitted alongside image assets. The engine handles everything else: loading, validation, session management, rendering, and player routing.

Everything you need to know about the addon format, image specifications, style presets, scene structure, dependencies, and submission requirements is documented in the Storyteller section of the app. Start there.

## For Software Developers

The Wudlands platform is built on a Next.js frontend and a FastAPI backend. The frontend handles rendering, player interaction, wallet integration, and the display of scene content. The backend is responsible for session state, addon loading, player routing, play count tracking, and revenue share logic. Both layers are designed to run multiple player sessions concurrently without interference — each session is isolated, stateful, and independently routed through its addon's scene graph.

![Software architecture diagram showing the relationship between the core engine and the story add-ons. The engine is a central hub that loads and runs the add-ons, which are separate modules containing story content and assets.](/public/images/dev-section/engine.jpg)

### The Addon Engine

The core of the platform is the addon engine — the system that takes a contributor's JSON file and turns it into a live, interactive session. When a player enters an adventure, the engine loads the addon definition for that adventure, validates its structure against the platform schema, and initialises a session record tied to that player and that addon. From that point forward, every choice the player makes is a traversal instruction: move from the current scene id to the target scene id specified by the selected choice.

The scene graph is an addressable map of scene objects keyed by id. The engine looks up the requested scene id in that map on every player action. The adventure starts at the `default_entry`, which serves as the normal session starting point. If a scene exists, it is returned and rendered. If it does not exist — because of a broken link in the addon, a missing node, or any other fault — the engine does not error or crash the session. Instead it falls back to the addon's `emergency_exit` scene, a dedicated error-recovery scene required by schema to exist. The session remains intact, the player can exit gracefully, and the fault is logged server-side for the addon author to review.

### Parallel Sessions

The engine is stateless at the request level. Each player action arrives as an independent HTTP request carrying the player's session token, the addon id, and the target scene id. The backend resolves the session, validates the transition, and returns the next scene. No shared in-memory state is held between requests. This means any number of players can be running through the same addon — or different addons — simultaneously, with no coordination overhead between their sessions. Horizontal scaling is straightforward: additional backend instances can be added without any session affinity requirement, as long as session state is stored in a shared persistence layer.

Play counts are tracked per player per addon. When a player enters an adventure, the engine checks their remaining play count for that addon. If the count is zero, entry is refused until the player resets by paying the entry fee again. Play count decrements happens when the player reaches a scene with `ending: true` or using an `escape_route`. This mirrors the real-world model of paying for the seat, not the outcome.

### Addon Loading & Validation

Addons are loaded from storage on session initialisation and cached for the duration of active sessions using that addon. The engine validates every loaded addon against the platform schema before making it available to players. Validation checks include: presence of all required fields, existence of the `default_entry`, `emergency_exit`, and `escape_route` scenes within the scene map, validity of all `to` targets in choice arrays, and correct boolean typing on `ending` scene flags. Addons that fail validation are not published. Addons that were published and subsequently become invalid due to a platform schema update are flagged for review and removed from active rotation until corrected.

### Adventure Dependencies & Unlocks

Each addon may declare a list of prerequisite addon ids in its `requires` field and a list of addon ids it unlocks in its `unlocks` field. The engine resolves these at the player level: before a player can enter an addon, the backend checks whether all entries in that addon's `requires` list appear in the player's completed adventure record. If they do not, the adventure is displayed as locked with the missing prerequisites listed. When a player completes an adventure, the engine marks it in their record and evaluates the `unlocks` list, making newly accessible adventures available immediately.

### Blockchain & Revenue Share

The platform operates on a blockchain environment, currently targeting Polkadot with an optional Ethereum fallback address per contributor. Note that Nova Wallets already feature both addresses with a single seed. When a player pays the entry fee for an adventure, the revenue split is applied at transaction time: 80% is routed to the wallet address declared in the addon's `polkadot_address` field, and 20% is retained by the platform.

### Soul Creation Slots

A player's welcome page shows ten soul-creation slots. The first is free and open to everyone — it is clickable the moment the page renders, without waiting on any lookup. The other nine are earned by what the player's wallet holds: an NFT from a specific collection, a total token balance, or a number of Grid Miner stars. Locked slots still show their artwork, greyed out, so a player can see what each reward looks like before qualifying for it.

Requirements are read from two public sources. Token balances and NFT collection ownership come from the Subscan API in a single call per chain, covering both Polkadot Asset Hub and Hydration — fast enough for the page to wait on. The Grid Miner star count is slower: it reads every owned item from Asset Hub's `nfts` pallet over RPC, then fetches each item's metadata document from IPFS to total the `Stars` trait. Those two slots therefore resolve on a second, background request and keep their loading indicator until it returns, so the rest of the grid is never held up.

Token thresholds are cumulative — holding 5B WUD unlocks the 1B slot as well. Balances are summed across both chains.

| Slot | Requirement | Source | Speed |
|------|---|---|---|
| 1 | Free — open to everyone | — | Immediate |
| 2 | WUD 1st Year NFT | Asset Hub collection 441 | Fast |
| 3 | WUD 2nd Year NFT | Asset Hub collection 842 | Fast |
| 4 | OG WUD BURN NFT | Asset Hub collection 244 | Fast |
| 5 | 1,000,000,000 WUD | Asset Hub + Hydration balance | Fast |
| 6 | 5,000,000,000 WUD | Asset Hub + Hydration balance | Fast |
| 7 | 1,000 DOT | Asset Hub + Hydration balance | Fast |
| 8 | 5,000 DOT | Asset Hub + Hydration balance | Fast |
| 9 | 20 Grid Miner stars | Collection 852 metadata (IPFS) | Background |
| 10 | 100 Grid Miner stars | Collection 852 metadata (IPFS) | Background |

Results are stored per wallet so the checks do not run on every visit. A player with no stored record is always checked; after that, roughly one login in thirty-three re-verifies, which keeps the unlock state current without spending the API quota on data that rarely changes. A "Reload Balances & NFTs" button on the welcome page forces an immediate re-check outside that schedule, for a player who wants to confirm a fresh balance or NFT right away. If the NFT/token lookup cannot run at all — no API key configured, or Subscan is unreachable — those slots are reset to unearned and that reset is stored, the same as any other fresh result; the grid never keeps reporting a wallet unlocked from a check it can no longer confirm. The Grid Miner star slots are unaffected by a Subscan outage, since they resolve over RPC and IPFS instead.

### Image Rendering & Style Presets

Each scene may reference a single image by filename. At runtime, the frontend loads the next scene as an HTML site and applies CSS filters to the image based on the scene's declared style preset. The scene text is displayed. Buttons will be rendered for each choice, and the player can click checkboxes and radio buttons for extra interactivity. There will be an escape button in the corner of the screen, backpack, character sheet and numbers of story dependent stats like health, sanity, and gold. The exact layout and design of the UI is still being iterated on, but the core functionality will be in place for Beta 1.0.

### Architecture Overview

| Layer | Responsibility |
|-------|---|
| Next.js Frontend | Scene rendering, player input, wallet connection, image display, CSS filter application, adventure selection UI. |
| FastAPI Backend | Session management, addon loading and validation, scene graph traversal, play count tracking, dependency resolution, revenue split logic. |
| Addon Engine | Stateless per-request scene lookup. Falls back to `emergency_exit` on missing scene. Each player session is independently routed with no shared in-memory state. |
| Scene Graph | An id-keyed map of scene objects defined in the addon JSON. Traversed by player choice. Any relationships, loops, and branches are all valid structures. Endless loops or completely separated story sections should be avoided and only used if the story calls for it. |
| Session State | Stored in a shared persistence layer. Holds current scene id, play count, completed adventure record, and player identity. |
| Addon Validation | Schema-checked on contribution. Required fields, scene existence, choice targets, and ending flags are all verified before an addon is made available to players. |
| Dependencies | Resolved per player at adventure entry. Completed addons are recorded. Unlocks are evaluated on completion and made available immediately. |
| Revenue Share | Applied at transaction time. 80% to the contributor's declared wallet address, 20% to the platform. Polkadot primary, Ethereum fallback. |
| Blockchain | Currently Polkadot. Migration to another chain might happen. |
| Soul Slots | Ten welcome-page creation slots. One free, nine gated on wallet holdings — NFT collections, token balances, and Grid Miner stars. Checked per wallet and cached, re-verified on roughly one login in thirty-three, or immediately via the Reload button. |

## Crafting XP

Crafting pays out two kinds of XP, which can land on different professions from the same craft. **Raw-material XP** is automatic: we count all raw materials used across a recipe's full creation chain, but not tools or other ingredients that already have their own blueprint. Consuming a raw material grants XP equal to the amount consumed to every profession the character has whose category lists that material (see the Resource Families column above) — a single craft can pay out to more than one profession at once if its raw materials overlap across categories.

**Final-item XP** only applies to genuinely blueprint-gated tools and items (not plain processing steps like refining ore or tanning leather): finishing one pays out a flat, tier-scaled assembly bonus — `10% × the item's full raw-material chain × its tier` — on top of whatever raw-material XP was already earned crafting its ingredients. Unlike raw-material XP, this bonus isn't tied to a fixed profession — the player chooses which of their profession slots receives it.

| Item | Blueprint | Raw XP | Raw Materials | T1 XP | T2 XP | T3 XP | T4 XP | T5 XP | T6 XP | T1 Total XP |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| Ebony Shield | Ebony Shield | 530 | Pigment x240, Herbs x144, Wood x96, Bone x50 | 53 | 106 | 159 | 212 | 265 | 318 | 583 |
| Chitin Shield | Chitin Shield | 507 | Pigment x240, Herbs x144, Skin x72, Wood x36, Monster Part x15 | 51 | 101 | 152 | 203 | 254 | 304 | 558 |
| Greatsword | Greatsword | 486 | Ore x375, Wood x111 | 49 | 97 | 146 | 194 | 243 | 292 | 535 |
| Warhammer | Warhammer | 486 | Ore x375, Wood x111 | 49 | 97 | 146 | 194 | 243 | 292 | 535 |
| Battle Axe | Battle Axe | 478 | Ore x375, Wood x103 | 48 | 96 | 143 | 191 | 239 | 287 | 526 |
| Anvil | Anvil | 376 | Ore x310, Wood x66 | 38 | 75 | 113 | 150 | 188 | 226 | 414 |
| Darksteel Head Armor | Darksteel | 361 | Ore x300, Wood x33, Clockwork x28 | 36 | 72 | 108 | 144 | 180 | 217 | 397 |
| Darksteel Chest Armor | Darksteel | 361 | Ore x300, Wood x33, Clockwork x28 | 36 | 72 | 108 | 144 | 180 | 217 | 397 |
| Darksteel Leg Armor | Darksteel | 361 | Ore x300, Wood x33, Clockwork x28 | 36 | 72 | 108 | 144 | 180 | 217 | 397 |
| Meteoric Iron Head Armor | Meteoric Iron | 350 | Crystal x140, Ore x120, Essence x90 | 35 | 70 | 105 | 140 | 175 | 210 | 385 |
| Meteoric Iron Chest Armor | Meteoric Iron | 350 | Crystal x140, Ore x120, Essence x90 | 35 | 70 | 105 | 140 | 175 | 210 | 385 |
| Meteoric Iron Leg Armor | Meteoric Iron | 350 | Crystal x140, Ore x120, Essence x90 | 35 | 70 | 105 | 140 | 175 | 210 | 385 |
| Ebony Head Armor | Ebony | 340 | Wood x132, Bone x80, Pigment x80, Herbs x48 | 34 | 68 | 102 | 136 | 170 | 204 | 374 |
| Ebony Chest Armor | Ebony | 340 | Wood x132, Bone x80, Pigment x80, Herbs x48 | 34 | 68 | 102 | 136 | 170 | 204 | 374 |
| Ebony Leg Armor | Ebony | 340 | Wood x132, Bone x80, Pigment x80, Herbs x48 | 34 | 68 | 102 | 136 | 170 | 204 | 374 |
| Sword | Sword | 320 | Ore x250, Wood x70 | 32 | 64 | 96 | 128 | 160 | 192 | 352 |
| Mace | Mace | 320 | Ore x250, Wood x70 | 32 | 64 | 96 | 128 | 160 | 192 | 352 |
| Iron Head Armor | Iron | 316 | Ore x250, Wood x66 | 32 | 63 | 95 | 126 | 158 | 190 | 348 |
| Iron Chest Armor | Iron | 316 | Ore x250, Wood x66 | 32 | 63 | 95 | 126 | 158 | 190 | 348 |
| Iron Leg Armor | Iron | 316 | Ore x250, Wood x66 | 32 | 63 | 95 | 126 | 158 | 190 | 348 |
| Chitin Head Armor | Chitin | 314 | Skin x144, Pigment x80, Herbs x48, Monster Part x30, Wood x12 | 31 | 63 | 94 | 126 | 157 | 188 | 345 |
| Chitin Chest Armor | Chitin | 314 | Skin x144, Pigment x80, Herbs x48, Monster Part x30, Wood x12 | 31 | 63 | 94 | 126 | 157 | 188 | 345 |
| Chitin Leg Armor | Chitin | 314 | Skin x144, Pigment x80, Herbs x48, Monster Part x30, Wood x12 | 31 | 63 | 94 | 126 | 157 | 188 | 345 |
| Chainmail Head Armor | Chainmail | 258 | Ore x225, Wood x33 | 26 | 52 | 77 | 103 | 129 | 155 | 284 |
| Chainmail Chest Armor | Chainmail | 258 | Ore x225, Wood x33 | 26 | 52 | 77 | 103 | 129 | 155 | 284 |
| Chainmail Leg Armor | Chainmail | 258 | Ore x225, Wood x33 | 26 | 52 | 77 | 103 | 129 | 155 | 284 |
| Darksteel Shield | Darksteel Shield | 245 | Ore x200, Wood x33, Clockwork x12 | 24 | 49 | 74 | 98 | 122 | 147 | 269 |
| Axe | Axe | 229 | Ore x180, Wood x49 | 23 | 46 | 69 | 92 | 115 | 137 | 252 |
| Meteoric Iron Shield | Meteoric Iron Shield | 215 | Crystal x86, Ore x75, Essence x54 | 22 | 43 | 64 | 86 | 108 | 129 | 237 |
| Crossbow | Crossbow | 171 | Ore x75, Wood x60, Fiber x36 | 17 | 34 | 51 | 68 | 86 | 103 | 188 |
| Reinforced Wooden Shield | Reinforced Wooden Shield | 170 | Ore x125, Wood x45 | 17 | 34 | 51 | 68 | 85 | 102 | 187 |
| Spear | Spear | 166 | Ore x125, Wood x41 | 17 | 33 | 50 | 66 | 83 | 100 | 183 |
| Iron Shield | Iron Shield | 162 | Ore x125, Wood x37 | 16 | 32 | 49 | 65 | 81 | 97 | 178 |
| Sickle | Sickle | 162 | Ore x125, Wood x37 | 16 | 32 | 49 | 65 | 81 | 97 | 178 |
| Dagger | Dagger | 158 | Ore x125, Wood x33 | 16 | 32 | 47 | 63 | 79 | 95 | 174 |
| Bow | Bow | 152 | Fiber x132, Wood x20 | 15 | 30 | 46 | 61 | 76 | 91 | 167 |
| Leather Head Armor | Leather | 150 | Skin x120, Wood x18, Bone x12 | 15 | 30 | 45 | 60 | 75 | 90 | 165 |
| Leather Chest Armor | Leather | 150 | Skin x120, Wood x18, Bone x12 | 15 | 30 | 45 | 60 | 75 | 90 | 165 |
| Leather Leg Armor | Leather | 150 | Skin x120, Wood x18, Bone x12 | 15 | 30 | 45 | 60 | 75 | 90 | 165 |
| Furnace | Furnace | 98 | Ore x50, Clay x36, Sand x12 | 10 | 20 | 29 | 39 | 49 | 59 | 108 |
| Kiln | Kiln | 95 | Clay x60, Sand x20, Ore x15 | 10 | 19 | 28 | 38 | 48 | 57 | 105 |
| Cloth Head Armor | Cloth | 72 | Fiber x72 | 7 | 14 | 22 | 29 | 36 | 43 | 79 |
| Cloth Chest Armor | Cloth | 72 | Fiber x72 | 7 | 14 | 22 | 29 | 36 | 43 | 79 |
| Cloth Leg Armor | Cloth | 72 | Fiber x72 | 7 | 14 | 22 | 29 | 36 | 43 | 79 |
| Grinding Stone | Grinding Stone | 72 | Ore x40, Clay x24, Sand x8 | 7 | 14 | 22 | 29 | 36 | 43 | 79 |
| Lapidary Bench | Lapidary Bench | 72 | Ore x40, Clay x24, Sand x8 | 7 | 14 | 22 | 29 | 36 | 43 | 79 |
| Loom | Loom | 54 | Wood x40, Ore x10, Clockwork x4 | 5 | 11 | 16 | 22 | 27 | 32 | 59 |
| Scriptorium | Scriptorium | 45 | Pigment x24, Sand x12, Fiber x5, Feather x4 | 4 | 9 | 14 | 18 | 22 | 27 | 49 |
| Enchanters Table | Enchanters Table | 42 | Wood x30, Crystal x6, Bone x4, Herbs x1, Monster Part x1 | 4 | 8 | 13 | 17 | 21 | 25 | 46 |
| Workbench | Workbench | 37 | Wood x30, Bone x4, Reed x1, Feather x1, Skin x1 | 4 | 7 | 11 | 15 | 18 | 22 | 41 |
| Alchemy Stand | Alchemy Stand | 34 | Clay x18, Ore x10, Sand x6 | 3 | 7 | 10 | 14 | 17 | 20 | 37 |
| Tanning Rack | Tanning Rack | 34 | Wood x24, Ore x10 | 3 | 7 | 10 | 14 | 17 | 20 | 37 |
| Writers Table | Writers Table | 34 | Wood x30, Bone x4 | 3 | 7 | 10 | 14 | 17 | 20 | 37 |
| Wooden Shield | Wooden Shield | 28 | Wood x16, Skin x12 | 3 | 6 | 8 | 11 | 14 | 17 | 31 |
| Mortar And Pestle | Mortar And Pestle | 26 | Clay x12, Ore x10, Sand x4 | 3 | 5 | 8 | 10 | 13 | 16 | 29 |
| Spinning Wheel | Spinning Wheel | 25 | Wood x23, Bone x2 | 2 | 5 | 8 | 10 | 12 | 15 | 27 |
| Quiver Of Arrows | Quiver Of Arrows | 24 | Wood x16, Ore x5, Feather x2, Skin x1 | 2 | 5 | 7 | 10 | 12 | 14 | 26 |
| Set Of Bolts | Set Of Bolts | 22 | Wood x12, Ore x10 | 2 | 4 | 7 | 9 | 11 | 13 | 24 |
| Magic Staff | Magic Staff | 22 | Wood x16, Crystal x6 | 2 | 4 | 7 | 9 | 11 | 13 | 24 |
| Iron Ration | Iron Ration | 21 | Fiber x10, Harvest x7, Meat x3, Herbs x1 | 2 | 4 | 6 | 8 | 10 | 13 | 23 |
| Wrench | Wrench | 20 | Ore x20 | 2 | 4 | 6 | 8 | 10 | 12 | 22 |
| Fishermans Ration | Fishermans Ration | 20 | Fiber x10, Fish x6, Harvest x3, Herbs x1 | 2 | 4 | 6 | 8 | 10 | 12 | 22 |
| Hearty Stew | Hearty Stew | 14 | Harvest x6, Herbs x5, Meat x3 | 1 | 3 | 4 | 6 | 7 | 8 | 15 |
| Oven | Oven | 13 | Wood x8, Stone x5 | 1 | 3 | 4 | 5 | 6 | 8 | 14 |
| Fish Chowder | Fish Chowder | 13 | Harvest x6, Herbs x5, Fish x2 | 1 | 3 | 4 | 5 | 6 | 8 | 14 |
| Bangers | Bangers | 12 | Meat x6, Herbs x5, Monster Part x1 | 1 | 2 | 4 | 5 | 6 | 7 | 13 |
| Wand | Wand | 7 | Wood x4, Crystal x3 | 1 | 1 | 2 | 3 | 4 | 4 | 8 |
| Merchants Scale | Merchants Scale | 4 | Wood x2, Stone x2 | 0 | 1 | 1 | 2 | 2 | 2 | 4 |

### Items and Tools Without a Blueprint

These recipes need no learned blueprint to craft, so they never earn the tier-scaled assembly bonus above — only the raw-material XP their full chain pays out.

| Item | Raw XP | Raw Materials |
|---|---:|---|
| Metal Bar | 158 | Ore x125, Wood x33 |
| Lacquer | 140 | Pigment x80, Herbs x48, Wood x12 |
| Tent | 99 | Fiber x96, Wood x3 |
| Written Scroll | 48 | Pigment x24, Sand x12, Reed x8, Feather x4 |
| Antidote Potion | 44 | Herbs x26, Sand x12, Venom x6 |
| Healing Potion | 42 | Herbs x26, Sand x12, Harvest x4 |
| Mana Potion | 42 | Crystal x15, Sand x12, Essence x9, Monster Part x6 |
| Venom Vial | 33 | Herbs x12, Sand x12, Venom x9 |
| Cart | 32 | Wood x32 |
| Metal Ingot | 31 | Ore x25, Wood x6 |
| Tinkered Gearbox | 29 | Ore x25, Clockwork x4 |
| Glass Lantern | 28 | Sand x12, Ore x10, Crystal x3, Meat x3 |
| Cloth Cloak | 25 | Fiber x25 |
| Panel | 25 | Wood x15, Bone x10 |
| Leather Lining | 24 | Skin x24 |
| Woven Cloth | 24 | Fiber x24 |
| Hunters Charm | 22 | Monster Part x12, Bone x10 |
| Grappling Hook | 21 | Ore x15, Fiber x6 |
| Fur Cloak | 20 | Hide x20 |
| Chain | 20 | Ore x20 |
| Ink | 18 | Pigment x12, Sand x6 |
| Mirror | 17 | Sand x12, Ore x5 |
| Fired Brick | 16 | Clay x12, Sand x4 |
| Iron Spikes | 15 | Ore x15 |
| Manacles | 15 | Ore x15 |
| Clockwork Mechanism | 14 | Ore x10, Clockwork x4 |
| Pickled Fish | 14 | Sand x12, Fish x2 |
| Beam | 12 | Wood x12 |
| Glass Bottle | 12 | Sand x12 |
| Backpack | 10 | Skin x6, Hide x4 |
| Crowbar | 10 | Ore x10 |
| Lock And Key | 10 | Ore x10 |
| Sharpened Stick | 9 | Wood x5, Meat x3, Harvest x1 |
| Roast Haunch | 9 | Meat x9 |
| Axe Stone | 8 | Wood x3, Meat x3, Stone x2 |
| Torch | 8 | Fiber x3, Meat x3, Wood x2 |
| Ladder | 8 | Wood x6, Fiber x2 |
| Spyglass | 8 | Ore x5, Crystal x3 |
| Refined Clay | 8 | Clay x6, Sand x2 |
| Hourglass | 7 | Sand x7 |
| Shovel | 7 | Ore x5, Wood x2 |
| Venomous Extract | 7 | Herbs x4, Venom x3 |
| Smoked Fish | 7 | Wood x5, Fish x2 |
| Rope | 6 | Fiber x6 |
| Leather | 6 | Skin x6 |
| Alloy Dust | 6 | Ore x3, Crystal x2, Essence x1 |
| Glass Pane | 6 | Sand x6 |
| Herbal Extract | 6 | Herbs x6 |
| Medicinal Paste | 6 | Herbs x4, Harvest x2 |
| Thread | 6 | Fiber x6 |
| Club | 5 | Wood x5 |
| Bedroll | 5 | Hide x3, Fiber x2 |
| Candle | 5 | Harvest x3, Fiber x2 |
| Cured Chitin | 5 | Monster Part x5 |
| Arcane Dust | 5 | Crystal x3, Essence x2 |
| Distilled Essence | 5 | Essence x3, Monster Part x2 |
| Ground Spice | 5 | Herbs x5 |
| Refined Ore | 5 | Ore x5 |
| Reinforced Frame | 5 | Wood x3, Bone x2 |
| Sponge | 5 | Fiber x5 |
| Firewood | 5 | Wood x5 |
| Squirrel Hoard | 4 | Harvest x4 |
| Wizened Figs | 4 | Harvest x3, Herbs x1 |
| Fishing Pole | 4 | Wood x3, Fiber x1 |
| Quill | 4 | Feather x4 |
| Ground Pigment | 4 | Pigment x4 |
| Hardened Stick | 4 | Wood x4 |
| Parchment | 4 | Reed x4 |
| Plank | 4 | Wood x4 |
| Trimmed Pelt | 4 | Hide x4 |
| Grilled Fish Skewer | 4 | Fish x4 |
| Salt Horse | 3 | Meat x3 |
| Holy Symbol | 3 | Wood x2, Pigment x1 |
| Waterskin | 3 | Skin x3 |
| Tinderbox | 3 | Stone x2, Wood x1 |
| Baked Harvest | 3 | Harvest x3 |
| Coal | 3 | Wood x3 |
| Cooked Meat | 3 | Meat x3 |
| Cut Crystal | 3 | Crystal x3 |
| Dressed Meat | 3 | Meat x3 |
| Carcass | 3 | Meat x3 |
| Trophy Charm | 3 | Monster Part x3 |
| Oil | 3 | Meat x2, Fiber x1 |
| Chalk | 2 | Stone x2 |
| Signal Whistle | 2 | Bone x2 |
| Whetstone | 2 | Stone x2 |
| Bone Blade | 2 | Bone x2 |
| Bone Shard | 2 | Bone x2 |
| Quilted Thread | 2 | Feather x2 |
| Cooked Fish | 2 | Fish x2 |
| Clean Fish | 1 | Fish x1 |

### Light Sources

A light source's raw cost stays the same across all six tiers — only the tier of raw material used changes (e.g. a tier-1 Candle burns Grain, a tier-6 Candle burns Ambrosia) — while burn duration doubles each tier:

| Light Source | Raw Materials | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---:|---:|---:|---:|---:|---:|
| Candle | Harvest x3, Fiber x2 | 1h | 2h | 4h | 8h | 16h | 32h |
| Torch | Fiber x3, Meat x3, Wood x2 | 2h | 4h | 8h | 16h | 32h | 64h |
| Glass Lantern + Oil (per flask) | Lantern: Sand x12, Ore x10, Crystal x3, Meat x3 · Oil: Meat x2, Fiber x1 | 1h | 2h | 4h | 8h | 16h | 32h |

Candle and Torch are self-contained and just burn for their own tier's duration. A Lantern instead needs Oil: its actual burn time is bottlenecked by whichever of the lantern/oil pair is the lower tier (a tier-6 lantern burning tier-1 oil only gets 1h). When the equipped lantern runs dry, the character automatically falls back to a carried Torch, then a Candle, and finally goes dark if nothing is left.

Total raw material cost to keep a light burning for a given duration, using tier-1 items:

| Duration | Candle (1h each) | Torch per 1h | Lantern 1 oil per hour |
|---|---:|---:|---:|
| 10h | 50 | 40 | 58 |
| 20h | 100 | 80 | 88 |
| 30h | 150 | 120 | 118 |
| 40h | 200 | 160 | 148 |
| 50h | 250 | 200 | 178 |

