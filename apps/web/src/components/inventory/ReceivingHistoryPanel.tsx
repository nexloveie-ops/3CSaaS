import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type InboundLine = {
  productId: string | { _id: string; name?: string };
  quantity: number;
  serialNumbers?: string[];
};

type InboundReceipt = {
  _id: string;
  docNumber: string;
  supplier?: string;
  notes?: string;
  receivedAt?: string;
  createdAt?: string;
  lines: InboundLine[];
};

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function lineProductName(line: InboundLine): string {
  if (typeof line.productId === 'object' && line.productId.name) return line.productId.name;
  return String(line.productId);
}

export function ReceivingHistoryPanel() {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayIso);

  const { data, isLoading } = useQuery({
    queryKey: ['inbound-receipts', date],
    queryFn: () =>
      api.listInboundReceipts({ from: date, to: date }) as Promise<InboundReceipt[]>,
  });

  const list = data ?? [];
  const totals = useMemo(
    () =>
      list.map((r) => ({
        lines: r.lines.length,
        units: r.lines.reduce((s, l) => s + l.quantity, 0),
      })),
    [list],
  );

  return (
    <div className="receiving-history">
      <div className="receiving-history__toolbar">
        <label className="form-field receiving-history__date">
          <span>{t('inventory.historyDate')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {isLoading && <p>{t('common.checking')}</p>}
      {!isLoading && list.length === 0 && (
        <p className="empty-state">{t('inventory.historyEmpty')}</p>
      )}

      <ul className="clean-list receiving-history__list">
        {list.map((r, idx) => (
          <li key={r._id} className="receiving-history__card">
            <details>
              <summary>
                <span className="receiving-history__doc">{r.docNumber}</span>
                <span className="receiving-history__meta">
                  {r.supplier || '—'}
                  {' · '}
                  {t('inventory.historySummary', {
                    lines: totals[idx]?.lines ?? r.lines.length,
                    units: totals[idx]?.units ?? 0,
                  })}
                </span>
              </summary>
              <div className="receiving-history__body">
                {r.notes && (
                  <p className="receiving-history__notes">
                    {t('inventory.batchNotes')}: {r.notes}
                  </p>
                )}
                <table className="receiving-history__table">
                  <tbody>
                    {r.lines.map((line, i) => (
                      <tr key={i}>
                        <td>{lineProductName(line)}</td>
                        <td align="right">×{line.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
