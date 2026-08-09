# The Wudlands
An old-school round-based Fighting Fantasy-style adventure game inspired by UltraQuest, Lone Wolf Saga, EverQuest, Dungeon Crawl Classic, books from Steve Jackson, Ian Livingstone, and the GAVUN WUD meme, built as a browser-based fantasy RPG with scene-driven gameplay, pixel-art, ascii-art, narrative-driven adventures, and onchain character progression. The game will be built using a modular, plugin-based architecture that allows for easy extension and modification. 

Visit [The Wudlands](https://thewudlands.eu/) to explore the game.

## Game Engine

This repo is the core engine to host and run several adventures in parallel for users. It tracks the current position of an adventurer, game specific variables and status.

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

Results are stored per wallet so the checks do not run on every visit. A player with no stored record is always checked; after that, roughly one login in twenty re-verifies, which keeps the unlock state current without spending the API quota on data that rarely changes. A "Reload Balances & NFTs" button on the welcome page forces an immediate re-check outside that schedule, for a player who wants to confirm a fresh balance or NFT right away. If a lookup cannot run at all — no API key configured, or the service is unreachable with nothing cached — the grid stays locked rather than recording that the wallet qualifies for nothing, and previously earned slots are never revoked by an outage.

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
| Soul Slots | Ten welcome-page creation slots. One free, nine gated on wallet holdings — NFT collections, token balances, and Grid Miner stars. Checked per wallet and cached, re-verified on roughly one login in twenty, or immediately via the Reload button. |

