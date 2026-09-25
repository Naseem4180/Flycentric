// Plain, dependency-free email rendering — one function per `template` value
// used in enqueueMail() calls across the app. Each returns { html, text }.
// Deliberately simple inline-styled HTML (no build step, no external CSS)
// so it renders consistently across email clients.

function wrap(bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8f9fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eef2f6;">
          <tr><td style="padding:22px 28px;border-bottom:1px solid #eef2f6;">
            <span style="font-size:18px;font-weight:800;color:#0f172a;">Fly<span style="color:#3b82f6;">Centric</span></span>
          </td></tr>
          <tr><td style="padding:28px;">
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:18px 28px;background:#fbfcfe;border-top:1px solid #eef2f6;">
            <span style="font-size:12px;color:#94a3b8;">FlyCentric · New Delhi, India · support@flycentric.in</span>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function btn(url, label) {
  return `<a href="${url}" style="display:inline-block;margin-top:18px;padding:11px 22px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">${label}</a>`;
}

const RENDERERS = {
  'password-reset': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;">Reset your password</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">We received a request to reset your FlyCentric password. This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email.</p>
      ${btn(data.resetLink, 'Reset password')}
    `),
    text: `Reset your FlyCentric password: ${data.resetLink}\n\nThis link expires in 1 hour and can only be used once. If you didn't request this, you can ignore this email.`,
  }),

  'payment-receipt': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;">Payment received</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;">Hi ${data.name || 'there'}, thanks for your purchase — you now have access to <strong>${data.bundleTitle}</strong>.</p>
      <table role="presentation" width="100%" style="margin-top:12px;border-top:1px solid #eef2f6;padding-top:12px;">
        <tr><td style="color:#94a3b8;font-size:13px;padding:4px 0;">Receipt ID</td><td align="right" style="font-size:13px;color:#0f172a;">${data.paymentId}</td></tr>
        <tr><td style="color:#94a3b8;font-size:13px;padding:4px 0;">Amount paid</td><td align="right" style="font-size:13px;font-weight:700;color:#0f172a;">₹${Number(data.amountInr || 0).toLocaleString('en-IN')}</td></tr>
      </table>
    `),
    text: `Payment received. Receipt ${data.paymentId} — ₹${data.amountInr} for ${data.bundleTitle}.`,
  }),

  're-engagement': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;">We miss you, ${data.name || 'there'}</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">It's been a week since your last study session. Your syllabus progress is still saved — pick up right where you left off.</p>
      ${btn(process.env.CLIENT_URL || 'http://localhost:5173', 'Continue studying')}
    `),
    text: `We miss you at FlyCentric, ${data.name || 'there'}. Come back and continue where you left off: ${process.env.CLIENT_URL || 'http://localhost:5173'}`,
  }),

  'progress-report': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;">Your weekly progress, ${data.name || 'there'}</h2>
      <table role="presentation" width="100%" style="margin-top:8px;">
        ${(data.chapters || []).map((c) => `
          <tr>
            <td style="padding:6px 0;border-bottom:1px solid #eef2f6;font-size:13px;color:#0f172a;">${c.subject} – ${c.chapter}</td>
            <td align="right" style="padding:6px 0;border-bottom:1px solid #eef2f6;font-size:13px;color:#475569;">${c.completion_percent}% · ${c.score}</td>
          </tr>`).join('')}
      </table>
    `),
    text: data.summaryText || 'Your weekly FlyCentric progress report.',
  }),

  birthday: (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;">🎂 ${data.name ? `Happy Birthday, ${data.name}!` : 'Happy Birthday!'}</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">${data.message}</p>
      <p style="color:#94a3b8;font-size:13px;margin-top:16px;">— ${data.branding || 'FlyCentric Team'}</p>
    `),
    text: `${data.message}\n\n— ${data.branding || 'FlyCentric Team'}`,
  }),

  'bulk-campaign': (data) => ({
    html: wrap(`
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">Hi ${data.name || 'there'},</p>
      <div style="color:#0f172a;font-size:14px;line-height:1.6;margin-top:10px;white-space:pre-wrap;">${data.body || ''}</div>
    `),
    text: `Hi ${data.name || 'there'},\n\n${data.body || ''}`,
  }),
};

// Anything without a specific renderer still gets a readable fallback
// instead of the send silently failing on an unknown template.
function renderEmail(template, data = {}) {
  const renderer = RENDERERS[template];
  if (renderer) return renderer(data);
  return {
    html: wrap(`<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#0f172a;">${JSON.stringify(data, null, 2)}</pre>`),
    text: JSON.stringify(data, null, 2),
  };
}

module.exports = { renderEmail };
