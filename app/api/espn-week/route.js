import { NextResponse } from "next/server";
import { fetchEspnWeek } from "../../../lib/espn";

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

  try {
    const games = await fetchEspnWeek(week, year, seasontype);
    return NextResponse.json({ games });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
