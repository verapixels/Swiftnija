// functions/src/otpEmailTemplate.ts

export function buildOtpEmail(opts: {
  code: string;
  purpose: "email" | "phone";
  recipientName: string;
  expiryMinutes?: number;
}): { subject: string; html: string } {
  const {code, purpose, recipientName, expiryMinutes = 5} = opts;

  const firstName = recipientName.split(" ")[0] || "there";
  const purposeLabel = purpose === "email" ? "email address" : "phone number";
  const purposeEmoji = purpose === "email" ? "&#x2709;&#xFE0F;" : "&#x1F4F1;";

  const subject = purpose === "email" ?
    `${code} \u2014 Your Swiftnija email verification code` :
    `${code} \u2014 Your Swiftnija phone verification code`;

  const digitBoxes = code
    .split("")
    .map((d) => `
      <td style="padding:0 4px;">
        <div style="width:52px;height:60px;background:#0f0f18;border:1.5px solid #2a2a3a;border-radius:12px;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:900;color:#FF6B00;text-align:center;line-height:60px;display:inline-block;">${d}</div>
      </td>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Swiftnija Verification</title>
</head>
<body style="margin:0;padding:0;background:#09090c;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090c;padding:40px 16px 60px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- BRAND -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="width:42px;height:42px;background:linear-gradient(135deg,#FF6B00,#FF8C00);border-radius:13px;text-align:center;line-height:42px;font-size:20px;vertical-align:middle;">&#x1F6F5;</td>
            <td style="padding-left:10px;vertical-align:middle;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">swift<span style="color:#FF6B00;">nija</span></td>
          </tr></table>
        </td></tr>

        <!-- CARD -->
        <tr><td style="background:#111118;border:1px solid #1e1e2a;border-radius:22px;overflow:hidden;">
          <div style="height:4px;background:linear-gradient(90deg,#FF6B00,#FF8C00,#FFa040);"></div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:36px;">

            <!-- ICON + GREETING -->
            <tr><td align="center" style="padding-bottom:24px;">
              <div style="width:64px;height:64px;background:rgba(255,107,0,0.1);border:1.5px solid rgba(255,107,0,0.2);border-radius:20px;font-size:28px;text-align:center;line-height:64px;margin:0 auto 16px;">${purposeEmoji}</div>
              <div style="font-size:20px;font-weight:800;color:#ffffff;margin-bottom:8px;">Hi ${firstName} &#x1F44B;</div>
              <div style="font-size:14px;color:#55556a;line-height:1.6;">Here's your verification code to confirm your<br/><span style="color:#FF6B00;font-weight:700;">${purposeLabel}</span> on Swiftnija.</div>
            </td></tr>

            <!-- DIVIDER -->
            <tr><td style="padding-bottom:24px;"><div style="height:1px;background:#1e1e2a;"></div></td></tr>

            <!-- CODE LABEL -->
            <tr><td align="center" style="padding-bottom:14px;">
              <span style="font-size:10px;font-weight:800;color:#44445a;text-transform:uppercase;letter-spacing:1.2px;">Your 6-digit code</span>
            </td></tr>

            <!-- DIGITS -->
            <tr><td align="center" style="padding-bottom:18px;">
              <table cellpadding="0" cellspacing="0" border="0"><tr>${digitBoxes}</tr></table>
            </td></tr>

            <!-- EXPIRY -->
            <tr><td align="center" style="padding-bottom:24px;">
              <span style="font-size:12px;color:#44445a;font-weight:600;">Expires in <strong style="color:#e8e8f0;">${expiryMinutes} minutes</strong> &nbsp;&middot;&nbsp; One-time use only</span>
            </td></tr>

            <!-- WARNING -->
            <tr><td style="padding-bottom:24px;">
              <div style="background:rgba(255,107,0,0.05);border:1px solid rgba(255,107,0,0.12);border-radius:13px;padding:15px 17px;">
                <div style="font-size:11px;font-weight:800;color:#FF6B00;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">&#x1F512; Keep this code private</div>
                <div style="font-size:12px;color:#44445a;line-height:1.6;">Swiftnija will <strong style="color:#e8e8f0;">never</strong> ask for this code by phone or chat. If you didn't request this, safely ignore this email &mdash; your account is secure.</div>
              </div>
            </td></tr>

            <!-- DIVIDER -->
            <tr><td style="padding-bottom:22px;"><div style="height:1px;background:#1e1e2a;"></div></td></tr>

            <!-- BOTTOM NOTE -->
            <tr><td align="center">
              <div style="font-size:13px;color:#44445a;line-height:1.7;">Order from 500+ restaurants, pharmacies &amp; stores across Lagos &mdash; delivered in minutes. &#x1F680;</div>
            </td></tr>

          </table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td align="center" style="padding-top:28px;">
          <div style="height:1px;background:#1a1a22;margin-bottom:20px;"></div>
          <div style="font-size:13px;font-weight:800;color:#FF6B00;margin-bottom:6px;">Swiftnija</div>
          <div style="font-size:11px;color:#2a2a3a;line-height:1.6;">This is an automated message &mdash; please do not reply.<br/>Sent from Swiftnija &middot; Lagos, Nigeria</div>
          <div style="margin-top:10px;font-size:11px;color:#222230;">
            <a href="#" style="color:#333348;text-decoration:none;">Privacy Policy</a> &nbsp;&middot;&nbsp;
            <a href="#" style="color:#333348;text-decoration:none;">Terms of Service</a> &nbsp;&middot;&nbsp;
            <a href="#" style="color:#333348;text-decoration:none;">Help Centre</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {subject, html};
}
