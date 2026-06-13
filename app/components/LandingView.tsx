import styles from "../page.module.css";
import { EnterWudlandsButton } from "./EnterWudlandsButton";

interface LandingViewProps {
  status: string;
  joining: boolean;
  onEnter: (address: string) => void;
  onError: (error: string) => void;
}

export function LandingView({ status, joining, onEnter, onError }: LandingViewProps) {
  return (
    <div className={styles.bottomGroup}>
      <p className={styles.status}>{status}</p>
      <EnterWudlandsButton
        onEnter={onEnter}
        onError={onError}
        disabled={joining}
      />
    </div>
  );
}
