import styles from "./page.module.css";

export default function AGB() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>Terms &amp; Conditions</h2>

        <p className={styles.body}>
          The Wudlands is an old-school round-based Fighting Fantasy-style adventure game inspired by UltraQuest, 
          Lone Wolf Saga, EverQuest, Dungeon Crawl Classic, books from Steve Jackson, Ian Livingstone, and the 
          GAVUN WUD meme, built as a browser-based fantasy RPG with scene-driven 
          gameplay, pixel-art, ascii-art, narrative-driven adventures, and onchain 
          character progression. The game will be built using a modular, plugin-based 
          architecture that allows for easy extension and modification. 
        </p>


        <p className={styles.body}>
          By submitting an adventure addon to The Wudlands, you agree to the terms set out on this page in full.
          Please read carefully before contributing any content. These terms exist to keep The Wudlands running,
          growing, and free to evolve as the project develops. If you do not agree, please do not submit content.
        </p>

        <h3 className={styles.subheading}>1. Rights to Submitted Content</h3>

        <p className={styles.body}>
          When you submit an adventure, story, scene, encounter, character, or any other content to The Wudlands,
          you grant The Wudlands an irrevocable, worldwide, royalty-free license to use, reproduce, modify, adapt,
          translate, publish, distribute, and display that content in any form, through any medium, at any time,
          without restriction and without further notice to you. This includes but is not limited to use within
          the game itself, promotional material, derived works, and future versions of the platform. Contributors 
          retain ownership of their original content and can also redistribute it or commercialize it but acknowledge 
          that The Wudlands has the right to use it in any way. 
        </p>

        <p className={styles.body}>
          The Wudlands reserves the right to alter, edit, rewrite, restructure, or remove any submitted content
          at its sole discretion. Submitted adventures may be changed in narrative, tone, mechanics, or structure
          to fit the needs of the platform. You will not be consulted before such changes are made.
          By submitting, you accept that your contribution becomes part of The Wudlands in whatever form
          the project team sees fit.
        </p>

        <h3 className={styles.subheading}>2. Romantic Storyline &amp; Minne</h3>

        <p className={styles.body}>
          The Wudlands uses courtly-love tropes (historically called &quot;Minne&quot;) as a deliberate, genre-specific
          narrative device: structured NPC-affection mechanics, quest triggers tied to social status, and
          consequence-bearing reward paths. These conventions are retained for aesthetic fidelity to legacy
          fantasy gamebooks, but are implemented as optional mechanics and not prescriptive social guidance.
          Creators must label significant romantic content in addon metadata; explicit romance must comply with
          platform content policies (see Section 5).
        </p>

        <h3 className={styles.subheading}>3. Revenue Share</h3>

        <p className={styles.body}>
          The Wudlands may, at its discretion, offer contributors a share of revenue generated when adventurers
          explore their stories. Where such a share is offered, adventure revenue is split 80% to the contributor
          and 20% to The Wudlands. This share is entirely voluntary and represents a goodwill gesture from The
          Wudlands toward its creator community. It does not constitute payment for services rendered, does not
          create an employment or contractor relationship, and carries no legally enforceable entitlement. 
          The revenue is an essencial part of the platform to pay server costs and transaction fees. It is not 
          guaranteed, may be changed or removed at any time. The contributor may suggest a price tag for their 
          adventure, but The Wudlands reserves the right to set or change the price as it sees fit. Each adventure 
          has a maximum try of 3 explorations. The counter can be reset by paying the full price again.
        </p>

        <p className={styles.body}>
          The amount, timing, method, and continuation of any revenue share is decided solely by The Wudlands
          and may be changed, suspended, or discontinued at any time without prior notice. Contributors may not
          claim any legal right to compensation, revenue sharing, or financial benefit of any kind based on their
          submission or the use of their content.
        </p>

        <h3 className={styles.subheading}>4. Blockchain &amp; Polkadot & ETH Address Storage</h3>

        <p className={styles.body}>
          The Wudlands currently operates on a blockchain environment. However, the platform may at any point in the future
          migrate to a different blockchain network if technical, economic, or strategic reasons make this necessary or desirable.
          By contributing content and providing a secondary fallback ETH wallet address, you acknowledge and accept that such a migration may occur
          and that your address and any associated data may be transferred or adapted as part of that process.
        </p>

        <p className={styles.body}>
          If you choose to provide a Polkadot and optional Ethereum (ETH) wallet address as part of your contributor profile or submission,
          that address will be stored securely by The Wudlands for the purpose of potential revenue distribution
          and identity association within the platform. You are not required to provide a wallet address.
          Providing one does not guarantee any payment will be made to it. The Wudlands will not sell or share
          your ETH address with third parties outside of what is technically required to operate the platform. 
          It may be visible in smart contracts.
        </p>

        <h3 className={styles.subheading}>5. Content Standards, Age Restrictions &amp; Player Warnings</h3>

        <p className={styles.body}>
          The Wudlands is a dark fantasy adventure platform. By its nature it contains mature themes including
          violence, death, horror, moral ambiguity, and psychological distress. The platform is intended for users
          aged <span className={styles.highlight}>16 and above</span> as a baseline. Certain content sections or addons
          marked as adult may only be appropriate for users aged <span className={styles.highlight}>18 and above</span>.
          By using The Wudlands you confirm that you meet the age requirement for the content you are accessing.
          It is the responsibility of parents and guardians to ensure that minors do not access content beyond their age rating.
        </p>

        <p className={styles.body}>
          The Wudlands carries content warnings for the following: graphic depictions of violence and injury,
          themes of death, torture, captivity, and sacrifice, psychological horror and existential dread,
          morally complex scenarios with no clean resolution, disturbing imagery described in text,
          and — in adult-flagged content sections — erotic or sexually explicit material between adult characters.
          These elements are part of the dark fantasy genre and are present by design. If you are sensitive
          to any of these themes, please exercise caution or avoid content marked accordingly.
          <span className={styles.highlight}> The game experience is not designed to be comfortable.</span>
        </p>

        <p className={styles.body}>
          The following content is <span className={styles.highlight}>absolutely prohibited</span> in all submitted addons
          regardless of age flag or context, with zero tolerance and immediate removal:
          any sexual content involving characters who are minors or described as minors;
          sexual violence presented approvingly or without clear narrative consequence;
          graphic violence against innocent characters presented purely for shock value, without any narrative purpose or consequence;
          content that glorifies, celebrates, or incites real-world hatred based on race, ethnicity, gender, sexuality,
          religion, disability, or national origin; content that reproduces or promotes real-world atrocities, genocide,
          or war crimes in a positive light; and any content designed to harass, threaten, or target real individuals.
          Violations will result in immediate removal of the addon and permanent exclusion from the platform.
        </p>

        <p className={styles.body}>
          Dark themes, moral horror, and disturbing scenes are permitted and at times encouraged when they serve
          the story and atmosphere. Violence in The Wudlands is a consequence of the world, not a reward.
          Monsters are dangerous. Villains may be cruel. Innocents may suffer. These things can appear in a story
          if they carry weight and meaning. What is never acceptable is cruelty presented as entertainment without
          narrative purpose — scenes that exist only to degrade, shock, or harm without any consequence or context
          within the story. Addon creators are trusted to understand the difference. The Wudlands team will remove
          content that crosses this line without warning or appeal.
        </p>

        <h3 className={styles.subheading}>6. Erotic Content</h3>

        <p className={styles.body}>
          Erotic content is permitted exclusively in addons that have been explicitly flagged as adult content
          by the creator and reviewed by The Wudlands. All characters involved in any erotic scene must be
          unambiguously adult. No ambiguous ages are acceptable — if the age of a character is unclear,
          they must be written and described as adults, and the platform reserves the right to remove any content
          where this is in doubt. Erotic content must remain consensual within the narrative context or, where
          non-consensual scenarios appear, must handle them with appropriate weight and consequence. Gratuitous
          or exploitative depictions are not permitted.
        </p>

        <img
          src="/images/guide/affection.jpg"
          alt="Doorways to lead to various adventures, in the middle a noble woman hugging her favorite hero."
          className={styles.sectionImage}
        />

        <p className={styles.body}>
          Contributors must only submit original content that they have the right to share. Submitting stolen,
          plagiarised, or otherwise copied text, artwork, or images is strictly prohibited.
          The use of <span className={styles.highlight}>generative AI tools and large language model (LLM) output</span> is
          permitted — AI-assisted writing, AI-generated imagery, and LLM-produced text are all acceptable contributions,
          provided the contributor holds the necessary rights or the content is otherwise freely usable.
          However, reproducing or adapting content from the <span className={styles.highlight}>Fighting Fantasy</span> gamebook
          series — including stories, characters, place names, game mechanics, and artwork from those books — is
          <span className={styles.highlight}> expressly forbidden</span>. Fighting Fantasy is a protected intellectual
          property. Submissions that incorporate Fighting Fantasy material will be removed immediately, and the contributor
          may be permanently excluded from the platform. This restriction applies regardless of how heavily the source
          material is paraphrased or adapted.
        </p>

        <p className={styles.body}>
          The Wudlands is a living platform. The game experience — including story content, available addons,
          mechanics, reward structures, and platform features — <span className={styles.highlight}>may change at any time
          without prior notice</span>. Addons may be modified, rebalanced, retired, or removed. New content
          restrictions or moderation standards may be introduced as the platform evolves and as legal or community
          requirements change. Players and contributors should not assume that the experience they encounter today
          will remain identical in the future. The Wudlands does not guarantee continuity of any specific story,
          mechanic, reward, or feature across platform updates.
        </p>

        <h3 className={styles.subheading}>7. Summary</h3>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Topic</th>
              <th>What It Means</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Content Rights</td>
              <td>Submitted content belongs to The Wudlands to use, change, or remove in any way it sees fit.</td>
            </tr>
            <tr>
              <td>Modifications</td>
              <td>The Wudlands may rewrite, restructure, or edit your adventure without asking permission.</td>
            </tr>
            <tr>
              <td>Romantic / Minne</td>
              <td>Vintage 80s/90s fantasy gender dynamics and courtly love tropes are part of the aesthetic. They do not reflect the team&apos;s values.</td>
            </tr>
            <tr>
              <td>Revenue Share</td>
              <td>Any share of revenue is voluntary and optional. It creates no legal entitlement or obligation.</td>
            </tr>
            <tr>
              <td>No Guarantee</td>
              <td>Contributing content does not guarantee any compensation, credit, or continued presence on the platform.</td>
            </tr>
            <tr>
              <td>Blockchain Migration</td>
              <td>The platform may move to a different blockchain at any time. You accept this when contributing.</td>
            </tr>
            <tr>
              <td>ETH Address</td>
              <td>Stored if provided, used only for platform purposes. Not required. Does not guarantee any payment.</td>
            </tr>
            <tr>
              <td>Age Rating</td>
              <td>16+ general. 18+ for adult-flagged content. Users confirm they meet the requirement by playing.</td>
            </tr>
            <tr>
              <td>Content Warnings</td>
              <td>The game contains violence, horror, death, disturbing themes, and potentially erotic material.</td>
            </tr>
            <tr>
              <td>Zero Tolerance</td>
              <td>Sexual content involving minors, glorified violence against innocents, and hate content are immediately removed and result in a permanent ban.</td>
            </tr>
            <tr>
              <td>Erotic Content</td>
              <td>Permitted only in adult-flagged addons. All characters must be unambiguously adult. Must be handled responsibly.</td>
            </tr>
            <tr>
              <td>Dark Themes</td>
              <td>Horror, cruelty, and moral ambiguity are allowed when they serve the story. Gratuitous shock content without purpose is not.</td>
            </tr>
            <tr>
              <td>Original Content</td>
              <td>Stolen or plagiarised text and images are forbidden. AI-generated content is permitted. Fighting Fantasy material is strictly prohibited due to copyright.</td>
            </tr>
            <tr>
              <td>Changing Experience</td>
              <td>Content, mechanics, and features may change at any time. No continuity of any specific element is guaranteed.</td>
            </tr>
            <tr>
              <td>Agreement</td>
              <td>Submitting content means you have read and accepted these terms in full.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
