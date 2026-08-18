import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceClient } from "../../../lib/supabase-server";
import { sendEmail } from "../../../lib/email";

const ADMIN_EMAIL = "austin.woods5526@gmail.com";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    const { data: players } = await supabase.from("players").select("id, name");
    const { data: allGames } = await supabase
      .from("games")
      .select("id, week, home_team, away_team, home_score, away_score, is_final, kickoff_time")
      .order("kickoff_time", { ascending: true });

    const distinctWeeks = [...new Set((allGames || []).map((g) => g.week))].sort((a, b) => a - b);
    const finalGames = (allGames || []).filter((g) => g.is_final);
    const gameIds = finalGames.map((g) => g.id);
    const safeIds = gameIds.length > 0 ? gameIds : ["00000000-0000-0000-0000-000000000000"];

    const { data: allPicks } = await supabase
      .from("picks")
      .select("player_id, game_id, picked_team")
      .in("game_id", safeIds);

    const winners = {};
    finalGames.forEach((g) => {
      winners[g.id] =
        g.home_score === g.away_score
          ? null
          : g.home_score > g.away_score
          ? g.home_team
          : g.away_team;
    });

    // ---- Sheet 1: Season Standings ----
    const standingsRows = (players || []).map((player) => {
      const weekWins = {};
      let total = 0;
      distinctWeeks.forEach((w) => {
        const weekGameIds = finalGames.filter((g) => g.week === w).map((g) => g.id);
        const wins = (allPicks || []).filter(
          (pk) =>
            pk.player_id === player.id &&
            weekGameIds.includes(pk.game_id) &&
            winners[pk.game_id] &&
            pk.picked_team === winners[pk.game_id]
        ).length;
        weekWins[w] = wins;
        total += wins;
      });
      return { name: player.name, weekWins, total };
    });
    standingsRows.sort((a, b) => b.total - a.total);

    const standingsHeader = ["Rank", "Player", ...distinctWeeks.map((w) => `Week ${w}`), "Total"];
    const standingsData = [
      standingsHeader,
      ...standingsRows.map((r, idx) => [
        idx + 1,
        r.name,
        ...distinctWeeks.map((w) => r.weekWins[w]),
        r.total,
      ]),
    ];

    // ---- Sheet 2: This week's results (most recent week with games) ----
    const currentWeek = distinctWeeks[distinctWeeks.length - 1];
    const weekGames = (allGames || []).filter((g) => g.week === currentWeek);

    const weekPlayerWins = (players || []).map((player) => {
      let wins = 0;
      weekGames.forEach((g) => {
        const pick = (allPicks || []).find(
          (pk) => pk.player_id === player.id && pk.game_id === g.id
        );
        const winner = winners[g.id];
        if (pick && winner && pick.picked_team === winner) wins += 1;
      });
      return { name: player.name, wins };
    });

    const topWeekScore = Math.max(0, ...weekPlayerWins.map((p) => p.wins));
    const weekWinners =
      topWeekScore > 0
        ? weekPlayerWins.filter((p) => p.wins === topWeekScore).map((p) => p.name)
        : [];
    const weekFullyDecided = weekGames.length > 0 && weekGames.every((g) => g.is_final);

    const weekHeader = [
      "Player",
      ...weekGames.map((g) => `${g.away_team} @ ${g.home_team}`),
      "Wins This Week",
    ];
    const weekData = [
      weekHeader,
      ...(players || []).map((player) => {
        const cells = weekGames.map((g) => {
          const pick = (allPicks || []).find(
            (pk) => pk.player_id === player.id && pk.game_id === g.id
          );
          return pick ? pick.picked_team : "—";
        });
        const winsForPlayer = weekPlayerWins.find((p) => p.name === player.name)?.wins ?? 0;
        return [player.name, ...cells, winsForPlayer];
      }),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(standingsData), "Season Standings");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weekData), `Week ${currentWeek}`);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const base64 = buffer.toString("base64");

    const topThree = standingsRows
      .slice(0, 3)
      .map((r, idx) => `${idx + 1}. ${r.name} — ${r.total} correct`)
      .join("<br>");

    let winnerBanner = "";
    if (weekWinners.length > 0) {
      if (weekFullyDecided) {
        winnerBanner = `
          <div style="background:#14301f;border:1px solid #22c55e;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h2 style="margin:0;color:#22c55e;">🏆 This week's winner${weekWinners.length > 1 ? "s were" : " was"} ${weekWinners.join(", ")}, Congrats!</h2>
            <p style="margin:4px 0 0 0;color:#555;">${topWeekScore} correct picks in Week ${currentWeek}</p>
          </div>
        `;
      } else {
        winnerBanner = `
          <div style="background:#fff8e1;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h3 style="margin:0;">Leading Week ${currentWeek} so far: ${weekWinners.join(", ")} (${topWeekScore} correct)</h3>
            <p style="margin:4px 0 0 0;color:#555;">Not all games have finished yet, so this could still change.</p>
          </div>
        `;
      }
    }

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `TD Pool Weekly Report — Week ${currentWeek}`,
      html: `
        <h2>TD Pool Weekly Report</h2>
        ${winnerBanner}
        <p><strong>Season standings (top 3):</strong><br>${topThree}</p>
        <p>Full standings and this week's results are attached as an Excel file.</p>
      `,
      attachments: [
        {
          filename: `TD_Pool_Report_Week${currentWeek}.xlsx`,
          content: base64,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
