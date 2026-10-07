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

/** Customer copy (with price and terms) then shop copy, cut between them. */
export function renderRepairTickets(c: RepairTicketInput): string {
  const device = [c.deviceBrand, c.deviceModel].filter(Boolean).join(' ');
  const where = c.repairLocation?.trim()
    ? `外送 ${safe(c.repairLocation)}`
    : '店内';
  const head = [
    `<C>${safe(c.storeName) || '门店'}</C><BR>`,
    c.storeAddress ? `<C>${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>${safe(c.storePhone)}</C><BR>` : '',
    `单号: ${safe(c.docNumber)}<BR>`,
    `时间: ${safe(c.printedAt)}<BR>`,
    row('顾客', c.customerName),
    row('电话', c.customerPhone),
    row('设备', device),
    row('IMEI/SN', c.imeiSn),
    row('故障', c.issueDescription),
    `维修: ${where}<BR>`,
    row('预计完成', c.expectedCompletion),
  ].join('');

  const customer = [
    '<CB>维修接机单</CB><BR>',
    '<C>客户联</C><BR>',
    head,
    `金额: €${c.priceIncVat.toFixed(2)}<BR>`,
    c.repairTerms?.trim()
      ? `<BR>条款<BR>${safe(c.repairTerms).slice(0, 800)}<BR>`
      : '',
  ].join('');

  const shop = [
    '<CB>维修接机单</CB><BR>',
    '<C>门店联</C><BR>',
    head,
    row('备注', c.notes),
    c.photoCount ? `照片: ${c.photoCount}<BR>` : '',
  ].join('');

  return `${customer}<BR><CUT>${shop}<BR><CUT>`.slice(0, 4500);
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
  const pay = c.paymentLines
    .map((l) =>
      l
        .replace(/^Cash:/, '现金:')
        .replace(/^Card:/, '刷卡:')
        .replace(/^Received:/, '实收:')
        .replace(/^Change:/, '找零:'),
    )
    .map((l) => `${safe(l)}<BR>`)
    .join('');
  const terms = c.salesTerms?.trim()
    ? `<BR>${safe(c.salesTerms).slice(0, 600)}<BR>`
    : '';
  return [
    '<CB>销售小票</CB><BR>',
    `<C>${safe(c.storeName) || '门店'}</C><BR>`,
    c.storeAddress ? `<C>${safe(c.storeAddress)}</C><BR>` : '',
    c.storePhone ? `<C>${safe(c.storePhone)}</C><BR>` : '',
    `单号: ${safe(c.docNumber)}<BR>`,
    `日期: ${safe(c.businessDate)}<BR>`,
    '<BR>',
    lines,
    `<BR>合计: €${c.totalIncVat.toFixed(2)}<BR>`,
    pay,
    terms,
    '<CUT>',
  ]
    .join('')
    .slice(0, 4500);
}
