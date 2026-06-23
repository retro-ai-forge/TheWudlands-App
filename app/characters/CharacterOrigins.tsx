"use client";

import { useState } from "react";
import styles from "./characters.module.css";

export default function CharacterOrigins() {
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    gender: false,
    race: false,
    profession: false,
    impact: false,
    classes: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };


  return (
    <>
      <header className={styles.header}>
        <p className={styles.title}>[ Origins ]</p>
        <p className={styles.divider}>— — — — — — — — — — — — — — — — —</p>
      </header>

      <section className={styles.intro}>
        <p className={styles.introText}>
          You were born into the Wudlands with bare hands. Your blood marks
          you — the race that flows through your veins. Your upbringing shaped
          you — the stone you broke, the words you wrote, the apprenticeships
          you served, the trade your hands learned. This is who you are, before
          the road.
        </p>
        <p className={styles.introText}>
          A class is not something you are born with. A blacksmith master
          notices the way your hands know iron. A guild recognizes the cut of
          your work. A mentor sees something worth teaching. This is how you
          become more than you were.
        </p>
      </section>

      <div className={styles.panels}>
        <div className={styles.panel}>
          <p className={styles.panelLabel}>Foundation</p>
          <p className={styles.panelTitle}>Race</p>
          <p className={styles.panelText}>
            Your race determines your natural aptitudes, resistances, and how
            the world perceives you before you have said a word. It is the
            ground you stand on — not a ceiling, but a starting point that
            quietly influences everything else.
          </p>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Background</p>
          <p className={styles.panelTitle}>Former Profession</p>
          <p className={styles.panelText}>
            Before adventure, there was a life. A craft learned, a trade
            practiced, a way of moving through the world. That knowledge does
            not vanish when you pick up a weapon or a travelling cloak — it
            travels with you, shaping what comes naturally and what costs you
            effort.
          </p>
          <p className={styles.panelNote}>
            A former blacksmith still knows how iron behaves. A former herbalist
            still reads the forest floor.
          </p>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Earned in Play</p>
          <p className={styles.panelTitle}>Class</p>
          <p className={styles.panelText}>
            There are no classes at creation. A class is something you grow
            into — discovered in a guild hall, taught by a wandering master,
            or unlocked through deeds that draw the right eyes to you. Until
            then, you are simply who you are.
          </p>
          <p className={styles.panelNote}>
            Seek out teachers, join guilds, find mentors. The path will open.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <button
          onClick={() => toggleSection("gender")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: "100%",
            textAlign: "center",
          }}
        >
          <p className={styles.sectionTitle}>
            {expandedSections.gender ? "▼" : "▶"} [ Gender ]
          </p>
          <p className={styles.sectionDivider}>— — — — — — — — — — — — — — — — —</p>
        </button>
        {expandedSections.gender && (
          <>
            <p style={{ fontSize: "0.95rem", color: "#d4c9a8", textAlign: "center", marginBottom: "1rem" }}>
              Choose how the world reads you before you speak a single word.
            </p>
            <p className={styles.sectionIntro}>
          Love is not a side note in the Wudlands — it is one of its deepest currents.
          You may lose your heart to a warlord who should be your enemy. A noblewoman
          may risk her title for a single night in your company. A bond forged in
          darkness may outlast every sword and oath. These are not small things.
          They are the moments that define a life in the Wudlands.
          Gender is the key that unlocks them. It is what the world reads before you
          have spoken a word — and what story writers use to craft immersive, believable
          relationships that feel earned. A great love story needs to know who it is written
          for. Most adventures are crafted to welcome <strong>M</strong> and <strong>D</strong>,
          or <strong>F</strong> and <strong>D</strong> alike. Some, rarer ones, are written
          for a single kind. What you carry here shapes every story that reaches for you.
        </p>
        <div className={styles.scrollContainer}>
          {GENDERS.map((g) => (
            <div
              key={g.id}
              className={styles.genderCard}
            >
              <p className={styles.genderSymbol}>{g.symbol}</p>
              <p className={styles.genderName}>{g.name}</p>
              <p className={styles.genderDescription}>{g.description}</p>
            </div>
          ))}
        </div>
          </>
        )}
      </div>

      <div className={styles.section}>
        <button
          onClick={() => toggleSection("race")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: "100%",
            textAlign: "center",
          }}
        >
          <p className={styles.sectionTitle}>
            {expandedSections.race ? "▼" : "▶"} [ Race ]
          </p>
          <p className={styles.sectionDivider}>— — — — — — — — — — — — — — — — —</p>
        </button>
        {expandedSections.race && (
          <>
            <p style={{ fontSize: "0.95rem", color: "#d4c9a8", textAlign: "center", marginBottom: "1rem" }}>
              Your blood marks you — choose the foundation of who you are.
            </p>
        {Object.entries(racesByCategory).map(([category, races]) => (
          <div key={category} style={{ marginBottom: "2rem" }}>
            <p style={{
              fontSize: "0.85rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#a89968",
              marginBottom: "1rem",
              textAlign: "center",
            }}>
              {category}
            </p>
            <div className={styles.scrollContainer}>
              {races.map((race) => (
                <div
                  key={race.id}
                  className={styles.raceCard}
                >
                  <p className={styles.raceName}>{race.name}</p>
                  <p className={styles.raceDescription}>{race.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
          </>
        )}
      </div>

      <div className={styles.section}>
        <button
          onClick={() => toggleSection("profession")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: "100%",
            textAlign: "center",
          }}
        >
          <p className={styles.sectionTitle}>
            {expandedSections.profession ? "▼" : "▶"} [ Profession ]
          </p>
          <p className={styles.sectionDivider}>— — — — — — — — — — — — — — — — —</p>
        </button>
        {expandedSections.profession && (
          <>
            <p style={{ fontSize: "0.95rem", color: "#d4c9a8", textAlign: "center", marginBottom: "1rem" }}>
              Your craft and upbringing shape what comes naturally to you.
            </p>
        {Object.entries(professionsByCategory).map(([category, professions]) => (
          <div key={category} style={{ marginBottom: "2rem" }}>
            <p style={{
              fontSize: "0.85rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#a89968",
              marginBottom: "1rem",
              textAlign: "center",
            }}>
              {category}
            </p>
            <div className={styles.scrollContainer}>
              {professions.map((profession) => (
                <div
                  key={profession.id}
                  className={styles.professionCard}
                >
                  <p className={styles.professionName}>{profession.name}</p>
                  <p className={styles.professionDescription}>{profession.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
          </>
        )}
      </div>

      <div className={styles.section}>
        <button
          onClick={() => toggleSection("impact")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: "100%",
            textAlign: "center",
          }}
        >
          <p className={styles.sectionTitle}>
            {expandedSections.impact ? "▼" : "▶"} [ Story Impact ]
          </p>
          <p className={styles.sectionDivider}>— — — — — — — — — — — — — — — — —</p>
        </button>
        {expandedSections.impact && (
          <>
            <p style={{ fontSize: "0.95rem", color: "#d4c9a8", textAlign: "center", marginBottom: "1rem" }}>
              Every decision leaves a mark that shapes how the world reads you.
            </p>
            <p className={styles.sectionIntro}>
          Your stats are not numbers on a sheet — they are the reputation you
          build, the bonds you forge, and the enemies you make. Every decision
          in the Wudlands leaves a mark. These marks accumulate into social
          forces that open doors, close them, or kick them off their hinges.
          Most stats come with an opposing force: push too hard in one direction
          and the other diminishes into your shadow.
        </p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Stat</th>
                <th>Description</th>
                <th>In-game Story Use</th>
              </tr>
            </thead>
            <tbody>
              {STORY_STATS.map((row) => (
                <tr key={row.stat}>
                  <td className={styles.statName}>{row.stat}</td>
                  <td>{row.description}</td>
                  <td>{row.storyUse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>

      <div className={styles.section}>
        <button
          onClick={() => toggleSection("classes")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: "100%",
            textAlign: "center",
          }}
        >
          <p className={styles.sectionTitle}>
            {expandedSections.classes ? "▼" : "▶"} [ Classes ]
          </p>
          <p className={styles.sectionDivider}>— — — — — — — — — — — — — — — — —</p>
        </button>
        {expandedSections.classes && (
          <>
            <p style={{ fontSize: "0.95rem", color: "#d4c9a8", textAlign: "center", marginBottom: "1rem" }}>
              A class is not given—it is earned through stories and recognition.
            </p>
            <p className={styles.sectionIntro}>
          You begin with craft. Your hands know stone, or fire, or steel, or words. But craft 
          alone does not make you a Master of those hands. A blacksmith swinging a hammer for thirty 
          years is still a blacksmith. A farmer tilling the same fields their whole life is still 
          a farmer. To reach a class—Paladin, Ranger, Rogue, Cleric—you need something more than 
          skill. You need <strong>a story that recognizes your growth.</strong>
        </p>
        <p className={styles.sectionIntro}>
          Every class begins when someone notices you. A guild master sees the way you move. 
          A wandering mentor hears your name in taverns and comes looking. A god or calling 
          speaks and you answer. But being noticed requires a story. Without stories woven into 
          the Wudlands — without <strong>story writers and narrators building the world 
          around you</strong> — no one ever notices. No guilds exist to find you. No mentors 
          come. No miracles happen. You remain what you were at birth: skilled hands, 
          capable mind, a person living a life.
        </p>
        <p className={styles.sectionIntro}>
          The path to mastery requires doors to open. And doors only open when someone writes 
          them. This is why we need story writers. Without them, there are only craftspeople, 
          not classes. Without narrative, there is only skill, not destiny. Your journey to 
          something greater depends on the world choosing to witness it, and that choice 
          belongs to those who tell the stories the Wudlands lives by.
        </p>
          </>
        )}
      </div>

      <p className={styles.footer}>— character creation in beta 1.0 —</p>
    </>
  );
}

const GENDERS = [
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

const RACES = [
  { id: "human", name: "Human", category: "Common Peoples", description: "Adaptable and ambitious. Masters of trade and politics. No innate gift, but boundless potential." },
  { id: "elf", name: "Elf", category: "Common Peoples", description: "Long-lived and graceful. Affinity for magic and the wild. Time is your advantage." },
  { id: "dwarf", name: "Dwarf", category: "Common Peoples", description: "Sturdy and skilled in stone and metal. Natural resistance to harm and magic. Built to last." },
  { id: "halfling", name: "Halfling", category: "Common Peoples", description: "Quick-witted and nimble. Lucky by nature. Small body, sharp mind." },
  { id: "orc", name: "Orc", category: "Common Peoples", description: "Strong and fierce. Feared for strength but often misjudged. Scarred honor runs deep." },
  { id: "gnome", name: "Gnome", category: "Common Peoples", description: "Inventive and curious. Affinity for magic and artifice. Your mind works differently." },
  { id: "goblin", name: "Goblin", category: "Common Peoples", description: "Small, industrious, and clever. Often underestimated. Trade and tinkering are in your blood." },
  { id: "minotaur", name: "Minotaur", category: "Common Peoples", description: "Bull-headed and strong-willed. Labyrinth-dweller seeking a place in the world. Loyalty runs deep." },
  { id: "tiefling", name: "Tiefling", category: "Mystical", description: "Marked by infernal blood. Charismatic but often distrusted. Magic flows through you." },
  { id: "dragonborn", name: "Dragonborn", category: "Mystical", description: "Descended from dragons. Breath as a weapon, scales as armor. Ancient legacy in your blood." },
  { id: "lizardfolk", name: "Lizardfolk", category: "Mystical", description: "Cold-blooded and alien. Survivor's instinct runs deep. Excellent hunters and scouts. Tribal honor matters most." },
  { id: "beastfolk", name: "Beastfolk", category: "Mystical", description: "Touched by animal blood. Part human, part beast. Instinct wars with reason. Fierce and unpredictable." },
  { id: "halfelf", name: "Half-Elf", category: "Mixed Heritage", description: "Between two worlds. Flexible and diplomatic. Neither fully one thing nor another—both and neither." },
  { id: "halforc", name: "Half-Orc", category: "Mixed Heritage", description: "Strength and grace collide. Caught between two heritages. You are more than the prejudice that follows you." },
  { id: "elder", name: "Elder", category: "Mixed Heritage", description: "Born in the First Age from a union of an ancient race and something unknowable. You remember fragments of a world before this one. Immortal blood runs thin, but it runs deep." },
  { id: "ogre", name: "Ogre", category: "Giants & Kin", description: "Brutish and powerful. Often enslaved or cast out. Strength is all you have—make it count." },
  { id: "goliath", name: "Goliath", category: "Giants & Kin", description: "Enormous and athletic. Built for the mountains and the sky. Strength defines your place in the world." },
  { id: "giant", name: "Giant", category: "Giants & Kin", description: "Towering and ancient. The world was made for smaller folk. Your size is both gift and curse." },
];

const racesByCategory = RACES.reduce((acc, race) => {
  if (!acc[race.category]) {
    acc[race.category] = [];
  }
  acc[race.category].push(race);
  return acc;
}, {} as Record<string, typeof RACES>);

const PROFESSIONS = [
  { id: "farmer", name: "Farmer", category: "Rural", description: "Land and soil. Crops, livestock, seasons. You know survival." },
  { id: "herder", name: "Herder", category: "Rural", description: "Goats, sheep, cattle. Wind and weather. Patience and care." },
  { id: "hunter", name: "Hunter", category: "Rural", description: "Bow and tracking. Wild things and wilderness. You survive through skill." },
  { id: "fisher", name: "Fisher", category: "Rural", description: "Net and line. Coast and tidal knowledge. You harvest the sea's bounty." },
  { id: "miner", name: "Miner", category: "Rural", description: "Stone and darkness. Pickaxe and deep earth. You have dug deep." },
  { id: "forager", name: "Forager", category: "Rural", description: "Wild plants and mushrooms. Herbs and roots. The forest feeds those who know where to look." },
  { id: "blacksmith", name: "Blacksmith", category: "Craftsman Metal", description: "Hammer, anvil, fire. Iron and steel know your hands. Creation through force." },
  { id: "armorer", name: "Armorer", category: "Craftsman Metal", description: "Armor and blades. Protection and precision. Your work saves lives." },
  { id: "tinsmith", name: "Tinsmith", category: "Craftsman Metal", description: "Cups, pots, pans. Useful beauty. Common things, well-made." },
  { id: "mason", name: "Mason", category: "Craftsman Stone", description: "Stone and mortar. Walls and cathedrals. You built things that last." },
  { id: "stonemason", name: "Stonemason", category: "Craftsman Stone", description: "Chisel and hammer. Shaping rock. Strength in precision." },
  { id: "potter", name: "Potter", category: "Craftsman Stone", description: "Clay and wheel. Vessels and art. Hands and water and earth." },
  { id: "leatherworker", name: "Leatherworker", category: "Craftsman Garment", description: "Hides and dyes. Armor and saddles. Your craft is both practical and beautiful." },
  { id: "tanner", name: "Tanner", category: "Craftsman Garment", description: "Raw hides into leather. Smells nobody forgets. Essential work, little glory." },
  { id: "weaver", name: "Weaver", category: "Craftsman Garment", description: "Loom and thread. Cloth and tapestry. Patterns from chaos." },
  { id: "dyer", name: "Dyer", category: "Craftsman Garment", description: "Colors from plants and minerals. Bringing life to cloth. Chemistry is your art." },
  { id: "glassblower", name: "Glassblower", category: "Craftsman Glass", description: "Fire and sand. Fragile beauty. Your breath shapes light." },
  { id: "jeweler", name: "Jeweler", category: "Craftsman Glass", description: "Gems and precious metals. Tiny, intricate, priceless. Luxury is your medium." },
  { id: "carpenter", name: "Wudsman", category: "Craftsman Wood", description: "Lumberjack builds roofs and houses. You built the bones of the world." },
  { id: "cooper", name: "Carpenter", category: "Craftsman Wood", description: "Cabinet maker, barrels and casks. Wooden vessels and tools, great demand." },
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

const professionsByCategory = PROFESSIONS.reduce((acc, profession) => {
  if (!acc[profession.category]) {
    acc[profession.category] = [];
  }
  acc[profession.category].push(profession);
  return acc;
}, {} as Record<string, typeof PROFESSIONS>);

const STORY_STATS = [
  { stat: "Fame",                  description: "Known as a hero — trusted, admired, celebrated",    storyUse: "Nobility welcomes you with honor, strangers offer aid", opposed: "Infamous" },
  { stat: "Infamous",              description: "Feared by the powerful — a weapon in the shadows",   storyUse: "Noble houses employ you for dark deeds, finest vintage wines flow freely", opposed: "Fame" },
  { stat: "Faith",                 description: "Devoted to a god or cosmic force, earning divine favour", storyUse: "Temples offer shelter, clergy grant healing, holy orders call on you", opposed: "Heresy / Corruption" },
  { stat: "Heresy\nCorruption",   description: "Denounced by the faithful, touched by forbidden powers", storyUse: "Inquisitors hunt you, holy temples bar entry, but dark shrines grant power to the condemned", opposed: "Faith" },
  { stat: "Notoriety",             description: "Bards sing your legend in every tavern and kingdom", storyUse: "Doors open without asking, nobles and merchants gift you gold", opposed: "Obscurity" },
  { stat: "Obscurity",             description: "Unknown, forgotten, walking unseen through the world", storyUse: "Slip past guards unnoticed, enemies cannot find you", opposed: "Notoriety" },
  { stat: "Love\nAffection",      description: "Bonds of loyalty and deep romance",        storyUse: "Allies risk their lives for you, secret aid flows freely", opposed: "Hatred / Resentment" },
  { stat: "Hatred\nResentment",   description: "Scorned lovers and betrayed allies",       storyUse: "Ambushed by those who once knew you, reputation poisoned", opposed: "Love / Affection" },
  { stat: "Respect\nHonor",       description: "Esteemed by peers for integrity and strength", storyUse: "Duels avoided through reputation, lead honor guard", opposed: "Infamy / Disdain" },
  { stat: "Infamy\nDisdain",      description: "Scorned and disrespected by worthy foes",  storyUse: "Challenged constantly, betrayed by allies",      opposed: "Respect / Honor" },
  { stat: "Persuasion",            description: "Words that sway hearts and minds",           storyUse: "Enemies lay down arms, merchants offer discounts", opposed: "Intimidation" },
  { stat: "Intimidation",          description: "Rule through fear and force of will",      storyUse: "Enemies flee in terror, merchants comply quickly", opposed: "Persuasion" },
  { stat: "Guild Membership",      description: "Belonging to a guild or secret order",      storyUse: "Call for aid, access guild safehouse",          opposed: "Guild Outcast" },
  { stat: "Guild Outcast",         description: "Exiled or ostracized from organized groups", storyUse: "Former allies hunt you, no refuge",             opposed: "Guild Membership" },
  { stat: "Wealth\nProsperity",   description: "Gold, treasures, and assets accumulated",  storyUse: "Buy out rivals, commission grand works",        opposed: "Debt\nObligation" },
  { stat: "Debt\nObligation",     description: "Owe gold or favors to powerful forces",    storyUse: "Creditors demand payment in blood",              opposed: "Wealth\nProsperity" },
  { stat: "Manipulation",          description: "Master of deception and cunning schemes",   storyUse: "Turn enemies against each other, blackmail nobles", opposed: "Sincerity" },
  { stat: "Sincerity",             description: "Known for truth and unwavering honor",      storyUse: "Enemies trust your word, easier treaties",       opposed: "Manipulation" },
];
