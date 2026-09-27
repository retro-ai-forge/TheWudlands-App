# The Wudlands — Developer's Guide

![Engine Architecture](/public/images/dev-section/engine.jpg)

This is the core engine that hosts and runs several adventures in parallel for users. It tracks the current position of an adventurer, game-specific variables, and session status.

Want to run the project locally? See [SETUP.md](../SETUP.md) for the full setup instructions.

## Architecture Overview

The Wudlands platform is built on a **Next.js** frontend and a **FastAPI** backend. The frontend handles rendering, player interaction, wallet integration, and scene content display. The backend is responsible for session state, addon loading, player routing, play count tracking, and revenue share logic. Both layers are designed to run multiple player sessions concurrently without interference — each session is isolated, stateful, and independently routed through its addon's scene graph.

| Layer | Responsibility |
|-------|---|
| Next.js Frontend | Scene rendering, player input, wallet connection, image display, CSS filter application, adventure selection UI. |
| FastAPI Backend | Session management, addon loading and validation, scene graph traversal, play count tracking, dependency resolution, revenue split logic. |
| Addon Engine | Stateless per-request scene lookup. Falls back to `emergency_exit` on missing scene. Each player session is independently routed with no shared in-memory state. |
| Scene Graph | An id-keyed map of scene objects defined in the addon. Traversed by player choice. Any relationships, loops, and branches are valid structures. |
| Session State | Stored in a shared persistence layer. Holds current scene id, play count, completed adventure record, and player identity. |
| Addon Validation | Schema-checked on contribution. Required fields, scene existence, choice targets, and ending flags are all verified before an addon is made available to players. |
| Dependencies | Resolved per player at adventure entry. Completed addons are recorded. Unlocks are evaluated on completion and made available immediately. |
| Revenue Share | Applied at transaction time. 80% to the contributor's declared wallet address, 20% to the platform. Polkadot primary, Ethereum fallback. |
| Blockchain | Currently Polkadot. Migration to another chain might happen. |
| Soul Slots | Ten welcome-page creation slots. One free, nine gated on wallet holdings — NFT collections, token balances, and Grid Miner stars. Checked per wallet and cached, re-verified on roughly one login in thirty-three, or immediately via the Reload button. |

## The Addon Engine

The core of the platform is the addon engine — the system that takes a contributor's adventure definition and turns it into a live, interactive session. When a player enters an adventure, the engine loads the addon definition for that adventure, validates its structure against the platform schema, and initialises a session record tied to that player and that addon. From that point forward, every choice the player makes is a traversal instruction: move from the current scene id to the target scene id specified by the selected choice.

The scene graph is an addressable map of scene objects keyed by id. The engine looks up the requested scene id in that map on every player action. The adventure starts at the `default_entry`, which serves as the normal session starting point. If a scene exists, it is returned and rendered. If it does not exist — because of a broken link in the addon, a missing node, or any other fault — the engine does not error or crash the session. Instead it falls back to the addon's `emergency_exit` scene, a dedicated error-recovery scene required by schema to exist. The session remains intact, the player can exit gracefully, and the fault is logged server-side for the addon author to review.

## Parallel Sessions

The engine is stateless at the request level. Each player action arrives as an independent HTTP request carrying the player's session token, the addon id, and the target scene id. The backend resolves the session, validates the transition, and returns the next scene. No shared in-memory state is held between requests. This means any number of players can be running through the same addon — or different addons — simultaneously, with no coordination overhead between their sessions. Horizontal scaling is straightforward: additional backend instances can be added without any session affinity requirement, as long as session state is stored in a shared persistence layer.

Play counts are tracked per player per addon. When a player enters an adventure, the engine checks their remaining play count for that addon. If the count is zero, entry is refused until the player resets by paying the entry fee again. Play count decrements happens when the player reaches a scene with `ending: true` or using an `escape_route`. This mirrors the real-world model of paying for the seat, not the outcome.

## Addon Loading & Validation

Addons are loaded from storage on session initialisation and cached for the duration of active sessions using that addon. The engine validates every loaded addon against the platform schema before making it available to players. Validation checks include: presence of all required fields, existence of the `default_entry`, `emergency_exit`, and `escape_route` scenes within the scene map, validity of all `to` targets in choice arrays, and correct boolean typing on `ending` scene flags. Addons that fail validation are not published. Addons that were published and subsequently become invalid due to a platform schema update are flagged for review and removed from active rotation until corrected.

## Adventure Dependencies & Unlocks

Each addon may declare a list of prerequisite addon ids in its `requires` field and a list of addon ids it unlocks in its `unlocks` field. The engine resolves these at the player level: before a player can enter an addon, the backend checks whether all entries in that addon's `requires` list appear in the player's completed adventure record. If they do not, the adventure is displayed as locked with the missing prerequisites listed. When a player completes an adventure, the engine marks it in their record and evaluates the `unlocks` list, making newly accessible adventures available immediately.

## Blockchain & Revenue Share

The platform operates on a blockchain environment, currently targeting Polkadot with an optional Ethereum fallback address per contributor. Note that Nova Wallets already feature both addresses with a single seed. When a player pays the entry fee for an adventure, the revenue split is applied at transaction time: 80% is routed to the wallet address declared in the addon's `polkadot_address` field, and 20% is retained by the platform.

## Image Rendering & Style Presets

Each scene may reference a single image by filename. At runtime, the frontend loads the next scene as an HTML site and applies CSS filters to the image based on the scene's declared style preset. The scene text is displayed. Buttons will be rendered for each choice, and the player can click checkboxes and radio buttons for extra interactivity. There will be an escape button in the corner of the screen, backpack, character sheet and numbers of story dependent stats like health, sanity, and gold. The exact layout and design of the UI is still being iterated on, but the core functionality will be in place for Beta 1.0.

## Tools

The Wudlands ecosystem is built with open and creative tools. Here's what powers the platform:

### Story Creation
**[Twine](https://twinery.org/)** — the free, open-source tool for crafting interactive, nonlinear stories. Write your branching adventures visually, see the full map of your narrative, and playtest before submitting. Available on [Linux, macOS, and Windows via Snap](https://snapcraft.io/twinejs).

### Crafting System Design
**[draw.io](https://www.drawio.com/)** — visual recipe and crafting system design. Export as XML for data interchange, or render as JPG with padding for landing page previews. A straightforward way to map out material flows and profession chains.

### Content Generation
**[ChatGPT](https://platform.openai.com/chat)** — text generation via OpenAI's platform. Use GPT-4.1 or higher on a prepaid, per-request basis (no subscription required).

**[DALL-E 3 / Image Generation](https://platform.openai.com/playground/images)** — AI-generated images with transparency support. Request beautiful, detailed fantasy artwork without commissioning external artists. Use model `gpt-image-2-5-sunburst` with transparency enabled for seamless integration.

### Version Control & Deployment
**[GitHub](https://github.com/)** — app version tracking and collaborative development. Every release is tagged and pushed.

**[Google Cloud Run](https://cloud.google.com/run)** — serverless deployment. Scales horizontally to handle concurrent player sessions without the overhead of traditional infrastructure.

### Wallet Integration
**[Polkadot SDK](https://polkadot.js.org/)** — blockchain wallet connection. Players authenticate and transact directly from their wallets. The platform ships with Polkadot support and an optional Ethereum fallback address per contributor.
