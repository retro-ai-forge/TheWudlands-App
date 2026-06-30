import Link from "next/link";
import styles from "./page.module.css";
import WalletGuide from "./WalletGuide";
import GuideTable from "./GuideTable";

const WORLD_ROWS = [
  { key: "Choices", value: "Every decision you make carries weight. A door left unopened, an offer refused, a stranger left to their fate — the story remembers. Do not expect choices to be decorative. Some will save you. Some will cost you dearly. A few you will regret for the rest of the adventure." },
  { key: "Adventure Dependencies", value: "Some roads in the Wudlands are closed until you have walked the ones before them. A sealed vault may require you to have recovered the key in a previous adventure. A faction leader may refuse to speak until you carry the proof of an earlier deed. These dependencies are shown clearly before you attempt an adventure — you will never find yourself locked out without warning. Each prerequisite adventure stands on its own and is worth completing for its own sake. The chain of stories is meant to feel like a natural journey through the world, not a series of gates." },
  { key: "Survival", value: "Hunger, thirst, exhaustion, disease, and cold are not abstractions in the Wudlands. Some adventures will track them. Push too hard without rest and your hands will shake at the wrong moment. Ignore a wound and it will slow you down before it kills you. These things exist not to punish you but to make every decision — do I press on or make camp, do I spend the last of my rations now or save them — carry real stakes." },
  { key: "Combat", value: "Not every fight is one you are meant to win. Knowing when to run is as valuable a skill as knowing when to stand. In most encounters you will have the option to flee — though retreat rarely comes without a price. Your pride, your purse, or a piece of your equipment may not follow you out the door. There are moments, however, when the story has already cornered you — when the ambush was sprung before you realised it was coming. In those scenes, there is no stepping back. Read the road carefully. Sounds heard through a door, a companion's warning, a wrongness in the air — these are not decoration. They are the story telling you to be ready." },
  { key: "Shelter & Refuge", value: "The Wudlands offers no permanent home — not yet. You cannot plant a flag and call a ruin yours. What you can find are places to endure: a cave to wait out the storm, a barricaded inn to hold through the night, a collapsed watchtower that keeps the wind off long enough to dress your wounds. These shelters exist within the story and belong to it, not to you. That said, some adventures hide something rarer — a place that might, if you earn it, become a retreat. A room above a tavern whose owner owes you a debt. A forgotten hermitage deep in the forest that no one else has found. These must be discovered through the stories themselves. The Wudlands does not hand out homes. It lets you find them." },
  { key: "Escape Route", value: (<>Every adventure in the Wudlands has a way out. No matter how deep in the dark you find yourself — overwhelmed, lost, out of resources — there is always a path that leads somewhere you can call an end. It may not be the ending you wanted. It may cost you something to reach it. But it is there. You will never be stranded without a road home. Using an <span className={styles.code}>escape_route</span> on your own term, does count as a playthrough and does consume one of the three replays.</>) },
  { key: "Plays & Entry Fee", value: "Each adventure requires a small on-chain fee to enter (approximately $0.80 for three attempts). That fee grants you the right to experience it up to three times — enough to find different paths, try different choices, and see what the story holds from another angle. If your count runs out and you wish to return, pay the fee again and your plays are restored. The Wudlands does not close its doors to those who want to walk the same road twice." },
];

