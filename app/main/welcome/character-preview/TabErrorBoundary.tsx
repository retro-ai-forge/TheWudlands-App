"use client";

import React from "react";

interface State {
  error: Error | null;
}

export class TabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "1rem", color: "#f44", background: "#1a0000", borderRadius: "8px", margin: "1rem" }}>
          <strong>Render error caught:</strong>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", marginTop: "0.5rem" }}>
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
