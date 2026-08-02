import { APP_VERSION } from "./appVersion";
import styles from "./PageVersionTag.module.css";

export function PageVersionTag() {
  return <div className={styles.tag}>{APP_VERSION}</div>;
}
