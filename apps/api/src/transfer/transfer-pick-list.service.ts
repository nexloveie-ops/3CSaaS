import { Injectable } from '@nestjs/common';

export type PickListInput = {
  docNumber: string;
  status: string;
  companyName: string;
  fromStoreName: string;
  toStoreName: string;
  createdAt?: Date;
  lines: { productName: string; quantity: number }[];
};

@Injectable()
export class TransferPickListService {
  render(data: PickListInput): string {
    const rows = data.lines
      .map(
        (l) => `
      <tr>
        <td>${escapeHtml(l.productName)}</td>
        <td align="center"><strong>${l.quantity}</strong></td>
        <td align="center">☐</td>
      </tr>`,
      )
      .join('');

    const dateStr = data.createdAt
      ? new Date(data.createdAt).toLocaleString()
      : new Date().toLocaleString();

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(data.docNumber)} pick list</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 14px; max-width: 720px; margin: 24px auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #475569; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; }
  th { background: #f1f5f9; text-align: left; }
  @media print { button { display: none; } }
</style></head><body>
<button type="button" onclick="window.print()">Print pick list</button>
<h1>Transfer pick list</h1>
<p class="meta">
  <strong>${escapeHtml(data.docNumber)}</strong> · ${escapeHtml(data.status)}<br>
  ${escapeHtml(data.companyName)}<br>
  From: <strong>${escapeHtml(data.fromStoreName)}</strong> → To: <strong>${escapeHtml(data.toStoreName)}</strong><br>
  ${escapeHtml(dateStr)}
</p>
<table>
  <thead><tr><th>Product</th><th>Qty</th><th>Picked</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
