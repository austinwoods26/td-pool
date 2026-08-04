"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

export default function PicksPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [playerId, setPlayerId] = useState(null);

  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);

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

      const { data: player, error: playerError } = await supabase
        .from("players")
        .select("id")
        .eq("email", session.user.email)
        .single();

      if (playerError || !player) {
        setError(
          "We couldn't find your player profile. Try logging out and signing up again."
        );
        setChecking(false);
        return;
      }

      setPlayerId(player.id);
      setChecking(false);
    }
    init();
  }, []);

  // 2. Once we know who the player is, load available weeks
  useEffect(() => {
    if (!playerId) return;

    async function loadWeeks() {
      const { data } = await supabase
        .from("games")
        .select("week")
        .order("week", { ascending: true });

      if (data && data.length > 0) {
        const uniqueWeeks = [...new Set(data.map((g) => g.week))];
        setWeeks(uniqueWeeks);
        setSelectedWeek(uniqueWeeks[0]);
      } else {
        setLoading(false);
      }
    }
    loadWeeks();
  }, [playerId]);

  // 3. Load games + existing picks whenever the selected week changes
  useEffect(() => {
    if (!selectedWeek || !playerId) return;
    loadWeekData();
  }, [selectedWeek, playerId]);

  async function loadWeekData() {
    setLoading(true);
    setMessage("");
    setError("");

    const { data: weekGames } = await supabase
      .from("games")
      .select("*")
      .eq("week", selectedWeek)
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
      .eq("week", selectedWeek)
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
          week: selectedWeek,
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
      <p className="subtitle">Make your picks</p>

      {error && <div className="error">{error}</div>}

      {weeks.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <label htmlFor="week">Week</label>
          <select
            id="week"
            value={selectedWeek || ""}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value, 10))}
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
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
      )}

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
