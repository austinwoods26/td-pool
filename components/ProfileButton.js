"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "../lib/supabase-browser";
import { ensurePlayerRecord } from "../lib/players";

const HIDE_ON_PATHS = ["/login", "/signup"];

export default function ProfileButton() {
  const pathname = usePathname();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      setSession(data.session);

      const player = await ensurePlayerRecord(supabase, data.session);
      if (player) {
        setPlayerId(player.id);
        const { data: full } = await supabase
          .from("players")
          .select("name")
          .eq("id", player.id)
          .single();
        if (full) {
          setName(full.name);
          setEditName(full.name);
        }
      }
    }
    init();
  }, []);

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("players")
      .update({ name: editName.trim() })
      .eq("id", playerId);

    setSaving(false);

    if (error) {
      setMessage("Couldn't save — try again.");
      return;
    }

    setName(editName.trim());
    setMessage("Saved!");
    setTimeout(() => setMessage(""), 2000);
  }

  if (HIDE_ON_PATHS.includes(pathname)) return null;
  if (!session) return null;

  const initial = (name || session.user.email || "?").charAt(0).toUpperCase();

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 40,
          width: 44,
          height: 44,
          margin: 0,
          borderRadius: "50%",
          background: "#22c55e",
          border: "none",
          color: "#05170c",
          fontSize: 18,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initial}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 45 }}
          />
          <div
            style={{
              position: "fixed",
              top: 68,
              right: 16,
              width: 260,
              background: "#142a1d",
              border: "1px solid #234431",
              borderRadius: 12,
              padding: 20,
              zIndex: 50,
            }}
          >
            <div style={{ fontSize: 13, color: "#9fb8a8", marginBottom: 16 }}>
              {session.user.email}
            </div>

            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />

            {message && (
              <div style={{ fontSize: 13, color: "#4ade80", marginTop: 8 }}>
                {message}
              </div>
            )}

            <button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
