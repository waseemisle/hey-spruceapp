const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://groundopscos.vercel.app';
const LOGO_URL = `${APP_URL}/logo.png`;
const YEAR = new Date().getFullYear();

export function emailLayout({
  title,
  preheader = '',
  body,
}: {
  title: string;
  preheader?: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#EDE7DC;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ''}

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDE7DC;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(8,15,23,0.12);">

          <!-- Header -->
          <tr>
            <td style="background-color:#0D1520;padding:20px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="GroundOps" style="max-height:52px;width:auto;display:inline-block;" />
            </td>
          </tr>

          <!-- Title banner -->
          <tr>
            <td style="background-color:#2563EB;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">${title}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;color:#1A2635;font-size:15px;line-height:1.6;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0D1520;padding:24px 32px;text-align:center;">
              <p style="margin:0 0 8px 0;color:#93C5FD;font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">GroundOps</p>
              <p style="margin:0 0 8px 0;color:#8A9CAB;font-size:12px;">Facility Maintenance Infrastructure</p>
              <p style="margin:0;color:#5A6C7A;font-size:11px;">
                <a href="mailto:info@groundops.co" style="color:#93C5FD;text-decoration:none;">info@groundops.co</a>
                &nbsp;·&nbsp;
                <a href="https://www.groundops.co" style="color:#93C5FD;text-decoration:none;">groundops.co</a>
              </p>
              <p style="margin:12px 0 0 0;color:#5A6C7A;font-size:11px;">© ${YEAR} GroundOps LLC. All rights reserved.</p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Reusable styled components */

export function infoCard(html: string): string {
  return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #2563EB;border-radius:6px;padding:20px 24px;margin:20px 0;">${html}</div>`;
}

export function infoRow(label: string, value: string): string {
  return `<p style="margin:6px 0;font-size:14px;color:#1A2635;"><span style="color:#5A6C7A;font-weight:500;min-width:140px;display:inline-block;">${label}</span> <strong>${value}</strong></p>`;
}

export function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.2px;">${text}</a>
  </div>`;
}

export function alertBox(html: string, type: 'info' | 'success' | 'warning' = 'info'): string {
  const colors = {
    info:    { bg: '#EFF6FF', border: '#2563EB', text: '#1E40AF' },
    success: { bg: '#F0FDF4', border: '#16A34A', text: '#15803D' },
    warning: { bg: '#FFFBEB', border: '#D97706', text: '#92400E' },
  };
  const c = colors[type];
  return `<div style="background:${c.bg};border-left:4px solid ${c.border};border-radius:6px;padding:14px 18px;margin:20px 0;font-size:14px;color:${c.text};">${html}</div>`;
}

export function divider(): string {
  return `<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">`;
}

export function priorityBadge(priority: string): string {
  const map: Record<string, { bg: string; color: string }> = {
    high:   { bg: '#FEE2E2', color: '#DC2626' },
    urgent: { bg: '#FEE2E2', color: '#DC2626' },
    medium: { bg: '#FEF3C7', color: '#D97706' },
    low:    { bg: '#F0FDF4', color: '#16A34A' },
  };
  const s = map[priority?.toLowerCase()] || { bg: '#F1F5F9', color: '#475569' };
  const label = priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:0.5px;text-transform:uppercase;">${label}</span>`;
}
