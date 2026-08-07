"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

export default function StandingsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weeks, setWeeks] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setChecking(false);
      loadStandings();
    }
    init();
  }, []);

  async function loadStandings() {
    setLoading(true);
    setError("");

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name");

    if (playersError) {
      setError(playersError.message);
      setLoading(false);
      return;
    }

    const { data: allGames, error: gamesError } = await supabase
      .from("games")
      .select("id, week, home_team, away_team, home_score, away_score, is_final");

    if (gamesError) {
      setError(gamesError.message);
      setLoading(false);
      return;
    }

    const distinctWeeks = [...new Set(allGames.map((g) => g.week))].sort((a, b) => a - b);
    setWeeks(distinctWeeks);

    const finalGames = allGames.filter((g) => g.is_final);
    const gameIds = finalGames.map((g) => g.id);
    const safeIds = gameIds.length > 0 ? gameIds : ["00000000-0000-0000-0000-000000000000"];

    const { data: picks, error: picksError } = await supabase
      .from("picks")
      .select("player_id, game_id, picked_team")
      .in("game_id", safeIds);

    if (picksError) {
      setError(picksError.message);
      setLoading(false);
      return;
    }

    const winners = {};
    finalGames.forEach((g) => {
      winners[g.id] =
        g.home_score === g.away_score
          ? null
          : g.home_score > g.away_score
          ? g.home_team
          : g.away_team;
    });

    const results = players.map((player) => {
      const weekWins = {};
      let total = 0;

      distinctWeeks.forEach((w) => {
        const weekGameIds = finalGames.filter((g) => g.week === w).map((g) => g.id);
        const wins = picks.filter(
          (pk) =>
            pk.player_id === player.id &&
            weekGameIds.includes(pk.game_id) &&
            winners[pk.game_id] &&
            pk.picked_team === winners[pk.game_id]
        ).length;
        weekWins[w] = wins;
        total += wins;
      });

      return { id: player.id, name: player.name, weekWins, total };
    });

    results.sort((a, b) => b.total - a.total);

    setRows(results);
    setLoading(false);
  }

  if (checking) {
    return (
      <div className="container">
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  const medalColor = (rank) => {
    if (rank === 0) return "#ffd700";
    if (rank === 1) return "#c0c0c0";
    if (rank === 2) return "#cd7f32";
    return "transparent";
  };

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <h1>TD Pool</h1>
      <p className="subtitle">Season Results</p>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>No players yet.</p>
        </div>
      ) : weeks.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>
            No games have been added yet.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "#0b1f14",
                    padding: "8px 12px",
                    textAlign: "left",
                    borderBottom: "2px solid #234431",
                    minWidth: 140,
                  }}
                >
                  Player
                </th>
                {weeks.map((w) => (
                  <th
                    key={w}
                    style={{
                      padding: "8px 6px",
                      borderBottom: "2px solid #234431",
                      borderLeft: "1px solid #234431",
                      minWidth: 50,
                      textAlign: "center",
                    }}
                  >
                    Wk {w}
                  </th>
                ))}
                <th
                  style={{
                    padding: "8px 6px",
                    borderBottom: "2px solid #234431",
                    borderLeft: "1px solid #234431",
                    minWidth: 60,
                    textAlign: "center",
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "#0b1f14",
                      padding: "8px 12px",
                      borderBottom: "1px solid #234431",
                      borderLeft: idx < 3 ? `3px solid ${medalColor(idx)}` : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.name}
                  </td>
                  {weeks.map((w) => (
                    <td
                      key={w}
                      style={{
                        padding: "8px 6px",
                        textAlign: "center",
                        borderBottom: "1px solid #234431",
                        borderLeft: "1px solid #234431",
                        color: "#9fb8a8",
                      }}
                    >
                      {row.weekWins[w]}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "center",
                      borderBottom: "1px solid #234431",
                      borderLeft: "1px solid #234431",
                      fontWeight: 700,
                      color: idx < 3 ? medalColor(idx) : "#fff",
                    }}
                  >
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
