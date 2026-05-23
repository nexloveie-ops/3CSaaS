import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

const STEPS = ['confirmed', 'shipped', 'received', 'invoiced'] as const;

type B2bOrder = {
  _id: string;
  docNumber: string;
  status: string;
  paymentStatus: string;
  totalNetPreTax: number;
  sellerInvoiceId?: string;
};

type InvoiceRow = {
  _id: string;
  docNumber: string;
  perspective: string;
  totalVat: number;
  totalPayable: number;
  b2bOrderId?: string;
  pdfStorageKey?: string;
};

async function downloadInvoicePdf(inv: InvoiceRow) {
  const blob = await api.fetchInvoicePdfBlob(inv._id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inv.docNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function B2bPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: orders } = useQuery({
    queryKey: ['b2b-seller'],
    queryFn: () => api.listB2bOrders('seller'),
  });
  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.listStores(),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.listProducts(),
  });
  const { data: invoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.listInvoices(),
  });

  const [buyerStoreId, setBuyerStoreId] = useState('');
  const [productId, setProductId] = useState('');

  const sellerInvoicesByOrder = useMemo(() => {
    const map = new Map<string, InvoiceRow>();
    for (const inv of (invoices as InvoiceRow[] | undefined) ?? []) {
      if (inv.perspective === 'seller' && inv.b2bOrderId) {
        map.set(String(inv.b2bOrderId), inv);
      }
    }
    return map;
  }, [invoices]);

  const create = useMutation({
    mutationFn: () =>
      api.createB2bOrder({
        buyerStoreId,
        lines: [{ productId, quantity: 1 }],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['b2b-seller'] }),
  });

  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.transitionB2bOrder(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['b2b-seller'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  return (
    <div className="page-content">
      <PageHeader title={t('b2b.title')} />
      <div className="card">
        <select value={buyerStoreId} onChange={(e) => setBuyerStoreId(e.target.value)}>
          <option value="">{t('b2b.buyerStore')}</option>
          {(stores as { _id: string; name: string }[] | undefined)?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">{t('b2b.product')}</option>
          {(products as { _id: string; name: string }[] | undefined)?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => create.mutate()} disabled={!buyerStoreId || !productId}>
          {t('b2b.createOrder')}
        </button>
      </div>

      <h3>{t('b2b.sellerOrders')}</h3>
      <ul>
        {((orders as B2bOrder[] | undefined) ?? []).map((o) => {
          const flow =
            o.status === 'draft'
              ? 'confirmed'
              : STEPS[STEPS.indexOf(o.status as (typeof STEPS)[number]) + 1];
          const next = flow;
          const inv = sellerInvoicesByOrder.get(o._id);
          return (
            <li key={o._id} className="card" style={{ listStyle: 'none' }}>
              {o.docNumber} — {o.status} — net €{o.totalNetPreTax?.toFixed(2)} — pay:{' '}
              {o.paymentStatus}
              {next && (
                <button
                  type="button"
                  style={{ marginLeft: 8 }}
                  onClick={() => transition.mutate({ id: o._id, status: next })}
                >
                  → {next}
                </button>
              )}
              {o.status === 'invoiced' && o.paymentStatus === 'unpaid' && (
                <button
                  type="button"
                  style={{ marginLeft: 8 }}
                  onClick={() =>
                    api
                      .updateB2bPayment(o._id, {
                        paymentStatus: 'paid',
                        paymentMethod: 'bank_transfer',
                      })
                      .then(() => qc.invalidateQueries({ queryKey: ['b2b-seller'] }))
                  }
                >
                  {t('b2b.markPaid')}
                </button>
              )}
              {inv && (
                <span style={{ marginLeft: 8, fontSize: 13 }}>
                  {t('b2b.linkedInvoice', { doc: inv.docNumber })}
                  {inv.pdfStorageKey ? ` (${t('b2b.pdfReady')})` : ''}
                  <button
                    type="button"
                    style={{ marginLeft: 8, background: '#64748b' }}
                    onClick={async () => {
                      const html = await api.fetchInvoicePrintHtml(inv._id);
                      const w = window.open('', '_blank');
                      if (w) {
                        w.document.write(html);
                        w.document.close();
                      }
                    }}
                  >
                    {t('b2b.print')}
                  </button>
                  <button
                    type="button"
                    style={{ marginLeft: 8, background: '#1d4ed8' }}
                    onClick={() => downloadInvoicePdf(inv).catch((e) => alert((e as Error).message))}
                  >
                    {t('b2b.downloadPdf')}
                  </button>
                  <button
                    type="button"
                    style={{ marginLeft: 8, background: '#0f766e' }}
                    onClick={() => {
                      const to = window.prompt('Email to:');
                      if (!to) return;
                      api.emailInvoice(inv._id, to).then((r) => alert(t('b2b.emailSent') + ` (${r.mode})`));
                    }}
                  >
                    {t('b2b.emailPdf')}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h3>{t('b2b.allInvoices')}</h3>
      <ul>
        {((invoices as InvoiceRow[] | undefined) ?? []).map((inv) => (
          <li key={inv._id}>
            {inv.docNumber} ({inv.perspective}) — VAT €{inv.totalVat.toFixed(2)} — payable €
            {inv.totalPayable.toFixed(2)}
            {inv.pdfStorageKey && (
              <span style={{ marginLeft: 6, fontSize: 12, color: '#15803d' }}>
                {t('b2b.pdfReady')}
              </span>
            )}
            <button
              type="button"
              style={{ marginLeft: 8, background: '#64748b' }}
              onClick={async () => {
                const html = await api.fetchInvoicePrintHtml(inv._id);
                const w = window.open('', '_blank');
                if (w) {
                  w.document.write(html);
                  w.document.close();
                }
              }}
            >
              {t('b2b.print')}
            </button>
            <button
              type="button"
              style={{ marginLeft: 8, background: '#1d4ed8' }}
              onClick={() => downloadInvoicePdf(inv).catch((e) => alert((e as Error).message))}
            >
              {t('b2b.downloadPdf')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
