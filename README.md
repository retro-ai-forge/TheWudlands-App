# The Wudlands

An old-school round-based Fighting Fantasy-style adventure game inspired by UltraQuest, Lone Wolf Saga, EverQuest, Dungeon Crawl Classic, books from Steve Jackson, Ian Livingstone, and the GAVUN WUD meme, built as a browser-based fantasy RPG with scene-driven gameplay, pixel-art, ascii-art, narrative-driven adventures, and onchain character progression. The game is built using a modular, plugin-based architecture that allows for easy extension and modification.

Visit [The Wudlands](https://thewudlands.eu/) to explore the game.

---

## Call for Contributors

The Wudlands is built by the community, for the community. We're actively recruiting contributors across multiple disciplines to help bring this dark fantasy world to life. Whether you're a writer, artist, developer, or designer, there are roles that match your skills and passion.

---

## For Players

![The World Eternal](/public/images/theworld/the-world-eternal.jpg)

Create your character, choose a class and profession, gear up with crafted weapons and armor, tame companions and mounts, and venture into branching adventures where your choices shape the story. Ten soul-creation slots await — the first is free, the rest are unlocked by what your wallet holds.

**[Read the full Player's Guide &rarr;](docs/PLAYERS.md)** ⚠️ *Contains progression and crafting tables*

---

## For Storytellers

![The Wudlands Engine](/public/images/create/wudland-engine.jpg)

Write branching adventures using [Twine](https://snapcraft.io/twinejs) — a free, visual tool for interactive fiction. You create the scenes, choices, and branching paths; the engine handles loading, validation, rendering, and player sessions. No coding required. Adventures earn 80% of the entry fee revenue, paid directly to your wallet.

**[Read the full Storyteller's Guide &rarr;](docs/STORYTELLERS.md)**

---

## For Developers

![Engine Architecture](/public/images/dev-section/engine.jpg)

A Next.js frontend and FastAPI backend power the addon engine — a stateless, per-request scene walker that runs multiple player sessions concurrently. The codebase covers session management, scene graph traversal, crafting systems, blockchain wallet integration, and addon validation.

**[Read the full Developer's Guide &rarr;](docs/DEVELOPERS.md)** · [Setup instructions](SETUP.md)
