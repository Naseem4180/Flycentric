// Plain, dependency-free email rendering — one function per `template` value
// used in enqueueMail() calls across the app. Each returns { html, text }.
// Deliberately simple inline-styled HTML (no build step, no external CSS)
// so it renders consistently across all email clients (Gmail, Outlook, Apple Mail, etc).

function wrap(bodyHtml, title = 'FlyCentric Aviation Academy') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f1f5f9;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06);border:1px solid #e2e8f0;">
          <!-- Top Header Banner -->
          <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);border-bottom:3px solid #3b82f6;">
            <table role="presentation" width="100%">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#ffffff;">FLY<span style="color:#38bdf8;">CENTRIC</span></span>
                  <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-top:2px;">Aviation Ground School & Pilot Training</div>
                </td>
                <td align="right">
                  <span style="display:inline-block;padding:4px 10px;background:rgba(255,255,255,0.1);border-radius:999px;font-size:11px;font-weight:700;color:#38bdf8;letter-spacing:0.04em;">DGCA CPL / ATPL</span>
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- Main Email Content -->
          <tr><td style="padding:32px;">
            ${bodyHtml}
          </td></tr>

          <!-- Email Footer -->
          <tr><td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:4px;">FlyCentric Aviation Academy</div>
            <div style="font-size:11px;color:#64748b;line-height:1.5;">Official Ground School & Trial Exam System · New Delhi, India</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Queries or Support: <a href="mailto:support@flycentric.in" style="color:#2563eb;text-decoration:none;font-weight:600;">support@flycentric.in</a></div>
            <div style="font-size:10px;color:#94a3b8;margin-top:12px;">This is a system-generated transactional communication from FlyCentric.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function btn(url, label, color = '#2563eb') {
  return `<a href="${url}" style="display:inline-block;padding:12px 24px;background:${color};color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;margin:6px 4px;box-shadow:0 2px 8px rgba(37,99,235,0.2);">${label}</a>`;
}

