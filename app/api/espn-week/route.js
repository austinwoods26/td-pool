import { NextResponse } from "next/server";

// ESPN's public (unofficial) scoreboard endpoint.
// seasontype: 1 = preseason, 2 = regular season, 3 = postseason
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");
  const year = searchParams.get("year");
  const seasontype = searchParams.get("seasontype") || "2";

  if (!week || !year) {
    return NextResponse.json(
      { error: "week and year are required" },
      { status: 400 }
    );
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=${seasontype}&week=${week}`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json(
        { error: `ESPN request failed with status ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    const games = (data.events || []).map((event) => {
      const competition = event.competitions[0];
      const home = competition.competitors.find((c) => c.homeAway === "home");
      const away = competition.competitors.find((c) => c.homeAway === "away");
      const odds = competition.odds?.[0];

      return {
        espn_game_id: event.id,
        home_team: home?.team?.displayName || "TBD",
        away_team: away?.team?.displayName || "TBD",
        home_team_logo: home?.team?.logo || null,
        away_team_logo: away?.team?.logo || null,
        kickoff_time: event.date, // already ISO format
        home_score: home?.score ? parseInt(home.score, 10) : null,
        away_score: away?.score ? parseInt(away.score, 10) : null,
        is_final: competition.status?.type?.completed || false,
        odds_summary: odds?.details || null,
      };
    });

    return NextResponse.json({ games });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
