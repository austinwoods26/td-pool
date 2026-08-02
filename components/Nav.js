"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase-browser";

const ADMIN_EMAILS = ["austin.woods5526@gmail.com"];

export default function Nav() {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(null);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setEmail(data.session.user.email);
      }
    }
    checkSession();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
  }

  function go(path) {
    setOpen(false);
    router.push(path);
  }

  // Not logged in (e.g. on /login or /signup) — show nothing
  if (!email) return null;

  const isAdmin = ADMIN_EMAILS.includes(email);

  const linkStyle = {
    display: "block",
    padding: "12px 16px",
    color: "#fff",
    textDecoration: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 15,
  };

  return (
    <>
      {/* Hamburger toggle button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 40,
          width: 44,
          height: 44,
          margin: 0,
          borderRadius: 8,
          background: "#142a1d",
          border: "1px solid #234431",
          color: "#fff",
          fontSize: 20,
          display: open ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ☰
      </button>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 45,
          }}
        />
      )}

      {/* Sidebar panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: open ? 0 : -260,
          width: 240,
          height: "100%",
          background: "#0f2417",
          borderRight: "1px solid #234431",
          zIndex: 50,
          transition: "left 0.2s ease",
          padding: 16,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <strong style={{ fontSize: 18 }}>TD Pool</strong>
          <button
            onClick={() => setOpen(false)}
            style={{
              width: "auto",
              margin: 0,
              background: "transparent",
              border: "none",
              color: "#9fb8a8",
              fontSize: 18,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <a onClick={() => go("/dashboard")} style={linkStyle}>
          Dashboard
        </a>
        <a onClick={() => go("/picks")} style={linkStyle}>
          Make Picks
        </a>
        <a onClick={() => go("/standings")} style={linkStyle}>
          Standings
        </a>
        {isAdmin && (
          <a onClick={() => go("/admin")} style={linkStyle}>
            Admin
          </a>
        )}

        <div style={{ marginTop: "auto" }}>
          <div
            style={{
              fontSize: 12,
              color: "#9fb8a8",
              padding: "0 16px",
              marginBottom: 8,
              wordBreak: "break-all",
            }}
          >
            {email}
          </div>
          <a onClick={handleLogout} style={{ ...linkStyle, color: "#fca5a5" }}>
            Log Out
          </a>
        </div>
      </div>
    </>
  );
}