const CHARACTER_ROWS = [
  { key: "Race", value: "Several races are available at character creation. Each carries its own strengths, history, and the way the world reacts to your face. Your choice is permanent — the Wudlands does not let you be someone else." },
  { key: "Class", value: "You begin classless. Classes become available in the alpha release, chosen only after you have gathered enough experience and skill to earn one. Some may require you to find a teacher willing to take you on — they will not all be easy to find, and not all of them will find you worthy on the first meeting." },
  { key: "Party Size", value: "Up to four adventurers may travel together. A party is only as strong as the decisions it makes as a group — and the first decision is the marching order." },
  { key: "Marching Order", value: "The formation your party travels in determines who faces what first. The front takes the brunt of head-on threats. The rear is exposed to anything that sneaks up from behind. The middle is not safe either — attacks from hidden positions, aerial threats, or ambushes from the flanks strike wherever the story demands. Set your order with care and revisit it when the terrain changes." },
  { key: "Age & Time", value: "Your character starts at an age you choose. Every adventure adds one month to their life by default. Old age accumulates and eventually makes itself known. Life potions exist that can restore some measure of youth — but they must be found, and nothing in the Wudlands comes without a cost." },
  { key: "Carrying Equipment", value: "What you can carry has limits, though they are not rigid walls. Riding dogs and backpacks extend what you can bring into the field. Exceed your soft limit and the weight will tell — slower movement, quicker exhaustion, choices made harder by the burden on your back. Carry what you need. Leave behind what you can afford to lose." },
];

