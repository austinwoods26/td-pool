"use client";

import { useState } from "react";
import { createClient } from "../../../lib/supabase-browser";

export default function SetPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState(null); // { type: "success" | "error", message: string }
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus({ type: "error", message: "You're not logged in." });
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin-set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Something went wrong." });
      } else {
        setStatus({
          type: "success",
          message: `Password updated for ${email}. Give them the new password directly.`,
        });
        setNewPassword("");
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Something went wrong." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Set Player Password</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Look up a player by their email and set a new password for them
        directly. This bypasses email recovery entirely — use it when a
        player says their reset link isn&apos;t working.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          Player&apos;s email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              marginTop: 4,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </label>

        <label>
          New password
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            placeholder="At least 6 characters"
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              marginTop: 4,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            border: "none",
            background: "#1d4ed8",
            color: "white",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Updating..." : "Set Password"}
        </button>
      </form>

      {status && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 14px",
            borderRadius: 6,
            background: status.type === "success" ? "#dcfce7" : "#fee2e2",
            color: status.type === "success" ? "#166534" : "#991b1b",
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
