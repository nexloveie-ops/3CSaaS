export type TaxScheme = 'zero' | 'standard_13_5' | 'standard_23' | 'margin_23';

export type InvoicePerspective = 'retail' | 'b2b_seller' | 'b2b_buyer';

export interface TaxLineInput {
  scheme: TaxScheme;
  salePriceIncVat?: number;
  costPreTax?: number;
  wholesalePreTax?: number;
  perspective: InvoicePerspective;
  quantity?: number;
}

export interface TaxLineResult {
  netPreTax: number;
  vatAmount: number;
  gross: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function b2bStandard(netUnit: number, qty: number, rate: number, perspective: InvoicePerspective): TaxLineResult {
  const net = netUnit * qty;
  if (perspective === 'b2b_buyer') {
    return { netPreTax: round2(net), vatAmount: 0, gross: round2(net) };
  }
  const vat = round2(net * rate);
  return { netPreTax: round2(net), vatAmount: vat, gross: round2(net + vat) };
}

export function calculateLineTax(input: TaxLineInput): TaxLineResult {
  const qty = input.quantity ?? 1;
  const p = input.perspective;

  if (input.scheme === 'zero') {
    const gross = (input.salePriceIncVat ?? input.wholesalePreTax ?? 0) * qty;
    return { netPreTax: round2(gross), vatAmount: 0, gross: round2(gross) };
  }

  if (input.scheme === 'standard_13_5') {
    if (p === 'b2b_seller' || p === 'b2b_buyer') {
      return b2bStandard(input.wholesalePreTax ?? 0, qty, 0.135, p);
    }
    const gross = (input.salePriceIncVat ?? 0) * qty;
    const vat = round2((gross * 13.5) / 113.5);
    return { netPreTax: round2(gross - vat), vatAmount: vat, gross: round2(gross) };
  }

  if (input.scheme === 'standard_23') {
    if (p === 'b2b_seller' || p === 'b2b_buyer') {
      return b2bStandard(input.wholesalePreTax ?? 0, qty, 0.23, p);
    }
    const gross = (input.salePriceIncVat ?? 0) * qty;
    const vat = round2((gross * 23) / 123);
    return { netPreTax: round2(gross - vat), vatAmount: vat, gross: round2(gross) };
  }

  const cost = (input.costPreTax ?? 0) * qty;
  const wholesale = (input.wholesalePreTax ?? 0) * qty;

  if (p === 'b2b_buyer') {
    return { netPreTax: round2(wholesale), vatAmount: 0, gross: round2(wholesale) };
  }

  if (p === 'b2b_seller') {
    const vat = round2(((wholesale - cost) * 23) / 123);
    return {
      netPreTax: round2(wholesale),
      vatAmount: vat,
      gross: round2(wholesale + vat),
    };
  }

  const gross = (input.salePriceIncVat ?? 0) * qty;
  const vat = round2(((gross - cost) * 23) / 123);
  return { netPreTax: round2(gross - vat), vatAmount: Math.max(0, vat), gross: round2(gross) };
}

/** Short label for reports — percentage only, no qualifiers like "(New goods)". */
export function taxSchemeReportLabel(scheme: TaxScheme | string): string {
  switch (scheme) {
    case 'standard_13_5':
      return '13.5% VAT';
    case 'standard_23':
      return '23% VAT';
    case 'margin_23':
      return 'Margin VAT';
    case 'zero':
      return '0% VAT';
    default:
      return scheme;
  }
}
