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
      home_team_abbr: home?.team?.abbreviation || null,
      away_team_abbr: away?.team?.abbreviation || null,
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

// How many weeks are in each season type, per ESPN's actual calendar.
// 1 = preseason, 2 = regular season, 3 = postseason
//
// Preseason: week 1 = Hall of Fame Game, weeks 2-4 = the "real" preseason
// (what most fans think of as Preseason Weeks 1-3)
//
// Postseason: 1 = Wild Card, 2 = Divisional, 3 = Conference Championship,
// 4 = Pro Bowl (not a real matchup — skip this one), 5 = Super Bowl
export const SEASON_WEEK_LIMITS = {
  1: 4,
  2: 18,
  3: 5,
};

// Weeks within a season type that don't have a real pick'em matchup
// (exhibitions, all-star games) and should be skipped over automatically.
export const SKIP_WEEKS = {
  3: [4], // postseason week 4 = Pro Bowl
};

export function getNextWeek(seasontype, week) {
  const limit = SEASON_WEEK_LIMITS[seasontype];
  let next;

  if (week < limit) {
    next = { seasontype, week: week + 1 };
  } else if (seasontype === 2) {
    // Regular season just ended — the pool doesn't track postseason,
    // so stay put instead of rolling into playoff weeks
    return { seasontype, week };
  } else if (seasontype < 3) {
    next = { seasontype: seasontype + 1, week: 1 };
  } else {
    return { seasontype, week };
  }

  if (SKIP_WEEKS[next.seasontype]?.includes(next.week)) {
    return getNextWeek(next.seasontype, next.week);
  }

  return next;
}

export function getPreviousWeek(seasontype, week) {
  let prev;

  if (week > 1) {
    prev = { seasontype, week: week - 1 };
  } else if (seasontype > 1) {
    const prevType = seasontype - 1;
    prev = { seasontype: prevType, week: SEASON_WEEK_LIMITS[prevType] };
  } else {
    return null;
  }

  if (SKIP_WEEKS[prev.seasontype]?.includes(prev.week)) {
    return getPreviousWeek(prev.seasontype, prev.week);
  }

  return prev;
}
