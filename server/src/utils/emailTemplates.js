// Dynamic Email Templates Engine & Administrator Configuration
// Supports customizable HTML code, subject lines, variable interpolation ({{var}}),
// live preview rendering, and database persistence.

const pool = require('../db/pool');

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

// Variable substitution engine: replaces {{key}} with data[key]
function interpolate(str, data = {}) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (key in data) {
      const val = data[key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }
    return match;
  });
}

// ----------------------------------------------------------------------------
// Canonical Template Definitions with Defaults & Variable Specifications
// ----------------------------------------------------------------------------
const TEMPLATE_DEFS = {
  welcome: {
    id: 'welcome',
    name: 'Student Welcome Email',
    category: 'Onboarding',
    description: 'Sent automatically when a new cadet registers or completes account creation.',
    defaultSubject: 'Welcome to FlyCentric Aviation Academy! ✈️',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'email', label: 'Cadet Email', sample: 'aryan.sharma@example.com' },
      { key: 'role', label: 'Account Role', sample: 'student' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:800;">Welcome to FlyCentric, {{name}}! ✈️</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Your official account for FlyCentric Aviation Academy has been successfully created. You now have access to India's premier DGCA pilot ground school training platform.
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:10px;">Account Summary</div>
  <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
    <tr><td style="color:#64748b;">Registered Name:</td><td style="font-weight:600;color:#0f172a;" align="right">{{name}}</td></tr>
    <tr><td style="color:#64748b;">Registered Email:</td><td style="font-weight:600;color:#0f172a;" align="right">{{email}}</td></tr>
    <tr><td style="color:#64748b;">Cadet Role:</td><td style="font-weight:600;color:#2563eb;text-transform:capitalize;" align="right">{{role}}</td></tr>
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
  <a href="{{clientUrl}}/dashboard" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Access Student Dashboard</a>
</div>`,
    defaultText: `Welcome to FlyCentric, {{name}}!\n\nYour account has been registered under {{email}}.\nLog in at: {{clientUrl}}/login\n\nFlyCentric Aviation Academy · support@flycentric.in`,
  },

  'otp-verification': {
    id: 'otp-verification',
    name: 'Account Verification OTP',
    category: 'Security',
    description: 'Sent during student registration with a 6-digit one-time password.',
    defaultSubject: 'Your FlyCentric Verification Code: {{otp}}',
    variables: [
      { key: 'otp', label: '6-digit OTP Code', sample: '749201' },
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'email', label: 'Cadet Email', sample: 'aryan.sharma@example.com' },
    ],
    defaultHtml: `<div style="text-align:center;margin-bottom:16px;">
  <span style="display:inline-block;padding:4px 12px;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:800;border-radius:999px;letter-spacing:0.04em;">
    SECURITY VERIFICATION
  </span>
</div>
<h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:800;text-align:center;">
  Verify Your Email Address ✈️
</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 18px;text-align:center;">
  Hi {{name}}, welcome to FlyCentric Aviation Academy. Please use the 6-digit one-time code below to verify your email and activate your student account:
</p>

<div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:24px 20px;text-align:center;margin:24px 0;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.06em;margin-bottom:8px;">Your One-Time Password (OTP)</div>
  <div style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:900;letter-spacing:10px;color:#1e40af;">
    {{otp}}
  </div>
  <div style="font-size:12px;color:#64748b;margin-top:10px;font-weight:500;">
    ⏱️ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
  </div>
</div>

<p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;text-align:center;">
  If you did not initiate this registration request, please disregard this email.
</p>`,
    defaultText: `Hi {{name}},\n\nYour FlyCentric email verification code is: {{otp}}\n\nThis code is valid for 10 minutes.\n\nFlyCentric Aviation Academy · support@flycentric.in`,
  },

  'password-reset': {
    id: 'password-reset',
    name: 'Password Reset Link',
    category: 'Security',
    description: 'Sent when a user requests password reset with a secure 1-hour single-use link.',
    defaultSubject: 'Reset Your FlyCentric Password 🔐',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'resetLink', label: 'Reset Link URL', sample: 'http://localhost:5173/reset-password?token=sample_token_xyz' },
    ],
    defaultHtml: `<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Reset Your Password 🔐</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 14px;">
  We received a request to reset the password for your FlyCentric Aviation account.
</p>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
  Click the button below to choose a new password. For security reasons, this link will expire in <strong>1 hour</strong> and can only be used once.
</p>

<div style="text-align:center;margin:24px 0;">
  <a href="{{resetLink}}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Reset My Password</a>
</div>

<div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:12px 16px;margin-top:20px;">
  <span style="font-size:12px;color:#92400e;line-height:1.5;">
    <strong>Security notice:</strong> If you did not make this request, you can safely ignore this email. Your current password will remain unchanged.
  </span>
</div>`,
    defaultText: `Reset your FlyCentric password:\n{{resetLink}}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
  },

  'password-changed': {
    id: 'password-changed',
    name: 'Password Changed Notice',
    category: 'Security',
    description: 'Security confirmation sent when an account password is changed.',
    defaultSubject: 'Security Alert: Password Updated 🛡️',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Security Alert: Password Updated 🛡️</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 14px;">
  Hi {{name}}, your FlyCentric account password was successfully updated.
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#334155;">
  All existing active sessions have been invalidated as a security precaution. Please sign in with your new password to resume studying.
</div>
<p style="color:#dc2626;font-size:13px;line-height:1.5;margin:0 0 20px;">
  <strong>Did not change your password?</strong> If you did not perform this action, please contact FlyCentric support immediately at <a href="mailto:support@flycentric.in" style="color:#dc2626;">support@flycentric.in</a>.
</p>
<div style="text-align:center;">
  <a href="{{clientUrl}}/login" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Sign In to Your Account</a>
</div>`,
    defaultText: `Your FlyCentric password was successfully changed. If this was not you, contact support@flycentric.in immediately.`,
  },

  'payment-receipt': {
    id: 'payment-receipt',
    name: 'Payment Confirmation & Invoice',
    category: 'Commerce',
    description: 'Itemized invoice and confirmation sent after server-side payment verification.',
    defaultSubject: 'Tax Invoice & Payment Receipt #FC-REC-{{paymentId}} — {{bundleTitle}} | FlyCentric',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'email', label: 'Cadet Email', sample: 'aryan.sharma@example.com' },
      { key: 'paymentId', label: 'Payment ID', sample: '1084' },
      { key: 'amountInr', label: 'Amount Paid (₹)', sample: '24999' },
      { key: 'bundleTitle', label: 'Course Bundle', sample: 'DGCA CPL Complete Ground School' },
      { key: 'orderId', label: 'Order ID', sample: 'ORD-1084' },
      { key: 'transactionId', label: 'Gateway Txn ID', sample: 'pay_Nx8B9w3x5K' },
      { key: 'validityMonths', label: 'Validity Months', sample: '12' },
      { key: 'expiryDate', label: 'Expiry Date', sample: '11 Oct 2027' },
      { key: 'paymentMethod', label: 'Payment Method', sample: 'Razorpay Gateway (UPI / Card)' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
  <span style="display:inline-block;padding:4px 12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669;font-size:12px;font-weight:800;border-radius:999px;letter-spacing:0.04em;">
    ✓ PAYMENT SUCCESSFUL & VERIFIED
  </span>
</div>

<h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:800;">Official Tax Invoice & Receipt</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
  Dear <strong>{{name}}</strong>, thank you for your payment. Your enrollment in <strong>{{bundleTitle}}</strong> is active and verified.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:separate;border-spacing:0;">
  <tr>
    <td width="48%" style="vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Billed To</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;">{{name}}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">{{email}}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Invoice #: <strong style="color:#0f172a;">#FC-REC-{{paymentId}}</strong></div>
    </td>
    <td width="4%"></td>
    <td width="48%" style="vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Transaction Info</div>
      <div style="font-size:12px;color:#334155;"><strong>Order Ref:</strong> <span style="font-family:monospace;">{{orderId}}</span></div>
      <div style="font-size:12px;color:#334155;margin-top:2px;"><strong>Method:</strong> {{paymentMethod}}</div>
      <div style="font-size:12px;color:#4338ca;margin-top:2px;"><strong>Validity:</strong> <strong>{{validityMonths}} Months</strong></div>
      <div style="font-size:12px;color:#059669;margin-top:2px;"><strong>Valid Until:</strong> {{expiryDate}}</div>
    </td>
  </tr>
</table>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
  <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
    <tr><td style="color:#64748b;">Course / Package:</td><td style="font-weight:700;color:#0f172a;" align="right">{{bundleTitle}}</td></tr>
    <tr style="border-top:1px solid #e2e8f0;"><td style="padding-top:8px;font-size:15px;font-weight:800;color:#0f172a;">Total Paid:</td><td align="right" style="padding-top:8px;font-size:17px;font-weight:900;color:#0f172a;">₹{{amountInr}}</td></tr>
  </table>
</div>

<div style="text-align:center;margin:28px 0 10px;">
  <a href="{{clientUrl}}/my-subjects" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;margin-right:8px;">🚀 Launch Course</a>
  <a href="{{clientUrl}}/my-purchases" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">📄 View Purchases</a>
</div>`,
    defaultText: `FlyCentric Tax Invoice #FC-REC-{{paymentId}}\n\nCourse: {{bundleTitle}}\nAmount Paid: ₹{{amountInr}}\nOrder ID: {{orderId}}\nAccess Valid Until: {{expiryDate}}\n\nLaunch courses: {{clientUrl}}/my-subjects`,
  },

  'enrollment-confirmation': {
    id: 'enrollment-confirmation',
    name: 'Course Enrollment Confirmed',
    category: 'Commerce',
    description: 'Confirmation email for complimentary or trial subject access.',
    defaultSubject: 'Course Enrollment Confirmed: {{bundleTitle}} 🎓',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'bundleTitle', label: 'Course Bundle Title', sample: 'Air Regulations Trial Access' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Course Enrollment Confirmed 🎓</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Hi <strong>{{name}}</strong>, your enrollment in <strong>{{bundleTitle}}</strong> is now confirmed.
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
  <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
    <tr><td style="color:#64748b;">Course / Subject:</td><td style="font-weight:700;color:#0f172a;" align="right">{{bundleTitle}}</td></tr>
    <tr><td style="color:#64748b;">Status:</td><td style="font-weight:700;color:#059669;" align="right">Active</td></tr>
  </table>
</div>

<div style="text-align:center;margin:24px 0 10px;">
  <a href="{{clientUrl}}/my-subjects" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Start Studying Now</a>
</div>`,
    defaultText: `Course Enrollment Confirmed: {{bundleTitle}}\nAccess at: {{clientUrl}}/my-subjects`,
  },

  'exam-results': {
    id: 'exam-results',
    name: 'Exam Results & Scorecard',
    category: 'Academics',
    description: 'Sent immediately after an exam or quiz attempt is submitted and graded.',
    defaultSubject: 'Exam Results: {{quizTitle}} — Score: {{score}}% ({{statusText}}) | FlyCentric',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'quizTitle', label: 'Exam Title', sample: 'Air Navigation DGCA Mock Exam 01' },
      { key: 'subjectTitle', label: 'Subject Name', sample: 'Air Navigation' },
      { key: 'score', label: 'Final Score (%)', sample: '88' },
      { key: 'passPercent', label: 'Passing Threshold (%)', sample: '70' },
      { key: 'statusText', label: 'Result Badge Text', sample: 'PASSED ✅' },
      { key: 'correctCount', label: 'Correct Questions', sample: '88' },
      { key: 'totalQuestions', label: 'Total Questions', sample: '100' },
      { key: 'timeTakenMinutes', label: 'Time Spent (min)', sample: '72' },
      { key: 'submittedAt', label: 'Submission Timestamp', sample: '11 Oct 2026, 11:30 AM' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<div style="text-align:center;margin-bottom:16px;">
  <span style="display:inline-block;padding:6px 16px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669;font-size:12px;font-weight:800;border-radius:999px;letter-spacing:0.04em;">
    {{statusText}}
  </span>
</div>

<h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:800;text-align:center;">
  Exam Results: {{quizTitle}}
</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Hi <strong>{{name}}</strong>, your submission for <strong>{{quizTitle}}</strong> ({{subjectTitle}}) has been graded.
</p>

<div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:14px;padding:24px 20px;text-align:center;margin-bottom:24px;">
  <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.06em;margin-bottom:6px;">Final Grade</div>
  <div style="font-size:42px;font-weight:900;color:#059669;line-height:1;">
    {{score}}%
  </div>
  <div style="font-size:12px;color:#64748b;margin-top:6px;">
    Passing threshold: <strong>{{passPercent}}%</strong>
  </div>
</div>

<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
  <table role="presentation" width="100%" style="font-size:13px;line-height:2;">
    <tr><td style="color:#64748b;">Exam / Test:</td><td style="font-weight:700;color:#0f172a;" align="right">{{quizTitle}}</td></tr>
    <tr><td style="color:#64748b;">Subject:</td><td style="font-weight:600;color:#0f172a;" align="right">{{subjectTitle}}</td></tr>
    <tr><td style="color:#64748b;">Correct Questions:</td><td style="font-weight:700;color:#059669;" align="right">{{correctCount}} / {{totalQuestions}}</td></tr>
    <tr><td style="color:#64748b;">Time Taken:</td><td style="font-weight:600;color:#0f172a;" align="right">{{timeTakenMinutes}} min</td></tr>
    <tr><td style="color:#64748b;">Submitted At:</td><td style="font-weight:600;color:#0f172a;" align="right">{{submittedAt}}</td></tr>
  </table>
</div>

<div style="text-align:center;margin:28px 0 10px;">
  <a href="{{clientUrl}}/dashboard" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">📊 Review Full Exam & Explanations</a>
</div>`,
    defaultText: `Exam Results: {{quizTitle}}\nScore: {{score}}% ({{statusText}})\nCorrect: {{correctCount}}/{{totalQuestions}}\nReview at: {{clientUrl}}/dashboard`,
  },

  'exam-reminder': {
    id: 'exam-reminder',
    name: 'Exam Milestone Reminder',
    category: 'Academics',
    description: 'Periodic reminder to encourage active cadets to attempt their subject mock exams.',
    defaultSubject: '⏰ Exam Reminder: Test your knowledge in {{quizTitle}} — FlyCentric',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'quizTitle', label: 'Exam Title', sample: 'Meteorology Milestone Assessment' },
      { key: 'subjectTitle', label: 'Subject Name', sample: 'Aviation Meteorology' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<div style="text-align:center;margin-bottom:16px;">
  <span style="display:inline-block;padding:4px 12px;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:800;border-radius:999px;letter-spacing:0.04em;">
    EXAM REMINDER ✈️
  </span>
</div>
<h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:800;text-align:center;">
  Ready to Test Your Knowledge?
</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;text-align:center;">
  Hi <strong>{{name}}</strong>, your milestone test for <strong>{{quizTitle}}</strong> in <strong>{{subjectTitle}}</strong> is ready.
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:10px;">Why Timed Mock Exams Matter</div>
  <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">
    Regular exam practice under timed conditions builds muscle memory and is proven to increase first-time pass rates on official DGCA exams.
  </p>
</div>

<div style="text-align:center;margin:24px 0 10px;">
  <a href="{{clientUrl}}/my-subjects" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Start Exam Now 🚀</a>
</div>`,
    defaultText: `Hi {{name}},\n\nYour milestone exam for {{quizTitle}} is ready.\nTake it now at: {{clientUrl}}/my-subjects`,
  },

  'progress-report': {
    id: 'progress-report',
    name: 'Weekly Student Progress Report',
    category: 'Academics',
    description: 'Weekly breakdown of syllabus progress, chapter completion, and test scores.',
    defaultSubject: 'Your FlyCentric Ground School Progress Report 📊',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'summaryText', label: 'Summary Report Text', sample: 'Air Regulations: 100% · Score: 92%\nMeteorology: 75% · Score: 84%' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Your Weekly Progress Report 📊</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Hi {{name}}, here is a summary of your ground school syllabus progress and trial examination scores:
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:13px;line-height:1.8;color:#0f172a;white-space:pre-wrap;">{{summaryText}}</div>

<div style="text-align:center;margin:24px 0 10px;">
  <a href="{{clientUrl}}/dashboard" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">View Full Performance Analytics</a>
</div>`,
    defaultText: `Hi {{name}},\n\nYour weekly progress report:\n{{summaryText}}\n\nView analytics at: {{clientUrl}}/dashboard`,
  },

  're-engagement': {
    id: 're-engagement',
    name: 'Inactivity Re-engagement',
    category: 'Retention',
    description: 'Sent automatically to students who have been inactive for 7 or more days.',
    defaultSubject: 'We miss you in the cockpit, {{name}}! ✈️',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">We miss you in the cockpit, {{name}}! ✈️</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
  It's been a few days since your last ground school study session. Consistency is the single biggest factor in clearing your DGCA pilot exams on the first attempt!
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
  <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:4px;">Recommended Next Step:</div>
  <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">
    Complete 1 chapter revision or take a quick 15-minute practice test to keep your aviation concepts fresh.
  </p>
</div>
<div style="text-align:center;margin:24px 0 10px;">
  <a href="{{clientUrl}}/my-subjects" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Continue Studying</a>
</div>`,
    defaultText: `We miss you at FlyCentric, {{name}}! Pick up where you left off: {{clientUrl}}/my-subjects`,
  },

  'course-expiring': {
    id: 'course-expiring',
    name: 'Course Expiry Warning',
    category: 'Commerce',
    description: 'Sent 7 days before course access expires to prompt course renewal.',
    defaultSubject: '⚠️ Access Expiring Soon: {{bundleTitle}} ({{daysRemaining}} days left) — FlyCentric',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'bundleTitle', label: 'Course Bundle Title', sample: 'Technical General Ground School' },
      { key: 'expiryDate', label: 'Expiration Date', sample: '18 Oct 2026' },
      { key: 'daysRemaining', label: 'Days Remaining', sample: '7' },
      { key: 'clientUrl', label: 'Portal URL', sample: 'http://localhost:5173' },
    ],
    defaultHtml: `<div style="display:inline-block;padding:4px 12px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:12px;font-weight:800;border-radius:999px;margin-bottom:12px;">
  ⚠️ ACCESS EXPIRING SOON
</div>
<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">Course Access Expiring Soon</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
  Hi {{name}}, your enrollment in <strong>{{bundleTitle}}</strong> is scheduled to expire in <strong>{{daysRemaining}} days</strong>.
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
  <table role="presentation" width="100%" style="font-size:13px;line-height:1.8;">
    <tr><td style="color:#64748b;">Course:</td><td style="font-weight:700;color:#0f172a;" align="right">{{bundleTitle}}</td></tr>
    <tr><td style="color:#64748b;">Expiration Date:</td><td style="font-weight:700;color:#dc2626;" align="right">{{expiryDate}}</td></tr>
    <tr><td style="color:#64748b;">Days Remaining:</td><td style="font-weight:800;color:#dc2626;" align="right">{{daysRemaining}} Days</td></tr>
  </table>
</div>

<p style="color:#475569;font-size:13px;line-height:1.6;margin:0 0 20px;">
  Renewing before expiry ensures uninterrupted access to your DGCA question bank, lecture notes, video content, and saved exam attempt history.
</p>

<div style="text-align:center;margin:24px 0 10px;">
  <a href="{{clientUrl}}/explore-bundles" style="display:inline-block;padding:12px 24px;background:#4338ca;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Renew Course Access Now</a>
</div>`,
    defaultText: `Important: Your access to {{bundleTitle}} expires on {{expiryDate}} ({{daysRemaining}} days remaining).\nRenew at: {{clientUrl}}/explore-bundles`,
  },

  'admin-notification': {
    id: 'admin-notification',
    name: 'Platform Admin Event Alert',
    category: 'System',
    description: 'Real-time alert sent to platform administrators when key events occur.',
    defaultSubject: '[Admin Alert] {{title}}',
    variables: [
      { key: 'eventType', label: 'Event Badge Name', sample: 'Payment Confirmed' },
      { key: 'title', label: 'Event Title', sample: 'Course Enrollment Payment Verified' },
      { key: 'actionLabel', label: 'Button Action Label', sample: 'View in Admin Purchases' },
      { key: 'actionUrl', label: 'Target Action URL', sample: 'http://localhost:5173/admin/purchases' },
    ],
    defaultHtml: `<div style="margin-bottom:16px;">
  <span style="display:inline-block;padding:4px 12px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:11px;font-weight:800;border-radius:999px;letter-spacing:0.05em;text-transform:uppercase;">
    🔔 {{eventType}}
  </span>
</div>

<h2 style="margin:0 0 8px;color:#0f172a;font-size:19px;font-weight:800;">
  {{title}}
</h2>
<p style="color:#64748b;font-size:13px;line-height:1.5;margin:0 0 20px;">
  A key operational event occurred on the FlyCentric LMS platform. Review details and take action via the link below:
</p>

<div style="text-align:center;margin:24px 0 10px;">
  <a href="{{actionUrl}}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">{{actionLabel}}</a>
</div>`,
    defaultText: `[Admin Alert] {{title}}\nEvent: {{eventType}}\n\nAction Link: {{actionUrl}}`,
  },

  birthday: {
    id: 'birthday',
    name: 'Birthday Greeting',
    category: 'Retention',
    description: 'Automated greeting sent to students on their birthday.',
    defaultSubject: 'Happy Birthday from FlyCentric! 🎂',
    variables: [
      { key: 'name', label: 'Cadet Name', sample: 'Cadet Aryan Sharma' },
      { key: 'message', label: 'Birthday Message', sample: 'Wishing you clear skies and smooth tailwinds on your special day!' },
      { key: 'branding', label: 'Signature Team', sample: 'FlyCentric Aviation Team' },
    ],
    defaultHtml: `<h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">🎂 Happy Birthday, {{name}}!</h2>
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">{{message}}</p>
<p style="color:#94a3b8;font-size:13px;margin-top:16px;">— {{branding}}</p>`,
    defaultText: `Happy Birthday, {{name}}!\n\n{{message}}\n\n— {{branding}}`,
  },
};

// In-memory cache for custom overrides from database
let customTemplateCache = {};
let lastCacheFetch = 0;

async function ensureTemplatesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        html_body TEXT NOT NULL,
        text_body TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT now(),
        updated_by INTEGER
      );
    `);
  } catch (err) {
    // If DB is offline or restricted, proceed with defaults
  }
}

