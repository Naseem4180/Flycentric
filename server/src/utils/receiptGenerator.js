// Official FlyCentric Payment Receipt / Tax Invoice Generator
function generateReceiptHtml(receipt) {
  const invoiceNum = `FC-REC-${receipt.id}`;
  const purchaseDate = receipt.created_at
    ? new Date(receipt.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleDateString('en-US');

  const expiryDate = receipt.expiry_date
    ? new Date(receipt.expiry_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    : receipt.validity_months
      ? new Date(Date.now() + receipt.validity_months * 30 * 86400000).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Lifetime Access';

  const originalAmount = Number(receipt.original_amount_inr || receipt.amount_inr || 0);
  const discountAmount = Number(receipt.discount_amount_inr || 0);
  const finalAmount = Number(receipt.amount_inr || 0);
  const statusUpper = String(receipt.status || 'PAID').toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipt #${receipt.id} - FlyCentric</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #f8fafc; color: #1e293b; padding: 40px 20px; }
    .invoice-card {
      max-width: 780px; margin: 0 auto; background: #ffffff;
      border-radius: 16px; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
      border: 1px solid #e2e8f0; overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      color: #ffffff; padding: 36px 40px; display: flex;
      justify-content: space-between; align-items: flex-start;
    }
    .brand h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
    .brand h1 span { color: #6366f1; }
    .brand p { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .receipt-title { text-align: right; }
    .receipt-title h2 { font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8; }
    .receipt-title p { font-size: 14px; color: #cbd5e1; margin-top: 4px; font-family: monospace; }
    .content { padding: 36px 40px; }
    .status-banner {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 700;
      letter-spacing: 0.04em; margin-bottom: 24px;
      background: ${statusUpper === 'PAID' || statusUpper === 'SUCCESSFUL' ? '#ecfdf5' : '#fef2f2'};
      color: ${statusUpper === 'PAID' || statusUpper === 'SUCCESSFUL' ? '#059669' : '#dc2626'};
      border: 1px solid ${statusUpper === 'PAID' || statusUpper === 'SUCCESSFUL' ? '#a7f3d0' : '#fecaca'};
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; }
    .box h4 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 10px; }
    .box p { font-size: 14px; margin-bottom: 4px; color: #1e293b; }
    .table-wrap { margin-top: 10px; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    thead th { background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 12px 18px; border-bottom: 1px solid #e2e8f0; }
    tbody td { padding: 16px 18px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
    .summary-card {
      margin-left: auto; width: 340px; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px;
    }
    .summary-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; color: #475569; }
    .summary-row.total {
      font-size: 18px; font-weight: 800; color: #0f172a;
      border-top: 2px solid #e2e8f0; padding-top: 12px; margin-top: 8px;
    }
    .footer {
      border-top: 1px solid #e2e8f0; background: #fafafa;
      padding: 24px 40px; font-size: 12px; color: #94a3b8; text-align: center;
    }
    .actions-bar {
      max-width: 780px; margin: 20px auto 0; display: flex;
      justify-content: flex-end; gap: 12px;
    }
    .btn {
      padding: 10px 20px; border-radius: 8px; font-size: 14px;
      font-weight: 600; cursor: pointer; text-decoration: none; border: none;
    }
    .btn-print { background: #4f46e5; color: #ffffff; }
    .btn-print:hover { background: #4338ca; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; }
      .actions-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="actions-bar">
    <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="invoice-card">
    <div class="header">
      <div class="brand">
        <h1>Fly<span>Centric</span></h1>
        <p>Aviation Ground School & Pilot Training</p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 2px;">support@flycentric.in · New Delhi, India</p>
      </div>
      <div class="receipt-title">
        <h2>Tax Invoice</h2>
        <p>Invoice #: ${invoiceNum}</p>
        <p style="font-size: 12px; color: #94a3b8;">Date: ${purchaseDate}</p>
      </div>
    </div>

    <div class="content">
      <div class="status-banner">
        <span>● Payment Status: ${statusUpper}</span>
      </div>

      <div class="grid-2">
        <div class="box">
          <h4>Billed To (Cadet / Student)</h4>
          <p><strong>${receipt.student_name || 'Cadet'}</strong></p>
          <p>${receipt.student_email || ''}</p>
          ${receipt.student_phone ? `<p>Phone: ${receipt.student_phone}</p>` : ''}
          <p style="font-size: 12px; color: #64748b; margin-top: 6px;">Customer Ref: STU-${receipt.user_id}</p>
        </div>

        <div class="box">
          <h4>Transaction Reference</h4>
          <p><strong>Order ID:</strong> <span style="font-family:monospace;font-size:12px;">${receipt.razorpay_order_id || `ORD-${receipt.id}`}</span></p>
          <p><strong>Payment ID:</strong> <span style="font-family:monospace;font-size:12px;">${receipt.razorpay_payment_id || receipt.gateway_ref || 'Online Verification'}</span></p>
          <p><strong>Gateway / Method:</strong> ${receipt.payment_method || 'Razorpay Gateway (UPI / Card)'}</p>
          <p><strong>Valid Until:</strong> <strong style="color:#4338ca;">${expiryDate}</strong></p>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Description / Course</th>
              <th>Exam Scope</th>
              <th>Selected Validity</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${receipt.bundle_title || `Course Bundle #${receipt.bundle_id}`}</strong>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Comprehensive DGCA Theory, Chapter Syllabus & Test Bank</div>
              </td>
              <td>${receipt.exam_type || 'CPL / ATPL'}</td>
              <td><strong>${receipt.validity_months ? `${receipt.validity_months} Months` : '12 Months'}</strong></td>
              <td style="text-align: right; font-weight: 700;">₹${originalAmount.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="summary-card">
        <div class="summary-row">
          <span>Course Subtotal:</span>
          <span>₹${originalAmount.toLocaleString('en-IN')}</span>
        </div>
        ${discountAmount > 0 ? `
        <div class="summary-row" style="color: #059669; font-weight: 600;">
          <span>Discount Applied ${receipt.coupon_code ? `(${receipt.coupon_code})` : ''}:</span>
          <span>-₹${discountAmount.toLocaleString('en-IN')}</span>
        </div>` : ''}
        <div class="summary-row">
          <span>Taxes & Platform Fees:</span>
          <span>₹0</span>
        </div>
        <div class="summary-row total">
          <span>Total Paid:</span>
          <span>₹${finalAmount.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>This is a computer-generated receipt issued by FlyCentric Aviation LMS. No physical signature is required.</p>
      <p style="margin-top: 4px;">For billing queries or course renewals, please reach out to <strong>support@flycentric.in</strong></p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateReceiptHtml };

