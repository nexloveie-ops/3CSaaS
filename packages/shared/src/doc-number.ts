const PREFIX: Record<string, string> = {
  receipt: 'R',
  inbound: 'IN',
  transfer: 'TR',
  invoice_b2b: 'INV',
  invoice_b2b_buyer: 'INVB',
  b2b_order: 'B2B',
  credit_note: 'CN',
  work_order: 'WO',
  preorder: 'PRE',
};

export function formatDocNumber(docType: string, year: number, seq: number): string {
  const prefix = PREFIX[docType] ?? 'DOC';
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}
