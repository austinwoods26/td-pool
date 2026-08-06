"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";
import { ensurePlayerRecord } from "../../lib/players";

export default function PicksPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [playerId, setPlayerId] = useState(null);

  const [currentWeek, setCurrentWeek] = useState(null);

  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState({}); // { game_id: "team name" }
  const [tiebreaker, setTiebreaker] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Confirm login + find matching player record
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.push("/login");
        return;
      }

      const player = await ensurePlayerRecord(supabase, session);

      if (!player) {
        setError(
          "We couldn't set up your player profile. Try logging out and back in."
        );
        setChecking(false);
        return;
      }

      setPlayerId(player.id);
      setChecking(false);
    }
    init();
  }, []);

  // 2. Once we know who the player is, figure out the current active week
  // from the saved sync config (the same week the Tuesday auto-sync just loaded)
  useEffect(() => {
    if (!playerId) return;

    async function loadCurrentWeek() {
      const { data: config } = await supabase
        .from("sync_config")
        .select("pool_week")
        .eq("id", 1)
        .single();

      if (config) {
        // The config tracks the NEXT week to sync, so the current/active
        // week is one behind that
        setCurrentWeek(Math.max(config.pool_week - 1, 1));
      } else {
        setLoading(false);
      }
    }
    loadCurrentWeek();
  }, [playerId]);

  // 3. Load games + existing picks for the current week
  useEffect(() => {
    if (!currentWeek || !playerId) return;
    loadWeekData();
  }, [currentWeek, playerId]);

  async function loadWeekData() {
    setLoading(true);
    setMessage("");
    setError("");

    const { data: weekGames } = await supabase
      .from("games")
      .select("*")
      .eq("week", currentWeek)
      .order("kickoff_time", { ascending: true });

    setGames(weekGames || []);

    const { data: existingPicks } = await supabase
      .from("picks")
      .select("game_id, picked_team")
      .eq("player_id", playerId)
      .in("game_id", (weekGames || []).map((g) => g.id));

    const pickMap = {};
    (existingPicks || []).forEach((p) => {
      pickMap[p.game_id] = p.picked_team;
    });
    setPicks(pickMap);

    const { data: existingTiebreaker } = await supabase
      .from("tiebreakers")
      .select("guessed_total")
      .eq("player_id", playerId)
      .eq("week", currentWeek)
      .single();

    setTiebreaker(
      existingTiebreaker ? String(existingTiebreaker.guessed_total) : ""
    );

    setLoading(false);
  }

  function isLocked(kickoffTime) {
    const lockTime = new Date(kickoffTime).getTime() - 15 * 60 * 1000;
    return now >= lockTime;
  }

  function formatCountdown(kickoffTime) {
    const lockTime = new Date(kickoffTime).getTime() - 15 * 60 * 1000;
    const remaining = lockTime - now;

    if (remaining <= 0) return null;

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `Locks in ${days}d ${hours}h`;
    if (hours > 0) return `Locks in ${hours}h ${minutes}m`;
    if (minutes > 0) return `Locks in ${minutes}m ${seconds}s`;
    return `Locks in ${seconds}s`;
  }

  function handlePick(gameId, team) {
    setPicks((prev) => ({ ...prev, [gameId]: team }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    // Only save picks for games that are NOT locked
    const openGames = games.filter((g) => !isLocked(g.kickoff_time));

    const rows = openGames
      .filter((g) => picks[g.id])
      .map((g) => ({
        player_id: playerId,
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

    // Save tiebreaker only if the last game of the week isn't locked yet
    const lastGame = games[games.length - 1];
    if (lastGame && !isLocked(lastGame.kickoff_time) && tiebreaker) {
      const { error: tbError } = await supabase.from("tiebreakers").upsert(
        {
          player_id: playerId,
          week: currentWeek,
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
    setMessage("Picks saved!");
  }

  if (checking) {
    return (
      <div className="container">
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>TD Pool</h1>
      <p className="subtitle">
        Make your picks{currentWeek ? ` — Week ${currentWeek}` : ""}
      </p>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p>Loading games...</p>
      ) : games.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>
            No games have been added for this week yet.
          </p>
        </div>
      ) : (
        <>
          {games.map((g, idx) => {
            const locked = isLocked(g.kickoff_time);
            const isLastGame = idx === games.length - 1;

            return (
              <div key={g.id} className="card" style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "#9fb8a8",
                    marginBottom: 10,
                  }}
                >
                  {new Date(g.kickoff_time).toLocaleString()}
                  {g.odds_summary && <span> · {g.odds_summary}</span>}
                  {locked ? (
                    <span style={{ color: "#fca5a5", marginLeft: 8 }}>
                      🔒 Locked
                    </span>
                  ) : (
                    (() => {
                      const countdown = formatCountdown(g.kickoff_time);
                      const remaining =
                        new Date(g.kickoff_time).getTime() -
                        15 * 60 * 1000 -
                        now;
                      const urgent = remaining < 15 * 60 * 1000; // under 15 min left
                      return countdown ? (
                        <span
                          style={{
                            marginLeft: 8,
                            color: urgent ? "#fbbf24" : "#4ade80",
                            fontWeight: urgent ? 700 : 400,
                          }}
                        >
                          ⏱ {countdown}
                        </span>
                      ) : null;
                    })()
                  )}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { team: g.away_team, logo: g.away_team_logo },
                    { team: g.home_team, logo: g.home_team_logo },
                  ].map(({ team, logo }) => (
                    <button
                      key={team}
                      type="button"
                      disabled={locked}
                      onClick={() => handlePick(g.id, team)}
                      style={{
                        flex: 1,
                        margin: 0,
                        background:
                          picks[g.id] === team ? "#22c55e" : "#0f2417",
                        color: picks[g.id] === team ? "#05170c" : "#fff",
                        border: "1px solid #2e5540",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      {logo && (
                        <img
                          src={logo}
                          alt=""
                          style={{ width: 22, height: 22 }}
                        />
                      )}
                      {team}
                    </button>
                  ))}
                </div>

                {isLastGame && (
                  <div style={{ marginTop: 16 }}>
                    <label htmlFor="tiebreaker">
                      Tiebreaker: total combined points in this game
                    </label>
                    <input
                      id="tiebreaker"
                      type="number"
                      disabled={locked}
                      value={tiebreaker}
                      onChange={(e) => setTiebreaker(e.target.value)}
                      placeholder="e.g. 45"
                    />
                  </div>
                )}
              </div>
            );
          })}

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
            {saving ? "Saving..." : "Save Picks"}
          </button>
        </>
      )}
    </div>
  );
}
