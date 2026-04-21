"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error?.digest) {
      // eslint-disable-next-line no-console
      console.error("Global app error", { digest: error.digest, message: error.message });
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: "4rem 1rem",
          minHeight: "100vh",
          background: "#f9fafb",
          color: "#111827",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Something went very wrong
          </h1>
          <p style={{ color: "#4b5563", marginBottom: "1.5rem" }}>
            The site hit a critical error. Please refresh — if it keeps
            happening, email us at{" "}
            <a href="mailto:hello@watamubookings.com" style={{ color: "#0f766e" }}>
              hello@watamubookings.com
            </a>
            .
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#0f766e",
              color: "white",
              border: "none",
              padding: "0.75rem 1.25rem",
              borderRadius: "0.5rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
