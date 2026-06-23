# TheWudlands — Website Restructure Concept & Claude Code Prompts

> Goal: turn the current 7-page flat site into a focused, mobile-first onboarding
> funnel for **new players**, while keeping **storyteller/artist** content on-site
> (they don't use git) and pushing **developer** content to the repo `README.md`.

---

## 1. Current state (audit)

**Top navigation (7 flat items):**
`The Wudlands (home)` · `About` · `Guide` · `Characters` · `Storyteller` · `Dev Section` · `GTC`

| Page | Audience | Verdict |
|------|----------|---------|
| **Home** (`/`) | New players | Banner slideshow + "Enter Wudlands" wallet button. **Wallet-first, no explanation** — a first-time visitor sees a slideshow and a Connect button but never learns *what the game is* or *why to play* before hitting the wallet wall. |
| **About** | New players | Holds the real "what is it / the world / how to start / adventures / fees" content — but it's buried as nav item #2 instead of being the hero. |
| **Guide** | New players | Player mechanics (Minne, fame, notoriety, survival, combat, party, age). Already uses fold-outs. Good content, secondary priority. |
| **Characters** | Players / lore | Race / profession / class / gender / stats. Very dense; already collapsible. |
| **Storyteller** | **Contributors (must stay on site)** | Addon authoring guide, JSON schema, image specs. Dense but essential for non-git artists. |
| **Dev Section** | Developers | Overview + repo links + roadmap. **Mostly duplicated in README now** — doesn't need primary-nav real estate. |
| **GTC** | Legal | Terms. Belongs in a footer, not primary nav. |

**Core problem:** the site treats all 7 pages as equals. Three different audiences
(players, contributors, developers) compete for the same flat menu, and the home
page leads with the single highest-friction action (connect a wallet) before
giving anyone a reason to care.

---

## 2. What the research says

**Web3 game onboarding (the big one):** wallet-first onboarding is the #1 reason
players bounce. Let players understand and *want* the game before asking for a
wallet. Use **progressive disclosure** — show the world first, reveal the wallet
step only when the player is ready to commit. Translate blockchain into game
language: not "connect your Polkadot wallet," but "save your adventure forever."
Avoid leading with the word "Web3" at all.

**Hero / above-the-fold:** users spend ~80% of their time above the fold. The hero
needs one compelling headline (passes a 5-second "what is this?" test), one
supporting subhead, and **one** primary CTA. Multiple competing CTAs can cut
conversion dramatically. Add trust signals (roadmap, community, "free to play in beta").

**Gamebook lineage (positioning):** Fighting Fantasy / Lone Wolf / Choice of Games
all present a game as *"you read, you choose, you live with the consequences."*
That one-line promise is clearer than "scene-driven onchain RPG." Lead with the
gamebook hook; mention the chain second.

Sources:
- https://cryptodaily.co.uk/2026/05/web3-gaming-wallet-first-onboarding
- https://sequence.xyz/blog/how-to-simplify-user-onboarding-for-a-web3-app
- https://magic.link/posts/user-onboarding-web3-challenges-best-practices
- https://prismic.io/blog/website-hero-section
- https://blog.logrocket.com/ux-design/hero-section-examples-best-practices/
- https://www.choiceofgames.com/
- https://fightingfantasy.net/

---

## 3. Target information architecture

Collapse 7 flat items into **3–4 primary nav items + a footer**, organised by audience.

```
PRIMARY NAV (players first)
├── Play            → redesigned home / hero landing  (the funnel)
├── The World       → About + lore (what it is, the world, inspirations, how to start)
├── Guide           → player mechanics (Guide + Characters folded in as sections)
└── Create          → Storyteller hub (contributors/artists — stays on site)

FOOTER (secondary, de-emphasised)
├── Developers      → one short paragraph + links to GitHub README (was: Dev Section)
├── Roadmap         → keep the timeline, link from footer + welcome view
├── Terms (GTC)
├── Telegram / community
└── version badge
```

**Principles**
1. **Players see 3 things first:** what it is → why play → how to start. Everything
   else is one scroll or one click deeper.
2. **Progressive disclosure everywhere:** dense lore, schemas and specs stay folded
   (much of this already exists — extend it).
3. **Wallet step reframed** as "save your progress forever," introduced *after* the
   pitch, not as the first thing on screen.
4. **Contributors keep a real home** (`Create`), but it's separated from the player
   funnel so it doesn't clutter onboarding.
5. **Developers and legal move to the footer** — discoverable, not prominent.

---

## 4. Claude Code prompts (run in order)

Each prompt below is self-contained and ready to paste into Claude Code. They are
ordered so the site stays working after every step. Do them one at a time and
check the result in the browser (`npm run dev`) before moving on.

> Repo facts to give Claude Code if it asks: Next.js App Router, pages live in
> `app/<route>/page.tsx`, nav is defined in `app/main/Header.tsx` (the `NAV` array),
> shared styles in `app/main/Header.module.css`, home funnel in `app/page.tsx` +
> `app/main/LandingView.tsx`, palette is dark amber (`#c07a3a`, `#d4c9a8`,
> `#7a6a3a` on `#0a0a0a`), monospace Courier UI.

---

### PROMPT 1 — Slim the primary nav and add a footer

```
In app/main/Header.tsx the NAV array currently has 7 items: The Wudlands, About,
Guide, Characters, Storyteller, Dev Section, GTC. Restructure the site navigation
for a player-first onboarding funnel:

- Reduce the PRIMARY header nav to 4 items only:
  Play (href "/"), The World (href "/about"), Guide (href "/guide"),
  Create (href "/storyteller").
- Do NOT delete the /characters, /dev-section, or /gtc routes/pages — just remove
  them from the primary header nav.
- Create a new site Footer component (app/main/Footer.tsx + Footer.module.css) and
  render it in app/layout.tsx below the page content. The footer holds the
  de-emphasised, secondary links: Developers (→ /dev-section), Terms (→ /gtc),
  a Telegram community link (https://t.me/+GNokB3Y-FllhNjBi), and the GitHub repo
  (https://github.com/retro-ai-forge/TheWudlands-App).
- Match the existing dark amber palette and monospace styling used in
  Header.module.css. Keep it mobile-first; the footer should stack vertically on
  narrow screens.
- Move the VersionBadge into the footer if it isn't already globally positioned.

Keep the existing hamburger/mobile-menu behaviour in Header.tsx working with the
new shorter NAV array.
```

---

### PROMPT 2 — Redesign the home page into a hero landing with progressive disclosure

```
Redesign the home page (app/page.tsx + app/main/LandingView.tsx +
app/page.module.css) so a first-time visitor immediately understands the game
BEFORE being asked to connect a wallet. Keep the existing BannerSlideshow and
HomeBackground as the backdrop. Build a scrollable landing with these stacked
sections, top to bottom:

1. HERO (above the fold): a short headline that passes a 5-second "what is this?"
   test, e.g. "A dark fantasy gamebook you play in your browser." One supporting
   subhead line, e.g. "Read the scene. Make the choice. Live with what follows."
   Then ONE primary CTA button. Do not surface wallet jargon here.

2. "WHAT IS THE WUDLANDS" — 2–3 short sentences positioning it as an old-school
   Fighting Fantasy / Lone Wolf style choose-your-path adventure, now in the
   browser with permanent character progression. Pull/condense from the existing
   About page copy (app/about/page.tsx) — do not invent new lore.

3. "HOW IT WORKS" — three compact steps with simple icons or numbers:
   (1) Pick an adventure, (2) Make choices that matter, (3) Your character &
   deeds are saved forever. Use game language, not blockchain terms.

4. TRUST / STATUS strip — small, reassuring line(s): "Free to play in beta ·
   No coins spent before alpha" and a link to the roadmap (/dev-section#roadmap).

5. FINAL CTA — repeat the primary action at the bottom of the scroll.

Keep the actual wallet connect flow (EnterWudlandsButton) exactly as-is
functionally — only change WHERE it sits and the surrounding copy. The status
text ("Ready." etc.) should stay near the button as it is now. Everything must be
mobile-first and use the existing palette and Courier styling.
```

---

### PROMPT 3 — Reframe the wallet step in player-friendly language

```
Across the player-facing UI, reframe wallet/login language from technical Web3
terms into game language, using progressive disclosure. Specifically:

- In app/main/EnterWudlandsButton.tsx and the home landing copy, the primary CTA
  should read like a game action (e.g. "[ ENTER THE WUDLANDS ]") rather than
  "Connect wallet". Only when the user taps it do we explain — in one short
  sentence — that a Polkadot wallet (Nova, Talisman, SubWallet, Polkadot.js) is
  used to save their progress forever. Keep all existing connect/sign/verify logic
  intact; this is copy + a small inline helper note only.
- Keep the existing WalletGuide foldable (app/guide/WalletGuide.tsx) as the
  detailed "how to install a wallet" reference, and link to it from the inline
  helper note.
- Do not remove the word Polkadot where it's factually needed, but lead with the
  benefit ("save your adventure forever") before the mechanism.

Do not change any auth endpoints, signing, or session logic — copy and small
presentational helpers only.
```

---

### PROMPT 4 — Fold the deep player content (Characters into Guide)

```
The /characters page (app/characters/page.tsx) is dense lore that no longer has a
primary nav entry after the nav restructure. Surface it where players actually
look: fold it into the Guide.

- On app/guide/page.tsx, add a clearly-labelled "Character & Origins" area that
  links to, or embeds as collapsible sections, the Race / Profession / Class /
  Gender / Story-Impact content currently in app/characters/page.tsx.
- Prefer reusing the existing collapsible pattern already in characters/page.tsx
  (the expandedSections toggles) rather than dumping it all open — keep first view
  uncluttered.
- If embedding is too heavy, instead add a prominent "Character creation →" card on
  the Guide page linking to /characters, and keep /characters reachable.
- Keep all existing copy and data arrays (GENDERS, RACES, PROFESSIONS, STORY_STATS)
  intact. Mobile-first, existing palette.
```

---

### PROMPT 5 — Turn Storyteller into a clear "Create" contributor hub

```
Reframe the Storyteller page (app/storyteller/page.tsx) as the "Create" hub for
non-technical story writers and artists who do NOT use git. Improve scannability
with progressive disclosure without removing any content:

- Add a short, welcoming intro at the very top aimed at writers/artists:
  one paragraph that says "You don't need to code or use GitHub to add an adventure"
  and a 3-step overview (write scenes as choices → add images → submit for review).
- Group the existing material under clear collapsible sections so the page doesn't
  open as one giant wall: "1. Writing your story (JSON)", "2. Images & style presets",
  "3. Full example", plus the existing schema/example expanders. Keep the existing
  expand/collapse buttons; just make the top-level structure foldable too.
- Keep ALL current guideline text, the JSON schema block, the image spec tables,
  the ImageGallery, and the example addon exactly as they are — only reorganise and
  add section headers/intros. Mobile-first, existing palette.
```

---

### PROMPT 6 — Reduce Dev Section to a thin pointer to the README

```
Developer content now lives in the repo README.md. Trim the on-site Dev Section
(app/dev-section/page.tsx) to a thin pointer so it stops competing with player
content:

- Keep the page reachable from the footer (added in Prompt 1) and keep the
  #roadmap anchor + the roadmap timeline (it's linked from WelcomeView).
- Replace the long "Developer Overview / Addon Engine / Parallel Sessions" prose
  with a short paragraph: "The Wudlands is open source. Full technical docs live in
  the GitHub README." plus the existing repo/Telegram links.
- Preserve the roadmap section (id="roadmap") and the social links block. Do not
  break the /dev-section#roadmap deep link used in app/main/WelcomeView.tsx.
```

---

### PROMPT 7 (optional) — Mobile-first QA & polish pass

```
Do a mobile-first QA pass on the restructured site (375px viewport first, then
desktop). Check: the 4-item header nav + hamburger, the new home hero and its
single primary CTA, the footer stacking, and that /characters, /dev-section, /gtc
remain reachable from Guide/footer. Fix any overflow, tap-target, or spacing
issues. Confirm the wallet connect/sign/verify flow still works end to end and the
"Ready." status still sits close to the Enter button. Don't change game logic —
layout and styling fixes only.
```

---

## 5. Image assets & generation prompts

The images below are mapped to each restructure prompt (1–7), in your 80s/90s
pixel-art / old-school dungeon aesthetic, and constrained to sizes your repo
already uses so new art drops in cleanly.

### 5.1 What the repo already uses (measured)

| Family | Ratio | Source px (actual) | Format | Max KB |
|--------|-------|--------------------|--------|--------|
| Banner / hero backdrop (`/banner/*`) | 2:3 portrait | **1024 × 1536** | JPG/WebP | ~400 |
| Inline section image (`fame`, `minne`, `engine`…) | 3:2 landscape | **1536 × 1024** | JPG/WebP | ~400 |
| In-game scene image (storyteller spec) | 16:9 | 1024 × 576 (max 1200×700) | JPG/WebP | 400 |
| "Wud Legends" avatar | 1:1 | square, shown at 80px | PNG | — |

Keep these. Everything new below either reuses one of these families or adds a
**pixel-art icon/portrait** layer for UI chrome.

### 5.2 New size targets for the restructure

| Surface | Ratio | Author at | Format | Max KB | Shown at |
|---------|-------|-----------|--------|--------|----------|
| Hero backdrop | 2:3 portrait | 1024 × 1536 | JPG/WebP | 400 | full-bleed |
| Step / UI icon (pixel) | 1:1 | 128 × 128 | PNG + alpha | 40 | 96–128px |
| Item / loot icon (pixel) | 1:1 | 64 × 64 or 128 × 128 | PNG + alpha | 30 | 48–96px |
| Character / race portrait | 1:1 | 384 × 384 | PNG/JPG | 120 | 120–200px bust |
| Class emblem / sigil | 1:1 | 128 × 128 | PNG + alpha | 40 | 80–128px |
| Footer crest / wordmark | 1:1 or wide | 512 × 512 / 1024 × 256 | PNG + alpha | 60 | 48–96px |
| In-game scene / location card | 16:9 | 1024 × 576 | JPG/WebP | 400 | scene frame |

> Pixel-art tip: AI models rarely produce a *true* pixel grid. Author at the small
> size, or generate larger then **downscale + quantise to ~32 colours with
> nearest-neighbor** (no blur). In CSS render icons with
> `image-rendering: pixelated;` so they stay crisp. Put item/UI icons on a
> **transparent** background.

### 5.3 Reusable style preamble (paste before EVERY prompt below)

```
STYLE: 16-bit era pixel art in the spirit of late-80s/early-90s DOS & Amiga
dungeon-crawler RPGs and Fighting Fantasy gamebook plates (Eye of the Beholder,
Ultima Underworld, HeroQuest). Clean visible pixel grid, limited palette, dithered
shading, hard edges, NO anti-aliasing, NO smooth modern gradients, NO text or
letters anywhere in the image. Dark, candle-lit dungeon-fantasy mood.
PALETTE — constrain to: ink black #0a0a0a, deep brown #3a3020 shadows,
olive-bronze #7a6a3a midtones, warm amber #c07a3a and bright amber #e6a55a
highlights, parchment #d4c9a8 for light. Render at a true low-res pixel grid and
scale up nearest-neighbor (no blur). Where an icon is requested use a fully
transparent background.
```

### 5.4 Per-prompt image sets

**For PROMPT 1 (nav + footer) — 1 image**
- *Footer crest / sigil* — 512×512 PNG, ≤60KB, transparent.
```
[STYLE PREAMBLE] A small heraldic crest for a dark-fantasy world called The
Wudlands: a gnarled dead oak tree inside a worn circular bronze seal, antler and
bare-branch motifs around the rim, weathered amber and olive-bronze metal.
Centered, symmetrical, emblem only, transparent background.
```

**For PROMPT 2 (home hero landing) — 1 backdrop + 3 step icons**
- *Hero backdrop* — 1024×1536 portrait, JPG/WebP ≤400KB. Leave dark sky at top for the headline overlay.
```
[STYLE PREAMBLE] Portrait composition. A lone hooded wanderer with a torch stands
on a rocky ridge at dusk, looking down into a vast dark pine-forest valley; a
ruined watchtower silhouette on a far hill, circling crows, faint amber glow on
the horizon. Large expanse of near-black storm sky filling the top third (empty
space for a title). Atmospheric, painterly-pixel hybrid, heavy vignette.
```
- *3 "How it works" step icons* — each 128×128 PNG, ≤40KB, transparent:
```
1) [STYLE PREAMBLE] An open illustrated leather gamebook / tome with a quill resting
   on it, amber page glow. Single centered object icon, transparent background.
2) [STYLE PREAMBLE] A forked forest path splitting into two trails at a weathered
   wooden signpost, dark trees either side. Single centered icon, transparent bg.
3) [STYLE PREAMBLE] A glowing amber rune-stone tablet etched with a single sigil,
   soft magical light. Single centered object icon, transparent background.
```

**For PROMPT 3 (wallet reframe) — 1 artifact icon**
- *"Saved forever" ledger-stone* — 128×128 PNG, ≤40KB, transparent. Used in the inline "save your progress forever" helper.
```
[STYLE PREAMBLE] A magical ledger artifact: an upright amber rune tablet that
records deeds, carved chain-link border around the edge, warm inner glow, faint
etched marks. Single centered object icon, transparent background.
```

**For PROMPT 4 (Characters → Guide) — the portrait set (6 races + 6 classes)**
- *Race portrait busts* — 384×384 PNG/JPG, ≤120KB each. Same framing/lighting across all six (head-and-shoulders, ¾ view, dark background) so they read as a set.
```
[STYLE PREAMBLE] Head-and-shoulders character portrait bust, three-quarter view,
centered, plain dark #0a0a0a background, single torch key-light from the left.
SUBJECT: <one of>
 - a weathered human wanderer in a hooded travelling cloak
 - a sharp-featured elf with long pale hair and leaf-pattern armor
 - a broad bearded dwarf in riveted iron with braided beard rings
 - a wiry halfling with a sly grin and a patched leather jerkin
 - a heavy-jawed orc-blooded warrior with tusks and tribal scars
 - an Ancient-Born elder with faintly glowing amber eyes and rune-etched skin
Consistent style across the set.
```
- *Class emblems* — 128×128 PNG, ≤40KB, transparent, simple iconic symbol each:
```
[STYLE PREAMBLE] A single iconic class emblem on transparent background:
 - Warrior: crossed broadsword and notched shield
 - Rogue: hooded dagger over a coin
 - Mage: a staff topped with a glowing amber crystal
 - Ranger: a longbow with a single arrow and an oak leaf
 - Cleric: a radiant holy symbol / sunburst amulet
 - Paladin: an upright greatsword crossed with a winged shield
Centered emblem only, no background.
```

**For PROMPT 5 (Create hub) — 3 step icons + optional sample scene cards**
- *3 contributor step icons* — 128×128 PNG, ≤40KB, transparent:
```
1) [STYLE PREAMBLE] A quill writing branching lines / a flowchart of choices on
   parchment. Single centered icon, transparent background.
2) [STYLE PREAMBLE] A painter's palette and brush over a small framed dungeon
   scene. Single centered icon, transparent background.
3) [STYLE PREAMBLE] A wax-sealed scroll being handed forward / an "approved" stamp.
   Single centered icon, transparent background.
```
- *Optional sample scene cards* (to show writers what a scene looks like) — 1024×576 16:9 JPG ≤400KB, dark painterly-pixel, e.g. "a ruined gate at the mouth of a sinkhole," "a vaulted underground vault with dripping pillars."

**For PROMPT 6 (Dev section trim) — 0–1 image**
- Keep existing `engine.jpg`. Optional tiny pixel *engine/gears* icon (128×128 PNG ≤40KB) if you want a footer/devs glyph. No new hero art needed.

**For PROMPT 7 (QA pass) — none.** Verify pixel icons render with
`image-rendering: pixelated` and that no asset exceeds its KB budget on mobile.

### 5.5 Bonus — in-game asset library (for the actual MVP, per your architect role)

When you build the first adventure round, these reuse the same style preamble:
- **Item / loot icons** (64–128px PNG, ≤30KB, transparent): short sword, round
  shield, red potion, gold pouch, sealed scroll, iron key, lit torch, ration bundle.
- **Monster sprites** (128×128 PNG, ≤40KB, transparent): goblin, giant rat,
  skeleton, dire wolf, bandit.
- **Location / map cards** for the three starting sites (16:9 1024×576 JPG ≤400KB):
  *Old Forest* (dense dark pines, mist), *Goblin Cave* (jagged torch-lit cave
  mouth), *Ruined Watchtower* (broken stone tower on a bleak hill). These double as
  the clickable pixel-map tiles.

---

## 6. Suggested commit sequence

1. `nav: slim primary nav to 4 items, add footer` (Prompt 1)
2. `home: hero landing with progressive disclosure` (Prompt 2)
3. `onboarding: reframe wallet step in game language` (Prompt 3)
4. `guide: fold character/origins content in` (Prompt 4)
5. `create: restructure storyteller hub for non-coders` (Prompt 5)
6. `dev: trim dev-section to README pointer` (Prompt 6)
7. `polish: mobile-first QA pass` (Prompt 7)

Each step leaves the site fully working, so you can ship or roll back at any point.
```
