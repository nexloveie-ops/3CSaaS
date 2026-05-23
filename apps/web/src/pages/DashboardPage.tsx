import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { isValidLocale } from '@lz3c/shared';
import { PageHeader } from '../components/ui/PageHeader';
import { meQueryKey } from '../lib/query-keys';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useContextStore } from '../stores/context';
import { useLocaleStore } from '../stores/locale';

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { companyId, storeId, setCompanyId, setStoreId } = useContextStore();
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [companyName, setCompanyName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [warehouseStore, setWarehouseStore] = useState(false);
  const [companyDefaultLocale, setCompanyDefaultLocale] = useState('en');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('cashier');
  const [memberStoreId, setMemberStoreId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [inviteStoreId, setInviteStoreId] = useState('');
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [auditRetentionDays, setAuditRetentionDays] = useState(365);
  const [inviteEmailNote, setInviteEmailNote] = useState('');
  const [inviteEmailNoteZh, setInviteEmailNoteZh] = useState('');
  const [webhookEventFilter, setWebhookEventFilter] = useState('');
  const [webhookStatusFilter, setWebhookStatusFilter] = useState('');
  const [selectedWebhookId, setSelectedWebhookId] = useState('');
  const [invitePreviewLocale, setInvitePreviewLocale] = useState<'en' | 'zh'>('en');
  const [legalName, setLegalName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [companyVat, setCompanyVat] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const qc = useQueryClient();

  const { data: me } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
  });

  useEffect(() => {
    const loc = me?.user?.locale;
    if (loc && isValidLocale(loc)) setLocale(loc, false);
  }, [me?.user?.locale, setLocale]);

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.listCompanies(),
    enabled: !!token,
  });

  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => api.getCompany(companyId!),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (company?.defaultLocale) setCompanyDefaultLocale(company.defaultLocale);
  }, [company?.defaultLocale]);

  useEffect(() => {
    const c = company as
      | {
          webhookUrl?: string;
          auditRetentionDays?: number;
          inviteEmailNote?: string;
          inviteEmailNoteZh?: string;
          legalName?: string;
          registrationNumber?: string;
          vatNumber?: string;
          address?: string;
          contactPhone?: string;
          contactEmail?: string;
        }
      | undefined;
    if (!c) return;
    if (c.webhookUrl !== undefined) setWebhookUrl(c.webhookUrl ?? '');
    if (c.auditRetentionDays != null) setAuditRetentionDays(c.auditRetentionDays);
    if (c.inviteEmailNote !== undefined) setInviteEmailNote(c.inviteEmailNote ?? '');
    if (c.inviteEmailNoteZh !== undefined) setInviteEmailNoteZh(c.inviteEmailNoteZh ?? '');
    if (c.legalName !== undefined) setLegalName(c.legalName ?? '');
    if (c.registrationNumber !== undefined) setRegistrationNumber(c.registrationNumber ?? '');
    if (c.vatNumber !== undefined) setCompanyVat(c.vatNumber ?? '');
    if (c.address !== undefined) setCompanyAddress(c.address ?? '');
    if (c.contactPhone !== undefined) setCompanyPhone(c.contactPhone ?? '');
    if (c.contactEmail !== undefined) setCompanyEmail(c.contactEmail ?? '');
  }, [company]);

  const { data: selectedStore } = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => api.getStore(storeId!),
    enabled: !!companyId && !!storeId,
  });

  useEffect(() => {
    const s = selectedStore as
      | { address?: string; phone?: string; email?: string }
      | undefined;
    if (!s) return;
    if (s.address !== undefined) setStoreAddress(s.address ?? '');
    if (s.phone !== undefined) setStorePhone(s.phone ?? '');
    if (s.email !== undefined) setStoreEmail(s.email ?? '');
  }, [selectedStore]);

  const { data: stores } = useQuery({
    queryKey: ['stores', companyId],
    queryFn: () => api.listStores(),
    enabled: !!token && !!companyId,
  });

  const { data: billing } = useQuery({
    queryKey: ['billing', companyId],
    queryFn: () => api.getBilling(),
    enabled: !!token && !!companyId,
  });

  const createCompany = useMutation({
    mutationFn: (name: string) => api.createCompany(name),
    onSuccess: (c: { _id: string }) => {
      setCompanyId(c._id);
      qc.invalidateQueries({ queryKey: ['companies'] });
      setCompanyName('');
    },
  });

  const createStore = useMutation({
    mutationFn: (name: string) => api.createStore(name, warehouseStore),
    onSuccess: (s: { _id: string }) => {
      setStoreId(s._id);
      qc.invalidateQueries({ queryKey: ['stores', companyId] });
      setStoreName('');
    },
  });

  const saveCompanyLocale = useMutation({
    mutationFn: () =>
      api.updateCompanyLocale(companyId!, { defaultLocale: companyDefaultLocale }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company', companyId] }),
  });

  const { data: pendingInvites, refetch: refetchInvites } = useQuery({
    queryKey: ['invites', companyId],
    queryFn: () => api.listInvites(companyId!),
    enabled: !!companyId,
  });

  const { data: webhookDeliveries, refetch: refetchWebhookDeliveries } = useQuery({
    queryKey: ['webhookDeliveries', companyId, webhookEventFilter, webhookStatusFilter],
    queryFn: () =>
      api.listWebhookDeliveries(companyId!, {
        event: webhookEventFilter || undefined,
        status: (webhookStatusFilter as 'success' | 'failed') || undefined,
      }),
    enabled: !!companyId,
  });

  const { data: webhookDetail } = useQuery({
    queryKey: ['webhookDetail', companyId, selectedWebhookId],
    queryFn: () => api.getWebhookDelivery(companyId!, selectedWebhookId),
    enabled: !!companyId && !!selectedWebhookId,
  });

  const { data: maintenanceStatus, refetch: refetchMaintenance } = useQuery({
    queryKey: ['maintenanceStatus', companyId],
    queryFn: () => api.getCompanyMaintenanceStatus(companyId!),
    enabled: !!companyId,
  });

  const createInvite = useMutation({
    mutationFn: () =>
      api.createInvite(companyId!, {
        email: inviteEmail,
        role: inviteRole,
        storeId: inviteStoreId || undefined,
      }),
    onSuccess: (res: { inviteUrl: string }) => {
      setLastInviteUrl(res.inviteUrl);
      setInviteEmail('');
      refetchInvites();
    },
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => api.revokeInvite(companyId!, inviteId),
    onSuccess: () => refetchInvites(),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      api.updateCompanySettings(companyId!, {
        webhookUrl: webhookUrl || undefined,
        auditRetentionDays,
        inviteEmailNote: inviteEmailNote || undefined,
        inviteEmailNoteZh: inviteEmailNoteZh || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
      refetchWebhookDeliveries();
    },
  });

  const saveCompanyProfile = useMutation({
    mutationFn: () =>
      api.updateCompanyProfile(companyId!, {
        legalName: legalName || undefined,
        registrationNumber: registrationNumber || undefined,
        vatNumber: companyVat || undefined,
        address: companyAddress || undefined,
        contactPhone: companyPhone || undefined,
        contactEmail: companyEmail || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company', companyId] }),
  });

  const saveStoreProfile = useMutation({
    mutationFn: () =>
      api.updateStoreProfile(storeId!, {
        address: storeAddress || undefined,
        phone: storePhone || undefined,
        email: storeEmail || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', storeId] }),
  });

  const purgeAudit = useMutation({
    mutationFn: () => api.purgeCompanyAudit(companyId!),
    onSuccess: () => {
      refetchMaintenance();
      qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });

  const retryWebhook = useMutation({
    mutationFn: (deliveryId: string) => api.retryWebhookDelivery(companyId!, deliveryId),
    onSuccess: () => refetchWebhookDeliveries(),
  });

  const retryAllWebhooks = useMutation({
    mutationFn: () =>
      api.retryAllFailedWebhooks(companyId!, webhookEventFilter || undefined),
    onSuccess: () => refetchWebhookDeliveries(),
  });

  const addMember = useMutation({
    mutationFn: () =>
      api.addCompanyMember(companyId!, {
        email: memberEmail,
        role: memberRole,
        storeId: memberStoreId || undefined,
      }),
    onSuccess: () => {
      setMemberEmail('');
      qc.invalidateQueries({ queryKey: meQueryKey(token) });
    },
  });

  if (!token) {
    navigate('/login');
    return null;
  }

  const displayName = (me as { user?: { displayName?: string } })?.user?.displayName ?? '';
  const billingInfo = billing as
    | {
        subscriptionStatus: string;
        enabledModules: string[];
        plan?: { name: string };
      }
    | undefined;

  return (
    <div className="page-content">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.welcome', { name: displayName || '—' })}
      />

      <div className="dashboard-grid">
      <div className="section-card">
        <h3>{t('dashboard.companies')}</h3>
        <ul className="clean-list">
          {(companies as { _id: string; name: string }[] | undefined)?.map((c) => (
            <li key={c._id} className="form-inline">
              <button
                type="button"
                className={companyId === c._id ? '' : 'btn-secondary btn-sm'}
                onClick={() => {
                  setCompanyId(c._id);
                  setStoreId(null);
                }}
              >
                {t('common.select')}
              </button>
              <span>
                <strong>{c.name}</strong>{' '}
                <span className="code">{c._id}</span>
              </span>
            </li>
          ))}
        </ul>
        <form
          className="form-row"
          style={{ marginTop: '1rem' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createCompany.mutate(companyName);
          }}
        >
          <div className="form-field" style={{ flex: 2 }}>
            <input
              placeholder={t('dashboard.newCompany')}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <button type="submit">{t('dashboard.createCompany')}</button>
        </form>
        <p className="status-ok" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {t('dashboard.taxHint')}
        </p>
      </div>

      {companyId && (
        <div className="section-card">
          <h3>{t('dashboard.companyProfile')}</h3>
          <p style={{ marginTop: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {t('dashboard.companyProfileHint')}
          </p>
          <div className="form-row">
            <div className="form-field">
              <label>{t('dashboard.legalName')}</label>
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>{t('dashboard.registrationNumber')}</label>
              <input
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>{t('dashboard.vatNumber')}</label>
              <input value={companyVat} onChange={(e) => setCompanyVat(e.target.value)} />
            </div>
            <div className="form-field">
              <label>{t('dashboard.companyPhone')}</label>
              <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>{t('dashboard.companyEmail')}</label>
            <input
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>{t('dashboard.companyAddress')}</label>
            <input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
          </div>
          <button
            type="button"
            disabled={saveCompanyProfile.isPending}
            onClick={() => saveCompanyProfile.mutate()}
          >
            {t('dashboard.saveCompanyProfile')}
          </button>
        </div>
      )}

      {companyId && billingInfo && (
        <div className="section-card">
          <h3>{t('dashboard.subscription')}</h3>
          <p>
            {t('dashboard.subscriptionStatus')}:{' '}
            <strong>{billingInfo.subscriptionStatus}</strong>
            {billingInfo.subscriptionStatus === 'read_only' && (
              <span className="status-fail" style={{ marginLeft: 8 }}>
                {t('dashboard.readOnlyBanner')}
              </span>
            )}
          </p>
          <p>
            {t('dashboard.subscriptionPlan')}: {billingInfo.plan?.name ?? '—'}
          </p>
          <p style={{ fontSize: 13 }}>
            {t('dashboard.subscriptionModules')}: {billingInfo.enabledModules?.join(', ')}
          </p>
          <Link to="/dashboard/billing">{t('dashboard.manageBilling')}</Link>
        </div>
      )}

      {companyId && billingInfo?.subscriptionStatus !== 'read_only' && (
        <div className="section-card">
          <h3>{t('dashboard.inviteByEmail')}</h3>
          <div className="form-field">
            <label>{t('dashboard.inviteEmailNote')}</label>
            <textarea
              value={inviteEmailNote}
              onChange={(e) => setInviteEmailNote(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
          <div className="form-field">
            <label>{t('dashboard.inviteEmailNoteZh')}</label>
            <textarea
              value={inviteEmailNoteZh}
              onChange={(e) => setInviteEmailNoteZh(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              saveSettings.mutate(undefined, {
                onSuccess: () => qc.invalidateQueries({ queryKey: ['company', companyId] }),
              })
            }
            disabled={saveSettings.isPending}
          >
            {t('dashboard.saveSettings')}
          </button>
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <label>{t('dashboard.memberEmail')}</label>
            <input
              placeholder={t('dashboard.memberEmail')}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div className="form-row">
          <div className="form-field">
            <label>{t('dashboard.memberRole')}</label>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="manager">manager</option>
            <option value="cashier">cashier</option>
            <option value="warehouse_staff">warehouse_staff</option>
          </select>
          </div>
          <div className="form-field">
            <label>{t('dashboard.memberStore')}</label>
          <select
            value={inviteStoreId}
            onChange={(e) => setInviteStoreId(e.target.value)}
          >
            <option value="">{t('dashboard.memberStore')}</option>
            {(stores as { _id: string; name: string }[] | undefined)?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          </div>
          <div className="form-field">
            <label>{t('dashboard.invitePreviewLocale')}</label>
            <select
              value={invitePreviewLocale}
              onChange={(e) => setInvitePreviewLocale(e.target.value as 'en' | 'zh')}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          </div>
          <div className="form-inline" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!inviteEmail}
            onClick={async () => {
              const p = await api.previewInviteEmail(companyId!, {
                email: inviteEmail,
                role: inviteRole,
                storeId: inviteStoreId || undefined,
                locale: invitePreviewLocale,
              });
              const w = window.open('', '_blank');
              if (w) {
                w.document.write(p.html);
                w.document.close();
              }
            }}
          >
            {t('dashboard.previewInvite')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  t('dashboard.confirmInvite', { email: inviteEmail, role: inviteRole }),
                )
              ) {
                return;
              }
              createInvite.mutate();
            }}
            disabled={!inviteEmail || createInvite.isPending}
          >
            {t('dashboard.sendInvite')}
          </button>
          </div>
          {lastInviteUrl && (
            <p className="status-ok" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {t('dashboard.inviteLink')}: {lastInviteUrl}
            </p>
          )}
          {(pendingInvites as { _id: string; email: string; role: string; expiresAt: string }[] | undefined)
            ?.length ? (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '8px 0' }}>{t('dashboard.pendingInvites')}</h4>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                {(pendingInvites as { _id: string; email: string; role: string; expiresAt: string }[]).map(
                  (inv) => (
                    <li key={inv._id} style={{ marginBottom: 6 }}>
                      {inv.email} — {inv.role} ({t('dashboard.expires')}{' '}
                      {new Date(inv.expiresAt).toLocaleDateString()})
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        style={{ marginLeft: 8 }}
                        onClick={() => revokeInvite.mutate(inv._id)}
                        disabled={revokeInvite.isPending}
                      >
                        {t('dashboard.revokeInvite')}
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : (
            <p style={{ fontSize: 13, marginTop: 8 }}>{t('dashboard.noPendingInvites')}</p>
          )}
        </div>
      )}

      {companyId && billingInfo?.subscriptionStatus !== 'read_only' && (
        <div className="section-card">
          <h3>{t('dashboard.teamMembers')}</h3>
          <input
            placeholder={t('dashboard.memberEmail')}
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            style={{ display: 'block', marginBottom: 8, width: '100%' }}
          />
          <select
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
            style={{ marginRight: 8 }}
          >
            <option value="manager">manager</option>
            <option value="cashier">cashier</option>
            <option value="warehouse_staff">warehouse_staff</option>
          </select>
          <select
            value={memberStoreId}
            onChange={(e) => setMemberStoreId(e.target.value)}
            style={{ marginRight: 8 }}
          >
            <option value="">{t('dashboard.memberStore')}</option>
            {(stores as { _id: string; name: string }[] | undefined)?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addMember.mutate()}
            disabled={!memberEmail || addMember.isPending}
          >
            {t('dashboard.addMember')}
          </button>
          {addMember.isSuccess && <p className="status-ok">{t('dashboard.memberAdded')}</p>}
          {addMember.error && (
            <p className="status-fail">{(addMember.error as Error).message}</p>
          )}
        </div>
      )}

      {companyId && billingInfo?.subscriptionStatus !== 'read_only' && (
        <div className="section-card" style={{ gridColumn: '1 / -1' }}>
          <h3>{t('dashboard.integrations')}</h3>
          <div className="form-field">
            <label>{t('dashboard.webhookUrl')}</label>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://example.com/webhook"
            />
          </div>
          <div className="form-field">
            <label>{t('dashboard.auditRetention')}</label>
            <input
              type="number"
              min={30}
              max={3650}
              value={auditRetentionDays}
              onChange={(e) => setAuditRetentionDays(Number(e.target.value) || 365)}
              style={{ maxWidth: 140 }}
            />
          </div>
          <div className="form-inline">
          <button type="button" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            {t('dashboard.saveSettings')}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (window.confirm(t('dashboard.purgeAuditConfirm'))) purgeAudit.mutate();
            }}
            disabled={purgeAudit.isPending}
          >
            {t('dashboard.purgeAudit')}
          </button>
          </div>
          {purgeAudit.data && (
            <p className="status-ok" style={{ fontSize: 12 }}>
              {t('dashboard.purgeResult', {
                count: (purgeAudit.data as { deleted: number }).deleted,
              })}
            </p>
          )}
          {maintenanceStatus && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <h4 style={{ margin: '8px 0' }}>{t('dashboard.maintenanceStatus')}</h4>
              <p>
                {maintenanceStatus.lastAuditPurgeAt
                  ? t('dashboard.lastPurge', {
                      at: new Date(maintenanceStatus.lastAuditPurgeAt).toLocaleString(),
                      count: maintenanceStatus.lastAuditPurgeDeleted,
                    })
                  : t('dashboard.lastPurgeNever')}
              </p>
              <p>
                {t('dashboard.serverAutoPurge', {
                  state: maintenanceStatus.serverAutoPurgeEnabled ? 'on' : 'off',
                })}
              </p>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#64748b' }}>{t('dashboard.purgeNotifyHint')}</p>
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '8px 0' }}>{t('dashboard.webhookDeliveries')}</h4>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <label>
                {t('dashboard.webhookFilterEvent')}
                <select
                  value={webhookEventFilter}
                  onChange={(e) => {
                    setWebhookEventFilter(e.target.value);
                    setSelectedWebhookId('');
                  }}
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
                  onChange={(e) => {
                    setWebhookStatusFilter(e.target.value);
                    setSelectedWebhookId('');
                  }}
                  style={{ display: 'block', marginTop: 4 }}
                >
                  <option value="">{t('dashboard.webhookAllStatuses')}</option>
                  <option value="success">success</option>
                  <option value="failed">failed</option>
                </select>
              </label>
              <button
                type="button"
                style={{ alignSelf: 'flex-end' }}
                onClick={async () => {
                  const blob = await api.fetchWebhookDeliveriesCsv(companyId!, {
                    event: webhookEventFilter || undefined,
                    status: webhookStatusFilter || undefined,
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'webhook-deliveries.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t('dashboard.webhookExportCsv')}
              </button>
              <button
                type="button"
                style={{ alignSelf: 'flex-end', background: '#1d4ed8' }}
                disabled={retryAllWebhooks.isPending}
                onClick={() => retryAllWebhooks.mutate()}
              >
                {t('dashboard.webhookRetryAll')}
              </button>
            </div>
            {(webhookDeliveries as { _id: string; event: string; status: string; attempts: number; httpStatus?: number; lastError?: string; createdAt: string }[] | undefined)
              ?.length ? (
              <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th align="left">{t('audit.when')}</th>
                    <th align="left">{t('audit.action')}</th>
                    <th align="left">HTTP</th>
                    <th align="left">{t('dashboard.subscriptionStatus')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(
                    webhookDeliveries as {
                      _id: string;
                      event: string;
                      status: string;
                      attempts: number;
                      httpStatus?: number;
                      lastError?: string;
                      createdAt: string;
                    }[]
                  ).map((d) => (
                    <tr
                      key={d._id}
                      style={{
                        cursor: 'pointer',
                        background: selectedWebhookId === d._id ? '#f1f5f9' : undefined,
                      }}
                      onClick={() => setSelectedWebhookId(d._id)}
                    >
                      <td>{new Date(d.createdAt).toLocaleString()}</td>
                      <td>
                        <code>{d.event}</code> ({d.attempts}x)
                      </td>
                      <td>{d.httpStatus ?? '—'}</td>
                      <td className={d.status === 'success' ? 'status-ok' : 'status-fail'}>
                        {d.status}
                        {d.lastError ? ` — ${d.lastError}` : ''}
                      </td>
                      <td>
                        {d.status === 'failed' && (
                          <button
                            type="button"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            disabled={retryWebhook.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              retryWebhook.mutate(d._id);
                            }}
                          >
                            {t('dashboard.webhookRetry')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <p style={{ fontSize: 13 }}>{t('dashboard.webhookNoDeliveries')}</p>
            )}
            {webhookDetail && (
              <div className="section-card" style={{ marginTop: 12, fontSize: 12 }}>
                <h4 style={{ margin: '0 0 8px' }}>{t('dashboard.webhookDetail')}</h4>
                <p>
                  <strong>{t('dashboard.webhookTargetUrl')}:</strong> {webhookDetail.url}
                </p>
                <p>
                  <strong>{t('audit.action')}:</strong> <code>{webhookDetail.event}</code>
                </p>
                <p>
                  <strong>HTTP:</strong> {webhookDetail.httpStatus ?? '—'} — {webhookDetail.status}
                </p>
                {webhookDetail.lastError && (
                  <p className="status-fail">
                    <strong>Error:</strong> {webhookDetail.lastError}
                  </p>
                )}
                {webhookDetail.payload && (
                  <pre style={{ overflow: 'auto', fontSize: 11 }}>
                    {JSON.stringify(webhookDetail.payload, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {companyId && (
        <div className="section-card">
          <h3>{t('dashboard.localeSettings')}</h3>
          <div className="form-field">
            <label>{t('dashboard.defaultLocale')}</label>
            <select
              value={companyDefaultLocale}
              onChange={(e) => setCompanyDefaultLocale(e.target.value)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <button type="button" onClick={() => saveCompanyLocale.mutate()}>
            {t('dashboard.saveLocale')}
          </button>
        </div>
      )}

      {companyId && storeId && (
        <div className="section-card">
          <h3>{t('dashboard.storeProfile')}</h3>
          <p style={{ marginTop: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {t('dashboard.storeProfileHint')}
          </p>
          <div className="form-field">
            <label>{t('dashboard.storeAddress')}</label>
            <input value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>{t('dashboard.storePhone')}</label>
              <input value={storePhone} onChange={(e) => setStorePhone(e.target.value)} />
            </div>
            <div className="form-field">
              <label>{t('dashboard.storeEmail')}</label>
              <input
                type="email"
                value={storeEmail}
                onChange={(e) => setStoreEmail(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={saveStoreProfile.isPending}
            onClick={() => saveStoreProfile.mutate()}
          >
            {t('dashboard.saveStoreProfile')}
          </button>
        </div>
      )}

      {companyId && (
        <div className="section-card">
          <h3>{t('dashboard.stores')}</h3>
          <ul className="clean-list">
            {(stores as { _id: string; name: string; warehouseEnabled?: boolean }[] | undefined)?.map(
              (s) => (
                <li key={s._id} className="form-inline">
                  <button
                    type="button"
                    className={storeId === s._id ? '' : 'btn-secondary btn-sm'}
                    onClick={() => setStoreId(s._id)}
                  >
                    {t('common.select')}
                  </button>
                  <span>
                    <strong>{s.name}</strong>
                    {s.warehouseEnabled ? (
                      <span className="badge" style={{ marginLeft: 6 }}>
                        WH
                      </span>
                    ) : null}{' '}
                    <span className="code">{s._id}</span>
                  </span>
                </li>
              ),
            )}
          </ul>
          <form
            className="form-row"
            style={{ marginTop: '1rem' }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createStore.mutate(storeName);
            }}
          >
            <div className="form-field" style={{ flex: 2 }}>
              <input
                placeholder={t('dashboard.newStore')}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
            </div>
            <label className="form-inline" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={warehouseStore}
                onChange={(e) => setWarehouseStore(e.target.checked)}
              />
              {t('dashboard.warehouseFlag')}
            </label>
            <button type="submit">{t('dashboard.createStore')}</button>
          </form>
        </div>
      )}
      </div>

      {companyId && storeId && (
        <div className="alert alert-info" style={{ marginTop: '1rem' }}>
          {t('common.ready')}
        </div>
      )}
    </div>
  );
}
