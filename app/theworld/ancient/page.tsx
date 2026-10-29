import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";
import styles from "./page.module.css";

const SECTIONS = [
  {
    title: "1. The First Rising of the World",
    text: "Before road or crown, before river or name, it was Za-Ruth the Chain-Lord, a titan of iron will, who hauled the world from the abyss. His chains dragged up continents and ripped wounds in the heavens, and from those sky-holes spilled both poison and blessing from the dark beyond. Beneath the world-chains, the Slumbering Thing waited in half-dream—vast, ancient, and neither truly male nor female—its true name lost before memory began. When the land at last took shape, the Elder came to gather star-metal that had fallen from the torn firmament, and with those pure fragments Binder-Queen Ith bound spells, oaths, and destinies into law. Even now, those who uncover star-metal often suffer strange dreams and waking visions, as though the old wound still remembers the hand that opened it.",
  },
  {
    title: "2. The Drowned Thrones Below",
    text: "Far beneath silt and shipwreck lay the empire of Queen Thaula the Deep-Minded, a kraken sovereign whose many arms could cradle, build, or crush. She forged her thrones from the bones of sunken ships and bound oath-memory into golden rings. Her rule was love and terror joined together, and the sea itself seemed to answer her song. Those who opposed her drowned in hymn or were held as coral-decorated ghosts within her courts below. Even now, coins found on the shore and rings cut from fishing nets are treated with suspicion, for the sea is believed to remember every old bargain. Coastal villages still make secret prayers to Thaula, even when they deny it in daylight.",
  },
  {
    title: "3. The Occupied Woods",
    text: "In the deep green dark, where the branches made a roof of shadow, ruled Nylneth the Hunger-Mother, first matron of the wild things. Her beauty was made of longing; her children were hunger given shape. She spun not from silk but from absence, filling the woods with false paths, whispered regrets, and hollow places where the lost might vanish. Against her came Ilveros the Silver Lord, swift, cold, and merciless in his justice. Some said he was a spurned suitor; others that he was a champion sent to preserve mortal will. His silver cut through web and glamour alike. To this day, mothers sew small silver charms into their children’s collars before dusk, and woodsfolk still speak of wanderers who return from the forest changed—carrying other people’s voices, shadows or hunger for roads they never took.",
  },
  {
    title: "4. The Broken Sky",
    text: "It was Vaelre the Sky-Breaker, neither man nor woman but a child of cloud and calamity, who struck against the tyranny of order. Seeking what Za-Ruth had hidden, Vaelre shattered a divine sky-chain and reopened wounds in the heavens. Black storms spilled through it, twisted by red lightning, and the world beneath was forever altered. The sun grew uncertain. Seasons became less obedient, tempers ran wild. In some places, storms settle for years without moving, and a second baleful light sometimes follows the moon, casting a pale, unwholesome glow that twists wandering children and unspools the flight of birds. Fearing this, parents keep their children hidden indoors on such nights, whispering old warnings and bolting every door. Yet as time passes, those sheltered sons and daughters come to resent their vigil—adults now, carrying a buried anger for the chance they feel was stolen from them, and for a path into night that was closed before they could ever choose to walk it.",
  },
  {
    title: "5. The Age of Measured Rule",
    text: "Lady Scyrian of the Crooked Smile ruled with calm precision, her law spreading like grain through the western villages. Her gift was order; her curse was dependence. By her side stood the Circle-Eyed Cartographer, who mapped every field, every bloodline, and every village path until no life could easily slip free of record. Under their rule, land, rank, and inheritance became fixed as stone. Every deed and boundary became a chain of paper and ink. To this day, Lady Scyrian’s legacy poisons the roots of the Wudlands. In shadowed chambers, kings, lords, and lesser tyrants strike secret bargains—contracts that can erase a village, curse a bloodline, or doom a child’s fate with the flick of a pen. Edicts, older than memory, still shackle the living in invisible chains. The people know: what passes for order is only the surface, while beneath, suffering and silence are bartered like coin—a darkness cast by Scyrian’s hand, too deep for any dawn to cleanse.",
  },
  {
    title: "6. The Vaults Under Salt and Bone",
    text: "Beneath the salt-dark in coral catacombs, the pearl-boned monks kept vigil over the Memory Vaults. Their master was Archscribe Marivach the Salt-Seer, a figure of kelp, runes, and barnacle-crowned bone. He learned to anchor memories in star-metal, but each recollection pinned into the vault cost him a piece of himself, until he became a haunted thing—part witness, part grief. When fire and chaos swept the world above, the vaults cracked. Their letters rose on the tide, inked in storm-scented script, and fragments still wash ashore on wild nights. Some say reading them invites Marivach’s madness. Others seek those letters for healing, for truth, or for the power to remember what the world wishes to erase. Deep within the surviving shrines, needles of star-metal still wait to pin memory to flesh and spare the mind from unraveling.",
  },
  {
    title: "7. When Reflection Bore a Crown",
    text: "In the pale palace beyond time and sunlight, Seredain the Unseen, Lord of Faces, watched through reflection and sorrow. Born not of flesh but of seeing and being seen, he loved order, scrutiny, and the quiet violence of being known. His mirrors were weapons meant to reveal the soul’s weak seams; in his presence, glass held memory, water learned to stare back, and faces near a mirror sometimes wore expressions no living mouth had chosen. In the gilded cities of the Second Age, Yssra and Iskiel, the Twins-Crowned, ruled side by side and built a court of observation so complete that no private thought felt safe. Using the power first wrought by Seredain the Unseen, they bound each citizen with a Mirror Shard at the heart, meant to prove sincerity and devotion, but the shards began to remember, to judge, and to fracture dreams. Being seen became a form of ownership, and people learned to fear their own reflections. Folk still veil infants from their first mirror and cover standing water at dawn, fearing a shard of the Watcher may catch them. In some borderlands, mirror curses are said to run in blood, and those lines are greeted with caution, pity, or dread.",
  },
  {
    title: "8. The Web of Permission",
    text: "Then came the reign of the Eight Unseen Lords, powers who ruled not by sword but by silence and denial. At their center sat Duxessa Sivarine the Gilt-Masked, radiant and untouchable, her beauty sealed behind hammered gold. She could bend courts with a sentence and turn a lawgiver’s will to ash with a whisper. The other Lords were stranger still—masked, scentless, and cruelly precise in their movements. Under their dominion, the southern grasslands did not simply wither; they were remade into a blighted country of pale salt flats, glass-bright crusts, and thorned channels where nothing grew straight. Old paths vanished beneath invisible borders, and watchtowers rose where wells had once stood. Villages learned to live like trespassers in their own fields, speaking softly, lowering their eyes, and asking leave for everything: water, wood, marriage, burial, even song. A key, a birth, a funeral, a raised voice—each could be denied. Even now, folk in the wastes move as if the land itself is listening, knowing every step may be counted and every hope taxed before it is allowed to breathe.",
  },
  {
    title: "9. The Engine of Fate",
    text: "From the scorched hinterlands of the Iron West rose Magister Miscaron Forgehand, a being sculpted from storm and inferno, his hands glowing with the memory of furnace-coal, his words carrying the bitterness of ash. It is said that on the night of his forging, a wolf’s shadow circled the flames, a harbinger that the world itself would never be the same. In a fever of ambition, Miscaron shaped the greatest relic of his age—the Wudlands Engine. Buried deep beneath stone and legend, this enormous, intricate machine was built to steer the course of nature itself. Rivers, forests, and mountains could be bent or erased by its will, destinies rewritten, the very fabric of life altered at the whim of those who dared manipulate its secrets. But the Engine’s heart was always wild: a vessel pulsing with mysterious cobalt-blue liquid, said to be the distillation of all possible fates. In brief seasons, when the fluid seeped upward, the world would gleam with uncanny fertility—plants blazing bright, luck running thick. Yet when the blue liquid soured and turned black, catastrophe followed: animals twisted, crops withered, and old wisdom failed, as if the Engine’s mind had taken ill and flung chaos instead of order. So the Engine was forsaken, left to rust in the deep, while the world above learned to fear the sound of its waking pulse. Many ages after Miscaron’s time, the Engine was unearthed by those desperate for its promise. For a short and troubled era, kings, seers, and adventurers came to borrow its power, believing themselves in command. Each left altered, haunted, or lost; each tale ending in calamity, until the Engine was abandoned once more—left to rust and brood, half-broken, deep in the dark. Some claim it still steers deeds and destinies beneath the world, its intent fractured, its will unpredictable—a relic of doom as much as genius, feared for its power and mourned for its curse.",
  },
  {
    title: "10. The Bargemother of the Inland Seas",
    text: "Across the inland waters, Baroness Elithra of the Golden Wake ruled with lacquered claws, sweet perfume, and lantern-bright eyes. Her gifts were luxuries, music, coin, and celebration—but never without cost. Villages bloomed when her barges arrived, then dimmed and hollowed when she sailed away. Elithra’s lovers became mayors, her rivals beggars. She softened old customs until they could be bought, traded, or forgotten. River-people still throw gold into eddies for her favor, and children sing her name in lullabies thick with longing. The abandoned docks she left behind remain silent and rotting, said to be places where only the touched can ever smile again.",
  },
  {
    title: "11. The Sky of Useful Lies",
    text: "High on the trading hills, Archon Bellavaine the Pricebearer declared that all things—light, hope, water, even dreams—could be priced, taxed, or mortgaged. He called forth a Second Sun over the highlands, dazzling and precise, and sold its rays by strict measure. Under his rule, every life became a ledger of debt and obligation. Even blessings required accounting. Even conversation had a cost. When Bellavaine’s house finally fell, bitterness sank into the soil itself. Crops bended, the winds sharpened, and the hills became haunted by the murmur of old bargains. The ruined market stones still stand, overgrown and avoided, for it is said that deals made there never truly end.",
  },
  {
    title: "12. The First Refusal",
    text: "Into bondage came the First Free Ones: Red-Haired Syla, saint of broken chains; Orielle, thief-queen of the singing fires; and Mara Glasshands, widow-architect of rebuilt hope. They gathered outlaws, orphans, and strange children born with forbidden gifts, and they set the Mirror Courts burning. From their revolt grew the hidden communities that still survive beyond census and tax. Their doctrine was simple: a soul should keep its own keys. That teaching spread like fire in dry grass and still survives wherever a village quietly refuses a tallyman, burns a census roll, or teaches its children to hide their true names.",
  },
  {
    title: "13. The Living Current",
    text: "Yet resistance was never only flesh. The old stories name the Living Current as a shapeless, flickering presence—sometimes a wild dog, sometimes a silver fish, sometimes a black wind crossing a broken road. It is the spark between cracks in control, the whisper that tells the beaten to rise and the lost to try again. Where walls grow too certain, the Current slips through sleep, song, and rumor. When a lantern gutters alive before dawn or a cold wind turns a locked path into an opening, old women murmur thanks. They say the Current’s blessing means there is still a way out, if one is brave enough to take it.",
  },
  {
    title: "14. The Weaver’s Lattice",
    text: "Above the broken kingdoms, Uldran the Weaver, half-god artisan crowned in nimbus, laid down the Lattice of Bridges. Beside him stood Aelora the Iron-Browed, his immortal muse, whose beauty awakened feuds, songs, and feasts in equal measure. Together they joined distant realms into the Faceted-Circle, making passage possible where once there had only been barriers. Under those bridges, villages grew overnight. Healing wells, orchards, and market roads appeared as if summoned by hope itself. But the Lattice did not last. When envy and shadow brought it down, Aelora’s laughter faded, her gardens turned wild and sorrowful, and the bridges became relics of a better order. In hidden groves, mourners still leave flowers for her, praying for the return of passage, mercy, or both.",
  },
  {
    title: "15. The Crown of Many Hands",
    text: "The Bridge Crown was never a throne, but a burden borne by Solenne of Many Voices, a woman of flickering presence whose beauty could shift between charm and terror. She wove covenants so no single tyrant could seize every road. Each promise checked another; each village’s safety depended on its neighbors. When Solenne was betrayed by those who wanted power alone, the eastern meadows cracked open, leaving behind a treacherous floor of gray, storm-raked earth. Caravans vanished. Roads turned uncertain. Even now, peddlers and pilgrims passing through those lands touch iron to brow and whisper prayers, hoping not to stir the jealous echoes left behind in the grass.",
  },
  {
    title: "16. The Great Withdrawal of Power",
    text: "As uprisings spread and the old roads cracked, the ancient powers began to retreat. Yet retreat was not defeat. Kyathe the Pale, once Lady of Silks and Mirrors, vanished into rumor and private bargains. Her absence brought river-famine, superstition, and masked commerce in the ruined towns. Meanwhile, Magister Obron and the Eight Unseen Lords slipped into shadow, leaving behind laws no one fully understands and rituals no one dares to question. Even now, many believe the old powers return in ordinary forms: a veiled stranger in a market, a midwife whose silence stills a room, a voice carrying bargains on winter wind. Fate, people say, is not written only by kings or gods, but by whatever ancient soul still moves unnoticed among the living.",
  },
  {
    title: "17. The War of Memory and Passage",
    text: "In the last open years of that broken order, Sir Edric Harrowhaven, the final knight of the road, rose to defend the memory and sovereignty of his people. His greatest foe was Queen Miralya the Borrower, mistress of beautiful lies and keeper of every mirror that survived the empire’s ruin. Their war was fought in battlefields and hearths alike. Edric stirred villagers toward secret defiance, while Miralya replaced rebellion with forgetting, turning whole regions into obedient blanks. When the war ended, places touched by her hand were left nameless and strangely calm. Even now, villages with no old stories are feared more than haunted ones, and people say Edric’s fire still flickers wherever memory refuses to die.",
  },
  {
    title: "18. The Buried Truth Under the Underweave",
    text: "Beneath the deepest earth dwells the Mourning Matron, a faceless guardian who tends the wound of the world. Mortal and goddess, she walks the hidden roads between injury and repair. Her children—creatures part woman, part wolf, part whisper—travel at night to mark, mend, and mourn. Where her tears fall, starflower meadows bloom even in wasteland. Farmers, outlaws, and dreamers still call on her stewards when law fails and oath cannot hold. Her truths are not spoken aloud but stitched into secret tattoos, bone-memory, and the hidden customs of those who survive between thrones and monsters.",
  },
];

export default function AncientBackground() {
  return (
    <div className={styles.page}>
      <section className={styles.content}>
        <h2 className={styles.heading}>The Ancient Background of Wudlands</h2>

        {SECTIONS.map((section, i) => (
          <div key={section.title}>
            {i > 0 && <div className={styles.divider}>~ ~ ~</div>}
            <h3 className={styles.sectionTitle}>{section.title}</h3>
            <p className={styles.body}>{section.text}</p>
          </div>
        ))}

        <Link href="/theworld" className={styles.backLink}>
          &larr; Back to The World
        </Link>
      </section>
      <PageVersionTag />
    </div>
  );
}