export default function Guide() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>The Adventurer&apos;s Guide</h2>

        <p className={styles.body}>
          This guide explains how the Wudlands works — the systems, mechanics, and rules that shape your experience.
          For information about the world itself, how to get started, and the story behind the Wudlands, visit the <Link href="/about" className={styles.externalLink}>The World</Link> section.
        </p>

        <p className={styles.body}>
          To log in and store your adventure progress forever on the decentralized ledger, you will need to connect a wallet. This ensures your character, deeds, and choices are permanently recorded on the blockchain.
        </p>

        <WalletGuide />

        <h2 className={styles.sectionHeading}>Love, Admiration &amp; the Art of Minne</h2>

        <p className={styles.body}>
          Gold buys a bed for the night. Scars prove you survived. But neither will get you through a locked gate
          when the woman who holds the key has decided she is not interested. There are things in this world that
          cannot be taken by force or purchased at a market stall — the regard of someone who has no reason to
          give it, the warmth of a fire you were not supposed to sit beside, a name spoken well in a room you
          will never enter. If you have ever wanted more than survival — if you have wondered what it would feel
          like to be admired, sought after, remembered — then you already understand what drives half the
          wanderers on these roads.
        </p>

        <p className={styles.body}>
          They call it <strong>Minne</strong>. The old poets gave it that name — the Minnesingers who sang of
          knights who crossed mountains and fought monsters not for treasure but for a single moment of favour
          from a woman who probably would not even be watching. You know the feeling, even if you have never
          heard the word. You have done something difficult and thought of a specific face while doing it.
          That is Minne. It does not care whether she is a noble lady behind a castle wall, a matriarch who
          runs a merchant city with a calm that frightens her rivals, a wizard who has lived three hundred years
          and finds most people tedious, or an elven enchantress who has not given anyone a second glance in
          longer than your grandfather has been in the ground. They are all unreachable in their own way.
          That is the point. The reaching is the thing.
        </p>

        <img
          src="/images/guide/fame.jpg"
          alt="Famous and infamous names written on a wall, some in gold and some in blood."
          className={styles.sectionImage}
        />

        <p className={styles.body}>
          Do not expect doors to open simply because you knocked. Women of wealth and power have seen wanderers
          before. They have watched a great many of them try, and they remember every one who wasted their time.
          What opens a door is a name that arrived before you did — a deed someone thought worth repeating,
          a problem solved quietly, a moment where you stood between something dangerous and someone who mattered.
          Your fame tells them what kind of person is standing on their step. Your notoriety tells them
          whether to call for wine or call for the guard. The infamous are sought after in their own right —
          not merely tolerated but actively pursued by those who understand that a dangerous name, properly
          courted, is worth more than a loyal one. A matriarch does not send for someone fearsome because
          she has no choice. She sends for them because she wants to be the one they owe a favour to.
          Merchants go out of their way to be seen as generous before you have asked for anything. Lords make
          offers unprompted. There is a particular kind of attention that only infamy earns — people working
          to get ahead of you, to be remembered well by you, to place themselves on the right side before
          the wrong side becomes obvious. It is not so different from being admired. It simply arrives with
          better wine and more nervous smiles.
        </p>

        <p className={styles.body}>
          What follows once you are inside is yours to navigate. Flirtation, jealousy, courtly games, seduction,
          the particular silence of someone who is making you wait to see what you will do with the waiting —
          all of it is part of this world, and none of it is simple. A gesture of devotion earned through
          two nights of real danger in someone&apos;s name will land differently than one offered at the
          first drink. These connections leave marks. A lady&apos;s favour can open a city gate, call in a
          debt that has been owed for years, or hand your enemies exactly the leverage they needed.
          The world pays attention to who you are devoted to. It forms opinions.
          What you pursue and how far you take it is entirely your choice —
          but the choice, once made, belongs to the story.
        </p>

        <GuideTable rows={WORLD_ROWS} accordion />

        {/* ── Character & Party ───────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Character &amp; Party</h2>

        <p className={styles.body}>
          Before you set foot in the Wudlands you must decide who you are. Your race shapes how the world
          reads you — the weight of your footfall, the colour of the fear or respect in a stranger&apos;s eyes,
          the doors that open and the ones that do not. Several races are available at the start, each carrying
          their own history, their own burdens, and their own quiet advantages. Choose carefully. You will wear
          this choice for the rest of your time in the world.
        </p>

        <img
          src="/images/guide/affection.jpg"
          alt="Famous and infamous names written on a wall, some in gold and some in blood."
          className={styles.sectionImage}
        />

        <p className={styles.body}>
          You begin without a class. The Wudlands does not hand you a title on the first day — you must earn
          the right to one. Spend time in the world, gather experience, build skills through what you survive,
          and in time the shape of who you are becoming will grow clear. Classes will be available to choose from
          as the platform matures into its alpha release. When the moment comes, you may find that the choice
          is not simply made at a menu — some paths require a teacher. A swordmaster who will only take you on
          once you can prove you are worth her time. A grey-robed scholar who asks three questions before he
          opens his door. Finding the right person to name you what you already are is itself part of the journey.
        </p>

        <p className={styles.body}>
          You need not walk the Wudlands alone. Adventuring parties of up to four can travel together, but a
          group is not simply a collection of people — it is a formation. Before you move out, a marching order
          must be set. Who walks at the front? Who guards the rear? This is not a formality. Enemies most often
          come from ahead, but the road is full of things that do not fight fair. Something may drop from above
          onto the middle of your column. A figure may step out of a hidden place and drive a blade into whoever
          stands between your vanguard and your rearguard. And the last person in the line — the one watching
          the road behind — is the one who gets taken first when something follows quietly enough. Think about
          who you put where. It may save their life. It may cost them one.
        </p>

        <p className={styles.body}>
          Every character begins at an age you choose. The Wudlands tracks time. Each adventure, by default,
          adds one month to your character&apos;s life — and those months do not come back. Old age is not a
          distant abstraction; it is a horizon that moves toward you with every story you enter. As the years
          accumulate, their weight will be felt. There are those who have found ways to hold it off — life
          potions rumoured to restore something of what time has taken, to push the horizon back a little further.
          Whether you find one, afford one, or trust whoever is selling it is another matter entirely.
        </p>

        <GuideTable rows={CHARACTER_ROWS} accordion />

        {/* ── Character & Origins (folded; full page at /characters) ───────── */}
        <h2 className={styles.sectionHeading}>Character &amp; Origins</h2>

        <p className={styles.body}>
          Who you are before the road — your gender, race, former profession, the
          marks your deeds leave, and the classes you can grow into. Expand the
          section below, or open the full{" "}
          <Link href="/characters" className={styles.externalLink}>character creation</Link>{" "}
          page.
        </p>

      </section>
    </div>
  );
}
