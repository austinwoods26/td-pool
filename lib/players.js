export async function ensurePlayerRecord(supabase, session) {
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("email", session.user.email)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      email: session.user.email,
      name: session.user.user_metadata?.name || session.user.email,
    })
    .select("id")
    .single();

  if (error) return null;
  return created;
}
