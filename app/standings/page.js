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
      .select("id, week, home_team, away_team, home_score, away_score, is_final, kickoff_time");

    if (gamesError) {
      setError(gamesError.message);
      setLoading(false);
      return;
    }

    const { data: tiebreakers, error: tbError } = await supabase
      .from("tiebreakers")
      .select("player_id, week, guessed_total");

    if (tbError) {
      setError(tbError.message);
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

    // Actual combined score of the LAST (by kickoff) final game in each
    // week -- that's the game each week's tiebreaker guess is based on
    const weekFinalTotals = {};
    finalGames.forEach((g) => {
      const existing = weekFinalTotals[g.week];
      if (!existing || new Date(g.kickoff_time) > new Date(existing.kickoff_time)) {
        weekFinalTotals[g.week] = {
          kickoff_time: g.kickoff_time,
          actual_total: g.home_score + g.away_score,
        };
      }
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

      // Cumulative tiebreaker accuracy across every graded week
      const playerTiebreakers = tiebreakers.filter(
        (t) => t.player_id === player.id && weekFinalTotals[t.week]
      );
      const tiebreakerDiff = playerTiebreakers.reduce(
        (sum, t) => sum + Math.abs(t.guessed_total - weekFinalTotals[t.week].actual_total),
        0
      );
      const hasTiebreakerData = playerTiebreakers.length > 0;

      return { id: player.id, name: player.name, weekWins, total, tiebreakerDiff, hasTiebreakerData };
    });

    results.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      // Tied on total wins -- closer cumulative tiebreaker guess wins.
      // Players with no tiebreaker data fall to the bottom of a tie.
      if (a.hasTiebreakerData !== b.hasTiebreakerData) {
        return a.hasTiebreakerData ? -1 : 1;
      }
      return a.tiebreakerDiff - b.tiebreakerDiff;
    });

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

  const cellBg = "#142a1d";
  const cellBorder = "#234431";

  // Detect if there's an actual tie at the top that tiebreaker data resolved,
  // so we can show a small transparency note
  const tiesExist = rows.some(
    (r, idx) => idx > 0 && r.total === rows[idx - 1].total
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#0b1f14",
        backgroundImage: "url('/standings-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="container" style={{ maxWidth: 900 }}>
        <div
          style={{
            background: "rgba(5, 15, 10, 0.55)",
            backdropFilter: "blur(6px)",
            borderRadius: 12,
            padding: "18px 22px",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0 }}>TD Pool</h1>
          <p className="subtitle" style={{ margin: "4px 0 14px 0" }}>
            Season Results
          </p>
          <p
            style={{
              margin: 0,
              fontStyle: "italic",
              fontSize: 15,
              color: "#c9dcd0",
              borderTop: "1px solid rgba(159,184,168,0.3)",
              paddingTop: 12,
            }}
          >
            &ldquo;To hell with exciting, I&apos;d rather be drab as hell and
            win.&rdquo;
            <br />
            <span style={{ fontSize: 13, color: "#9fb8a8" }}>
              — Woody Hayes
            </span>
          </p>
        </div>

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
          <>
            <div
              style={{
                background: "rgba(5, 15, 10, 0.6)",
                backdropFilter: "blur(6px)",
                borderRadius: 12,
                padding: 12,
                overflowX: "auto",
              }}
            >
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        background: cellBg,
                        padding: "10px 14px",
                        textAlign: "left",
                        border: `1px solid ${cellBorder}`,
                        minWidth: 140,
                      }}
                    >
                      Player
                    </th>
                    {weeks.map((w) => (
                      <th
                        key={w}
                        style={{
                          padding: "10px 8px",
                          border: `1px solid ${cellBorder}`,
                          background: cellBg,
                          minWidth: 55,
                          textAlign: "center",
                        }}
                      >
                        Wk {w}
                      </th>
                    ))}
                    <th
                      style={{
                        padding: "10px 8px",
                        border: `1px solid ${cellBorder}`,
                        background: cellBg,
                        minWidth: 65,
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
                          background: cellBg,
                          padding: "10px 14px",
                          border: `1px solid ${cellBorder}`,
                          borderLeft: idx < 3 ? `3px solid ${medalColor(idx)}` : `1px solid ${cellBorder}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.name}
                      </td>
                      {weeks.map((w) => (
                        <td
                          key={w}
                          style={{
                            padding: "10px 8px",
                            textAlign: "center",
                            border: `1px solid ${cellBorder}`,
                            background: cellBg,
                            color: "#c9dcd0",
                          }}
                        >
                          {row.weekWins[w]}
                        </td>
                      ))}
                      <td
                        style={{
                          padding: "10px 8px",
                          textAlign: "center",
                          border: `1px solid ${cellBorder}`,
                          background: cellBg,
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

            {tiesExist && (
              <p style={{ color: "#9fb8a8", fontSize: 12, textAlign: "center", marginTop: 12 }}>
                Ties in total wins are broken using cumulative tiebreaker accuracy.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
