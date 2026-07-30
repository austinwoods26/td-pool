"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

const ADMIN_EMAILS = ["austin.woods5526@gmail.com"];

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [week, setWeek] = useState("1");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoff, setKickoff] = useState("");

  const [syncWeek, setSyncWeek] = useState("1");
  const [syncYear, setSyncYear] = useState(String(new Date().getFullYear()));
  const [syncSeasonType, setSyncSeasonType] = useState("2");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    async function checkAccess() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (!ADMIN_EMAILS.includes(session.user.email)) {
        setAuthorized(false);
        setChecking(false);
        return;
      }

      setAuthorized(true);
      setChecking(false);
    }
    checkAccess();
  }, []);

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
    if (authorized) {
      loadGames();
    }
  }, [authorized]);

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

  async function handleSaveSyncConfig() {
    setSyncMessage("");
    setError("");

    const { error: configError } = await supabase.from("sync_config").upsert(
      {
        id: 1,
        pool_week: parseInt(week, 10),
        espn_week: parseInt(syncWeek, 10),
        seasontype: parseInt(syncSeasonType, 10),
        year: parseInt(syncYear, 10),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (configError) {
      setError(configError.message);
      return;
    }

    setSyncMessage(
      "Auto-sync default saved. It'll run automatically every Tuesday at 4am Central, starting from these settings."
    );
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage("");
    setError("");

    try {
      const res = await fetch(
        `/api/espn-week?week=${syncWeek}&year=${syncYear}&seasontype=${syncSeasonType}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Sync failed");
        setSyncing(false);
        return;
      }

      if (!data.games || data.games.length === 0) {
        setSyncMessage("No games found for that week.");
        setSyncing(false);
        return;
      }

      const rows = data.games.map((g) => ({
        ...g,
        week: parseInt(week, 10),
      }));

      const { error: upsertError } = await supabase
        .from("games")
        .upsert(rows, { onConflict: "espn_game_id" });

      if (upsertError) {
        setError(upsertError.message);
        setSyncing(false);
        return;
      }

      setSyncMessage(`Synced ${rows.length} games.`);
      loadGames();
    } catch (err) {
      setError(err.message);
    }

    setSyncing(false);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this game?")) return;
    await supabase.from("games").delete().eq("id", id);
    loadGames();
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
      <h1>TD Pool Admin</h1>
      <p className="subtitle">Manage weekly games</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sync from ESPN</h3>
        <p style={{ color: "#9fb8a8", fontSize: 14, marginTop: 0 }}>
          Pulls matchups, kickoff times, logos, and odds straight from ESPN.
          Uses the &quot;Pool Week&quot; below to file them into your league.
        </p>

        <label htmlFor="poolWeek">Pool Week</label>
        <input
          id="poolWeek"
          type="number"
          min="1"
          max="22"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
        />

        <label htmlFor="syncSeasonType">Season Type</label>
        <select
          id="syncSeasonType"
          value={syncSeasonType}
          onChange={(e) => setSyncSeasonType(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #2e5540",
            background: "#0f2417",
            color: "#fff",
            fontSize: 15,
            marginTop: 6,
          }}
        >
          <option value="1">Preseason</option>
          <option value="2">Regular Season</option>
          <option value="3">Postseason</option>
        </select>

        <label htmlFor="syncWeek">ESPN Week Number</label>
        <input
          id="syncWeek"
          type="number"
          min="1"
          max="22"
          value={syncWeek}
          onChange={(e) => setSyncWeek(e.target.value)}
        />

        <label htmlFor="syncYear">Year</label>
        <input
          id="syncYear"
          type="number"
          value={syncYear}
          onChange={(e) => setSyncYear(e.target.value)}
        />

        {syncMessage && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#14301f",
              border: "1px solid #22c55e",
              color: "#4ade80",
              fontSize: 14,
            }}
          >
            {syncMessage}
          </div>
        )}

        <button onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync Games from ESPN"}
        </button>
        <button
          onClick={handleSaveSyncConfig}
          style={{ background: "#234431", marginTop: 10 }}
        >
          Save as Auto-Sync Default
        </button>
      </div>

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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {g.away_team_logo && (
                  <img src={g.away_team_logo} alt="" style={{ width: 24, height: 24 }} />
                )}
                <div>
                  <strong>Week {g.week}</strong>: {g.away_team} @ {g.home_team}
                  <div style={{ fontSize: 13, color: "#9fb8a8", marginTop: 4 }}>
                    {new Date(g.kickoff_time).toLocaleString()}
                    {g.odds_summary && <span> · {g.odds_summary}</span>}
                  </div>
                </div>
                {g.home_team_logo && (
                  <img src={g.home_team_logo} alt="" style={{ width: 24, height: 24 }} />
                )}
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
