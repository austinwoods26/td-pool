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
        <p style={{ margin: 0 }}>
          Use the menu in the top-left corner to make your picks, check
          standings, or manage the pool.
        </p>
      </div>
    </div>
  );
}
