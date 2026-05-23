import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

type AuditEvent = {
  _id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId?: string;
  userEmail?: string;
  userDisplayName?: string;
  metadata?: Record<string, unknown>;
};

export function AuditPage() {
  const { t } = useTranslation();
  const companyId = useContextStore((s) => s.companyId);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [action, setAction] = useState('');

  const { data: actions } = useQuery({
    queryKey: ['audit-actions', companyId, from, to],
    queryFn: () => api.listAuditActions({ from, to }),
    enabled: !!companyId,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['audit', companyId, from, to, action],
      queryFn: ({ pageParam }) =>
        api.listAudit({
          from,
          to,
          limit: 50,
          before: pageParam as string | undefined,
          action: action || undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: !!companyId,
    });

  const events = (data?.pages.flatMap((p) => p.events) ?? []) as AuditEvent[];

  return (
    <div className="page-content">
      <PageHeader title={t('audit.title')} />
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>
          {t('audit.from')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('audit.to')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          {t('audit.filterAction')}
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{ display: 'block', marginTop: 4, minWidth: 180 }}
          >
            <option value="">{t('audit.allActions')}</option>
            {(actions as string[] | undefined)?.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          style={{ alignSelf: 'flex-end', background: '#1d4ed8' }}
          onClick={() =>
            api.downloadAuditCsv({ from, to, action: action || undefined }).catch((e) =>
              alert((e as Error).message),
            )
          }
        >
          {t('audit.exportCsv')}
        </button>
      </div>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th>{t('audit.when')}</th>
            <th>{t('audit.user')}</th>
            <th>{t('audit.action')}</th>
            <th>{t('audit.entity')}</th>
            <th>{t('audit.detail')}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e._id}>
              <td>{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.userDisplayName || e.userEmail || '—'}</td>
              <td>{e.action}</td>
              <td>
                {e.entityType}
                {e.entityId ? ` #${e.entityId.slice(-6)}` : ''}
              </td>
              <td>
                <code style={{ fontSize: 11 }}>
                  {e.metadata ? JSON.stringify(e.metadata) : '—'}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isLoading && <p>{t('common.checking')}</p>}
      {!isLoading && !events.length && <p>{t('audit.empty')}</p>}
      {hasNextPage && (
        <button
          type="button"
          style={{ marginTop: 12 }}
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? t('audit.loading') : t('audit.loadMore')}
        </button>
      )}
    </div>
  );
}
