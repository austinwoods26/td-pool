import { NextResponse } from "next/server";
import { createServiceClient } from "../../../lib/supabase-server";
import { sendEmail } from "../../../lib/email";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    const now = Date.now();
    // Games whose kickoff is between 11 and 12 hours from now -- since
    // this runs hourly, each game passes through this window exactly once,
    // right around the "12 hours before kickoff" mark
    const windowStart = new Date(now + 11 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now + 12 * 60 * 60 * 1000).toISOString();

    const { data: upcomingGames } = await supabase
      .from("games")
      .select("id, week, home_team, away_team, kickoff_time")
      .gte("kickoff_time", windowStart)
      .lt("kickoff_time", windowEnd);

    if (!upcomingGames || upcomingGames.length === 0) {
      return NextResponse.json({ success: true, remindersSent: 0, note: "No games in the 12-hour window" });
    }

    const { data: players } = await supabase.from("players").select("id, name, email");
    const gameIds = upcomingGames.map((g) => g.id);

    const { data: existingPicks } = await supabase
      .from("picks")
      .select("player_id, game_id")
      .in("game_id", gameIds);

    // Build a map of player -> games they're missing in this batch
    const missingByPlayer = {};
    for (const player of players || []) {
      const missingGames = upcomingGames.filter(
        (g) => !(existingPicks || []).some((p) => p.player_id === player.id && p.game_id === g.id)
      );
      if (missingGames.length > 0) {
        missingByPlayer[player.id] = { player, missingGames };
      }
    }

    let remindersSent = 0;

    for (const { player, missingGames } of Object.values(missingByPlayer)) {
      const gameList = missingGames
        .map((g) => `<li>${g.away_team} @ ${g.home_team} (Week ${g.week})</li>`)
        .join("");

      await sendEmail({
        to: player.email,
        subject: `⏰ TD Pool: You haven't picked ${missingGames.length > 1 ? "these games" : "this game"} yet!`,
        html: `
          <h2>Don't forget to make your picks!</h2>
          <p>Hi ${player.name}, these games lock in about 12 hours and you haven't picked yet:</p>
          <ul>${gameList}</ul>
          <p><a href="https://www.thetdpool.com/picks">Make your picks now →</a></p>
        `,
      });

      remindersSent += 1;
    }

    return NextResponse.json({ success: true, remindersSent });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
