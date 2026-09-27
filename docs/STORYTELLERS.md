# The Wudlands — Storyteller's Guide

![The Wudlands Engine](/public/images/create/wudland-engine.jpg)

Welcome, Narrative Architect. The Wudlands engine lets you create branching, scene-driven adventures — complete with images, choices, stat checks, and multiple endings — without writing any code.

## How Adventures Work

Adventures are self-contained story add-ons: a scene graph of interconnected scenes, each with text, an optional image, and a set of player choices that lead to other scenes. The engine handles everything else — loading, validation, session management, rendering, and player routing. You focus entirely on the story.

## Writing Adventures with Twine

Adventures are authored using [Twine](https://snapcraft.io/twinejs), a free, open-source tool for creating interactive fiction. Twine gives you a visual map of your story's branching paths, making it easy to see how scenes connect, spot dead ends, and manage complex narratives.

You can use the desktop app (available on Linux, macOS, and Windows via Snap) or the browser version. Either way, Twine lets you:

- **Visually map** your entire scene graph — drag, connect, and rearrange passages
- **Preview and playtest** your adventure before submitting
- **Manage branching complexity** — see at a glance where paths converge, diverge, or loop
- **Write rich scene text** with formatting, stat checks, and conditional content

The Wudlands platform provides a Twine story format that maps Twine passages directly to engine scenes, so what you build in Twine is what players experience in the game.

## Scene Structure

![Scene Graph Visualization](/public/images/create/twine-cluster.jpg)

Every adventure is a graph of scenes, each identified by a unique id. The engine walks this graph one step at a time, driven by the player's choices.

### Required Scenes

Every adventure must include three special scenes:

- **default_entry** — the normal starting point when a player begins the adventure
- **emergency_exit** — a fallback the engine uses if a scene link is broken or missing, so the player can always exit gracefully
- **escape_route** — an always-available exit the player can use to leave mid-adventure

### Scene Content

Each scene can include:

- **Text** — the narrative content the player reads, supporting rich formatting
- **Image** — a single image reference with a CSS style preset applied at render time
- **Choices** — buttons the player clicks to move to the next scene, each pointing to a target scene id
- **Interactive elements** — checkboxes, radio buttons, and other inputs for richer player interaction
- **Ending flag** — marks the scene as a story conclusion (decrements play count)

### Branching & Flow

Any graph structure is valid: linear paths, branching trees, convergent storylines, loops, and combinations of all of these. Endless loops or completely isolated sections should be avoided unless the story specifically calls for them.

## Adventure Dependencies & Unlocks

Adventures can form chains. Each adventure may declare:

- **requires** — a list of other adventures the player must have completed before entering this one
- **unlocks** — a list of adventures that become available once the player completes this one

Locked adventures are displayed with their missing prerequisites listed, so players know what to do next.

## Image Specifications & Style Presets

Each scene may reference a single image by filename. At runtime, the frontend loads the image and applies CSS filters based on the scene's declared style preset. The exact visual style — dark, eerie, bright, washed-out — is controlled by the preset, not the raw image, so a single illustration can serve multiple moods.

## Submission

Adventures are submitted alongside their image assets. The engine validates every adventure against the platform schema before making it available to players. Validation checks include:

- Presence of all required fields
- Existence of `default_entry`, `emergency_exit`, and `escape_route` scenes
- Validity of all choice targets (every `to` field must point to an existing scene)
- Correct typing on `ending` flags

Adventures that fail validation are not published. Everything you need to know about the addon format, image specifications, style presets, and submission requirements is documented in the Storyteller section of the app.

## Revenue Share

When a player pays the entry fee for your adventure, the revenue split is applied at transaction time: **80%** is routed to the wallet address you declare in your adventure, and **20%** is retained by the platform. The platform operates on Polkadot with an optional Ethereum fallback address per contributor. For details look up GTC in the app.

## Play Count Model

Play counts are tracked per player per adventure. When a player enters your adventure, the engine checks their remaining play count. If the count is zero, entry is refused until the player pays the entry fee again. Play count decrements when the player reaches an ending scene or uses the escape route. This mirrors the real-world model of paying for the seat, not the outcome.
