"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase-browser";

const ADMIN_EMAILS = ["austin.woods5526@gmail.com"];

export default function EditPicksPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [players, setPlayers] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");

  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({});
  const [tiebreaker, setTiebreaker] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
        setAuthorized(false);
        setChecking(false);
        return;
      }

      setAuthorized(true);
      setChecking(false);

      const { data: allPlayers } = await supabase
        .from("players")
        .select("id, name")
        .order("name");
      setPlayers(allPlayers || []);

      const { data: allGames } = await supabase
        .from("games")
        .select("week")
        .order("week");
      const uniqueWeeks = [...new Set((allGames || []).map((g) => g.week))];
      setWeeks(uniqueWeeks);
    }
    init();
  }, []);

  useEffect(() => {
    if (!selectedPlayer || !selectedWeek) return;
    loadPlayerWeek();
  }, [selectedPlayer, selectedWeek]);

  async function loadPlayerWeek() {
    setLoading(true);
    setMessage("");
    setError("");

    const week = parseInt(selectedWeek, 10);

    const { data: weekGames } = await supabase
      .from("games")
      .select("*")
      .eq("week", week)
      .order("kickoff_time", { ascending: true });

    setGames(weekGames || []);

    const { data: existingPicks } = await supabase
      .from("picks")
      .select("game_id, picked_team")
      .eq("player_id", selectedPlayer)
      .in("game_id", (weekGames || []).map((g) => g.id));

    const pickMap = {};
    (existingPicks || []).forEach((p) => {
      pickMap[p.game_id] = p.picked_team;
    });
    setPicks(pickMap);

    const { data: existingTiebreaker } = await supabase
      .from("tiebreakers")
      .select("guessed_total")
      .eq("player_id", selectedPlayer)
      .eq("week", week)
      .single();

    setTiebreaker(existingTiebreaker ? String(existingTiebreaker.guessed_total) : "");
    setLoading(false);
  }

  function handlePick(gameId, team) {
    setPicks((prev) => ({ ...prev, [gameId]: team }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    const rows = games
      .filter((g) => picks[g.id])
      .map((g) => ({
        player_id: selectedPlayer,
        game_id: g.id,
        picked_team: picks[g.id],
      }));

    if (rows.length > 0) {
      const { error: pickError } = await supabase
        .from("picks")
        .upsert(rows, { onConflict: "player_id,game_id" });

      if (pickError) {
        setError(pickError.message);
        setSaving(false);
        return;
      }
    }

    if (tiebreaker) {
      const { error: tbError } = await supabase.from("tiebreakers").upsert(
        {
          player_id: selectedPlayer,
          week: parseInt(selectedWeek, 10),
          guessed_total: parseInt(tiebreaker, 10),
        },
        { onConflict: "player_id,week" }
      );

      if (tbError) {
        setError(tbError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setMessage("Saved!");
  }

  if (checking) {
    return (
      <div className="container">
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="container">
        <h1>TD Pool Admin</h1>
        <div className="card">
          <p>You don&apos;t have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>Edit Player Picks</h1>
      <p className="subtitle">
        For fixing mistakes — this bypasses normal lock times.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <label htmlFor="player">Player</label>
        <select
          id="player"
          value={selectedPlayer}
          onChange={(e) => setSelectedPlayer(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #2e5540",
            background: "#0f2417",
            color: "#fff",
            fontSize: 15,
            marginBottom: 16,
          }}
        >
          <option value="">Select a player...</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label htmlFor="week">Week</label>
        <select
          id="week"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #2e5540",
            background: "#0f2417",
            color: "#fff",
            fontSize: 15,
          }}
        >
          <option value="">Select a week...</option>
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : selectedPlayer && selectedWeek && games.length > 0 ? (
        <>
          {games.map((g, idx) => (
            <div key={g.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#9fb8a8", marginBottom: 10 }}>
                {new Date(g.kickoff_time).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[g.away_team, g.home_team].map((team) => (
                  <button
                    key={team}
                    type="button"
                    onClick={() => handlePick(g.id, team)}
                    style={{
                      flex: 1,
                      margin: 0,
                      background: picks[g.id] === team ? "#22c55e" : "#0f2417",
                      color: picks[g.id] === team ? "#05170c" : "#fff",
                      border: "1px solid #2e5540",
                    }}
                  >
                    {team}
                  </button>
                ))}
              </div>
              {idx === games.length - 1 && (
                <div style={{ marginTop: 16 }}>
                  <label htmlFor="tiebreaker">Tiebreaker guess</label>
                  <input
                    id="tiebreaker"
                    type="number"
                    value={tiebreaker}
                    onChange={(e) => setTiebreaker(e.target.value)}
                    placeholder="e.g. 45"
                  />
                </div>
              )}
            </div>
          ))}

          {message && (
            <div
              className="card"
              style={{
                background: "#14301f",
                border: "1px solid #22c55e",
                color: "#4ade80",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              {message}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </>
      ) : selectedPlayer && selectedWeek ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>
            No games found for that week.
          </p>
        </div>
      ) : (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>
            Choose a player and week above to view or edit their picks.
          </p>
        </div>
      )}
    </div>
  );
}
