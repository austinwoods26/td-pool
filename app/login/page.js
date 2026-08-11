"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundImage: "url('/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {!showForm ? (
        // Step 1: just her photo, full and unobstructed, with a single
        // gentle way in
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingBottom: 56,
            animation: "fadeIn 0.4s ease",
          }}
        >
          <div
            style={{
              background: "rgba(5, 15, 10, 0.5)",
              backdropFilter: "blur(6px)",
              borderRadius: 12,
              padding: "14px 24px",
              marginBottom: 18,
              textAlign: "center",
            }}
          >
            <h1 style={{ margin: 0 }}>TD Pool</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{ width: 260, margin: 0 }}
          >
            Sign In
          </button>
        </div>
      ) : (
        // Step 2: the actual form, revealed on request
        <div
          className="container"
          style={{
            paddingTop: 0,
            paddingBottom: 48,
            animation: "fadeIn 0.3s ease",
          }}
        >
          <div
            style={{
              background: "rgba(5, 15, 10, 0.55)",
              backdropFilter: "blur(6px)",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            <h1 style={{ margin: 0 }}>TD Pool</h1>
            <p className="subtitle" style={{ margin: "4px 0 0 0" }}>
              Sign in to make your picks
            </p>
          </div>

          <div className="card">
            <form onSubmit={handleLogin}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && <div className="error">{error}</div>}

              <button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="link-row">
              New to the pool? <a href="/signup">Create an account</a>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
