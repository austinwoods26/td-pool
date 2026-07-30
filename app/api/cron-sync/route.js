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
    const games = await fetchEspnWeek(
      config.espn_week,
      config.year,
      config.seasontype
    );

    const rows = games.map((g) => ({
      ...g,
      week: config.pool_week,
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("games")
        .upsert(rows, { onConflict: "espn_game_id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
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
      synced: rows.length,
      pool_week: config.pool_week,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
