import { useTranslation } from 'react-i18next';

export type TodayReceipt = {
  _id: string;
  docNumber: string;
  totalIncVat: number;
  netTotalIncVat?: number;
  refundedTotalIncVat?: number;
  paymentMethod: string;
  cashAmount?: number;
  cardAmount?: number;
  createdAt?: string;
};

type Props = {
  orders: TodayReceipt[] | undefined;
  onSelect: (orderId: string) => void;
  onPrint: (orderId: string) => void;
};

function formatTime(createdAt?: string): string {
  if (!createdAt) return '—';
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentLabel(
  o: TodayReceipt,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (o.paymentMethod === 'mixed') {
    const cash = o.cashAmount ?? 0;
    const card = o.cardAmount ?? 0;
    return t('pos.paymentMixedShort', { cash: cash.toFixed(2), card: card.toFixed(2) });
  }
  if (o.paymentMethod === 'cash') return t('pos.paymentCash');
  if (o.paymentMethod === 'card') return t('pos.paymentCard');
  return t('pos.paymentOther');
}

export function TodayReceiptsPanel({ orders, onSelect, onPrint }: Props) {
  const { t } = useTranslation();
  const list = orders ?? [];

  return (
    <section className="section-card pos-receipts-panel">
      <div className="pos-receipts-header">
        <h3>{t('pos.todayReceipts')}</h3>
        <span className="pos-receipts-count">
          {t('pos.receiptCount', { count: list.length })}
        </span>
      </div>

      {list.length === 0 ? (
        <p className="empty-state pos-receipts-empty">{t('pos.noReceiptsToday')}</p>
      ) : (
        <div className="table-wrap pos-receipts-table-wrap">
          <table className="pos-receipts-table">
            <thead>
              <tr>
                <th>{t('pos.receiptColNumber')}</th>
                <th>{t('pos.receiptColTime')}</th>
                <th className="pos-receipts-col-amount">{t('pos.receiptColAmount')}</th>
                <th>{t('pos.receiptColPayment')}</th>
                <th className="pos-receipts-col-actions">{t('pos.receiptColActions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const net = o.netTotalIncVat ?? o.totalIncVat;
                const refunded = o.refundedTotalIncVat ?? 0;
                return (
                <tr
                  key={o._id}
                  className="pos-receipt-row-clickable"
                  onClick={() => onSelect(o._id)}
                >
                  <td>
                    <span className="pos-receipt-doc">{o.docNumber}</span>
                  </td>
                  <td className="pos-receipt-muted">{formatTime(o.createdAt)}</td>
                  <td className="pos-receipts-col-amount">
                    <strong>€{net.toFixed(2)}</strong>
                    {refunded > 0 && (
                      <div className="pos-receipt-muted" style={{ fontSize: '0.7rem' }}>
                        {t('pos.refundedShort', { amount: refunded.toFixed(2) })}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`pos-payment-pill pos-payment-pill--${o.paymentMethod === 'mixed' ? 'mixed' : o.paymentMethod}`}
                    >
                      {paymentLabel(o, t)}
                    </span>
                  </td>
                  <td className="pos-receipts-col-actions">
                    <div className="pos-receipts-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrint(o._id);
                        }}
                      >
                        {t('pos.printReceipt')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
