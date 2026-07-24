"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setEmail(data.session.user.email);
      setChecking(false);
    }
    checkSession();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (checking) {
    return (
      <div className="container">
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>TD Pool</h1>
      <p className="subtitle">Welcome, {email}</p>
      <div className="card">
        <p>
          You&apos;re logged in! This is where your weekly picks and the
          season standings will live next.
        </p>
        <button onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  );
}
