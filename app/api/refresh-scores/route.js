import { NextResponse } from "next/server";
import { fetchEspnWeek, getPreviousWeek, getNextWeek } from "../../../lib/espn";
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

  const currentEspnWeek = config.espn_week;
  const currentPoolWeek = config.pool_week;

  try {
    let refreshed = 0;

    // Refresh whatever week the config currently points at (the week whose
    // games haven't been "closed out" yet)
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

    // Also refresh last week, in case a late game finished after the last run
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

    // Check whether the ACTIVE pool week (the one currently open for picks)
    // is entirely finished. If so, and next week hasn't been loaded yet,
    // advance immediately instead of waiting for Tuesday's scheduled sync.
    // This matters for short weeks (e.g. a single Thursday game) where
    // waiting days for the weekly cron would leave players with nothing
    // to pick in the meantime.
    let advanced = false;
    const activePoolWeek = currentPoolWeek;

    const { data: activeWeekGames } = await supabase
      .from("games")
      .select("is_final")
      .eq("week", activePoolWeek);

    const activeWeekComplete =
      activeWeekGames &&
      activeWeekGames.length > 0 &&
      activeWeekGames.every((g) => g.is_final);

    if (activeWeekComplete) {
      const next = getNextWeek(config.seasontype, config.espn_week);
      const nextPoolWeek = currentPoolWeek + 1;

      // Only advance if we haven't already loaded next week's games
      const { data: alreadyLoaded } = await supabase
        .from("games")
        .select("id")
        .eq("week", nextPoolWeek)
        .limit(1);

      const nextWeekIsNew = next.seasontype !== config.seasontype || next.week !== config.espn_week;

      if ((!alreadyLoaded || alreadyLoaded.length === 0) && nextWeekIsNew) {
        const nextGames = await fetchEspnWeek(next.week, config.year, next.seasontype);
        const nextRows = nextGames.map((g) => ({
          ...g,
          week: nextPoolWeek,
        }));

        if (nextRows.length > 0) {
          await supabase.from("games").upsert(nextRows, { onConflict: "espn_game_id" });
        }

        await supabase
          .from("sync_config")
          .update({
            pool_week: nextPoolWeek,
            espn_week: next.week,
            seasontype: next.seasontype,
            updated_at: new Date().toISOString(),
          })
          .eq("id", 1);

        advanced = true;
      }
    }

    return NextResponse.json({ success: true, refreshed, advanced });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
