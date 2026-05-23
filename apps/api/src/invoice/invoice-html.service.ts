import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceDocument } from '@lz3c/db';

@Injectable()
export class InvoiceHtmlService {
  render(inv: InvoiceDocument | Record<string, unknown>): string {
    if (!inv) throw new NotFoundException();
    const lines = (inv.lines as { productName: string; quantity: number; unitPricePreTax: number; lineNetPreTax: number; lineVat: number }[]) ?? [];
    const seller = inv.seller as Record<string, string>;
    const buyer = inv.buyer as Record<string, string>;

    const rows = lines
      .map(
        (l) => `
      <tr>
        <td>${escapeHtml(l.productName)}</td>
        <td align="right">${l.quantity}</td>
        <td align="right">€${l.unitPricePreTax.toFixed(2)}</td>
        <td align="right">€${l.lineNetPreTax.toFixed(2)}</td>
        ${inv.perspective === 'seller' ? `<td align="right">€${l.lineVat.toFixed(2)}</td>` : ''}
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${inv.docNumber}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; max-width: 800px; margin: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px; }
  .parties { display: flex; gap: 40px; }
  .party { flex: 1; }
  h1 { font-size: 18px; }
  @media print { button { display: none; } }
</style></head><body>
<button onclick="window.print()">Print</button>
<h1>Invoice ${inv.docNumber}</h1>
<p>Perspective: <strong>${inv.perspective}</strong></p>
<div class="parties">
  <div class="party"><h3>Seller</h3>
    <p>${escapeHtml(seller.legalName || seller.name)}<br>
    VAT: ${escapeHtml(seller.vatNumber || '—')}<br>
    ${escapeHtml(seller.address || '')}<br>
    ${escapeHtml(seller.contactName || '')} ${escapeHtml(seller.contactPhone || '')}<br>
    Bank: ${escapeHtml(seller.bankAccount || '—')}</p></div>
  <div class="party"><h3>Buyer</h3>
    <p>${escapeHtml(buyer.legalName || buyer.name)}<br>
    VAT: ${escapeHtml(buyer.vatNumber || '—')}<br>
    ${escapeHtml(buyer.address || '')}</p></div>
</div>
<table>
  <thead><tr>
    <th>Product</th><th>Qty</th><th>Unit (pre-tax)</th><th>Net</th>
    ${inv.perspective === 'seller' ? '<th>VAT</th>' : ''}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p>Subtotal (pre-tax): €${(inv.subtotalPreTax as number).toFixed(2)}</p>
${inv.perspective === 'seller' ? `<p>VAT total: €${(inv.totalVat as number).toFixed(2)}</p>` : ''}
<p><strong>Total payable: €${(inv.totalPayable as number).toFixed(2)}</strong></p>
</body></html>`;
  }
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
