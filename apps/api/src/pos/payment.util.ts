import { BadRequestException } from '@nestjs/common';
import { CreateSaleDto } from './dto/create-sale.dto';

export type ResolvedSalePayment = {
  paymentMethod: string;
  cashAmount: number;
  cardAmount: number;
  amountTendered?: number;
  changeGiven?: number;
  paymentMethodLabel: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveSalePayment(
  dto: CreateSaleDto,
  totalIncVat: number,
): ResolvedSalePayment {
  const total = round2(totalIncVat);
  const method = dto.paymentMethod ?? 'cash';

  if (method === 'card') {
    return {
      paymentMethod: 'card',
      cashAmount: 0,
      cardAmount: total,
      paymentMethodLabel: 'Card',
    };
  }

  if (method === 'mixed') {
    const cash = round2(dto.cashAmount ?? 0);
    const card = round2(dto.cardAmount ?? 0);
    if (cash <= 0 && card <= 0) {
      throw new BadRequestException('Enter cash and/or card amount');
    }
    if (Math.abs(cash + card - total) > 0.01) {
      throw new BadRequestException(
        `Cash (€${cash.toFixed(2)}) + card (€${card.toFixed(2)}) must equal total €${total.toFixed(2)}`,
      );
    }
    return {
      paymentMethod: 'mixed',
      cashAmount: cash,
      cardAmount: card,
      paymentMethodLabel: 'Mixed',
    };
  }

  if (method === 'cash') {
    if (dto.amountTendered == null) {
      throw new BadRequestException('Amount received is required for cash payment');
    }
    const tendered = round2(dto.amountTendered);
    if (tendered + 0.01 < total) {
      throw new BadRequestException(
        `Amount received must be at least €${total.toFixed(2)}`,
      );
    }
    return {
      paymentMethod: 'cash',
      cashAmount: total,
      cardAmount: 0,
      amountTendered: tendered,
      changeGiven: round2(tendered - total),
      paymentMethodLabel: 'Cash',
    };
  }

  return {
    paymentMethod: method,
    cashAmount: method === 'other' ? 0 : total,
    cardAmount: 0,
    paymentMethodLabel: formatPaymentMethodLabel(method),
  };
}

export function formatPaymentMethodLabel(method: string): string {
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'mixed') return 'Mixed';
  if (method === 'other') return 'Other';
  return method;
}

export function buildReceiptPaymentLines(order: {
  paymentMethod: string;
  totalIncVat: number;
  cashAmount?: number;
  cardAmount?: number;
  amountTendered?: number;
  changeGiven?: number;
}): string[] {
  const total = order.totalIncVat;
  if (order.paymentMethod === 'cash') {
    const lines = [`Cash: €${(order.cashAmount ?? total).toFixed(2)}`];
    if (order.amountTendered != null) {
      lines.push(`Received: €${order.amountTendered.toFixed(2)}`);
    }
    if (order.changeGiven != null && order.changeGiven > 0) {
      lines.push(`Change: €${order.changeGiven.toFixed(2)}`);
    }
    return lines;
  }
  if (order.paymentMethod === 'card') {
    return [`Card: €${(order.cardAmount ?? total).toFixed(2)}`];
  }
  if (order.paymentMethod === 'mixed') {
    return [
      `Cash: €${(order.cashAmount ?? 0).toFixed(2)}`,
      `Card: €${(order.cardAmount ?? 0).toFixed(2)}`,
    ];
  }
  return [`Payment: ${formatPaymentMethodLabel(order.paymentMethod)}`];
}

/** Split for daily settlement; supports legacy orders without cashAmount/cardAmount. */
export type OrderLineNet = {
  quantity: number;
  lineTotalIncVat: number;
  refundedQuantity?: number;
};

export function lineNetRevenue(line: OrderLineNet): number {
  const refunded = line.refundedQuantity ?? 0;
  const remaining = line.quantity - refunded;
  if (remaining <= 0) return 0;
  const unit = line.lineTotalIncVat / line.quantity;
  return round2(unit * remaining);
}

export function orderNetRevenue(order: {
  totalIncVat: number;
  lines: OrderLineNet[];
}): number {
  if (!order.lines?.length) return order.totalIncVat;
  return round2(order.lines.reduce((sum, line) => sum + lineNetRevenue(line), 0));
}

/** Allocate net revenue to cash/card using original payment ratio. */
export function orderNetPaymentSplit(
  order: {
    totalIncVat: number;
    cashAmount?: number;
    cardAmount?: number;
    paymentMethod: string;
    lines: OrderLineNet[];
  },
): { cash: number; card: number; other: number } {
  const net = orderNetRevenue(order);
  if (net <= 0) return { cash: 0, card: 0, other: 0 };
  const gross = order.totalIncVat;
  if (gross <= 0) {
    return paymentSplitForReport({
      paymentMethod: order.paymentMethod,
      totalIncVat: 0,
      cashAmount: 0,
      cardAmount: 0,
    });
  }
  const cashGross = order.cashAmount ?? 0;
  const cardGross = order.cardAmount ?? 0;
  if (cashGross > 0 || cardGross > 0) {
    const ratio = net / gross;
    return {
      cash: round2(cashGross * ratio),
      card: round2(cardGross * ratio),
      other: 0,
    };
  }
  const legacy = paymentSplitForReport(order);
  const ratio = net / gross;
  return {
    cash: round2(legacy.cash * ratio),
    card: round2(legacy.card * ratio),
    other: round2(legacy.other * ratio),
  };
}

export function paymentSplitForReport(order: {
  paymentMethod: string;
  totalIncVat: number;
  cashAmount?: number;
  cardAmount?: number;
}): { cash: number; card: number; other: number } {
  if (order.cashAmount != null || order.cardAmount != null) {
    return {
      cash: order.cashAmount ?? 0,
      card: order.cardAmount ?? 0,
      other: 0,
    };
  }
  if (order.paymentMethod === 'cash') {
    return { cash: order.totalIncVat, card: 0, other: 0 };
  }
  if (order.paymentMethod === 'card') {
    return { cash: 0, card: order.totalIncVat, other: 0 };
  }
  if (order.paymentMethod === 'mixed') {
    return { cash: 0, card: 0, other: order.totalIncVat };
  }
  return { cash: 0, card: 0, other: order.totalIncVat };
}
