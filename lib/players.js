export async function ensurePlayerRecord(supabase, session) {
  const email = session.user.email.toLowerCase();

  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("email", email)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      email,
      name: session.user.user_metadata?.name || email,
    })
    .select("id")
    .single();

  if (error) return null;
  return created;
}
