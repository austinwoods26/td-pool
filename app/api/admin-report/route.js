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

  // Supabase/PostgREST only returns up to 1000 rows per request by default
  // -- it does NOT error when there's more, it just silently truncates.
  // This pages through with .range() until every row has been fetched, so
  // the report stays correct no matter how big the picks table gets.
  async function fetchAllRows(table, select, applyFilters) {
    const pageSize = 1000;
    let from = 0;
    let allRows = [];

    while (true) {
      let query = supabase.from(table).select(select);
      if (applyFilters) query = applyFilters(query);
      query = query.range(from, from + pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;

      allRows = allRows.concat(data || []);

      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  }

  try {
    const players = await fetchAllRows("players", "id, name, email");
    const allGames = await fetchAllRows(
      "games",
      "id, week, home_team, away_team, home_score, away_score, is_final, kickoff_time",
      (query) => query.order("kickoff_time", { ascending: true })
    );

    const distinctWeeks = [...new Set((allGames || []).map((g) => g.week))].sort((a, b) => a - b);
    const finalGames = (allGames || []).filter((g) => g.is_final);
    const gameIds = finalGames.map((g) => g.id);
    const safeIds = gameIds.length > 0 ? gameIds : ["00000000-0000-0000-0000-000000000000"];

    const allPicks = await fetchAllRows(
      "picks",
      "player_id, game_id, picked_team",
      (query) =>
        query
          .in("game_id", safeIds)
          .order("player_id", { ascending: true })
          .order("game_id", { ascending: true })
    );

    const winners = {};
    finalGames.forEach((g) => {
      winners[g.id] =
        g.home_score === g.away_score
          ? null
          : g.home_score > g.away_score
          ? g.home_team
          : g.away_team;
    });

    // ---- Sheet 1: Season Standings (covers every week regardless) ----
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

    // ---- Sheet 2: results for the last FULLY COMPLETED week --------
    const completedWeeks = distinctWeeks.filter((w) => {
      const wg = (allGames || []).filter((g) => g.week === w);
      return wg.length > 0 && wg.every((g) => g.is_final);
    });
    const reportWeek =
      completedWeeks.length > 0
        ? completedWeeks[completedWeeks.length - 1]
        : distinctWeeks[distinctWeeks.length - 1];

    const weekGames = (allGames || []).filter((g) => g.week === reportWeek);

    const weekPlayerWins = (players || []).map((player) => {
      let wins = 0;
      weekGames.forEach((g) => {
        const pick = (allPicks || []).find(
          (pk) => pk.player_id === player.id && pk.game_id === g.id
        );
        const winner = winners[g.id];
        if (pick && winner && pick.picked_team === winner) wins += 1;
      });
      return { id: player.id, name: player.name, wins };
    });

    const topWeekScore = Math.max(0, ...weekPlayerWins.map((p) => p.wins));
    const weekFullyDecided = weekGames.length > 0 && weekGames.every((g) => g.is_final);

    // Weekly winner = most wins. If more than one player is tied on wins,
    // whoever's tiebreaker guess is closest to the actual combined score of
    // the week's last game (by kickoff) wins outright; equally close = tie.
    const tiedAtTop =
      topWeekScore > 0 ? weekPlayerWins.filter((p) => p.wins === topWeekScore) : [];
    let weekWinners = tiedAtTop.map((p) => p.name);
    let decidedByTiebreaker = false;
    let actualTotal = null;

    if (tiedAtTop.length > 1 && weekFullyDecided) {
      const lastGame = weekGames[weekGames.length - 1];
      if (
        lastGame &&
        lastGame.home_score !== null &&
        lastGame.away_score !== null
      ) {
        actualTotal = lastGame.home_score + lastGame.away_score;

        const weekTiebreakers = await fetchAllRows(
          "tiebreakers",
          "player_id, guessed_total",
          (query) => query.eq("week", reportWeek)
        );

        const withDiff = tiedAtTop.map((p) => {
          const tb = weekTiebreakers.find((t) => t.player_id === p.id);
          return {
            ...p,
            diff: tb ? Math.abs(tb.guessed_total - actualTotal) : Infinity,
          };
        });
        const minDiff = Math.min(...withDiff.map((p) => p.diff));
        weekWinners = withDiff.filter((p) => p.diff === minDiff).map((p) => p.name);
        decidedByTiebreaker = weekWinners.length < tiedAtTop.length;
      }
    }

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(weekData), `Week ${reportWeek}`);
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
            <p style="margin:4px 0 0 0;color:#555;">${topWeekScore} correct picks in Week ${reportWeek}${
              decidedByTiebreaker
                ? ` &middot; won on the tiebreaker (actual combined score: ${actualTotal})`
                : tiedAtTop.length > 1 && weekWinners.length > 1
                ? " &middot; tied on the tiebreaker too"
                : ""
            }</p>
          </div>
        `;
      } else {
        winnerBanner = `
          <div style="background:#fff8e1;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h3 style="margin:0;">Leading Week ${reportWeek} so far: ${weekWinners.join(", ")} (${topWeekScore} correct)</h3>
            <p style="margin:4px 0 0 0;color:#555;">Not all games have finished yet, so this could still change.</p>
          </div>
        `;
      }
    }

    // ---- Send: one individual email per player, instead of a single ----
    // ---- email with everyone bcc'd. A "to: one address, bcc: a big  ----
    // ---- list" pattern is a classic bulk-mail fingerprint that spam ----
    // ---- filters (Gmail especially) tend to flag -- sending each    ----
    // ---- player their own message looks like normal mail and lands ----
    // ---- reliably in the inbox instead.                             ----
    const recipients = (players || []).filter((p) => p.email);

    const buildHtml = (player) => `
      <p>Hi ${player.name || "there"},</p>
      <h2>TD Pool Weekly Report</h2>
      ${winnerBanner}
      <p><strong>Season standings (top 3):</strong><br>${topThree}</p>
      <p>Full standings and this week's results are attached as an Excel file.</p>
      <p><a href="https://www.thetdpool.com/standings">View full standings on the site →</a></p>
    `;

    const results = await Promise.allSettled(
      recipients.map((player, idx) =>
        // A small stagger between sends is gentle on Resend's rate limit
        // and doesn't meaningfully slow this down for a handful of players.
        new Promise((resolve) => setTimeout(resolve, idx * 150)).then(() =>
          sendEmail({
            to: player.email,
            subject: `TD Pool Weekly Report — Week ${reportWeek}`,
            html: buildHtml(player),
            attachments: [
              {
                filename: `TD_Pool_Report_Week${reportWeek}.xlsx`,
                content: base64,
              },
            ],
          })
        )
      )
    );

    const failed = results
      .map((r, idx) => ({ r, email: recipients[idx]?.email }))
      .filter((x) => x.r.status === "rejected");

    if (failed.length > 0) {
      console.error(
        "Weekly report failed to send to:",
        failed.map((f) => `${f.email}: ${f.r.reason}`).join("; ")
      );
    }

    return NextResponse.json({
      success: true,
      reportWeek,
      sentTo: recipients.length - failed.length,
      failedCount: failed.length,
      failedEmails: failed.map((f) => f.email),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
