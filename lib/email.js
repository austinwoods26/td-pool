export async function sendEmail({ to, bcc, subject, html, attachments }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TD Pool <picks@thetdpool.com>",
      to: Array.isArray(to) ? to : [to],
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      subject,
      html,
      ...(attachments ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error (${res.status}): ${text}`);
  }

  return res.json();
}
