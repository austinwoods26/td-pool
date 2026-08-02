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
  const [standings, setStandings] = useState([]);
  const [gradedCount, setGradedCount] = useState(0);

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

    const { data: finalGames, error: gamesError } = await supabase
      .from("games")
      .select("id, week, home_team, away_team, home_score, away_score, is_final, kickoff_time")
      .eq("is_final", true);

    if (gamesError) {
      setError(gamesError.message);
      setLoading(false);
      return;
    }

    setGradedCount(finalGames.length);

    if (finalGames.length === 0) {
      setStandings(
        players.map((p) => ({ ...p, correct: 0, graded: 0, pct: 0 }))
      );
      setLoading(false);
      return;
    }

    const gameIds = finalGames.map((g) => g.id);

    const { data: picks, error: picksError } = await supabase
      .from("picks")
      .select("player_id, game_id, picked_team")
      .in("game_id", gameIds);

    if (picksError) {
      setError(picksError.message);
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

    // Determine the actual combined score for each week's LAST final game
    // (by kickoff time) — that's the game the tiebreaker guess is based on
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

    // Determine the winning team for each final game (ties/pushes are skipped)
    const winners = {};
    finalGames.forEach((g) => {
      if (g.home_score === g.away_score) {
        winners[g.id] = null; // tie, no correct pick possible
      } else {
        winners[g.id] = g.home_score > g.away_score ? g.home_team : g.away_team;
      }
    });

    const results = players.map((player) => {
      const playerPicks = picks.filter((p) => p.player_id === player.id);
      let correct = 0;
      let graded = 0;

      playerPicks.forEach((pick) => {
        const winner = winners[pick.game_id];
        if (winner === null) return; // tie, doesn't count
        graded += 1;
        if (pick.picked_team === winner) correct += 1;
      });

      // Cumulative tiebreaker accuracy: total distance between guessed and
      // actual combined score, across every week that's been graded
      const playerTiebreakers = tiebreakers.filter(
        (t) => t.player_id === player.id && weekFinalTotals[t.week]
      );
      const tiebreakerDiff = playerTiebreakers.reduce(
        (sum, t) => sum + Math.abs(t.guessed_total - weekFinalTotals[t.week].actual_total),
        0
      );
      const hasTiebreakerData = playerTiebreakers.length > 0;

      return {
        ...player,
        correct,
        graded,
        pct: graded > 0 ? Math.round((correct / graded) * 100) : 0,
        tiebreakerDiff,
        hasTiebreakerData,
      };
    });

    results.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      // Tied on correct picks — closer cumulative tiebreaker guess wins.
      // Players with no tiebreaker data fall to the bottom of a tie.
      if (a.hasTiebreakerData !== b.hasTiebreakerData) {
        return a.hasTiebreakerData ? -1 : 1;
      }
      return a.tiebreakerDiff - b.tiebreakerDiff;
    });

    setStandings(results);
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
    if (rank === 0) return "#ffd700"; // gold
    if (rank === 1) return "#c0c0c0"; // silver
    if (rank === 2) return "#cd7f32"; // bronze
    return "#9fb8a8";
  };

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>TD Pool</h1>
      <p className="subtitle">
        Season Standings
        {gradedCount > 0 && ` · ${gradedCount} games graded`}
      </p>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p>Loading standings...</p>
      ) : standings.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>No players yet.</p>
        </div>
      ) : gradedCount === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: "#9fb8a8" }}>
            No games have been graded yet. Standings will appear here once
            games are marked final.
          </p>
        </div>
      ) : (
        standings.map((player, idx) => (
          <div
            key={player.id}
            className="card"
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border:
                idx < 3
                  ? `1px solid ${medalColor(idx)}`
                  : "1px solid #234431",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: medalColor(idx),
                  color: "#05170c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>
              <div>
                <strong>{player.name}</strong>
                <div style={{ fontSize: 13, color: "#9fb8a8" }}>
                  {player.correct} correct of {player.graded} graded
                  {player.hasTiebreakerData && (
                    <span> · tiebreaker off by {player.tiebreakerDiff}</span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{player.pct}%</div>
          </div>
        ))
      )}
    </div>
  );
}
