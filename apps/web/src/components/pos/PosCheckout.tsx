import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SalePaymentPayload = {
  paymentMethod: 'cash' | 'card' | 'mixed';
  amountTendered?: number;
  cashAmount?: number;
  cardAmount?: number;
};

type Props = {
  total: number;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: (payment: SalePaymentPayload) => void;
};

function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function PosCheckout({ total, disabled, pending, onSubmit }: Props) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed'>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const prevTotalRef = useRef(total);

  useEffect(() => {
    if (method === 'cash' && !amountTendered) {
      setAmountTendered(total > 0 ? total.toFixed(2) : '');
    }
  }, [method, total]);

  useEffect(() => {
    if (method !== 'cash') {
      prevTotalRef.current = total;
      return;
    }
    const prev = prevTotalRef.current;
    if (Math.abs(prev - total) >= 0.005) {
      const tendered = parseAmount(amountTendered);
      if (!amountTendered || Math.abs(tendered - prev) < 0.01) {
        setAmountTendered(total > 0 ? total.toFixed(2) : '');
      }
    }
    prevTotalRef.current = total;
  }, [total, method, amountTendered]);

  const changeDue = useMemo(() => {
    if (method !== 'cash') return 0;
    const tendered = parseAmount(amountTendered);
    return Math.max(0, Math.round((tendered - total) * 100) / 100);
  }, [method, amountTendered, total]);

  function onMixedCashChange(value: string) {
    setMixedCash(value);
    const cash = parseAmount(value);
    const card = Math.max(0, Math.round((total - cash) * 100) / 100);
    setMixedCard(card > 0 ? card.toFixed(2) : '');
  }

  function canSubmit(): boolean {
    if (total <= 0) return false;
    if (method === 'cash') return parseAmount(amountTendered) + 0.001 >= total;
    if (method === 'card') return true;
    const cash = parseAmount(mixedCash);
    const card = parseAmount(mixedCard);
    return cash + card + 0.01 >= total && cash + card - 0.01 <= total;
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    if (method === 'cash') {
      onSubmit({
        paymentMethod: 'cash',
        amountTendered: parseAmount(amountTendered),
      });
      return;
    }
    if (method === 'card') {
      onSubmit({ paymentMethod: 'card' });
      return;
    }
    onSubmit({
      paymentMethod: 'mixed',
      cashAmount: parseAmount(mixedCash),
      cardAmount: parseAmount(mixedCard),
    });
  }

  return (
    <div className="pos-checkout">
      <p className="pos-checkout-label">{t('pos.receiptColPayment')}</p>
      <div className="pos-checkout-methods" role="tablist">
        {(['cash', 'card', 'mixed'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            className={method === m ? 'pos-pay-tab pos-pay-tab--active' : 'pos-pay-tab'}
            onClick={() => setMethod(m)}
          >
            {m === 'cash'
              ? t('pos.paymentCash')
              : m === 'card'
                ? t('pos.paymentCard')
                : t('pos.paymentMixed')}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <div className="pos-checkout-fields">
          <label className="form-field pos-checkout-field">
            <span className="pos-checkout-field__label">{t('pos.amountReceived')}</span>
            <div className="pos-checkout-input-wrap">
              <span className="pos-checkout-input-prefix">€</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="pos-checkout-input"
                value={amountTendered}
                onChange={(e) => setAmountTendered(e.target.value)}
              />
            </div>
          </label>
          <p
            className={
              changeDue > 0 ? 'pos-change-hint pos-change-hint--due' : 'pos-change-hint'
            }
          >
            {t('pos.changeDue')}: <strong>€{changeDue.toFixed(2)}</strong>
          </p>
        </div>
      )}

      {method === 'mixed' && (
        <div className="pos-checkout-fields pos-checkout-fields--split">
          <label className="form-field pos-checkout-field">
            <span className="pos-checkout-field__label">{t('pos.mixedCashAmount')}</span>
            <div className="pos-checkout-input-wrap">
              <span className="pos-checkout-input-prefix">€</span>
              <input
                type="number"
                min={0}
                step="0.01"
                max={total}
                className="pos-checkout-input"
                value={mixedCash}
                onChange={(e) => onMixedCashChange(e.target.value)}
              />
            </div>
          </label>
          <label className="form-field pos-checkout-field">
            <span className="pos-checkout-field__label">{t('pos.mixedCardAmount')}</span>
            <div className="pos-checkout-input-wrap">
              <span className="pos-checkout-input-prefix">€</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="pos-checkout-input"
                value={mixedCard}
                onChange={(e) => setMixedCard(e.target.value)}
              />
            </div>
          </label>
          <p className="pos-change-hint">
            {t('pos.mixedMustEqual', { total: total.toFixed(2) })}
            {parseAmount(mixedCash) + parseAmount(mixedCard) > 0 && (
              <>
                {' '}
                ({t('pos.mixedSum', {
                  sum: (parseAmount(mixedCash) + parseAmount(mixedCard)).toFixed(2),
                })}
                )
              </>
            )}
          </p>
        </div>
      )}

      {method === 'card' && (
        <p className="pos-change-hint">{t('pos.cardPayHint')}</p>
      )}

      <button
        type="button"
        className="btn btn-primary pos-checkout-submit"
        disabled={disabled || pending || !canSubmit()}
        onClick={handleSubmit}
      >
        {pending ? t('common.checking') : t('pos.completeSale')}
      </button>
    </div>
  );
}
