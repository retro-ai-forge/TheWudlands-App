import Link from "next/link";
import { PageVersionTag } from "../../main/PageVersionTag";
import styles from "./page.module.css";

const STEPS = [
  {
    title: "Interactive Fiction",
    desc: "Write scenes that branch based on player choices — every path leads somewhere, every dead end has a way back.",
  },
  {
    title: "Decision Options",
    desc: "Give the player meaningful choices at every turn. Each option should carry weight — consequences, risk, or discovery.",
  },
  {
    title: "Metadata",
    desc: "Tag your scenes with IDs, images, and flags the engine needs — entry points, escape routes, endings, and dependencies.",
  },
  {
    title: "Story Variables",
    desc: "Track what the player has done with SugarCube variables — items picked up, doors opened, allies gained or lost.",
  },
  {
    title: "Testing & Submission",
    desc: "Play through your story, fix broken links and missing endings, then submit for review. The engine validates before it goes live.",
  },
];

export default function Tutorial() {
  return (
    <div className={styles.page}>
      <section className={styles.content}>
        <h2 className={styles.heading}>Story Editor Tutorial</h2>

        <p className={styles.intro}>
          A step-by-step walkthrough for building your first adventure in the
          Wudlands story editor. Each section covers one layer of the process —
          from writing your first scene to submitting a finished story.
        </p>

        <ol className={styles.stepList}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.stepItem}>
              <span className={styles.stepNum}>{i + 1}</span>
              <div className={styles.stepBody}>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepDesc}>{step.desc}</div>
              </div>
            </li>
          ))}
        </ol>

        <Link href="/create" className={styles.backLink}>
          &larr; Back to Create
        </Link>
      </section>
      <PageVersionTag />
    </div>
  );
}
