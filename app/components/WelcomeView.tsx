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
          Thanks for signing in — please read the{" "}
          <Link href="/guide" className={styles.welcomeLink}>guide</Link>{" "}
          on how to continue.
        </p>
      </div>

      <FeedbackForm />

      {userId !== null && (
        <span className={styles.playerId}>#{userId}</span>
      )}
      {playerAddress !== null && (
        <span className={styles.playerAddress}>{playerAddress.slice(0, 10)}...</span>
      )}
    </>
  );
}
