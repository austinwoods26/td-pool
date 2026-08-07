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
  const [tiebreakers, setTiebreakers] = useState([]);
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
    if (selectedWeek !== null) loadBoard();
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
    const safeIds = gameIds.length > 0 ? gameIds : ["00000000-0000-0000-0000-000000000000"];

    const { data: weekPicks } = await supabase
      .from("picks")
      .select("player_id, game_id, picked_team")
      .in("game_id", safeIds);

    const { data: weekTiebreakers } = await supabase
      .from("tiebreakers")
      .select("player_id, guessed_total")
      .eq("week", selectedWeek);

    setGames(weekGames || []);
    setPlayers(allPlayers || []);
    setPicks(weekPicks || []);
    setTiebreakers(weekTiebreakers || []);
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

  const rows = players.map((p) => {
    let wins = 0;
    const cells = lockedGames.map((g) => {
      const pick = picks.find((pk) => pk.player_id === p.id && pk.game_id === g.id);
      let status = "pending";

      if (g.is_final && g.home_score !== null && g.away_score !== null) {
        const winner =
          g.home_score === g.away_score
            ? null
            : g.home_score > g.away_score
            ? g.home_team
            : g.away_team;

        if (winner === null) {
          status = "pending";
        } else if (pick && pick.picked_team === winner) {
          status = "correct";
          wins += 1;
        } else {
          status = "wrong";
        }
      }

      const logo =
        pick?.picked_team === g.home_team
          ? g.home_team_logo
          : pick?.picked_team === g.away_team
          ? g.away_team_logo
          : null;

      return { status, logo };
    });

    const tb = tiebreakers.find((t) => t.player_id === p.id);

    return { id: p.id, name: p.name, cells, tb: tb?.guessed_total ?? "—", wins };
  });

  rows.sort((a, b) => b.wins - a.wins);

  const cellBorder = (status) => {
    if (status === "correct") return "#22c55e";
    if (status === "wrong") return "#7f1d1d";
    return "#234431";
  };
  const cellBg = (status) => {
    if (status === "correct") return "#14301f";
    if (status === "wrong") return "#3a1414";
    return "transparent";
  };

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <h1>TD Pool</h1>
      <p className="subtitle">Weekly Results</p>

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
            No games have locked yet for this week. The grid fills in once
            each game is 15 minutes from kickoff.
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
                    minWidth: 120,
                  }}
                >
                  Player
                </th>
                {lockedGames.map((g) => (
                  <th
                    key={g.id}
                    style={{
                      padding: "8px 6px",
                      borderBottom: "2px solid #234431",
                      borderLeft: "1px solid #234431",
                      minWidth: 70,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.away_team_abbr || g.away_team} vs{" "}
                    {g.home_team_abbr || g.home_team}
                  </th>
                ))}
                <th
                  style={{
                    padding: "8px 6px",
                    borderBottom: "2px solid #234431",
                    borderLeft: "1px solid #234431",
                    minWidth: 50,
                    textAlign: "center",
                  }}
                >
                  TB
                </th>
                <th
                  style={{
                    padding: "8px 6px",
                    borderBottom: "2px solid #234431",
                    borderLeft: "1px solid #234431",
                    minWidth: 60,
                    textAlign: "center",
                  }}
                >
                  Wins
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "#0b1f14",
                      padding: "8px 12px",
                      borderBottom: "1px solid #234431",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.name}
                  </td>
                  {row.cells.map((cell, idx) => (
                    <td
                      key={idx}
                      style={{
                        padding: "6px",
                        textAlign: "center",
                        background: cellBg(cell.status),
                        border: `1px solid ${cellBorder(cell.status)}`,
                      }}
                    >
                      {cell.logo ? (
                        <img src={cell.logo} alt="" style={{ width: 22, height: 22 }} />
                      ) : (
                        <span style={{ color: "#9fb8a8" }}>—</span>
                      )}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "center",
                      borderBottom: "1px solid #234431",
                      borderLeft: "1px solid #234431",
                    }}
                  >
                    {row.tb}
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "center",
                      borderBottom: "1px solid #234431",
                      borderLeft: "1px solid #234431",
                      fontWeight: 700,
                    }}
                  >
                    {row.wins}
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
