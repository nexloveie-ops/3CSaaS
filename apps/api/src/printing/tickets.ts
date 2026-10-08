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

/**
 * The cutter sits behind the print head. The sales ticket needs a longer
 * feed so the last line is past the blade before the single cut.
 */
const SALE_FEED_BEFORE_CUT = '<BR><BR><BR><BR><BR><BR><BR><BR><CUT>';

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
  const lines = [right(`Total: ${euro(total)}`)];
  if (p.method === 'cash') {
    lines.push(right(`Cash: ${euro(p.amountTendered ?? p.cashAmount ?? total)}`));
  } else if (p.method === 'card') {
    lines.push(right(`Card: ${euro(p.cardAmount || total)}`));
  } else if (p.method === 'mixed') {
    lines.push(right(`Cash: ${euro(p.cashAmount)}`));
    lines.push(right(`Card: ${euro(p.cardAmount)}`));
  } else if (p.method === 'bank_transfer' || p.method === 'other') {
    lines.push(right('Bank transfer'));
  } else if (p.method) {
    lines.push(right(p.method));
  }
  if ((p.changeGiven ?? 0) > 0) {
    lines.push(right(`Change: ${euro(p.changeGiven ?? 0)}`));
  }
  return lines.join('');
}

const THANKS_PATTERN = /thank you for your business[.!]?/i;

/** One clause per numbered item. "10." must stay intact, not split into "1" and "0.". */
function termsClauses(text?: string): string[] {
  const cleaned = String(text ?? '')
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<!\d)(?=\d+\.\s)/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderTerms(text?: string): string {
  const parts = termsClauses(text);
  if (!parts.length) return '';
  let thanks = '';
  const last = parts[parts.length - 1];
  const thanksAt = last.search(THANKS_PATTERN);
  if (thanksAt >= 0) {
    thanks = last.slice(thanksAt).trim();
    const before = last.slice(0, thanksAt).trim();
    if (before) parts[parts.length - 1] = before;
    else parts.pop();
  }
  const clauses = parts.map((part) => `${part}<BR>`).join('');
  const closing = thanks ? `<C>${thanks}</C><BR>` : '';
  return `<BR><C>Terms And Condition</C><BR>${clauses}${closing}`;
}

export function renderSaleTicket(c: SaleTicketInput): string {
  const lines = c.lines.map(renderSaleLine).join('<BR>');
  const body = [
    '<CB>SALES RECEIPT</CB><BR>',
    `<CB><BOLD>${safe(c.storeName) || 'Store'}</BOLD></CB><BR>`,
    c.storeAddress ? `<C>Address: ${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>Tel: ${safe(c.storePhone)}</C><BR>` : '',
    row('Receipt', c.docNumber),
    row('Date', c.businessDate),
    '<BR>',
    lines,
    '<BR>',
    renderSalePayment(c.totalIncVat, c.payment),
    renderTerms(c.salesTerms),
  ].join('');
  return body.slice(0, 4500 - SALE_FEED_BEFORE_CUT.length) + SALE_FEED_BEFORE_CUT;
}