// Automatically ensure table exists
ensureTemplatesTable();

async function refreshCache() {
  const now = Date.now();
  if (now - lastCacheFetch < 10000 && Object.keys(customTemplateCache).length > 0) {
    return;
  }
  try {
    const res = await pool.query('SELECT * FROM email_templates');
    const map = {};
    for (const r of res.rows) {
      map[r.id] = r;
    }
    customTemplateCache = map;
    lastCacheFetch = now;
  } catch (_) {
    // Fallback to empty cache (defaults apply)
  }
}

// Get listing of all templates with customization indicators
async function getTemplateList() {
  await refreshCache();
  const list = Object.keys(TEMPLATE_DEFS).map((id) => {
    const def = TEMPLATE_DEFS[id];
    const custom = customTemplateCache[id];
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      description: def.description,
      subject: custom?.subject || def.defaultSubject,
      is_active: custom ? custom.is_active : true,
      is_customized: Boolean(custom),
      updated_at: custom?.updated_at || null,
      variablesCount: def.variables.length,
    };
  });
  return list;
}

// Get full template details for editor & live testing
async function getTemplateDetail(id) {
  const def = TEMPLATE_DEFS[id];
  if (!def) return null;
  await refreshCache();
  const custom = customTemplateCache[id];

  // Compile sample data
  const sampleData = {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  };
  for (const v of def.variables) {
    sampleData[v.key] = v.sample;
  }

  return {
    id: def.id,
    name: def.name,
    category: def.category,
    description: def.description,
    subject: custom?.subject || def.defaultSubject,
    html_body: custom?.html_body || def.defaultHtml,
    text_body: custom?.text_body || def.defaultText,
    defaultSubject: def.defaultSubject,
    defaultHtml: def.defaultHtml,
    defaultText: def.defaultText,
    is_active: custom ? custom.is_active : true,
    is_customized: Boolean(custom),
    updated_at: custom?.updated_at || null,
    variables: def.variables,
    sampleData,
  };
}

