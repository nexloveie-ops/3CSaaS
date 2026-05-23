import { Injectable, NotFoundException } from '@nestjs/common';

export interface ReceiptRenderInput {
  docNumber: string;
  businessDate: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  paymentLines: string[];
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  lines: {
    productName: string;
    quantity: number;
    unitPriceIncVat: number;
    lineTotalIncVat: number;
    sn?: string;
  }[];
  totalIncVat: number;
}

@Injectable()
export class PosReceiptService {
  /** 80mm thermal receipt — VAT breakdown hidden for B2C (IE retail). */
  render(data: ReceiptRenderInput): string {
    const rows = data.lines
      .map(
        (l) => `
      <tr>
        <td>${escapeHtml(l.productName)}${l.sn ? `<br><small>IMEI/SN: ${escapeHtml(l.sn)}</small>` : ''}</td>
        <td align="center">${l.quantity}</td>
        <td align="right">€${l.lineTotalIncVat.toFixed(2)}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(data.docNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 8px; }
  .store-block { text-align: center; margin-bottom: 10px; font-size: 11px; line-height: 1.45; }
  .store-block h1.store-name { font-weight: bold; font-size: 14px; margin: 0 0 6px; text-align: center; }
  .meta { text-align: center; margin-bottom: 10px; font-size: 11px; line-height: 1.4; }
  .meta .pay { margin-top: 4px; font-weight: bold; }
  .pay-line { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; }
  .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 12px; border-top: 1px dashed #000; padding-top: 8px; }
  .thanks { text-align: center; margin-top: 16px; font-size: 11px; }
  @media screen { body { border: 1px dashed #ccc; padding: 12px; } button.print-btn { margin-bottom: 8px; } }
  @media print { button.print-btn { display: none; } }
</style></head><body>
<button class="print-btn" type="button" onclick="window.print()">Print receipt</button>
<div class="store-block">
  <h1 class="store-name">${escapeHtml(data.storeName)}</h1>
  ${data.storeAddress ? `<div>${escapeHtml(data.storeAddress)}</div>` : ''}
  ${data.storePhone ? `<div>Tel: ${escapeHtml(data.storePhone)}</div>` : ''}
  ${data.storeEmail ? `<div>${escapeHtml(data.storeEmail)}</div>` : ''}
</div>
<p class="meta">
${escapeHtml(data.docNumber)} · ${escapeHtml(data.businessDate)}<br>
<span class="pay">${escapeHtml(data.paymentMethodLabel)}</span>
${data.paymentLines.map((line) => `<div class="pay-line">${escapeHtml(line)}</div>`).join('')}
</p>
<table>
  <tbody>${rows}</tbody>
</table>
<p class="total">TOTAL €${data.totalIncVat.toFixed(2)}</p>
<p class="thanks">Thank you for your purchase</p>
</body></html>`;
  }
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
