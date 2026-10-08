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

export interface SaleTicketLine {
  /** Set for a repair line. Product fields are ignored. */
  repair?: { docNumber: string; model?: string; issue?: string };
  description?: string;
  variants?: string;
  sn?: string;
  quantity: number;
  unitPriceIncVat: number;
  lineTotalIncVat: number;
}

export interface SaleTicketPayment {
  method: string;
  cashAmount: number;
  cardAmount: number;
  /** Cash handed over. Printed as the cash amount when present. */
  amountTendered?: number;
  changeGiven?: number;
}

export interface SaleTicketInput {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  docNumber: string;
  businessDate: string;
  lines: SaleTicketLine[];
  totalIncVat: number;
  payment: SaleTicketPayment;
  salesTerms?: string;
}

function euro(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/** Feie right-aligns the whole row. Price rows are short enough to stay on one line. */
function right(text: string): string {
  return `<RIGHT>${safe(text)}</RIGHT><BR>`;
}

function renderSaleLine(l: SaleTicketLine): string {
  if (l.repair) {
    const detail = [l.repair.model, l.repair.issue]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');
    return [
      `${safe(l.repair.docNumber)}<BR>`,
      detail ? `${safe(detail)}<BR>` : '',
      right(euro(l.unitPriceIncVat)),
    ].join('');
  }
  const variants = l.variants?.trim();
  const sn = l.sn?.trim();
  return [
    `${safe(l.description)}<BR>`,
    variants ? `${safe(variants)}<BR>` : '',
    sn ? `IMEI/SN: ${safe(sn)}<BR>` : '',
    right(`${euro(l.unitPriceIncVat)}  x${l.quantity}  ${euro(l.lineTotalIncVat)}`),
  ].join('');
}

function renderSalePayment(total: number, p: SaleTicketPayment): string {
  const lines = [`Total: ${euro(total)}<BR>`];
  if (p.method === 'cash') {
    lines.push(`Cash: ${euro(p.amountTendered ?? p.cashAmount ?? total)}<BR>`);
  } else if (p.method === 'card') {
    lines.push(`Card: ${euro(p.cardAmount || total)}<BR>`);
  } else if (p.method === 'mixed') {
    lines.push(`Cash: ${euro(p.cashAmount)}<BR>`);
    lines.push(`Card: ${euro(p.cardAmount)}<BR>`);
  } else if (p.method === 'bank_transfer' || p.method === 'other') {
    lines.push('Bank transfer<BR>');
  } else if (p.method) {
    lines.push(`${safe(p.method)}<BR>`);
  }
  if ((p.changeGiven ?? 0) > 0) {
    lines.push(`Change: ${euro(p.changeGiven ?? 0)}<BR>`);
  }
  return lines.join('');
}

/** One clause per numbered item: "1. ... 2. ..." becomes two lines. */
function termsClauses(text?: string): string[] {
  const cleaned = String(text ?? '')
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(/(?=\d+\.\s)/))
    .map((part) => part.trim())
    .filter(Boolean);
}

export function renderSaleTicket(c: SaleTicketInput): string {
  const lines = c.lines.map(renderSaleLine).join('<BR>');
  const clauses = termsClauses(c.salesTerms);
  const terms = clauses.length
    ? `<BR><C>Terms And Condition</C><BR>${clauses.map((part) => `${part}<BR>`).join('')}`
    : '';
  const body = [
    '<CB>SALES RECEIPT</CB><BR>',
    `<C>${safe(c.storeName) || 'Store'}</C><BR>`,
    c.storeAddress ? `<C>${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>${safe(c.storePhone)}</C><BR>` : '',
    row('Receipt', c.docNumber),
    row('Date', c.businessDate),
    '<BR>',
    lines,
    '<BR>',
    renderSalePayment(c.totalIncVat, c.payment),
    terms,
  ].join('');
  return body.slice(0, 4500 - FEED_BEFORE_CUT.length) + FEED_BEFORE_CUT;
}
