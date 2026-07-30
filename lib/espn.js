export async function fetchEspnWeek(week, year, seasontype) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=${seasontype}&week=${week}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`ESPN request failed with status ${res.status}`);
  }

  const data = await res.json();

  return (data.events || []).map((event) => {
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
      kickoff_time: event.date,
      home_score: home?.score ? parseInt(home.score, 10) : null,
      away_score: away?.score ? parseInt(away.score, 10) : null,
      is_final: competition.status?.type?.completed || false,
      odds_summary: odds?.details || null,
    };
  });
}
