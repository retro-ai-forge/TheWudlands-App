import styles from "./page.module.css";

export default function Guide() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>The Adventurer&apos;s Guide</h2>

        <p className={styles.body}>
          The Wudlands is not a place that welcomes the faint of heart. It is a world of dark forests,
          crumbling dungeons, desperate choices, and things older than memory that do not wish to be disturbed.
          You will enter it as a wanderer with little more than your wits and whatever courage you can muster —
          and the world will test both without mercy. What you find, what you survive, and what stories are told
          of your passing are entirely yours to shape.
        </p>

        <p className={styles.body}>
          The Wudlands is made up of adventures — self-contained stories written by contributors from across the world.
          Each adventure is its own corner of the Wudlands: a haunted tower, a cursed merchant road, a court intrigue,
          a dungeon that has swallowed three expeditions before yours. You choose which adventure to enter, read the
          opening scene, and from that moment every decision is yours. Where you go, who you trust, when you run —
          all of it matters. The world does not forget what you choose.
        </p>

        <img
          src="/images/guide/groupline.jpg"
          alt="A line of adventurers marching through a dark and weathered landscape."
          className={styles.sectionImage}
        />

        <p className={styles.body}>
          Some adventures are locked when you first arrive. A story may require that you have already survived another
          before its gates will open to you. This is not an obstacle — it is the shape of the world. Certain ruins
          cannot be understood without knowing what fell in the war that built them. Certain factions will not speak
          to you until you carry a name they recognise. Complete what lies before you, and the deeper roads will open.
          The platform will tell you plainly what stands between you and the next chapter.
        </p>

        <p className={styles.body}>
          Entering an adventure requires a small coin — a fee that grants you the right to explore it again and again,
          up to three times by default. Think of it less as a toll and more as the price
          of a seat at the storyteller&apos;s fire. If you have exhausted your plays and wish to return, you may
          pay the fee once more and your count is restored. The road is always open to those willing to walk it again.
        </p>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>What to Know</th>
              <th>How It Works in the Wudlands</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Choices</td>
              <td>Every decision you make carries weight. A door left unopened, an offer refused, a stranger left to their fate — the story remembers. Do not expect choices to be decorative. Some will save you. Some will cost you dearly. A few you will regret for the rest of the adventure.</td>
            </tr>
            <tr>
              <td>Fame</td>
              <td>Your reputation is a living thing that walks the roads ahead of you. It runs in two directions. Choose the path of the honourable and people will speak your name in daylight — ballads at the inn, a farmer who offers you his barn without being asked, a city gate that opens just a little faster. Choose the other road and you earn something darker: a name that kings lower their voices to say before they send for you, that innkeepers write down after you leave, that mothers use to hush their children. Both kinds of fame open doors. They are simply not the same doors.</td>
            </tr>
            <tr>
              <td>Notoriety</td>
              <td>Fame tells the world what kind of wanderer you are. Notoriety tells it how far that word has travelled. A fresh adventurer may be known and feared in a single valley — cross the next ridge and you are a stranger again. As your deeds accumulate and your name spreads, it moves ahead of you: merchants in distant towns who have never met you will have heard something, gatekeepers will pause before they speak, lords will have already decided whether to receive you before you reach the hall. The higher your notoriety, the fewer introductions you need — and the fewer surprises you can afford.</td>
            </tr>
            <tr>
              <td>Adventure Dependencies</td>
              <td>Some roads in the Wudlands are closed until you have walked the ones before them. A sealed vault may require you to have recovered the key in a previous adventure. A faction leader may refuse to speak until you carry the proof of an earlier deed. These dependencies are shown clearly before you attempt an adventure — you will never find yourself locked out without warning. Each prerequisite adventure stands on its own and is worth completing for its own sake. The chain of stories is meant to feel like a natural journey through the world, not a series of gates.</td>
            </tr>
            <tr>
              <td>Survival</td>
              <td>Hunger, thirst, exhaustion, disease, and cold are not abstractions in the Wudlands. Some adventures will track them. Push too hard without rest and your hands will shake at the wrong moment. Ignore a wound and it will slow you down before it kills you. These things exist not to punish you but to make every decision — do I press on or make camp, do I spend the last of my rations now or save them — carry real stakes.</td>
            </tr>
            <tr>
              <td>Combat</td>
              <td>Not every fight is one you are meant to win. Knowing when to run is as valuable a skill as knowing when to stand. In most encounters you will have the option to flee — though retreat rarely comes without a price. Your pride, your purse, or a piece of your equipment may not follow you out the door. There are moments, however, when the story has already cornered you — when the ambush was sprung before you realised it was coming. In those scenes, there is no stepping back. Read the road carefully. Sounds heard through a door, a companion&apos;s warning, a wrongness in the air — these are not decoration. They are the story telling you to be ready.</td>
            </tr>
            <tr>
              <td>Shelter &amp; Refuge</td>
              <td>The Wudlands offers no permanent home — not yet. You cannot plant a flag and call a ruin yours. What you can find are places to endure: a cave to wait out the storm, a barricaded inn to hold through the night, a collapsed watchtower that keeps the wind off long enough to dress your wounds. These shelters exist within the story and belong to it, not to you. That said, some adventures hide something rarer — a place that might, if you earn it, become a retreat. A room above a tavern whose owner owes you a debt. A forgotten hermitage deep in the forest that no one else has found. These must be discovered through the stories themselves. The Wudlands does not hand out homes. It lets you find them.</td>
            </tr>
            <tr>
              <td>Escape Route</td>
              <td>Every adventure in the Wudlands has a way out. No matter how deep in the dark you find yourself — overwhelmed, lost, out of resources — there is always a path that leads somewhere you can call an end. It may not be the ending you wanted. It may cost you something to reach it. But it is there. You will never be stranded without a road home.</td>
            </tr>
            <tr>
              <td>Plays &amp; Entry Fee</td>
              <td>Each adventure requires a small fee to enter. That fee grants you the right to experience it up to three times — enough to find different paths, try different choices, and see what the story holds from another angle. If your count runs out and you wish to return, pay the fee again and your plays are restored. The Wudlands does not close its doors to those who want to walk the same road twice.</td>
            </tr>
          </tbody>
        </table>

        {/* ── Character & Party ───────────────────────────────── */}
        <h2 className={styles.sectionHeading}>Character &amp; Party</h2>

        <p className={styles.body}>
          Before you set foot in the Wudlands you must decide who you are. Your race shapes how the world
          reads you — the weight of your footfall, the colour of the fear or respect in a stranger&apos;s eyes,
          the doors that open and the ones that do not. Several races are available at the start, each carrying
          their own history, their own burdens, and their own quiet advantages. Choose carefully. You will wear
          this choice for the rest of your time in the world.
        </p>

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

        <table className={styles.table}>
          <thead>
            <tr>
              <th>What to Know</th>
              <th>How It Works in the Wudlands</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Race</td>
              <td>Several races are available at character creation. Each carries its own strengths, history, and the way the world reacts to your face. Your choice is permanent — the Wudlands does not let you be someone else.</td>
            </tr>
            <tr>
              <td>Class</td>
              <td>You begin classless. Classes become available in the alpha release, chosen only after you have gathered enough experience and skill to earn one. Some may require you to find a teacher willing to take you on — they will not all be easy to find, and not all of them will find you worthy on the first meeting.</td>
            </tr>
            <tr>
              <td>Party Size</td>
              <td>Up to four adventurers may travel together. A party is only as strong as the decisions it makes as a group — and the first decision is the marching order.</td>
            </tr>
            <tr>
              <td>Marching Order</td>
              <td>The formation your party travels in determines who faces what first. The front takes the brunt of head-on threats. The rear is exposed to anything that follows. The middle is not safe either — attacks from hidden positions, aerial threats, or ambushes from the flanks strike wherever the story demands. Set your order with care and revisit it when the terrain changes.</td>
            </tr>
            <tr>
              <td>Age &amp; Time</td>
              <td>Your character starts at an age you choose. Every adventure adds one month to their life by default. Old age accumulates and eventually makes itself known. Life potions exist that can restore some measure of youth — but they must be found, and nothing in the Wudlands comes without a cost.</td>
            </tr>
            <tr>
              <td>Carrying &amp; Equipment</td>
              <td>What you can carry has limits, though they are not rigid walls. Riding dogs and backpacks extend what you can bring into the field. Exceed your soft limit and the weight will tell — slower movement, quicker exhaustion, choices made harder by the burden on your back. Carry what you need. Leave behind what you can afford to lose.</td>
            </tr>
          </tbody>
        </table>

      </section>
    </div>
  );
}
