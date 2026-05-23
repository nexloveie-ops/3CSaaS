import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PosCheckout, type SalePaymentPayload } from './PosCheckout';

export type CartLine = {
  productId: string;
  name: string;
  qty: number;
  price: number;
  serialUnitId?: string;
  sn?: string;
  workOrderId?: string;
};

type Props = {
  lines: CartLine[];
  total: number;
  checkoutDisabled?: boolean;
  checkoutPending?: boolean;
  onRemove: (index: number) => void;
  onUpdateQty: (index: number, delta: number) => void;
  onCheckout: (payment: SalePaymentPayload) => void;
  children?: ReactNode;
};

function canAdjustQty(line: CartLine): boolean {
  return !line.serialUnitId && !line.workOrderId;
}

export function PosCartPanel({
  lines,
  total,
  checkoutDisabled,
  checkoutPending,
  onRemove,
  onUpdateQty,
  onCheckout,
  children,
}: Props) {
  const { t } = useTranslation();
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <aside className="pos-cart-panel">
      <header className="pos-cart-panel__header">
        <h3 className="pos-cart-panel__title">{t('pos.cart')}</h3>
        {itemCount > 0 && (
          <span className="pos-cart-panel__count">
            {t('pos.cartItemCount', { count: itemCount })}
          </span>
        )}
      </header>

      <div className="pos-cart-panel__body">
        {lines.length === 0 ? (
          <div className="pos-cart-empty">
            <div className="pos-cart-empty__icon" aria-hidden />
            <p>{t('pos.cartEmpty')}</p>
          </div>
        ) : (
          <ul className="pos-cart-items">
            {lines.map((line, i) => {
              const lineTotal = line.price * line.qty;
              const adjustable = canAdjustQty(line);
              return (
                <li key={line.workOrderId ?? line.serialUnitId ?? `${line.productId}-${i}`}>
                  <article className="pos-cart-item">
                    <div className="pos-cart-item__head">
                      <div className="pos-cart-item__info">
                        <p className="pos-cart-item__name">{line.name}</p>
                        {line.sn && (
                          <p className="pos-cart-item__meta">
                            <span className="pos-cart-item__label">{t('pos.lineSn')}</span>
                            <code>{line.sn}</code>
                          </p>
                        )}
                        {line.workOrderId && (
                          <span className="pos-cart-item__badge">{t('pos.repairSection')}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="pos-cart-item__remove"
                        aria-label={t('pos.removeFromCart')}
                        onClick={() => onRemove(i)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="pos-cart-item__foot">
                      {adjustable ? (
                        <div className="pos-cart-qty" role="group" aria-label={t('common.qty')}>
                          <button
                            type="button"
                            className="pos-cart-qty__btn"
                            aria-label={t('pos.decreaseQty')}
                            onClick={() => onUpdateQty(i, -1)}
                          >
                            −
                          </button>
                          <span className="pos-cart-qty__value">{line.qty}</span>
                          <button
                            type="button"
                            className="pos-cart-qty__btn"
                            aria-label={t('pos.increaseQty')}
                            onClick={() => onUpdateQty(i, 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <span className="pos-cart-qty pos-cart-qty--readonly">
                          {t('common.qty')} {line.qty}
                        </span>
                      )}
                      <div className="pos-cart-item__pricing">
                        {line.qty > 1 && (
                          <span className="pos-cart-item__unit">
                            €{line.price.toFixed(2)} × {line.qty}
                          </span>
                        )}
                        <span className="pos-cart-item__total">€{lineTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <footer className="pos-cart-panel__footer">
          <div className="pos-cart-summary">
            <span>{t('pos.total')}</span>
            <strong>€{total.toFixed(2)}</strong>
          </div>
          <PosCheckout
            total={total}
            disabled={checkoutDisabled}
            pending={checkoutPending}
            onSubmit={onCheckout}
          />
          {children}
        </footer>
      )}
    </aside>
  );
}
