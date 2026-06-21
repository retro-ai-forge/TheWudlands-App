import Link from "next/link";
import styles from "../page.module.css";
import { FeedbackForm } from "./FeedbackForm";

interface WelcomeViewProps {
  userId: number | null;
  playerAddress: string | null;
}

export function WelcomeView({ userId, playerAddress }: WelcomeViewProps) {
  return (
    <>
      <div className={styles.welcomeBody}>
        <h1 className={styles.welcomeHeadline}>Welcome to The Wudlands</h1>
        <p className={styles.welcomeMessage}>
          Thanks for signing in! This is a <strong>beta</strong> version of The Wudlands. The app engine is still in development as we gather ideas on how to structure and develop it. Check out our{" "}
          <Link href="/dev-section#roadmap" className={styles.welcomeLink}>roadmap in the dev-section</Link>{" "}
          to see what&apos;s planned.
        </p>
        <br/>
        <p className={styles.welcomeMessage}>
          We&apos;d love your feedback and ideas! Submit them using the email form below, or clone the repository 
          to contribute and be listed as a contributor. Communication happens on 
          Telegram, where new releases will be announced. 
        </p>
        <br/>
        <p className={styles.welcomeMessage}>
          Nova wallet and Polkadot.js extension haven been tested. Metamask, Talisman, and SubWallet should work but haven&apos;t been tested yet. If you have any issues with wallet connection, please let us know.
        </p>
        <br/>
        <p className={styles.welcomeMessage}>
          No coins or assets can be spend in beta &lt;2.0 or alpha version.
        </p>

      </div>

      <FeedbackForm />

      {userId !== null && (
        <span className={styles.playerId}>#{userId}</span>
      )}
    </>
  );
}
