"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";
import { ensurePlayerRecord } from "../../lib/players";

const ADMIN_EMAILS = ["austin.woods5526@gmail.com"];

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [currentWeek, setCurrentWeek] = useState(null);
  const [pickedCount, setPickedCount] = useState(0);
  const [totalGames, setTotalGames] = useState(0);
  const [rank, setRank] = useState(null);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      const userEmail = data.session.user.email;
      setEmail(userEmail);
      await loadSnapshot(data.session);
      setChecking(false);
    }
    init();
  }, []);

  async function loadSnapshot(session) {
    const { data: config } = await supabase
      .from("sync_config")
      .select("pool_week")
      .eq("id", 1)
      .single();

    const week = config ? Math.max(config.pool_week - 1, 1) : null;
    setCurrentWeek(week);

    if (!week) return;

    const player = await ensurePlayerRecord(supabase, session);
    if (!player) return;

    const { data: weekGames } = await supabase
      .from("games")
      .select("id")
      .eq("week", week);

    setTotalGames(weekGames?.length || 0);

    if (weekGames && weekGames.length > 0) {
      const { data: existingPicks } = await supabase
        .from("picks")
        .select("id")
        .eq("player_id", player.id)
        .in("game_id", weekGames.map((g) => g.id));

      setPickedCount(existingPicks?.length || 0);
    }

    const { data: finalGames } = await supabase
      .from("games")
      .select("id, home_team, away_team, home_score, away_score")
      .eq("is_final", true);

    if (finalGames && finalGames.length > 0) {
      const { data: allPlayers } = await supabase.from("players").select("id");
      const { data: allPicks } = await supabase
        .from("picks")
        .select("player_id, game_id, picked_team")
        .in("game_id", finalGames.map((g) => g.id));

      const winners = {};
      finalGames.forEach((g) => {
        winners[g.id] =
          g.home_score === g.away_score
            ? null
            : g.home_score > g.away_score
            ? g.home_team
            : g.away_team;
      });

      const totals = (allPlayers || []).map((p) => {
        const correct = (allPicks || []).filter(
          (pk) =>
            pk.player_id === p.id &&
            winners[pk.game_id] &&
            pk.picked_team === winners[pk.game_id]
        ).length;
        return { id: p.id, correct };
      });

      totals.sort((a, b) => b.correct - a.correct);
      const myIndex = totals.findIndex((t) => t.id === player.id);
      if (myIndex !== -1) setRank(myIndex + 1);
    }
  }

  const isAdmin = ADMIN_EMAILS.includes(email);

  if (checking) {
    return (
      <div className="container">
        <p style={{ textAlign: "center" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#0b1f14",
        backgroundImage: "url('/dashboard-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="container" style={{ maxWidth: 640 }}>
        <div
          style={{
            background: "rgba(5, 15, 10, 0.5)",
            backdropFilter: "blur(6px)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 20,
          }}
        >
          <h1 style={{ margin: 0 }}>TD Pool</h1>
          <p className="subtitle" style={{ margin: "4px 0 0 0" }}>
            Welcome, {email}
          </p>
        </div>

        {currentWeek && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Week {currentWeek}</h3>
            {totalGames === 0 ? (
              <p style={{ margin: 0, color: "#9fb8a8" }}>
                No games posted for this week yet.
              </p>
            ) : pickedCount === totalGames ? (
              <p style={{ margin: 0, color: "#4ade80" }}>
                ✓ All {totalGames} picks submitted
              </p>
            ) : (
              <p style={{ margin: 0, color: "#fca5a5" }}>
                {pickedCount} of {totalGames} picks made — finish up before
                kickoff!
              </p>
            )}
            <button onClick={() => router.push("/picks")} style={{ marginTop: 16 }}>
              {pickedCount === totalGames && totalGames > 0
                ? "Review Picks"
                : "Make Picks"}
            </button>
          </div>
        )}

        {rank && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Your Standing</h3>
            <p style={{ margin: 0 }}>
              You&apos;re currently in <strong>#{rank}</strong> place for the
              season.
            </p>
            <button
              onClick={() => router.push("/standings")}
              style={{ background: "#234431", marginTop: 16 }}
            >
              View Full Standings
            </button>
          </div>
        )}

        {isAdmin && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Admin</h3>
            <p style={{ margin: 0, color: "#9fb8a8" }}>
              Manage games, sync ESPN data, and refresh scores.
            </p>
            <button
              onClick={() => router.push("/admin")}
              style={{ background: "#234431", marginTop: 16 }}
            >
              Go to Admin
            </button>
          </div>
        )}

        <p
          style={{
            fontSize: 11,
            color: "rgba(159,184,168,0.7)",
            textAlign: "center",
            marginTop: 24,
          }}
        >
          Background photo by Louis Briscese / Official Travis AFB, Calif.
          (CC BY-NC 2.0)
        </p>
      </div>
    </div>
  );
}
