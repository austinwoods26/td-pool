import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase-server";

const ADMIN_EMAILS = ["austin.woods5526@gmail.com"];

export async function POST(req) {
  try {
    const { email, newPassword } = await req.json();

    if (!email || !newPassword) {
      return Response.json(
        { error: "Email and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return Response.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 }
      );
    }

    // --- Verify the person calling this is actually logged in as the admin ---
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const {
      data: { user: requester },
      error: requesterError,
    } = await anonClient.auth.getUser(token);

    if (requesterError || !requester) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    if (!ADMIN_EMAILS.includes((requester.email || "").toLowerCase())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    // --- Use the service role key to find and update the target player ---
    const supabase = createServiceClient();
    const targetEmail = email.toLowerCase().trim();

    // Look through all auth users for a matching email.
    // (Supabase's admin API doesn't support a direct "get user by email"
    // lookup, so we page through listUsers and filter.)
    let targetUser = null;
    let page = 1;
    const perPage = 200;

    while (!targetUser) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        return Response.json({ error: listError.message }, { status: 500 });
      }

      targetUser = data.users.find(
        (u) => (u.email || "").toLowerCase() === targetEmail
      );

      if (targetUser || data.users.length < perPage) break;
      page++;
    }

    if (!targetUser) {
      return Response.json(
        { error: `No player found with email ${email}.` },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword }
    );

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
