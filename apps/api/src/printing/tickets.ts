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

/**
 * Do not send <CUT>. This printer already cuts when the job finishes.
 * A <CUT> in the ticket fires before that and slices the receipt early.
 * The blank lines push the last row past the blade before that final cut.
 */
const SALE_END_FEED = '<BR><BR><BR><BR><BR><BR><BR><BR>';

function boldRow(label: string, value?: string): string {
  const text = safe(value);
  if (!text) return '';
  return `<BOLD>${label}: ${text}</BOLD><BR>`;
}

const REPAIR_TERMS_TITLE = 'Repair Terms & Conditions';

/** Keep each stored paragraph on its own line. Drop a repeated title. */
function renderRepairTerms(text?: string): string {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  const paragraphs = raw
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== REPAIR_TERMS_TITLE.toLowerCase());
  const body = paragraphs.map((part) => `${part}<BR>`).join('');
  return `<BR><C>${REPAIR_TERMS_TITLE}</C><BR>${body}`;
}

function finishTicket(body: string): string {
  return body.slice(0, 4500 - SALE_END_FEED.length) + SALE_END_FEED;
}

/** Customer copy. The printer cuts once, after the feed. */
export function renderRepairTickets(c: RepairTicketInput): string {
  const device = [c.deviceBrand, c.deviceModel].filter(Boolean).join(' ');
  const sendOut = c.repairLocation?.trim()
    ? `Repair: Send out: ${safe(c.repairLocation)}<BR>`
    : '';
  const body = [
    '<CB>REPAIR RECEIPT</CB><BR>',
    `<C>${safe(c.storeName) || 'Store'}</C><BR>`,
    c.storeAddress ? `<C>Address: ${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>Tel: ${safe(c.storePhone)}</C><BR>` : '',
    row('Receipt', c.docNumber),
    row('Time', c.printedAt),
    row('Customer', c.customerName),
    row('Phone', c.customerPhone),
    boldRow('Device', device),
    row('IMEI/SN', c.imeiSn),
    boldRow('Fault', c.issueDescription),
    sendOut,
    row('Expected', c.expectedCompletion),
    `<BOLD>Amount: €${c.priceIncVat.toFixed(2)}</BOLD><BR>`,
    renderRepairTerms(c.repairTerms),
  ].join('');
  return finishTicket(body);
}

/** Shop copy kept at intake. No terms, no amount, order number only in the title. */
export function renderRepairShopTicket(c: RepairTicketInput): string {
  const device = [c.deviceBrand, c.deviceModel].filter(Boolean).join(' ');
  const repair = c.repairLocation?.trim()
    ? `Repair: ${safe(c.repairLocation)}`
    : 'Repair: In store';
  const body = [
    `<CB>Repair: ${safe(c.docNumber)}</CB><BR>`,
    `From: ${safe(c.storeName) || 'Store'}<BR>`,
    c.storeAddress ? `Address: ${safe(c.storeAddress)}<BR>` : '',
    c.storePhone ? `Tel: ${safe(c.storePhone)}<BR>` : '',
    `${repair}<BR>`,
    row('Time', c.printedAt),
    row('Customer', c.customerName),
    row('Phone', c.customerPhone),
    boldRow('Device', device),
    row('IMEI/SN', c.imeiSn),
    boldRow('Fault', c.issueDescription),
    row('Expected', c.expectedCompletion),
  ].join('');
  return finishTicket(body);
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
  return body.slice(0, 4500 - SALE_END_FEED.length) + SALE_END_FEED;
}
