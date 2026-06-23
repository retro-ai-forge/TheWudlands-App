import styles from "./characters.module.css";
import CharacterOrigins from "./CharacterOrigins";

export default function Characters() {
  return (
    <main className={styles.screen}>
      <CharacterOrigins />
    </main>
  );
}
