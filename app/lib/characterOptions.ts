// Canonical character creation option lists — shared between the /characters
// lore page and the in-game Soul Creation wizard so both stay in sync.

export const GENDERS = [
  {
    id: "m",
    symbol: "◇",
    name: "Male",
    description: "The world was long written for you. Maidens steal glances from behind castle walls. A princess may slip away from her escort just to speak with you. A noblewoman lowers her guard in ways she would never admit at court. The Guildmistress of a powerful order may find reasons to summon you privately. The innkeeper's daughter remembers your name long after you have gone. Desire finds you before you look for it. The rest writes itself.",
  },
  {
    id: "d",
    symbol: "◈",
    name: "Diverse",
    description: "Neither bound nor defined. You walk between the old lines and the world must decide how to read you — sometimes it cannot. Most adventures open their gates to you, though some stories are written for a specific kind of soul: a tale of seduction built for a man, a rivalry that only burns between women, an intimacy that demands one or the other. Those doors will be closed to you. D is the widest path through the Wudlands — but not every path was cut for it.",
  },
  {
    id: "f",
    symbol: "◆",
    name: "Female",
    description: "Beauty and will are their own kind of power. A prince loses composure the moment you enter the hall. A dark baron with iron arms may discover, to his own surprise, that he wants to protect something. Pirates invite you aboard as an equal — sometimes as more. Marriage opens rivers, land deeds, harbor rights and trading ships. Some doors old tradition bars to others open quietly for you — and some men tear them off their hinges just to follow.",
  },
];

export const RACES = [
  { id: "human", name: "Human", category: "Common", description: "Adaptable and ambitious. Masters of trade and politics. No innate gift, but boundless potential." },
  { id: "elf", name: "Elf", category: "Common", description: "Long-lived and graceful. Affinity for magic and the wild. Time is your advantage." },
  { id: "dwarf", name: "Dwarf", category: "Common", description: "Sturdy and skilled in stone and metal. Natural resistance to harm and magic. Built to last." },
  { id: "halfling", name: "Halfling", category: "Common", description: "Quick-witted and nimble. Lucky by nature. Small body, sharp mind." },
  { id: "orc", name: "Orc", category: "Common", description: "Strong and fierce. Feared for strength but often misjudged. Scarred honor runs deep." },
  { id: "gnome", name: "Gnome", category: "Common", description: "Inventive and curious. Affinity for magic and artifice. Your mind works differently." },
  { id: "goblin", name: "Goblin", category: "Common", description: "Small, industrious, and clever. Often underestimated. Trade and tinkering are in your blood." },
  { id: "minotaur", name: "Minotaur", category: "Common", description: "Bull-headed and strong-willed. Labyrinth-dweller seeking a place in the world. Loyalty runs deep." },
  { id: "tiefling", name: "Tiefling", category: "Mystical", description: "Marked by infernal blood. Charismatic but often distrusted. Magic flows through you." },
  { id: "dragonborn", name: "Dragonborn", category: "Mystical", description: "Descended from dragons. Breath as a weapon, scales as armor. Ancient legacy in your blood." },
  { id: "lizardfolk", name: "Lizardfolk", category: "Mystical", description: "Cold-blooded and alien. Survivor's instinct runs deep. Excellent hunters and scouts. Tribal honor matters most." },
  { id: "beastfolk", name: "Beastfolk", category: "Mystical", description: "Touched by animal blood. Part human, part beast. Instinct wars with reason. Fierce and unpredictable." },
  { id: "halfelf", name: "HalfElf", category: "Mixed", description: "Between two worlds. Flexible and diplomatic. Neither fully one thing nor another—both and neither." },
  { id: "halforc", name: "HalfOrc", category: "Mixed", description: "Strength and grace collide. Caught between two heritages. You are more than the prejudice that follows you." },
  { id: "elder", name: "Elder", category: "Mixed", description: "Born in the First Age from a union of an ancient race and something unknowable. You remember fragments of a world before this one. Immortal blood runs thin, but it runs deep." },
  { id: "ogre", name: "Ogre", category: "Giants", description: "Brutish and powerful. Often enslaved or cast out. Strength is all you have—make it count." },
  { id: "goliath", name: "Goliath", category: "Giants", description: "Enormous and athletic. Built for the mountains and the sky. Strength defines your place in the world." },
  { id: "giant", name: "Giant", category: "Giants", description: "Towering and ancient. The world was made for smaller folk. Your size is both gift and curse." },
];

export const racesByCategory = RACES.reduce((acc, race) => {
  if (!acc[race.category]) {
    acc[race.category] = [];
  }
  acc[race.category].push(race);
  return acc;
}, {} as Record<string, typeof RACES>);

