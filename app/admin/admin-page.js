"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase-browser";

export default function AdminPage() {
  const supabase = createClient();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [week, setWeek] = useState("1");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoff, setKickoff] = useState("");

  async function loadGames() {
    setLoading(true);
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("week", { ascending: true })
      .order("kickoff_time", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setGames(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadGames();
  }, []);

  async function handleAddGame(e) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const { error } = await supabase.from("games").insert({
      week: parseInt(week, 10),
      home_team: homeTeam,
      away_team: awayTeam,
      kickoff_time: new Date(kickoff).toISOString(),
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setHomeTeam("");
    setAwayTeam("");
    setKickoff("");
    loadGames();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this game?")) return;
    await supabase.from("games").delete().eq("id", id);
    loadGames();
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>TD Pool Admin</h1>
      <p className="subtitle">Manage weekly games</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a Game</h3>
        <form onSubmit={handleAddGame}>
          <label htmlFor="week">Week</label>
          <input
            id="week"
            type="number"
            min="1"
            max="22"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            required
          />

          <label htmlFor="away">Away Team</label>
          <input
            id="away"
            type="text"
            placeholder="e.g. Dallas Cowboys"
            value={awayTeam}
            onChange={(e) => setAwayTeam(e.target.value)}
            required
          />

          <label htmlFor="home">Home Team</label>
          <input
            id="home"
            type="text"
            placeholder="e.g. Philadelphia Eagles"
            value={homeTeam}
            onChange={(e) => setHomeTeam(e.target.value)}
            required
          />

          <label htmlFor="kickoff">Kickoff Time</label>
          <input
            id="kickoff"
            type="datetime-local"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            required
          />

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={saving}>
            {saving ? "Adding..." : "Add Game"}
          </button>
        </form>
      </div>

      <h3 style={{ marginTop: 32 }}>Current Games</h3>
      {loading ? (
        <p>Loading...</p>
      ) : games.length === 0 ? (
        <p style={{ color: "#9fb8a8" }}>No games added yet.</p>
      ) : (
        games.map((g) => (
          <div key={g.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>Week {g.week}</strong>: {g.away_team} @ {g.home_team}
                <div style={{ fontSize: 13, color: "#9fb8a8", marginTop: 4 }}>
                  {new Date(g.kickoff_time).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => handleDelete(g.id)}
                style={{ width: "auto", margin: 0, background: "#7f1d1d", padding: "8px 14px" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
