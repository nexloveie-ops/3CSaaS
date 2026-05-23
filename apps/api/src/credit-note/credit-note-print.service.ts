import { Injectable } from '@nestjs/common';

@Injectable()
export class CreditNotePrintService {
  render(opts: {
    docNumber: string;
    companyName: string;
    storeName: string;
    businessDate: string;
    totalIncVat: number;
    paymentMethod: string;
    preorderDocNumber?: string;
    lines: { productName: string; quantity: number; lineTotalIncVat: number }[];
  }) {
    const rows = opts.lines
      .map(
        (l) => `<tr>
        <td>${esc(l.productName)}</td>
        <td align="center">${l.quantity}</td>
        <td align="right">€${l.lineTotalIncVat.toFixed(2)}</td>
      </tr>`,
      )
      .join('');
    const pre = opts.preorderDocNumber
      ? `<p class="meta">Preorder: ${esc(opts.preorderDocNumber)}</p>`
      : '';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(opts.docNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 4px; color: #b91c1c; }
  .meta { text-align: center; margin-bottom: 12px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  .total { font-weight: bold; text-align: right; margin-top: 12px; border-top: 1px dashed #000; padding-top: 8px; }
  @media print { button { display: none; } }
</style></head><body>
<button type="button" onclick="window.print()">Print</button>
<h1>CREDIT NOTE</h1>
<p class="meta">${esc(opts.companyName)} · ${esc(opts.storeName)}<br>
${esc(opts.docNumber)} · ${esc(opts.businessDate)}</p>
${pre}
<table><tbody>${rows}</tbody></table>
<p class="total">REFUND €${opts.totalIncVat.toFixed(2)}</p>
<p class="meta">${esc(opts.paymentMethod)}</p>
</body></html>`;
  }
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
