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
  salesTerms?: string;
}

export interface B2bInvoiceRenderInput {
  docNumber: string;
  businessDate: string;
  seller: {
    name: string;
    legalName?: string;
    vatNumber?: string;
    registrationNumber?: string;
    address?: string;
    contactPhone?: string;
    contactEmail?: string;
    bankAccount?: string;
  };
  buyer: {
    name: string;
    registrationNumber?: string;
    vatNumber?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  lines: {
    productName: string;
    quantity: number;
    unitPriceIncVat: number;
    lineTotalIncVat: number;
    lineNetPreTax: number;
    lineVat: number;
    vatLabel: string;
    sn?: string;
  }[];
  /** VAT totals grouped by tax scheme label (e.g. 23% VAT). */
  vatBreakdown: { label: string; net: number; vat: number }[];
  subtotalPreTax: number;
  totalIncVat: number;
  totalVat: number;
  /** e.g. "Draft preview" or "Awaiting payment" */
  statusLabel?: string;
  /** Show Confirm & send (draft preview opened from POS). */
  showConfirmSend?: boolean;
  /** Omit on-screen toolbar (for PDF attachment). */
  omitToolbar?: boolean;
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
  .terms { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #000; font-size: 10px; line-height: 1.4; text-align: left; }
  .terms-title { font-weight: bold; margin-bottom: 4px; text-align: center; }
  .terms-body { white-space: pre-wrap; word-break: break-word; }
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
${renderSalesTermsBlock(data.salesTerms)}
<p class="thanks">Thank you for your purchase</p>
</body></html>`;
  }

  /** A4 B2B invoice preview for POS wholesale sales. */
  renderB2bInvoice(data: B2bInvoiceRenderInput): string {
    const sellerName = data.seller.legalName || data.seller.name;
    const rows = data.lines
      .map(
        (l) => `
      <tr>
        <td>${escapeHtml(l.productName)}${l.sn ? `<br><small>SN: ${escapeHtml(l.sn)}</small>` : ''}</td>
        <td class="num">${l.quantity}</td>
        <td class="num">€${l.unitPriceIncVat.toFixed(2)}</td>
        <td class="num">€${l.lineNetPreTax.toFixed(2)}</td>
        <td class="num">${escapeHtml(l.vatLabel)}</td>
        <td class="num">€${l.lineVat.toFixed(2)}</td>
        <td class="num">€${l.lineTotalIncVat.toFixed(2)}</td>
      </tr>`,
      )
      .join('');

    const vatRows = data.vatBreakdown
      .map(
        (v) => `
      <tr>
        <td>${escapeHtml(v.label)}</td>
        <td class="num">€${v.net.toFixed(2)}</td>
        <td class="num">€${v.vat.toFixed(2)}</td>
      </tr>`,
      )
      .join('');

    const bankHtml = data.seller.bankAccount
      ? escapeHtml(data.seller.bankAccount).replace(/\r\n|\n|\r/g, '<br>')
      : '—';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(data.docNumber)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; max-width: 900px; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { color: #555; margin-bottom: 20px; }
  .parties { display: flex; gap: 40px; margin-bottom: 20px; }
  .party { flex: 1; }
  .party h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
  .party p { margin: 0; line-height: 1.5; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; vertical-align: top; }
  th { text-align: left; font-size: 11px; color: #555; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  .vat-summary { margin-top: 20px; margin-left: auto; width: 380px; }
  .vat-summary h3 { margin: 0 0 8px; font-size: 13px; text-align: left; }
  .vat-summary table { width: 100%; table-layout: fixed; margin-top: 0; }
  .vat-summary th:nth-child(1), .vat-summary td:nth-child(1) { width: 44%; text-align: left; }
  .vat-summary th:nth-child(2), .vat-summary td:nth-child(2) { width: 28%; }
  .vat-summary th:nth-child(3), .vat-summary td:nth-child(3) { width: 28%; }
  .totals { margin-top: 16px; text-align: right; line-height: 1.7; }
  .totals .grand { font-size: 16px; font-weight: bold; margin-top: 6px; }
  .bank { margin-top: 28px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .bank h3 { margin: 0 0 8px; font-size: 13px; }
  .status { display: inline-block; margin-top: 8px; padding: 4px 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 999px; font-size: 11px; font-weight: 600; color: #9a3412; }
  .status--draft { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; align-items: center; }
  .toolbar button { font: inherit; font-size: 13px; padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  .toolbar button.primary { background: #0f172a; color: #fff; border-color: #0f172a; font-weight: 600; }
  .toolbar button:disabled { opacity: 0.55; cursor: not-allowed; }
  .toolbar .hint { color: #64748b; font-size: 12px; }
  @media print { .toolbar { display: none; } }
</style></head><body>
${
  data.omitToolbar
    ? ''
    : `<div class="toolbar">
  <button type="button" onclick="window.print()">Print invoice</button>
  ${
    data.showConfirmSend
      ? `<button type="button" class="primary" id="confirm-send">确认并发送</button>
  <span class="hint" id="confirm-hint">确认后将完成交易、扣减库存，并把发票发送至买家邮箱。</span>`
      : ''
  }
</div>`
}
<h1>Invoice ${escapeHtml(data.docNumber)}</h1>
<p class="meta">${escapeHtml(data.businessDate)}${
  data.statusLabel
    ? ` · <span class="status${data.statusLabel === 'Draft preview' ? ' status--draft' : ''}" id="invoice-status">${escapeHtml(data.statusLabel)}</span>`
    : ''
}</p>
${
  data.showConfirmSend && !data.omitToolbar
    ? `<script>
(function () {
  var btn = document.getElementById('confirm-send');
  if (!btn) return;
  btn.addEventListener('click', function () {
    if (!window.opener || window.opener.closed) {
      alert('请保持 POS 窗口打开后再试。');
      return;
    }
    btn.disabled = true;
    btn.textContent = '处理中…';
    window.opener.postMessage({ type: 'lz3c-b2b-confirm-send' }, '*');
  });
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type !== 'lz3c-b2b-confirm-result') return;
    if (data.ok) {
      btn.textContent = '已确认';
      var status = document.getElementById('invoice-status');
      if (status) {
        status.textContent = 'Awaiting payment';
        status.className = 'status';
      }
      var hint = document.getElementById('confirm-hint');
      if (hint) {
        hint.textContent = data.emailSent
          ? ('已生成 ' + (data.docNumber || 'invoice') + ' 并发送至 ' + (data.emailTo || '买家') + '。')
          : ('已生成 ' + (data.docNumber || 'invoice') + (data.emailNote ? ' — ' + data.emailNote : '') + '。');
      }
      if (data.docNumber) {
        var h1 = document.querySelector('h1');
        if (h1) h1.textContent = 'Invoice ' + data.docNumber;
      }
    } else {
      btn.disabled = false;
      btn.textContent = '确认并发送';
      alert(data.error || '确认失败');
    }
  });
})();
</script>`
    : ''
}
<div class="parties">
  <div class="party">
    <h3>Seller</h3>
    <p><strong>${escapeHtml(sellerName)}</strong>
    ${data.seller.vatNumber ? `<br>VAT: ${escapeHtml(data.seller.vatNumber)}` : ''}
    ${data.seller.registrationNumber ? `<br>Reg: ${escapeHtml(data.seller.registrationNumber)}` : ''}
    ${data.seller.address ? `<br>${escapeHtml(data.seller.address)}` : ''}
    ${data.seller.contactPhone ? `<br>${escapeHtml(data.seller.contactPhone)}` : ''}
    ${data.seller.contactEmail ? `<br>${escapeHtml(data.seller.contactEmail)}` : ''}
    </p>
  </div>
  <div class="party">
    <h3>Buyer</h3>
    <p><strong>${escapeHtml(data.buyer.name)}</strong>
    ${data.buyer.vatNumber ? `<br>VAT: ${escapeHtml(data.buyer.vatNumber)}` : ''}
    ${data.buyer.registrationNumber ? `<br>Reg: ${escapeHtml(data.buyer.registrationNumber)}` : ''}
    ${data.buyer.address ? `<br>${escapeHtml(data.buyer.address)}` : ''}
    ${data.buyer.phone ? `<br>${escapeHtml(data.buyer.phone)}` : ''}
    ${data.buyer.email ? `<br>${escapeHtml(data.buyer.email)}` : ''}
    </p>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>Product</th>
      <th class="num">Qty</th>
      <th class="num">Unit (inc VAT)</th>
      <th class="num">Net</th>
      <th class="num">VAT rate</th>
      <th class="num">VAT</th>
      <th class="num">Total</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="vat-summary">
  <h3>VAT summary (by tax category)</h3>
  <table>
    <thead>
      <tr>
        <th>Tax</th>
        <th class="num">Net</th>
        <th class="num">VAT</th>
      </tr>
    </thead>
    <tbody>${vatRows}</tbody>
  </table>
</div>
<div class="totals">
  <div>Subtotal (ex VAT): €${data.subtotalPreTax.toFixed(2)}</div>
  <div>VAT total: €${data.totalVat.toFixed(2)}</div>
  <div class="grand">Total payable: €${data.totalIncVat.toFixed(2)}</div>
</div>
<div class="bank">
  <h3>Payment / bank details</h3>
  <div>${bankHtml}</div>
</div>
</body></html>`;
  }
}

function renderSalesTermsBlock(salesTerms?: string): string {
  const text = salesTerms?.trim();
  if (!text) return '';
  return `<div class="terms"><div class="terms-title">Terms &amp; conditions</div><div class="terms-body">${escapeHtml(text)}</div></div>`;
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
