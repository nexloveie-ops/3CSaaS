import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type B2bInvoicePaymentOrder = {
  _id: string;
  docNumber: string;
  totalIncVat: number;
  paidAmount?: number;
};

type Props = {
  order: B2bInvoicePaymentOrder;
  pending?: boolean;
  error?: string | null;
  onSubmit: (values: {
    paidAt: string;
    paymentMethod: string;
    amount: number;
  }) => void;
  onClose: () => void;
};

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function B2bInvoicePaymentModal({
  order,
  pending,
  error,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const remaining = Math.max(
    0,
    Math.round((order.totalIncVat - (order.paidAmount ?? 0)) * 100) / 100,
  );
  const [paidAt, setPaidAt] = useState(() => toLocalInputValue(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : '');

  const canSubmit = useMemo(() => {
    const n = Number(amount);
    return !!paidAt && Number.isFinite(n) && n > 0;
  }, [paidAt, amount]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || pending) return;
    const local = new Date(paidAt);
    onSubmit({
      paidAt: local.toISOString(),
      paymentMethod,
      amount: Math.round(Number(amount) * 100) / 100,
    });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-create"
        role="dialog"
        aria-labelledby="b2b-pay-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="b2b-pay-title">{t('b2bCustomers.payTitle')}</h3>
          <p className="pos-modal-sub">
            {order.docNumber} · €{order.totalIncVat.toFixed(2)}
          </p>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label={t('b2bCustomers.cancel')}
            disabled={pending}
          >
            ×
          </button>
        </header>
        <form className="pos-modal-body preorder-create-form" onSubmit={handleSubmit}>
          <label className="form-field preorder-form__full">
            <span>{t('b2bCustomers.payAt')}</span>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              required
            />
          </label>
          <label className="form-field preorder-form__full">
            <span>{t('b2bCustomers.payMethod')}</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              required
            >
              <option value="bank_transfer">{t('b2bCustomers.methodBank')}</option>
              <option value="cash">{t('b2bCustomers.methodCash')}</option>
              <option value="card">{t('b2bCustomers.methodCard')}</option>
              <option value="other">{t('b2bCustomers.methodOther')}</option>
            </select>
          </label>
          <label className="form-field preorder-form__full">
            <span>{t('b2bCustomers.payAmount')}</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          {error && <p className="status-fail">{error}</p>}
          <footer className="pos-modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={pending}
            >
              {t('b2bCustomers.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || !canSubmit}
            >
              {t('b2bCustomers.paySubmit')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
