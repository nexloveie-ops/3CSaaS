const IN_STORE: Record<string, string[]> = {
  draft: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['completed', 'cancelled'],
};

const SEND_OUT: Record<string, string[]> = {
  draft: ['sent_out', 'cancelled'],
  sent_out: ['in_repair', 'cancelled'],
  in_repair: ['returned', 'cancelled'],
  returned: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['completed', 'cancelled'],
};

export function canTransition(
  flowType: string,
  from: string,
  to: string,
): boolean {
  const map = flowType === 'send_out' ? SEND_OUT : IN_STORE;
  return map[from]?.includes(to) ?? false;
}

export const SMS_ON_ENTER: Record<string, 'price_confirm' | 'ready'> = {
  awaiting_payment: 'price_confirm',
  completed: 'ready',
};
