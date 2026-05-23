import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type ReceiptLine = {
  lineIndex: number;
  productName: string;
  quantity: number;
  refundedQuantity: number;
  refundableQuantity: number;
  unitPriceIncVat: number;
  lineTotalIncVat: number;
  sn?: string;
};

type ReceiptDetail = {
  _id: string;
  docNumber: string;
  businessDate?: string;
  createdAt?: string;
  totalIncVat: number;
  netTotalIncVat: number;
  refundedTotalIncVat: number;
  paymentMethod: string;
  cashAmount?: number;
  cardAmount?: number;
  amountTendered?: number;
  changeGiven?: number;
  lines: ReceiptLine[];
  creditNotes: { _id: string; docNumber: string; totalIncVat: number }[];
};

type Props = {
  orderId: string;
  onClose: () => void;
};

function formatReceiptTime(createdAt?: string): string {
  if (!createdAt) return '';
  return new Date(createdAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentLabel(
  detail: ReceiptDetail,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (detail.paymentMethod === 'mixed') {
    const cash = detail.cashAmount ?? 0;
    const card = detail.cardAmount ?? 0;
    return t('pos.paymentMixedShort', { cash: cash.toFixed(2), card: card.toFixed(2) });
  }
  if (detail.paymentMethod === 'cash') return t('pos.paymentCash');
  if (detail.paymentMethod === 'card') return t('pos.paymentCard');
  return t('pos.paymentOther');
}

export function ReceiptDetailModal({ orderId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [refundQty, setRefundQty] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['pos-receipt', orderId],
    queryFn: () => api.getPosReceipt(orderId),
  });

  const detail = data as ReceiptDetail | undefined;

  const refundLines = useMemo(() => {
    if (!detail) return [];
    return detail.lines
      .map((line) => ({
        lineIndex: line.lineIndex,
        quantity: Number(refundQty[line.lineIndex] ?? 0),
      }))
      .filter((l) => l.quantity > 0);
  }, [detail, refundQty]);

  const refundTotal = useMemo(() => {
    if (!detail) return 0;
    return detail.lines.reduce((sum, line) => {
      const q = Number(refundQty[line.lineIndex] ?? 0);
      if (q <= 0) return sum;
      const unit = line.lineTotalIncVat / line.quantity;
      return sum + unit * q;
    }, 0);
  }, [detail, refundQty]);

  const refund = useMutation({
    mutationFn: () => api.refundPosReceipt(orderId, { lines: refundLines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-receipt', orderId] });
      qc.invalidateQueries({ queryKey: ['orders-today'] });
      qc.invalidateQueries({ queryKey: ['daily-report'] });
      qc.invalidateQueries({ queryKey: ['company-report'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['work-orders-payable'] });
      setRefundQty({});
    },
  });

  function setMaxQty(line: ReceiptLine) {
    setRefundQty((prev) => ({
      ...prev,
      [line.lineIndex]: String(line.refundableQuantity),
    }));
  }

  const hasRefunds = (detail?.refundedTotalIncVat ?? 0) > 0;

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--receipt-detail"
        role="dialog"
        aria-labelledby="receipt-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header receipt-detail-header">
          <div>
            <h3 id="receipt-detail-title">{t('pos.receiptDetailTitle')}</h3>
            {detail && (
              <div className="receipt-detail-header-meta">
                <span className="receipt-detail-doc">{detail.docNumber}</span>
                {detail.createdAt && (
                  <span className="receipt-detail-time">
                    {formatReceiptTime(detail.createdAt)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="pos-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="pos-modal-body">
          {isLoading && <p className="receipt-detail-loading">{t('common.checking')}</p>}
          {detail && (
            <>
              <div className="receipt-detail-totals">
                <div className="receipt-detail-totals__main">
                  <span className="receipt-detail-totals__label">{t('pos.receiptTotal')}</span>
                  <span className="receipt-detail-totals__value">
                    €{detail.totalIncVat.toFixed(2)}
                  </span>
                </div>
                {hasRefunds && (
                  <>
                    <div className="receipt-detail-totals__row">
                      <span>{t('pos.refundedTotal')}</span>
                      <span className="receipt-detail-totals__refunded">
                        −€{detail.refundedTotalIncVat.toFixed(2)}
                      </span>
                    </div>
                    <div className="receipt-detail-totals__row receipt-detail-totals__row--balance">
                      <span>{t('pos.remainingBalance')}</span>
                      <strong>€{detail.netTotalIncVat.toFixed(2)}</strong>
                    </div>
                  </>
                )}
                <div className="receipt-detail-totals__payment">
                  <span
                    className={`pos-payment-pill pos-payment-pill--${detail.paymentMethod === 'mixed' ? 'mixed' : detail.paymentMethod}`}
                  >
                    {paymentLabel(detail, t)}
                  </span>
                </div>
              </div>

              <h4 className="receipt-detail-section-title">{t('pos.lineItem')}</h4>
              <ul className="receipt-detail-lines">
                {detail.lines.map((line) => {
                  const unit = line.lineTotalIncVat / line.quantity;
                  const remaining = line.quantity - line.refundedQuantity;
                  return (
                    <li key={line.lineIndex} className="receipt-line-card">
                      <div className="receipt-line-card__main">
                        <div className="receipt-line-card__info">
                          <p className="receipt-line-card__name">{line.productName}</p>
                          {line.sn && (
                            <p className="receipt-line-card__sn">SN {line.sn}</p>
                          )}
                          {line.refundedQuantity > 0 && (
                            <span className="receipt-line-badge">
                              {t('pos.alreadyRefunded', { count: line.refundedQuantity })}
                            </span>
                          )}
                        </div>
                        <div className="receipt-line-card__amounts">
                          <span className="receipt-line-card__total">
                            €{line.lineTotalIncVat.toFixed(2)}
                          </span>
                          <span className="receipt-line-card__unit">
                            {t('pos.lineUnitQty', {
                              qty: remaining,
                              price: unit.toFixed(2),
                            })}
                          </span>
                        </div>
                      </div>

                      {line.refundableQuantity > 0 ? (
                        <div className="receipt-line-card__refund">
                          <label
                            className="receipt-line-card__refund-label"
                            htmlFor={`refund-qty-${line.lineIndex}`}
                          >
                            {t('pos.refundQty')}
                          </label>
                          <div className="receipt-refund-controls">
                            <input
                              id={`refund-qty-${line.lineIndex}`}
                              type="number"
                              className="receipt-refund-input"
                              min={0}
                              max={line.refundableQuantity}
                              placeholder="0"
                              value={refundQty[line.lineIndex] ?? ''}
                              onChange={(e) =>
                                setRefundQty((prev) => ({
                                  ...prev,
                                  [line.lineIndex]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm receipt-refund-max"
                              onClick={() => setMaxQty(line)}
                            >
                              {t('pos.refundMax')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="receipt-line-card__fully-refunded">
                          {t('pos.refundedTotal')}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {detail.creditNotes.length > 0 && (
                <div className="receipt-detail-credits">
                  <h4 className="receipt-detail-section-title">{t('pos.refundHistory')}</h4>
                  <ul className="receipt-detail-credits-list">
                    {detail.creditNotes.map((cn) => (
                      <li key={cn._id}>
                        <span className="receipt-detail-credit-doc">{cn.docNumber}</span>
                        <span className="receipt-detail-credit-amount">
                          €{cn.totalIncVat.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {refundTotal > 0 && (
                <div className="receipt-detail-refund-preview" role="status">
                  {t('pos.refundPreview', { amount: refundTotal.toFixed(2) })}
                </div>
              )}

              {refund.error && (
                <p className="status-fail receipt-detail-error">
                  {(refund.error as Error).message}
                </p>
              )}

              <footer className="receipt-detail-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={refundLines.length === 0 || refund.isPending}
                  onClick={() => refund.mutate()}
                >
                  {refund.isPending ? t('common.checking') : t('pos.processRefund')}
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
