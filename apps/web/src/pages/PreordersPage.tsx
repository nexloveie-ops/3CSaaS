import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

export function PreordersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: preorders } = useQuery({
    queryKey: ['preorders'],
    queryFn: () => api.listPreorders(),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.listProducts(),
  });

  const [productId, setProductId] = useState('');
  const [deposit, setDeposit] = useState('50');

  const create = useMutation({
    mutationFn: () =>
      api.createPreorder({
        lines: [{ productId, quantity: 1 }],
        depositAmount: Number(deposit),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preorders'] }),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) => {
      if (act === 'deposit') return api.payPreorderDeposit(id, { amount: Number(deposit) });
      if (act === 'ready') return api.markPreorderReady(id);
      if (act === 'convert') return api.convertPreorder(id, { paymentMethod: 'cash' });
      if (act === 'cancel') return api.cancelPreorder(id);
      throw new Error('unknown');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preorders'] }),
  });

  return (
    <div className="page-content">
      <PageHeader title={t('preorders.title')} />
      <form
        className="card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="">Product</option>
          {(products as { _id: string; name: string }[] | undefined)?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Deposit"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
        <button type="submit">Create preorder</button>
      </form>

      <ul>
        {(
          preorders as
            | {
                _id: string;
                docNumber: string;
                status: string;
                totalIncVat: number;
                depositAmount: number;
                saleOrderId?: string;
                creditNoteId?: string;
              }[]
            | undefined
        )?.map((p) => (
          <li key={p._id} className="card" style={{ listStyle: 'none' }}>
            {p.docNumber} — {p.status} — total €{p.totalIncVat.toFixed(2)}, deposit €
            {p.depositAmount.toFixed(2)}
            {p.status === 'converted_to_sale' && (
              <span className="status-ok" style={{ marginLeft: 8, fontSize: 12 }}>
                {t('preorders.converted')}
              </span>
            )}
            {p.saleOrderId && (
              <span style={{ marginLeft: 8, fontSize: 12 }}>
                {t('preorders.saleOrder')}: <code>{p.saleOrderId}</code>
              </span>
            )}
            {p.creditNoteId && (
              <span style={{ marginLeft: 8, fontSize: 12 }}>
                {t('preorders.creditNote')}: <code>{p.creditNoteId}</code>
              </span>
            )}
            {p.status === 'draft' && (
              <button type="button" style={{ marginLeft: 8 }} onClick={() => action.mutate({ id: p._id, act: 'deposit' })}>
                Pay deposit
              </button>
            )}
            {p.status === 'deposit_paid' && (
              <button type="button" style={{ marginLeft: 8 }} onClick={() => action.mutate({ id: p._id, act: 'ready' })}>
                Mark ready
              </button>
            )}
            {['deposit_paid', 'ready'].includes(p.status) && (
              <button type="button" style={{ marginLeft: 8 }} onClick={() => action.mutate({ id: p._id, act: 'convert' })}>
                Convert to sale
              </button>
            )}
            {!['closed', 'cancelled', 'converted_to_sale'].includes(p.status) && (
              <button
                type="button"
                style={{ marginLeft: 8, background: '#b91c1c' }}
                onClick={() => action.mutate({ id: p._id, act: 'cancel' })}
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
