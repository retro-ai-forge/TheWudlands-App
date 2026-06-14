"use client";

import { useState } from "react";
import styles from "./FeedbackForm.module.css";

export function FeedbackForm() {
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!feedback.trim()) {
      setStatus("error");
      setMessage("Please enter some feedback.");
      return;
    }

    setStatus("sending");
    setMessage("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });

      if (!res.ok) {
        throw new Error("Failed to send feedback");
      }

      setStatus("success");
      setMessage("Thank you! Your feedback has been sent.");
      setFeedback("");
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
    } catch {
      setStatus("error");
      setMessage("Failed to send feedback. Please try again.");
    }
  }

  return (
    <div className={styles.feedbackContainer}>
      <div className={styles.feedbackSection}>
        <h2 className={styles.title}>Player Feedback &amp; Reviews</h2>
        <p className={styles.rewardInfo}>
          <span className={styles.highlight}>Constructive feedback will be rewarded with in-game currency.</span>
          {" "}Help shape The Wudlands by sharing your thoughts, suggestions, and reviews.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <textarea
            className={styles.textarea}
            placeholder="Share your feedback, suggestions, bug reports, or reviews here..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={5}
            disabled={status === "sending"}
          />

          <button
            type="submit"
            className={styles.submitButton}
            disabled={status === "sending" || !feedback.trim()}
          >
            {status === "sending" ? "Sending..." : "Send Feedback"}
          </button>
        </form>

        {message && (
          <p className={`${styles.statusMessage} ${styles[status]}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
