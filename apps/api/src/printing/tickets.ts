function safe(value?: string): string {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function row(label: string, value?: string): string {
  const text = safe(value);
  if (!text) return '';
  return `${label}: ${text}<BR>`;
}

export interface RepairTicketInput {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  docNumber: string;
  printedAt: string;
  customerPhone: string;
  customerName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  imeiSn?: string;
  issueDescription?: string;
  priceIncVat: number;
  repairLocation?: string;
  expectedCompletion?: string;
  repairTerms?: string;
  notes?: string;
  photoCount?: number;
}

/** Blank lines let the last row clear the cutter. One cut, after the whole ticket. */
const FEED_BEFORE_CUT = '<BR><BR><BR><BR><CUT>';

/** One customer repair ticket. No cut until the text has finished. */
export function renderRepairTickets(c: RepairTicketInput): string {
  const device = [c.deviceBrand, c.deviceModel].filter(Boolean).join(' ');
  const where = c.repairLocation?.trim()
    ? `Send out: ${safe(c.repairLocation)}`
    : 'In store';
  return [
    '<CB>REPAIR RECEIPT</CB><BR>',
    `<C>${safe(c.storeName) || 'Store'}</C><BR>`,
    c.storeAddress ? `<C>${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>${safe(c.storePhone)}</C><BR>` : '',
    row('Receipt', c.docNumber),
    row('Time', c.printedAt),
    row('Customer', c.customerName),
    row('Phone', c.customerPhone),
    row('Device', device),
    row('IMEI/SN', c.imeiSn),
    row('Fault', c.issueDescription),
    `Repair: ${where}<BR>`,
    row('Expected', c.expectedCompletion),
    `Amount: €${c.priceIncVat.toFixed(2)}<BR>`,
    c.repairTerms?.trim() ? `<BR>Terms<BR>${safe(c.repairTerms)}<BR>` : '',
    FEED_BEFORE_CUT,
  ]
    .join('')
    .slice(0, 4500);
}

export interface SaleTicketInput {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  docNumber: string;
  businessDate: string;
  lines: { productName: string; quantity: number; lineTotalIncVat: number; sn?: string }[];
  totalIncVat: number;
  paymentLines: string[];
  salesTerms?: string;
}

export function renderSaleTicket(c: SaleTicketInput): string {
  const lines = c.lines
    .map((l) => {
      const sn = l.sn?.trim() ? `<BR>  SN: ${safe(l.sn)}` : '';
      return `${safe(l.productName)} x${l.quantity}  €${l.lineTotalIncVat.toFixed(2)}${sn}<BR>`;
    })
    .join('');
  const pay = c.paymentLines.map((l) => `${safe(l)}<BR>`).join('');
  const terms = c.salesTerms?.trim() ? `<BR>Terms<BR>${safe(c.salesTerms)}<BR>` : '';
  return [
    '<CB>SALES RECEIPT</CB><BR>',
    `<C>${safe(c.storeName) || 'Store'}</C><BR>`,
    c.storeAddress ? `<C>${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>${safe(c.storePhone)}</C><BR>` : '',
    row('Receipt', c.docNumber),
    row('Date', c.businessDate),
    '<BR>',
    lines,
    `<BR>TOTAL: €${c.totalIncVat.toFixed(2)}<BR>`,
    pay,
    terms,
    FEED_BEFORE_CUT,
  ]
    .join('')
    .slice(0, 4500);
}
