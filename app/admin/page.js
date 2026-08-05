"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";
import { getPreviousWeek } from "../../lib/espn";

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

  const [players, setPlayers] = useState([]);
  const [statusWeek, setStatusWeek] = useState(null);
  const [playerStatus, setPlayerStatus] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);

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
      loadPlayers();
    }
  }, [authorized]);

  async function loadPlayers() {
    const { data } = await supabase.from("players").select("id, name").order("name");
    setPlayers(data || []);
  }

  useEffect(() => {
    if (games.length > 0 && statusWeek === null) {
      const maxWeek = Math.max(...games.map((g) => g.week));
      setStatusWeek(maxWeek);
    }
  }, [games]);

  useEffect(() => {
    if (statusWeek !== null && players.length > 0) {
      loadPlayerStatus();
    }
  }, [statusWeek, players, games]);

  async function loadPlayerStatus() {
    setStatusLoading(true);

    const weekGames = games.filter((g) => g.week === statusWeek);
    const gameIds = weekGames.map((g) => g.id);

    const { data: weekPicks } = await supabase
      .from("picks")
      .select("player_id, game_id")
      .in("game_id", gameIds.length > 0 ? gameIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data: weekTiebreakers } = await supabase
      .from("tiebreakers")
      .select("player_id")
      .eq("week", statusWeek);

    const tbSet = new Set((weekTiebreakers || []).map((t) => t.player_id));

    const status = players.map((p) => {
      const made = (weekPicks || []).filter((pk) => pk.player_id === p.id).length;
      return {
        id: p.id,
        name: p.name,
        made,
        total: weekGames.length,
        tiebreaker: tbSet.has(p.id),
      };
    });

    status.sort((a, b) => b.made - a.made || a.name.localeCompare(b.name));

    setPlayerStatus(status);
    setStatusLoading(false);
  }

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

  async function handleRefreshLastWeek() {
    setSyncing(true);
    setSyncMessage("");
    setError("");

    const { data: config, error: configError } = await supabase
      .from("sync_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (configError || !config) {
      setError("No auto-sync default saved yet, so there's no 'last week' to refresh.");
      setSyncing(false);
      return;
    }

    const prev = getPreviousWeek(config.seasontype, config.espn_week);

    if (!prev) {
      setSyncMessage("No previous week to refresh yet.");
      setSyncing(false);
      return;
    }

    const lastEspnWeek = prev.week;
    const lastSeasonType = prev.seasontype;
    const lastPoolWeek = config.pool_week - 1;

    try {
      const res = await fetch(
        `/api/espn-week?week=${lastEspnWeek}&year=${config.year}&seasontype=${lastSeasonType}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Refresh failed");
        setSyncing(false);
        return;
      }

      const rows = (data.games || []).map((g) => ({
        ...g,
        week: lastPoolWeek,
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("games")
          .upsert(rows, { onConflict: "espn_game_id" });

        if (upsertError) {
          setError(upsertError.message);
          setSyncing(false);
          return;
        }
      }

      setSyncMessage(`Refreshed scores for ${rows.length} games from last week.`);
      loadGames();
    } catch (err) {
      setError(err.message);
    }

    setSyncing(false);
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

      {games.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Player Pick Status</h3>

          <label htmlFor="statusWeek">Week</label>
          <select
            id="statusWeek"
            value={statusWeek ?? ""}
            onChange={(e) => setStatusWeek(parseInt(e.target.value, 10))}
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
            {[...new Set(games.map((g) => g.week))]
              .sort((a, b) => a - b)
              .map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
          </select>

          {statusLoading ? (
            <p style={{ margin: 0, color: "#9fb8a8" }}>Loading...</p>
          ) : players.length === 0 ? (
            <p style={{ margin: 0, color: "#9fb8a8" }}>
              No players have signed up yet.
            </p>
          ) : (
            playerStatus.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #234431",
                }}
              >
                <span>{p.name}</span>
                <span
                  style={{
                    color:
                      p.made === p.total && p.total > 0 ? "#4ade80" : "#9fb8a8",
                    fontSize: 14,
                  }}
                >
                  {p.made}/{p.total} picks
                  {p.tiebreaker ? " · TB ✓" : " · TB ✗"}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sync from ESPN</h3>
        <p style={{ color: "#9fb8a8", fontSize: 14, marginTop: 0 }}>
          Pulls matchups, kickoff times, logos, and odds straight from ESPN.
          Uses the &quot;Pool Week&quot; below to file them into your league.
        </p>
        <p style={{ color: "#9fb8a8", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          Heads up: ESPN counts the Hall of Fame Game as Preseason Week 1 —
          so the &quot;real&quot; Preseason Weeks 1-3 are actually ESPN Weeks
          2-4. If you'd rather skip the HOF game entirely, just start your
          Pool Week 1 at ESPN Week 2.
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
        <button
          onClick={handleRefreshLastWeek}
          disabled={syncing}
          style={{ background: "#234431", marginTop: 10 }}
        >
          {syncing ? "Refreshing..." : "Refresh Last Week's Scores Now"}
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
