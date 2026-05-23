import { Injectable } from '@nestjs/common';

export type WorkOrderReceiptCopy = 'customer' | 'shop';

export interface WorkOrderReceiptInput {
  copyLabel: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  docNumber: string;
  printedAt: string;
  customerPhone: string;
  customerName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  imeiSn?: string;
  issueDescription?: string;
  priceIncVat: number;
  showPrice: boolean;
  repairLocation?: string;
  expectedCompletion?: string;
  repairTerms?: string;
  notes?: string;
}

@Injectable()
export class WorkOrderReceiptService {
  /** 80mm thermal — one copy per print job. */
  render(c: WorkOrderReceiptInput): string {
    const storeLines = [
      `<div class="line center store-heading"><strong>Store location</strong></div>`,
      c.storeName,
      c.storeAddress || '(address not set)',
      [c.storePhone, c.storeEmail].filter(Boolean).join(' · '),
    ]
      .filter((x): x is string => Boolean(x))
      .map((x) =>
        x.startsWith('<div')
          ? x
          : `<div class="line center store-line">${esc(x)}</div>`,
      )
      .join('');

    const device = [
      c.deviceBrand || c.deviceModel
        ? `Device: ${[c.deviceBrand, c.deviceModel].filter(Boolean).join(' ')}`
        : '',
      c.imeiSn ? `IMEI/SN: ${c.imeiSn}` : '',
      c.issueDescription ? `Issue: ${c.issueDescription}` : '',
      c.showPrice ? `Price (inc VAT): €${c.priceIncVat.toFixed(2)}` : '',
      c.repairLocation ? `Repair at: ${c.repairLocation}` : 'Repair: In-store',
      c.expectedCompletion ? `Expected completion: ${c.expectedCompletion}` : '',
    ]
      .filter(Boolean)
      .map((x) => `<div class="line">${esc(x)}</div>`)
      .join('');

    const notesBlock = c.notes?.trim()
      ? `<div class="section"><div class="line"><strong>Notes</strong></div><div class="terms">${esc(c.notes)}</div></div>`
      : '';

    const terms = c.repairTerms?.trim()
      ? `<div class="section"><div class="line"><strong>Terms &amp; conditions</strong></div><div class="terms">${esc(c.repairTerms)}</div></div>`
      : '';

    const body = `<div class="ticket">
<div class="copy-label">${esc(c.copyLabel)}</div>
<h1>REPAIR RECEIPT</h1>
<div class="section store-block">${storeLines}</div>
<div class="section center muted">${esc(c.docNumber)} · ${esc(c.printedAt)}</div>
<div class="section">
<div class="line">Customer phone: ${esc(c.customerPhone)}</div>
${c.customerName ? `<div class="line">Customer name: ${esc(c.customerName)}</div>` : ''}
${device}
</div>
${notesBlock}
${terms}
</div>`;

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(c.docNumber)} — ${esc(c.copyLabel)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; margin: 0 auto; }
  .ticket { padding-bottom: 8px; }
  .copy-label { text-align: center; font-weight: bold; font-size: 12px; margin: 8px 0 6px; border: 1px solid #000; padding: 4px; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 4px; }
  .line { margin: 2px 0; word-break: break-word; }
  .center { text-align: center; }
  .muted { font-size: 10px; color: #333; }
  .section { margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; }
  .store-heading { margin-top: 4px; }
  .store-line { font-size: 11px; }
  .terms { font-size: 9px; white-space: pre-wrap; margin-top: 6px; }
  @media print { button { display: none; } }
  @media screen { body { border: 1px dashed #ccc; padding: 8px; } button { margin-bottom: 8px; } }
</style></head><body>
<button type="button" onclick="window.print()">Print</button>
${body}
<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 200); });</script>
</body></html>`;
  }
}

function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
