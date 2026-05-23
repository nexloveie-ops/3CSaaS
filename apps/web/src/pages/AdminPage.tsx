import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

export function AdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [auditFrom, setAuditFrom] = useState(today);
  const [auditTo, setAuditTo] = useState(today);
  const [auditCompanyId, setAuditCompanyId] = useState('');
  const [webhookCompanyId, setWebhookCompanyId] = useState('');
  const [webhookEventFilter, setWebhookEventFilter] = useState('');
  const [webhookStatusFilter, setWebhookStatusFilter] = useState('');

  const { data: plans, error } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.adminListPlans(),
    retry: false,
  });

  const { data: companies } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => api.adminListCompanies(),
    enabled: !error,
  });

  const { data: globalAudit } = useQuery({
    queryKey: ['admin-audit', auditFrom, auditTo, auditCompanyId],
    queryFn: () =>
      api.adminListAudit({
        from: auditFrom,
        to: auditTo,
        limit: 50,
        companyId: auditCompanyId || undefined,
      }),
    enabled: !error,
  });

  const { data: maintenanceStatus, refetch: refetchMaintenance } = useQuery({
    queryKey: ['admin-maintenance'],
    queryFn: () => api.adminMaintenanceStatus(),
    enabled: !error,
  });

  const { data: globalWebhooks, refetch: refetchWebhooks } = useQuery({
    queryKey: ['admin-webhooks', webhookCompanyId, webhookEventFilter, webhookStatusFilter],
    queryFn: () =>
      api.adminListWebhookDeliveries({
        companyId: webhookCompanyId || undefined,
        event: webhookEventFilter || undefined,
        status: (webhookStatusFilter as 'success' | 'failed') || undefined,
      }),
    enabled: !error,
  });

  const seed = useMutation({
    mutationFn: () => api.adminSeedPlans(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  });

  const purgeAll = useMutation({
    mutationFn: () => api.adminPurgeAllAudit(),
    onSuccess: () => {
      refetchMaintenance();
      refetchWebhooks();
    },
  });

  if (error) {
    return (
      <div className="page-content">
        <PageHeader title={t('nav.superAdmin')} />
        <div className="alert alert-danger">{t('admin.denied')}</div>
      </div>
    );
  }

  const events =
    (globalAudit as { events: { _id: string; createdAt: string; action: string; companyName?: string; userEmail?: string }[] } | undefined)
      ?.events ?? [];

  return (
    <div className="page-content">
      <PageHeader title={t('admin.title')} />
      <button type="button" onClick={() => seed.mutate()}>
        {t('admin.seed')}
      </button>
      <ul>
        {(plans as { _id: string; name: string; slug: string; moduleIds: string[] }[] | undefined)?.map(
          (p) => (
            <li key={p._id}>
              {p.name} ({p.slug}) — {p.moduleIds.length} {t('admin.modules')}
            </li>
          ),
        )}
      </ul>

      <h3 style={{ marginTop: 24 }}>{t('admin.maintenance')}</h3>
      <div className="card" style={{ fontSize: 13 }}>
        <p>
          {t('admin.autoPurge')}:{' '}
          <strong>{maintenanceStatus?.auditAutoPurgeEnabled ? 'on' : 'off'}</strong>
          {maintenanceStatus?.auditAutoPurgeEnabled && (
            <span> ({maintenanceStatus.auditAutoPurgeHours}h)</span>
          )}
        </p>
        <p>
          {maintenanceStatus?.lastAuditPurgeAt
            ? t('admin.lastGlobalPurge', {
                at: new Date(maintenanceStatus.lastAuditPurgeAt).toLocaleString(),
                count: maintenanceStatus.lastAuditPurgeDeleted,
                companies: maintenanceStatus.lastAuditPurgeCompanies,
              })
            : t('admin.lastGlobalPurgeNever')}
        </p>
        <button
          type="button"
          style={{ background: '#b91c1c' }}
          onClick={() => {
            if (window.confirm(t('dashboard.purgeAuditConfirm'))) purgeAll.mutate();
          }}
          disabled={purgeAll.isPending}
        >
          {t('admin.runPurgeAll')}
        </button>
        {purgeAll.data && (
          <p className="status-ok" style={{ marginTop: 8 }}>
            {t('dashboard.purgeResult', { count: purgeAll.data.deleted })}
          </p>
        )}
      </div>

      <h3 style={{ marginTop: 24 }}>{t('admin.webhookDeliveries')}</h3>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label>
            {t('admin.filterCompany')}
            <select
              value={webhookCompanyId}
              onChange={(e) => setWebhookCompanyId(e.target.value)}
              style={{ display: 'block', marginTop: 4, minWidth: 200 }}
            >
              <option value="">{t('admin.allCompanies')}</option>
              {(companies as { _id: string; name: string }[] | undefined)?.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('dashboard.webhookFilterEvent')}
            <select
              value={webhookEventFilter}
              onChange={(e) => setWebhookEventFilter(e.target.value)}
              style={{ display: 'block', marginTop: 4 }}
            >
              <option value="">{t('dashboard.webhookAllEvents')}</option>
              {[
                'pos.sale',
                'b2b.create',
                'b2b.transition',
                'transfer.transition',
                'company.invite',
                'company.invite_accept',
              ].map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('dashboard.webhookFilterStatus')}
            <select
              value={webhookStatusFilter}
              onChange={(e) => setWebhookStatusFilter(e.target.value)}
              style={{ display: 'block', marginTop: 4 }}
            >
              <option value="">{t('dashboard.webhookAllStatuses')}</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
            </select>
          </label>
        </div>
        <table style={{ width: '100%', fontSize: 13, marginTop: 12 }}>
          <thead>
            <tr>
              <th>{t('audit.when')}</th>
              <th>{t('admin.company')}</th>
              <th>{t('audit.action')}</th>
              <th>HTTP</th>
              <th>{t('dashboard.subscriptionStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {(
              globalWebhooks as
                | {
                    _id: string;
                    createdAt: string;
                    companyName?: string;
                    event: string;
                    httpStatus?: number;
                    status: string;
                    lastError?: string;
                  }[]
                | undefined
            )?.map((d) => (
              <tr key={d._id}>
                <td>{new Date(d.createdAt).toLocaleString()}</td>
                <td>{d.companyName ?? '—'}</td>
                <td>
                  <code>{d.event}</code>
                </td>
                <td>{d.httpStatus ?? '—'}</td>
                <td className={d.status === 'success' ? 'status-ok' : 'status-fail'}>
                  {d.status}
                  {d.lastError ? ` — ${d.lastError}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!globalWebhooks?.length && <p>{t('dashboard.webhookNoDeliveries')}</p>}
      </div>

      <h3 style={{ marginTop: 24 }}>{t('admin.globalAudit')}</h3>
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>
          {t('audit.from')}
          <input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} />
        </label>
        <label>
          {t('audit.to')}
          <input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} />
        </label>
        <label>
          {t('admin.filterCompany')}
          <select
            value={auditCompanyId}
            onChange={(e) => setAuditCompanyId(e.target.value)}
            style={{ display: 'block', marginTop: 4, minWidth: 200 }}
          >
            <option value="">{t('admin.allCompanies')}</option>
            {(companies as { _id: string; name: string }[] | undefined)?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th>{t('audit.when')}</th>
            <th>{t('admin.company')}</th>
            <th>{t('audit.user')}</th>
            <th>{t('audit.action')}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e._id}>
              <td>{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.companyName ?? '—'}</td>
              <td>{e.userEmail ?? '—'}</td>
              <td>{e.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!events.length && <p>{t('audit.empty')}</p>}
    </div>
  );
}
