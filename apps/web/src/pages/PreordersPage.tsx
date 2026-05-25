import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PreorderCreateModal } from '../components/preorders/PreorderCreateModal';
import { PreorderNotifyModal } from '../components/preorders/PreorderNotifyModal';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

type PreorderRow = {
  _id: string;
  docNumber: string;
  status: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  expectedArrivalDate?: string;
  lines: { productName: string; quantity: number; estimatedPriceIncVat?: number }[];
  notifiedVia?: string;
  notifiedAt?: string;
};

type StatusVariant = 'pending' | 'arrived' | 'completed' | 'cancelled';

function statusVariant(status: string): StatusVariant {
  if (['cancelled'].includes(status)) return 'cancelled';
  if (['completed', 'closed', 'converted_to_sale'].includes(status)) return 'completed';
  if (['arrived', 'ready'].includes(status)) return 'arrived';
  return 'pending';
}

function statusLabel(status: string, t: (k: string) => string): string {
  switch (statusVariant(status)) {
    case 'pending':
      return t('preorders.statusPending');
    case 'arrived':
      return t('preorders.statusArrived');
    case 'completed':
      return t('preorders.statusCompleted');
    case 'cancelled':
      return t('preorders.statusCancelled');
    default:
      return status;
  }
}

function PreorderContactCell({ p }: { p: PreorderRow }) {
  const name = p.customerName?.trim();
  const phone = p.customerPhone?.trim();
  const email = p.customerEmail?.trim();
  if (!name && !email) {
    return (
      <div className="preorders-contact">
        <span className="preorders-contact__primary">{phone || '—'}</span>
      </div>
    );
  }
  return (
    <div className="preorders-contact">
      {name && <span className="preorders-contact__primary">{name}</span>}
      {phone && <span className="preorders-contact__secondary">{phone}</span>}
      {email && <span className="preorders-contact__secondary">{email}</span>}
    </div>
  );
}

export function PreordersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: preorders, isLoading } = useQuery({
    queryKey: ['preorders'],
    queryFn: () => api.listPreorders() as Promise<PreorderRow[]>,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<PreorderRow | null>(null);

  const complete = useMutation({
    mutationFn: (id: string) => api.markPreorderCompleted(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preorders'] }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelPreorder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preorders'] }),
  });

  function openNotify(p: PreorderRow) {
    setNotifyTarget(p);
  }

  const list = preorders ?? [];

  return (
    <div className="page-content preorders-page">
      <PageHeader
        title={t('preorders.title')}
        description={t('preorders.subtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            {t('preorders.newButton')}
          </button>
        }
      />

      <section className="section-card preorders-panel">
        <div className="preorders-panel__head">
          <h3>{t('preorders.listTitle')}</h3>
          <span className="preorders-panel__count">
            {isLoading ? '…' : t('preorders.recordCount', { count: list.length })}
          </span>
        </div>

        {isLoading ? (
          <p className="preorders-panel__loading">{t('common.checking')}</p>
        ) : list.length === 0 ? (
          <div className="preorders-empty">
            <p className="preorders-empty__title">{t('preorders.empty')}</p>
            <p className="preorders-empty__hint">{t('preorders.emptyHint')}</p>
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              {t('preorders.emptyAction')}
            </button>
          </div>
        ) : (
          <div className="table-wrap preorders-table-wrap">
            <table className="preorders-table">
              <thead>
                <tr>
                  <th>{t('preorders.colRef')}</th>
                  <th>{t('preorders.colProduct')}</th>
                  <th>{t('preorders.colContact')}</th>
                  <th>{t('preorders.colEta')}</th>
                  <th className="preorders-table__num">{t('preorders.colPrice')}</th>
                  <th>{t('preorders.colStatus')}</th>
                  <th className="preorders-table__actions">{t('preorders.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const line = p.lines[0];
                  const variant = statusVariant(p.status);
                  const canArrive = ['pending', 'draft', 'deposit_paid', 'ready'].includes(
                    p.status,
                  );
                  const canComplete = p.status === 'arrived' || p.status === 'ready';
                  const canCancel = !['cancelled', 'completed', 'closed', 'converted_to_sale'].includes(
                    p.status,
                  );
                  const hasActions = canArrive || canComplete || canCancel;
                  return (
                    <tr key={p._id}>
                      <td className="preorders-table__doc">
                        <span className="preorders-doc">{p.docNumber}</span>
                        {p.notifiedAt && (
                          <span className="preorders-notified" title={p.notifiedVia ?? ''}>
                            {t('preorders.notifiedBadge')}
                          </span>
                        )}
                      </td>
                      <td className="preorders-table__product">
                        <span className="preorders-product-name">{line?.productName ?? '—'}</span>
                        {line && line.quantity > 1 && (
                          <span className="preorders-product-qty">×{line.quantity}</span>
                        )}
                      </td>
                      <td className="preorders-table__contact">
                        <PreorderContactCell p={p} />
                      </td>
                      <td className="preorders-table__eta">
                        {p.expectedArrivalDate ? (
                          <time dateTime={p.expectedArrivalDate}>{p.expectedArrivalDate}</time>
                        ) : (
                          <span className="preorders-muted">—</span>
                        )}
                      </td>
                      <td className="preorders-table__num">
                        {line?.estimatedPriceIncVat != null && line.estimatedPriceIncVat > 0 ? (
                          <strong>€{line.estimatedPriceIncVat.toFixed(2)}</strong>
                        ) : (
                          <span className="preorders-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`preorder-status preorder-status--${variant}`}>
                          {statusLabel(p.status, t)}
                        </span>
                      </td>
                      <td className="preorders-table__actions">
                        {hasActions ? (
                          <div className="preorders-actions">
                            {canArrive && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => openNotify(p)}
                              >
                                {t('preorders.markArrived')}
                              </button>
                            )}
                            {canComplete && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => complete.mutate(p._id)}
                                disabled={complete.isPending}
                              >
                                {t('preorders.markCompleted')}
                              </button>
                            )}
                            {canCancel && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm preorders-action-cancel"
                                onClick={() => cancel.mutate(p._id)}
                                disabled={cancel.isPending}
                              >
                                {t('preorders.cancel')}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="preorders-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen && <PreorderCreateModal onClose={() => setCreateOpen(false)} />}

      {notifyTarget && (
        <PreorderNotifyModal
          preorder={notifyTarget}
          onClose={() => setNotifyTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['preorders'] });
            setNotifyTarget(null);
          }}
        />
      )}
    </div>
  );
}
