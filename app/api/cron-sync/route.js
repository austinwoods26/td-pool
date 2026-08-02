import { NextResponse } from "next/server";
import { fetchEspnWeek } from "../../../lib/espn";
import { createServerClient } from "../../../lib/supabase-server";

export async function GET(request) {
  // Verify this request is really coming from Vercel's cron scheduler
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: config, error: configError } = await supabase
    .from("sync_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { error: "No sync_config found. Set one from the admin page first." },
      { status: 400 }
    );
  }

  try {
    // 1. Sync the upcoming week (new matchups, kickoff times, odds)
    const upcomingGames = await fetchEspnWeek(
      config.espn_week,
      config.year,
      config.seasontype
    );

    const upcomingRows = upcomingGames.map((g) => ({
      ...g,
      week: config.pool_week,
    }));

    if (upcomingRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("games")
        .upsert(upcomingRows, { onConflict: "espn_game_id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    // 2. Refresh final scores for LAST week too, since games finished since the last run
    let refreshedCount = 0;
    if (config.espn_week > 1) {
      const lastWeekGames = await fetchEspnWeek(
        config.espn_week - 1,
        config.year,
        config.seasontype
      );

      const lastWeekRows = lastWeekGames.map((g) => ({
        ...g,
        week: config.pool_week - 1,
      }));

      if (lastWeekRows.length > 0) {
        const { error: refreshError } = await supabase
          .from("games")
          .upsert(lastWeekRows, { onConflict: "espn_game_id" });

        if (refreshError) {
          return NextResponse.json({ error: refreshError.message }, { status: 500 });
        }
        refreshedCount = lastWeekRows.length;
      }
    }

    // Advance to next week for the following run
    await supabase
      .from("sync_config")
      .update({
        pool_week: config.pool_week + 1,
        espn_week: config.espn_week + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    return NextResponse.json({
      success: true,
      synced_new: upcomingRows.length,
      refreshed_last_week: refreshedCount,
      pool_week: config.pool_week,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
