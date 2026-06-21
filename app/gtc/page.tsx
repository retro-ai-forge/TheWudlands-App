import Image from "next/image";
import styles from "./page.module.css";

export default function GTC() {
  return (
    <div className={styles.page}>
      <section className={styles.guidelines}>
        <h2 className={styles.heading}>Terms &amp; Conditions</h2>

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
          The Wudlands may offer an 80/20 revenue split with contributors (80% to contributor, 20% to platform).
          This is entirely voluntary, not guaranteed, and does not create any employment relationship or legal entitlement.
          Revenue may be changed or discontinued at any time. Contributors may suggest a price, but The Wudlands
          reserves final say on pricing. Each adventure allows 3 plays; further plays require paying the fee again.
        </p>

        <h3 className={styles.subheading}>4. Blockchain &amp; Wallet Addresses</h3>

        <p className={styles.body}>
          The Wudlands currently uses Polkadot with optional Ethereum addresses for revenue distribution.
          The platform may migrate to a different blockchain at any time. Wallet addresses are stored securely
          and used only for payment purposes; they are not sold or shared with third parties. Providing an address
          does not guarantee any payment, and you may see your address reflected in smart contracts.
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
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Content Rights</td>
              <td>The Wudlands may use, modify, or remove your content at will.</td>
            </tr>
            <tr>
              <td>Revenue Share</td>
              <td>80/20 split is voluntary, not guaranteed, and can change anytime.</td>
            </tr>
            <tr>
              <td>No Legal Entitlement</td>
              <td>Submitting does not guarantee compensation, credit, or continued presence.</td>
            </tr>
            <tr>
              <td>Age Ratings</td>
              <td>16+ general, 18+ for adult content. Users confirm eligibility.</td>
            </tr>
            <tr>
              <td>Prohibited Content</td>
              <td>Zero tolerance: minors in sexual content, glorified violence, hate speech.</td>
            </tr>
            <tr>
              <td>Original Work</td>
              <td>No plagiarism or stolen content. Fighting Fantasy material forbidden. AI-generated OK.</td>
            </tr>
            <tr>
              <td>Platform Changes</td>
              <td>Content, mechanics, and features may change anytime without notice.</td>
            </tr>
          </tbody>
        </table>
      </section>

    </div>
  );
}