export const PROFESSIONS = [
  { id: "farmer", name: "Farmer", category: "Rural", description: "Land and soil. Crops, livestock, seasons. You know survival." },
  { id: "herder", name: "Herder", category: "Rural", description: "Goats, sheep, cattle. Wind and weather. Patience and care." },
  { id: "hunter", name: "Hunter", category: "Rural", description: "Bow and tracking. Wild things and wilderness. You survive through skill." },
  { id: "fisher", name: "Fisher", category: "Rural", description: "Net and line. Coast and tidal knowledge. You harvest the sea's bounty." },
  { id: "miner", name: "Miner", category: "Rural", description: "Stone and darkness. Pickaxe and deep earth. You have dug deep." },
  { id: "forager", name: "Forager", category: "Rural", description: "Wild plants and mushrooms. Herbs and roots. The forest feeds those who know where to look." },
  { id: "blacksmith", name: "Blacksmith", category: "CraftMetal", description: "Hammer, anvil, fire. Iron and steel know your hands. Creation through force." },
  { id: "armorer", name: "Armorer", category: "CraftMetal", description: "Armor and blades. Protection and precision. Your work saves lives." },
  { id: "tinsmith", name: "Tinsmith", category: "CraftMetal", description: "Cups, pots, pans. Useful beauty. Common things, well-made." },
  { id: "mason", name: "Mason", category: "CraftStone", description: "Stone and mortar. Walls and cathedrals. You built things that last." },
  { id: "stonemason", name: "Stonemason", category: "CraftStone", description: "Chisel and hammer. Shaping rock. Strength in precision." },
  { id: "potter", name: "Potter", category: "CraftStone", description: "Clay and wheel. Vessels and art. Hands and water and earth." },
  { id: "leatherworker", name: "Leatherworker", category: "CraftGarment", description: "Hides and dyes. Armor and saddles. Your craft is both practical and beautiful." },
  { id: "tanner", name: "Tanner", category: "CraftGarment", description: "Raw hides into leather. Smells nobody forgets. Essential work, little glory." },
  { id: "weaver", name: "Weaver", category: "CraftGarment", description: "Loom and thread. Cloth and tapestry. Patterns from chaos." },
  { id: "dyer", name: "Dyer", category: "CraftGarment", description: "Colors from plants and minerals. Bringing life to cloth. Chemistry is your art." },
  { id: "glassblower", name: "Glassblower", category: "CraftGlass", description: "Fire and sand. Fragile beauty. Your breath shapes light." },
  { id: "jeweler", name: "Jeweler", category: "CraftGlass", description: "Gems and precious metals. Tiny, intricate, priceless. Luxury is your medium." },
  { id: "carpenter", name: "Carpenter", category: "CraftWood", description: "Lumberjack builds roofs, ships and houses. You built the bones of the world." },
  { id: "cooper", name: "Cooper", category: "CraftWood", description: "Cabinet maker, barrels and casks. Wooden vessels, mechanics and tools, great demand." },
  { id: "scribe", name: "Scribe", category: "Aristocratic", description: "Words and ink. Record-keeping and documents. Knowledge flows through your hands." },
  { id: "clerk", name: "Clerk", category: "Aristocratic", description: "Numbers and ledgers. Accounts and records. Order is your domain." },
  { id: "scholar", name: "Scholar", category: "Aristocratic", description: "Books and learning. Your mind is your wealth. Questions guide your life." },
  { id: "merchant", name: "Merchant", category: "Trade", description: "Buy and sell. Travel and negotiation. Money and goods pass through your hands." },
  { id: "trader", name: "Trader", category: "Trade", description: "Exchange and profit. Fair deals and sharp eyes. You know value." },
  { id: "baker", name: "Baker", category: "Food", description: "Flour and fire. Bread and sustenance. You fed people." },
  { id: "butcher", name: "Butcher", category: "Food", description: "Meat and butchery. Practical work. You know anatomy." },
  { id: "brewmaster", name: "Brewmaster", category: "Food", description: "Grain and fermentation. Ale and mead. Chemistry and tradition." },
  { id: "cook", name: "Cook", category: "Food", description: "Hearth and pot. Day-in day-out feeding of workers, soldiers, families. You know hunger." },
  { id: "pastry", name: "Pastry Chef", category: "Food", description: "Sugar and butter. Delicate precision. Your hands craft luxury—cakes, tarts, sweetness." },
  { id: "apiarist", name: "Apiarist", category: "Food", description: "Bees and honey. Sweet gold. You have danced with stingers and reaped the rewards." },
  { id: "barkeep", name: "Barkeep", category: "Food", description: "Ale and wit. You pour drinks and know all the stories. The bar is your stage." },
  { id: "server", name: "Tavern Server", category: "Food", description: "Swift feet and careful hands. You remember orders and read moods. Service is your art." },
  { id: "soldier", name: "Soldier", category: "Military", description: "Discipline and steel. Orders and duty. War taught you its lessons." },
  { id: "guard", name: "Guard", category: "Military", description: "Watch and protect. Constant vigilance. You stand between order and chaos." },
  { id: "painter", name: "Painter", category: "Artists", description: "Canvas and pigment. You see the world in colors and shadows. Beauty is your language." },
  { id: "acrobat", name: "Acrobat", category: "Artists", description: "Balance and daring. Your body is a tool of impossible grace. The crowd gasps when you leap." },
  { id: "clown", name: "Clown", category: "Artists", description: "Laughter and wit. You read the room and play the fool. Humor is your weapon and shield." },
  { id: "firespitter", name: "Fire Spitter", category: "Artists", description: "Flame and breath. You dance with danger and dazzle crowds with impossible fire. Danger thrills you." },
  { id: "storyteller", name: "Storyteller", category: "Artists", description: "Words and wonder. You weave tales that move hearts and shape how the world remembers itself. Stories are your power." },
];

export const professionsByCategory = PROFESSIONS.reduce((acc, profession) => {
  if (!acc[profession.category]) {
    acc[profession.category] = [];
  }
  acc[profession.category].push(profession);
  return acc;
}, {} as Record<string, typeof PROFESSIONS>);