// Save / Publish template customization
async function saveTemplateOverride(id, { subject, html_body, text_body, is_active = true, updated_by }) {
  const def = TEMPLATE_DEFS[id];
  if (!def) throw new Error(`Unknown email template: ${id}`);
  await ensureTemplatesTable();

  await pool.query(
    `INSERT INTO email_templates (id, subject, html_body, text_body, is_active, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, now(), $6)
     ON CONFLICT (id) DO UPDATE SET
       subject = EXCLUDED.subject,
       html_body = EXCLUDED.html_body,
       text_body = EXCLUDED.text_body,
       is_active = EXCLUDED.is_active,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by`,
    [id, subject.trim(), html_body, text_body || '', Boolean(is_active), updated_by || null]
  );

  // Invalidate cache
  lastCacheFetch = 0;
  await refreshCache();
  return getTemplateDetail(id);
}

// Reset template to system default
async function resetTemplateOverride(id) {
  const def = TEMPLATE_DEFS[id];
  if (!def) throw new Error(`Unknown email template: ${id}`);
  await ensureTemplatesTable();
  await pool.query('DELETE FROM email_templates WHERE id = $1', [id]);
  lastCacheFetch = 0;
  await refreshCache();
  return getTemplateDetail(id);
}

// Asynchronous renderer with custom overrides & placeholder interpolation
async function renderEmailAsync(template, data = {}) {
  await refreshCache();
  const def = TEMPLATE_DEFS[template];
  const custom = customTemplateCache[template];

  // If template is disabled by admin, return disabled status
  if (custom && custom.is_active === false) {
    return { disabled: true };
  }

  const enrichedData = {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    ...data,
  };

  // If admin customized the template
  if (custom && custom.html_body) {
    const rawHtml = interpolate(custom.html_body, enrichedData);
    const finalHtml = rawHtml.includes('<html') || rawHtml.includes('<!doctype')
      ? rawHtml
      : wrap(rawHtml, interpolate(custom.subject, enrichedData));
    const finalSubject = interpolate(custom.subject, enrichedData);
    const finalText = interpolate(custom.text_body || '', enrichedData);

    return {
      html: finalHtml,
      text: finalText,
      subject: finalSubject,
    };
  }

  // Fallback to built-in renderer
  if (def) {
    const rawHtml = interpolate(def.defaultHtml, enrichedData);
    const finalHtml = wrap(rawHtml, interpolate(def.defaultSubject, enrichedData));
    const finalSubject = interpolate(def.defaultSubject, enrichedData);
    const finalText = interpolate(def.defaultText, enrichedData);
    return {
      html: finalHtml,
      text: finalText,
      subject: finalSubject,
    };
  }

  // Generic fallback
  return {
    html: wrap(`<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#0f172a;">${JSON.stringify(data, null, 2)}</pre>`),
    text: JSON.stringify(data, null, 2),
    subject: `FlyCentric Notification: ${template}`,
  };
}

// Synchronous renderer (backwards compatibility)
function renderEmail(template, data = {}) {
  const def = TEMPLATE_DEFS[template];
  const enrichedData = {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    ...data,
  };
  if (def) {
    const rawHtml = interpolate(def.defaultHtml, enrichedData);
    return {
      html: wrap(rawHtml, interpolate(def.defaultSubject, enrichedData)),
      text: interpolate(def.defaultText, enrichedData),
    };
  }
  return {
    html: wrap(`<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#0f172a;">${JSON.stringify(data, null, 2)}</pre>`),
    text: JSON.stringify(data, null, 2),
  };
}

module.exports = {
  renderEmail,
  renderEmailAsync,
  getTemplateList,
  getTemplateDetail,
  saveTemplateOverride,
  resetTemplateOverride,
  interpolate,
  wrap,
  btn,
  TEMPLATE_DEFS,
};
