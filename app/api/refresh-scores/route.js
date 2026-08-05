import { NextResponse } from "next/server";
import { fetchEspnWeek, getPreviousWeek } from "../../../lib/espn";
import { createServiceClient } from "../../../lib/supabase-server";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: config, error: configError } = await supabase
    .from("sync_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { error: "No sync_config found." },
      { status: 400 }
    );
  }

  // The config tracks the NEXT week to sync, so the "current" (just-played)
  // week is one behind that
  const currentEspnWeek = config.espn_week;
  const currentPoolWeek = config.pool_week;

  try {
    let refreshed = 0;

    // Refresh whatever week the config currently points at (covers the
    // week that's actively being played)
    const currentGames = await fetchEspnWeek(
      currentEspnWeek,
      config.year,
      config.seasontype
    );
    const currentRows = currentGames.map((g) => ({
      ...g,
      week: currentPoolWeek,
    }));
    if (currentRows.length > 0) {
      await supabase.from("games").upsert(currentRows, { onConflict: "espn_game_id" });
      refreshed += currentRows.length;
    }

    // Also refresh last week, in case a late game (e.g. Monday night)
    // finished after the weekly cron already moved on
    const prev = getPreviousWeek(config.seasontype, config.espn_week);
    if (prev) {
      const prevGames = await fetchEspnWeek(prev.week, config.year, prev.seasontype);
      const prevRows = prevGames.map((g) => ({
        ...g,
        week: currentPoolWeek - 1,
      }));
      if (prevRows.length > 0) {
        await supabase.from("games").upsert(prevRows, { onConflict: "espn_game_id" });
        refreshed += prevRows.length;
      }
    }

    return NextResponse.json({ success: true, refreshed });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