const RENDERERS = {
  // 0. Email Verification OTP
  'otp-verification': (data) => ({
    html: wrap(`
      <div style="text-align:center;margin-bottom:16px;">
        <span style="display:inline-block;padding:4px 12px;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:800;border-radius:999px;letter-spacing:0.04em;">
          SECURITY VERIFICATION
        </span>
      </div>
      <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:800;text-align:center;">
        Verify Your Email Address ✈️
      </h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 18px;text-align:center;">
        Hi ${data.name || 'Cadet'}, welcome to FlyCentric Aviation Academy. Please use the 6-digit one-time code below to verify your email and activate your student account:
      </p>

      <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:24px 20px;text-align:center;margin:24px 0;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.06em;margin-bottom:8px;">Your One-Time Password (OTP)</div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:900;letter-spacing:10px;color:#1e40af;">
          ${data.otp}
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:10px;font-weight:500;">
          ⏱️ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
        </div>
      </div>

      <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;text-align:center;">
        If you did not initiate this registration request, please disregard this email.
      </p>
    `, 'Verify Your FlyCentric Account'),
    text: `Hi ${data.name || 'Cadet'},\n\nYour FlyCentric email verification code is: ${data.otp}\n\nThis code is valid for 10 minutes.\n\nFlyCentric Aviation Academy · support@flycentric.in`,
  }),

  // 1. Account Welcome Email
  welcome: (data) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return {
      html: wrap(`
        <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:800;">Welcome to FlyCentric, ${data.name || 'Cadet'}! ✈️</h2>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Your official account for FlyCentric Aviation Academy has been successfully created. You now have access to India's premier DGCA pilot ground school training platform.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:10px;">Account Summary</div>
          <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
            <tr><td style="color:#64748b;">Registered Name:</td><td style="font-weight:600;color:#0f172a;" align="right">${data.name || 'Cadet'}</td></tr>
            <tr><td style="color:#64748b;">Registered Email:</td><td style="font-weight:600;color:#0f172a;" align="right">${data.email}</td></tr>
            <tr><td style="color:#64748b;">Cadet Role:</td><td style="font-weight:600;color:#2563eb;text-transform:capitalize;" align="right">${data.role || 'Student'}</td></tr>
          </table>
        </div>

        <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px;">What's available in your portal:</h3>
        <ul style="color:#475569;font-size:13px;line-height:1.7;margin:0 0 20px;padding-left:20px;">
          <li>Complete DGCA syllabus: Air Regulations, Meteorology, Air Navigation, Technical General, and Technical Specific.</li>
          <li>Chapter-by-chapter training notes, video lectures, and revision guides.</li>
          <li>Authentic DGCA mock exam simulator with exact timing and negative marking.</li>
          <li>Real-time question performance metrics and weak-area analysis.</li>
        </ul>

        <div style="text-align:center;margin:24px 0 10px;">
          ${btn(`${clientUrl}/dashboard`, 'Access Student Dashboard')}
        </div>
      `, 'Welcome to FlyCentric Aviation Academy'),
      text: `Welcome to FlyCentric, ${data.name || 'Cadet'}!\n\nYour account has been registered under ${data.email}.\nLog in at: ${process.env.CLIENT_URL || 'http://localhost:5173'}/login\n\nFlyCentric Aviation Academy · support@flycentric.in`,
    };
  },

  // 2. Official Tax Invoice & Payment Receipt Email
  'payment-receipt': (data) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const originalAmount = Number(data.originalAmount || data.amountInr || 0);
    const discountAmount = Number(data.discountAmount || 0);
    const finalAmount = Number(data.amountInr || 0);
    const validityStr = data.validityMonths ? `${data.validityMonths} Months` : '12 Months';
    const invoiceNum = `FC-REC-${data.paymentId}`;

    return {
      html: wrap(`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span style="display:inline-block;padding:4px 12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669;font-size:12px;font-weight:800;border-radius:999px;letter-spacing:0.04em;">
            ✓ PAYMENT SUCCESSFUL & VERIFIED
          </span>
        </div>

        <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:800;">Official Tax Invoice & Receipt</h2>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Dear <strong>${data.name || 'Cadet'}</strong>, thank you for your payment. Your enrollment in <strong>${data.bundleTitle || 'Aviation Course'}</strong> is active and verified. A copy of this invoice has also been attached to this email for your records.
        </p>

        <!-- Invoice Details Grid -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:separate;border-spacing:0;">
          <tr>
            <td width="48%" style="vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
              <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Billed To</div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">${data.name || 'Cadet'}</div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">${data.email || ''}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Invoice #: <strong style="color:#0f172a;">${invoiceNum}</strong></div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
              <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Transaction Info</div>
              <div style="font-size:12px;color:#334155;"><strong>Order Ref:</strong> <span style="font-family:monospace;">${data.orderId || `ORD-${data.paymentId}`}</span></div>
              ${data.transactionId ? `<div style="font-size:12px;color:#334155;margin-top:2px;"><strong>Gateway Txn:</strong> <span style="font-family:monospace;">${data.transactionId}</span></div>` : ''}
              <div style="font-size:12px;color:#334155;margin-top:2px;"><strong>Method:</strong> ${data.paymentMethod || 'Razorpay Gateway'}</div>
              <div style="font-size:12px;color:#4338ca;margin-top:2px;"><strong>Validity:</strong> <strong>${validityStr}</strong></div>
              ${data.expiryDate ? `<div style="font-size:12px;color:#059669;margin-top:2px;"><strong>Valid Until:</strong> ${data.expiryDate}</div>` : ''}
            </td>
          </tr>
        </table>

        <!-- Itemized Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <th align="left" style="padding:10px 14px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Description / Course</th>
              <th align="center" style="padding:10px 14px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Validity</th>
              <th align="right" style="padding:10px 14px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">
                <strong>${data.bundleTitle || 'Course Access'}</strong>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Full Syllabus Notes, Video Lectures & DGCA Question Bank</div>
              </td>
              <td align="center" style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:#4338ca;">
                ${validityStr}
              </td>
              <td align="right" style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;">
                ₹${originalAmount.toLocaleString('en-IN')}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Summary Calculation Box -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;margin-left:auto;max-width:320px;">
          <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
            <tr>
              <td style="color:#64748b;">Subtotal:</td>
              <td align="right" style="color:#0f172a;font-weight:600;">₹${originalAmount.toLocaleString('en-IN')}</td>
            </tr>
            ${discountAmount > 0 ? `
            <tr>
              <td style="color:#059669;font-weight:600;">Discount ${data.couponCode ? `(${data.couponCode})` : ''}:</td>
              <td align="right" style="color:#059669;font-weight:700;">-₹${discountAmount.toLocaleString('en-IN')}</td>
            </tr>` : ''}
            <tr>
              <td style="color:#64748b;">Taxes & Fees:</td>
              <td align="right" style="color:#0f172a;font-weight:600;">₹0</td>
            </tr>
            <tr style="border-top:2px solid #e2e8f0;">
              <td style="padding-top:8px;font-size:15px;font-weight:800;color:#0f172a;">Total Paid:</td>
              <td align="right" style="padding-top:8px;font-size:17px;font-weight:900;color:#0f172a;">₹${finalAmount.toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>

        <div style="text-align:center;margin:28px 0 10px;">
          ${btn(`${clientUrl}/my-subjects`, '🚀 Launch Course & Start Studying', '#16a34a')}
          ${btn(`${clientUrl}/my-purchases`, '📄 View Receipt & Purchases', '#2563eb')}
        </div>
      `, `Invoice ${invoiceNum} - FlyCentric`),
      text: `FlyCentric Tax Invoice & Receipt ${invoiceNum}\n\nCourse: ${data.bundleTitle}\nAmount Paid: ₹${data.amountInr}\nValidity: ${validityStr}\nAccess Expires: ${data.expiryDate || 'N/A'}\nOrder ID: ${data.orderId}\n\nAccess your courses at: ${clientUrl}/my-subjects\nView your purchase history at: ${clientUrl}/my-purchases`,
    };
  },

  // 3. Free Enrollment Confirmation Email
  'enrollment-confirmation': (data) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return {
      html: wrap(`
        <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Course Enrollment Confirmed 🎓</h2>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Hi <strong>${data.name || 'Cadet'}</strong>, your enrollment in <strong>${data.bundleTitle || 'Course'}</strong> is now confirmed.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
          <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
            <tr><td style="color:#64748b;">Course / Subject:</td><td style="font-weight:700;color:#0f172a;" align="right">${data.bundleTitle}</td></tr>
            <tr><td style="color:#64748b;">Enrollment Type:</td><td style="font-weight:600;color:#16a34a;" align="right">Free / Trial Access</td></tr>
            <tr><td style="color:#64748b;">Status:</td><td style="font-weight:700;color:#059669;" align="right">Active</td></tr>
          </table>
        </div>

        <div style="text-align:center;margin:24px 0 10px;">
          ${btn(`${clientUrl}/my-subjects`, 'Start Studying Now')}
        </div>
      `, 'Course Enrollment Confirmed - FlyCentric'),
      text: `Course Enrollment Confirmed: ${data.bundleTitle}\nAccess at: ${clientUrl}/my-subjects`,
    };
  },

  // 4. Password Reset Email
  'password-reset': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Reset Your Password 🔐</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 14px;">
        We received a request to reset the password for your FlyCentric Aviation account.
      </p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Click the button below to choose a new password. For security reasons, this link will expire in <strong>1 hour</strong> and can only be used once.
      </p>

      <div style="text-align:center;margin:24px 0;">
        ${btn(data.resetLink, 'Reset My Password')}
      </div>

      <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:12px 16px;margin-top:20px;">
        <span style="font-size:12px;color:#92400e;line-height:1.5;">
          <strong>Security notice:</strong> If you did not make this request, you can safely ignore this email. Your current password will remain unchanged.
        </span>
      </div>
    `, 'Reset Your FlyCentric Password'),
    text: `Reset your FlyCentric password:\n${data.resetLink}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
  }),

  // 5. Password Changed Confirmation Email
  'password-changed': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Security Alert: Password Updated 🛡️</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 14px;">
        Hi ${data.name || 'there'}, your FlyCentric account password was successfully updated.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#334155;">
        All existing active sessions have been invalidated as a security precaution. Please sign in with your new password to resume studying.
      </div>
      <p style="color:#dc2626;font-size:13px;line-height:1.5;margin:0 0 20px;">
        <strong>Did not change your password?</strong> If you did not perform this action, please contact FlyCentric support immediately at <a href="mailto:support@flycentric.in" style="color:#dc2626;">support@flycentric.in</a>.
      </p>
      <div style="text-align:center;">
        ${btn(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login`, 'Sign In to Your Account')}
      </div>
    `, 'Password Changed - FlyCentric Security'),
    text: `Your FlyCentric password was successfully changed. If this wasn't you, contact support@flycentric.in immediately.`,
  }),

  // 6. Course Expiration Warning Email (7 days before expiry)
  'course-expiring': (data) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return {
      html: wrap(`
        <div style="display:inline-block;padding:4px 12px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:12px;font-weight:800;border-radius:999px;margin-bottom:12px;">
          ⚠️ ACCESS EXPIRING SOON
        </div>
        <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Course Access Expiring Soon</h2>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Hi ${data.name || 'Cadet'}, your enrollment in <strong>${data.bundleTitle || 'your aviation course'}</strong> is scheduled to expire in <strong>${data.daysRemaining || 7} days</strong>.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
          <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
            <tr><td style="color:#64748b;">Course:</td><td style="font-weight:700;color:#0f172a;" align="right">${data.bundleTitle}</td></tr>
            <tr><td style="color:#64748b;">Expiration Date:</td><td style="font-weight:700;color:#dc2626;" align="right">${data.expiryDate}</td></tr>
            <tr><td style="color:#64748b;">Days Remaining:</td><td style="font-weight:800;color:#dc2626;" align="right">${data.daysRemaining} Days</td></tr>
          </table>
        </div>

        <p style="color:#475569;font-size:13px;line-height:1.6;margin:0 0 20px;">
          Renewing before expiry ensures uninterrupted access to your DGCA question bank, lecture notes, video content, and saved exam attempt history.
        </p>

        <div style="text-align:center;margin:24px 0 10px;">
          ${btn(`${clientUrl}/explore-bundles`, 'Renew Course Access Now', '#4338ca')}
        </div>
      `, 'Course Expiring Soon - FlyCentric'),
      text: `Important: Your access to ${data.bundleTitle} expires on ${data.expiryDate} (${data.daysRemaining} days remaining).\nRenew at: ${clientUrl}/explore-bundles`,
    };
  },

  // 7. Admin SMTP Test Email
  'test-email': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">SMTP Email Configuration Test 🚀</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Congratulations! Your transactional email configuration in FlyCentric LMS is working perfectly.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Diagnostics</div>
        <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
          <tr><td style="color:#64748b;">Test Sent At:</td><td style="font-weight:600;color:#0f172a;" align="right">${new Date().toLocaleString('en-US')}</td></tr>
          <tr><td style="color:#64748b;">SMTP Host:</td><td style="font-weight:600;color:#0f172a;" align="right">${data.host || 'Default Host'}</td></tr>
          <tr><td style="color:#64748b;">SMTP Port:</td><td style="font-weight:600;color:#0f172a;" align="right">${data.port || 587}</td></tr>
          <tr><td style="color:#64748b;">Delivery Status:</td><td style="font-weight:700;color:#059669;" align="right">Verified / Live</td></tr>
        </table>
      </div>

      <p style="color:#64748b;font-size:13px;line-height:1.5;">
        FlyCentric will now automatically deliver invoices, welcome emails, password reset requests, and course alerts to all student accounts.
      </p>
    `, 'FlyCentric SMTP Test Email'),
    text: `FlyCentric SMTP test email delivered successfully at ${new Date().toLocaleString()}.\nSMTP Host: ${data.host || 'Default'}`,
  }),

  // 8. Re-engagement Workflow
  're-engagement': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">We miss you in the cockpit, ${data.name || 'Cadet'}! ✈️</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
        It's been a few days since your last ground school study session. Consistency is the key to clearing your DGCA pilot exams on the first attempt!
      </p>
      <div style="text-align:center;margin:24px 0 10px;">
        ${btn(process.env.CLIENT_URL || 'http://localhost:5173', 'Continue Studying')}
      </div>
    `, 'Continue Your DGCA Studies - FlyCentric'),
    text: `We miss you at FlyCentric, ${data.name || 'there'}. Pick up where you left off: ${process.env.CLIENT_URL || 'http://localhost:5173'}`,
  }),

  // 9. Progress Report
  'progress-report': (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Your Weekly Progress Report 📊</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Hi ${data.name || 'Cadet'}, here is a breakdown of your syllabus progress and test accuracy:
      </p>
      <table role="presentation" width="100%" style="margin-top:8px;border-collapse:collapse;">
        ${(data.chapters || []).map((c) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eef2f6;font-size:13px;color:#0f172a;">${c.subject} – ${c.chapter}</td>
            <td align="right" style="padding:8px 0;border-bottom:1px solid #eef2f6;font-size:13px;font-weight:600;color:#2563eb;">${c.completion_percent}% · ${c.score}</td>
          </tr>`).join('')}
      </table>
      <div style="text-align:center;margin:24px 0 10px;">
        ${btn(`${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard`, 'View Full Performance Analytics')}
      </div>
    `, 'Your FlyCentric Progress Report'),
    text: data.summaryText || 'Your weekly FlyCentric progress report.',
  }),

  // 10. Birthday Greeting
  birthday: (data) => ({
    html: wrap(`
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">🎂 ${data.name ? `Happy Birthday, ${data.name}!` : 'Happy Birthday!'}</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">${data.message}</p>
      <p style="color:#94a3b8;font-size:13px;margin-top:16px;">— ${data.branding || 'FlyCentric Aviation Team'}</p>
    `, 'Happy Birthday from FlyCentric!'),
    text: `${data.message}\n\n— ${data.branding || 'FlyCentric Aviation Team'}`,
  }),

  // 11. Bulk Marketing Campaign
  'bulk-campaign': (data) => ({
    html: wrap(`
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 12px;">Hi ${data.name || 'there'},</p>
      <div style="color:#0f172a;font-size:14px;line-height:1.6;margin-top:10px;white-space:pre-wrap;">${data.body || ''}</div>
    `, 'Announcement - FlyCentric'),
    text: `Hi ${data.name || 'there'},\n\n${data.body || ''}`,
  }),
};

function renderEmail(template, data = {}) {
  const renderer = RENDERERS[template];
  if (renderer) return renderer(data);
  return {
    html: wrap(`<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#0f172a;">${JSON.stringify(data, null, 2)}</pre>`),
    text: JSON.stringify(data, null, 2),
  };
}

module.exports = { renderEmail, wrap, btn };
