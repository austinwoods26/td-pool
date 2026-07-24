"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // Create the matching player record so they show up in standings
    const { error: playerError } = await supabase.from("players").insert({
      name,
      email,
    });

    setLoading(false);

    if (playerError) {
      setError(playerError.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="container">
        <h1>TD Pool</h1>
        <div className="card">
          <p>
            You&apos;re almost in! Check your email to confirm your account,
            then head back to{" "}
            <a href="/login" style={{ color: "#4ade80" }}>
              sign in
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>TD Pool</h1>
      <p className="subtitle">Create your account</p>

      <div className="card">
        <form onSubmit={handleSignup}>
          <label htmlFor="name">Your Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="link-row">
          Already have an account? <a href="/login">Sign in</a>
        </div>
      </div>
    </div>
  );
}
