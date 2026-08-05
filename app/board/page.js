"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

export default function BoardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);

  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setChecking(false);
      loadWeeks();
    }
    init();
  }, []);

  async function loadWeeks() {
    const { data } = await supabase
      .from("games")
      .select("week")
      .order("week", { ascending: true });

    if (data && data.length > 0) {
      const uniqueWeeks = [...new Set(data.map((g) => g.week))];
      setWeeks(uniqueWeeks);
      setSelectedWeek(uniqueWeeks[uniqueWeeks.length - 1]);
    } else {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedWeek !== null) {
      loadBoard();
    }
  }, [selectedWeek]);

  async function loadBoard() {
    setLoading(true);

    const { data: weekGames } = await supabase
      .from("games")
      .select("*")
      .eq("week", selectedWeek)
      .order("kickoff_time", { ascending: true });

    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, name")
      .order("name", { ascending: true });

    const gameIds = (weekGames || []).map((g) => g.id);

    const { data: weekPicks } = await supabase
      .from("picks")
      .select("player_id, game_id, picked_team")
      .in("game_id", gameIds.length > 0 ? gameIds : ["00000000-0000-0000-0000-000000000000"]);

    setGames(weekGames || []);
    setPlayers(allPlayers || []);
    setPicks(weekPicks || []);
    setLoading(false);
  }

  function isLocked(kickoffTime) {
    const lockTime = new Date(kickoffTime).getTime() - 15 * 60 * 1000;
    return now >= lockTime;
  }

  if (checking) {
    return (
      <div className="container">
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  const lockedGames = games.filter((g) => isLocked(g.kickoff_time));
  const upcomingCount = games.length - lockedGames.length;

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>TD Pool</h1>
      <p className="subtitle">Picks Board</p>

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
        <p>Loading...</p>
      ) : lockedGames.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>
            No games have locked yet for this week. Picks show up here once
            each game is 15 minutes from kickoff.
          </p>
        </div>
      ) : (
        <>
          {lockedGames.map((g) => (
            <div key={g.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                {g.away_team_logo && (
                  <img src={g.away_team_logo} alt="" style={{ width: 22, height: 22 }} />
                )}
                <strong>
                  {g.away_team} @ {g.home_team}
                </strong>
                {g.home_team_logo && (
                  <img src={g.home_team_logo} alt="" style={{ width: 22, height: 22 }} />
                )}
              </div>

              {players.map((p) => {
                const pick = picks.find(
                  (pk) => pk.player_id === p.id && pk.game_id === g.id
                );
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderTop: "1px solid #234431",
                      fontSize: 14,
                    }}
                  >
                    <span>{p.name}</span>
                    <span style={{ color: pick ? "#fff" : "#9fb8a8" }}>
                      {pick ? pick.picked_team : "No pick"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {upcomingCount > 0 && (
            <p style={{ color: "#9fb8a8", fontSize: 13, textAlign: "center" }}>
              {upcomingCount} more game{upcomingCount > 1 ? "s" : ""} this
              week — picks will appear once locked.
            </p>
          )}
        </>
      )}
    </div>
  );
}
