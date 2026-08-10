export async function getCurrentWeek(supabase) {
  const { data } = await supabase
    .from("games")
    .select("week")
    .order("week", { ascending: false })
    .limit(1)
    .single();

  return data?.week ?? null;
}
