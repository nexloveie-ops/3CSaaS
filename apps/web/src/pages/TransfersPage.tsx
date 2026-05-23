import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

const FLOW = ['confirmed', 'shipped', 'received'] as const;

async function openPickList(transferId: string) {
  const html = await api.fetchTransferPickListHtml(transferId);
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

async function downloadPickListPdf(transferId: string, docNumber: string) {
  const blob = await api.fetchTransferPickListPdf(transferId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${docNumber}-pick-list.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

type DraftLine = { productId: string; quantity: number };

type TransferRow = {
  _id: string;
  docNumber: string;
  status: string;
  fromStoreId: string;
  toStoreId: string;
  lines: { productName: string; quantity: number }[];
};

export function TransfersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);

  const { data: transfers } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => api.listTransfers(),
  });
  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.listStores(),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.listProducts(),
  });

  const [toStoreId, setToStoreId] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ productId: '', quantity: 1 }]);

  const fromStore = (stores as { _id: string; name: string }[] | undefined)?.find(
    (s) => s._id === storeId,
  );

  const productList = products as { _id: string; name: string }[] | undefined;

  const create = useMutation({
    mutationFn: () => {
      const lines = draftLines
        .filter((l) => l.productId)
        .map((l) => ({ productId: l.productId, quantity: Math.max(1, l.quantity) }));
      if (!lines.length) throw new Error(t('transfers.needLine'));
      return api.createTransfer({ toStoreId, lines });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      setDraftLines([{ productId: '', quantity: 1 }]);
    },
  });

  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.transitionTransfer(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers', 'inventory'] }),
  });

  function nextStatus(status: string): string | null {
    if (status === 'draft') return 'confirmed';
    const idx = FLOW.indexOf(status as (typeof FLOW)[number]);
    return idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  }

  function canCancel(status: string) {
    return status === 'draft' || status === 'confirmed';
  }

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setDraftLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="page-content">
      <PageHeader title={t('transfers.title')} description={t('transfers.subtitle')} />

      {!storeId ? (
        <div className="alert alert-warning">{t('transfers.selectStore')}</div>
      ) : (
        <div className="section-card">
          <p style={{ marginTop: 0 }}>
            {t('transfers.fromStore')}: <strong>{fromStore?.name ?? storeId}</strong>
          </p>
          <label>
            {t('transfers.toStore')}
            <select
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              style={{ display: 'block', marginTop: 4, minWidth: 200 }}
            >
              <option value="">{t('transfers.pickStore')}</option>
              {(stores as { _id: string; name: string }[] | undefined)
                ?.filter((s) => s._id !== storeId)
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>

          <p style={{ marginTop: 12, marginBottom: 4, fontWeight: 600 }}>{t('transfers.lines')}</p>
          {draftLines.map((line, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'end' }}
            >
              <label>
                {t('transfers.product')}
                <select
                  value={line.productId}
                  onChange={(e) => updateLine(i, { productId: e.target.value })}
                  style={{ display: 'block', marginTop: 4, minWidth: 160 }}
                >
                  <option value="">{t('transfers.pickProduct')}</option>
                  {productList?.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('transfers.quantity')}
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 1 })}
                  style={{ display: 'block', marginTop: 4, width: 72 }}
                />
              </label>
              {draftLines.length > 1 && (
                <button
                  type="button"
                  style={{ background: '#64748b' }}
                  onClick={() => setDraftLines((rows) => rows.filter((_, idx) => idx !== i))}
                >
                  {t('transfers.removeLine')}
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            style={{ marginRight: 8, background: '#64748b' }}
            onClick={() => setDraftLines((rows) => [...rows, { productId: '', quantity: 1 }])}
          >
            {t('transfers.addLine')}
          </button>
          <button
            type="button"
            disabled={!toStoreId || create.isPending}
            onClick={() => create.mutate()}
          >
            {t('transfers.create')}
          </button>
          {create.error && (
            <p className="status-fail">{(create.error as Error).message}</p>
          )}
        </div>
      )}

      <h3>{t('transfers.list')}</h3>
      <ul style={{ fontSize: 14 }}>
        {(transfers as TransferRow[] | undefined)?.map((tr) => {
          const next = nextStatus(tr.status);
          const toName =
            (stores as { _id: string; name: string }[] | undefined)?.find(
              (s) => s._id === tr.toStoreId,
            )?.name ?? tr.toStoreId.slice(-6);
          const fromName =
            (stores as { _id: string; name: string }[] | undefined)?.find(
              (s) => s._id === tr.fromStoreId,
            )?.name ?? tr.fromStoreId.slice(-6);
          const lineSummary = tr.lines?.map((l) => `${l.productName} ×${l.quantity}`).join(', ');
          return (
            <li key={tr._id} style={{ marginBottom: 10 }}>
              <strong>{tr.docNumber}</strong> — {t(`transfers.status.${tr.status}`, tr.status)}
              <br />
              <span style={{ color: '#64748b' }}>
                {fromName} → {toName}
                {lineSummary ? ` · ${lineSummary}` : ''}
              </span>
              <button
                type="button"
                style={{ marginLeft: 8, marginTop: 4, background: '#64748b' }}
                onClick={() => openPickList(tr._id).catch((e) => alert((e as Error).message))}
              >
                {t('transfers.printPickList')}
              </button>
              <button
                type="button"
                style={{ marginLeft: 8, marginTop: 4, background: '#1d4ed8' }}
                onClick={() =>
                  downloadPickListPdf(tr._id, tr.docNumber).catch((e) =>
                    alert((e as Error).message),
                  )
                }
              >
                {t('transfers.downloadPickPdf')}
              </button>
              {next && tr.status !== 'cancelled' && (
                <button
                  type="button"
                  style={{ marginLeft: 8, marginTop: 4 }}
                  disabled={transition.isPending}
                  onClick={() => transition.mutate({ id: tr._id, status: next })}
                >
                  {t('transfers.advance', { status: next })}
                </button>
              )}
              {canCancel(tr.status) && (
                <button
                  type="button"
                  style={{ marginLeft: 8, marginTop: 4, background: '#b91c1c' }}
                  disabled={transition.isPending}
                  onClick={() => transition.mutate({ id: tr._id, status: 'cancelled' })}
                >
                  {t('transfers.cancel')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!(transfers as unknown[] | undefined)?.length && <p>{t('transfers.empty')}</p>}
    </div>
  );
}
