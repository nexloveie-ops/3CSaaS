export function renderAuditPurgeEmail(opts: {
  companyName: string;
  deleted: number;
  cutoff: string;
  at: string;
}) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;color:#334155;line-height:1.5;padding:24px;">
  <h2 style="color:#1d4ed8;margin:0 0 12px;">LZ3C — Audit log purge</h2>
  <p>Audit retention cleanup completed for <strong>${escapeHtml(opts.companyName)}</strong>.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Deleted</td><td><strong>${opts.deleted}</strong> events</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Cutoff</td><td>${escapeHtml(opts.cutoff)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Completed</td><td>${escapeHtml(opts.at)}</td></tr>
  </table>
  <p style="font-size:12px;color:#94a3b8;">This is an automated message from your LZ3C company settings.</p>
</body></html>`;
}

export function auditPurgeEmailText(opts: {
  companyName: string;
  deleted: number;
  cutoff: string;
  at: string;
}) {
  return `Audit log purge completed for ${opts.companyName}.\n\nDeleted: ${opts.deleted} events\nCutoff: ${opts.cutoff}\nAt: ${opts.at}\n`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
