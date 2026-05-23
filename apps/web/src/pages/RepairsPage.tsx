import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

function printRepairReceiptHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const w = window.open('', '_blank', 'width=360,height=640');
    if (!w) {
      resolve();
      return;
    }
    w.document.write(html);
    w.document.close();
    const done = () => {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    w.onload = () => {
      w.focus();
      w.print();
      if ('onafterprint' in w) {
        w.onafterprint = done;
      } else {
        setTimeout(done, 1500);
      }
    };
  });
}

async function printCustomerReceipt(workOrderId: string) {
  const html = await api.fetchWorkOrderReceiptHtml(workOrderId, 'customer');
  await printRepairReceiptHtml(html);
}

async function printRepairSlip(workOrderId: string) {
  const html = await api.fetchWorkOrderReceiptHtml(workOrderId, 'shop');
  await printRepairReceiptHtml(html);
}

async function printBothReceipts(workOrderId: string) {
  await printCustomerReceipt(workOrderId);
  await printRepairSlip(workOrderId);
}

type PriceListRow = {
  _id: string;
  brand: string;
  model: string;
  issue: string;
  name: string;
  priceIncVat: number;
};

type WorkOrderRow = {
  _id: string;
  docNumber: string;
  flowType: string;
  status: string;
  customerPhone?: string;
  customerName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  imeiSn?: string;
  serialSn?: string;
  issueDescription?: string;
  repairLocation?: string;
  expectedCompletionAt?: string;
  quotedPriceIncVat: number;
  notes?: string;
  completionResult?: 'successful' | 'failed';
};

type OrderFilter = 'all' | 'in_progress' | 'awaiting_payment' | 'completed';

const IN_STORE_STEPS: Record<string, string> = {
  draft: 'in_progress',
};

const SEND_OUT_STEPS: Record<string, string> = {
  draft: 'sent_out',
  sent_out: 'in_repair',
  in_repair: 'returned',
};

const IN_PROGRESS_STATUSES = new Set([
  'draft',
  'in_progress',
  'sent_out',
  'in_repair',
  'returned',
]);

function needsCompleteAction(wo: WorkOrderRow): boolean {
  return wo.status === 'in_progress' || wo.status === 'returned';
}

function matchesFilter(wo: WorkOrderRow, filter: OrderFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'in_progress') return IN_PROGRESS_STATUSES.has(wo.status);
  if (filter === 'awaiting_payment') return wo.status === 'awaiting_payment';
  return wo.status === 'completed' || wo.status === 'cancelled';
}

function matchesModel(priceModel: string, input: string): boolean {
  const m = input.trim().toLowerCase();
  if (!m) return true;
  if (priceModel === '—') return true;
  return priceModel.toLowerCase() === m;
}

export function RepairsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);

  const { data: orders } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => api.listWorkOrders(),
  });
  const { data: brands } = useQuery({
    queryKey: ['price-list-brands'],
    queryFn: () => api.listPriceListBrands(),
  });
  const { data: priceList } = useQuery({
    queryKey: ['price-list'],
    queryFn: () => api.listPriceList(),
  });

  const { data: store } = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => api.getStore(storeId!),
    enabled: !!storeId,
  });

  const [repairTerms, setRepairTerms] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [imeiSn, setImeiSn] = useState('');
  const [priceListItemId, setPriceListItemId] = useState('');
  const [issueText, setIssueText] = useState('');
  const [notes, setNotes] = useState('');
  const [repairLocation, setRepairLocation] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [completeTarget, setCompleteTarget] = useState<WorkOrderRow | null>(null);

  const brandName = useMemo(
    () => (brands as { _id: string; name: string }[] | undefined)?.find((b) => b._id === brandId)?.name ?? '',
    [brands, brandId],
  );

  const { data: brandModels } = useQuery({
    queryKey: ['price-list-models', brandId],
    queryFn: () => api.listPriceListModels(brandId),
    enabled: !!brandId,
  });

  const issueOptions = useMemo(() => {
    const list = (priceList as PriceListRow[] | undefined) ?? [];
    if (!brandName) return [];
    const seen = new Set<string>();
    const out: { id: string; label: string; price: number; issue: string }[] = [];
    for (const p of list) {
      if (p.brand !== brandName) continue;
      if (!matchesModel(p.model, deviceModel)) continue;
      const key = p._id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: p._id,
        label: `${p.issue} — €${p.priceIncVat.toFixed(2)}`,
        price: p.priceIncVat,
        issue: p.issue,
      });
    }
    return out.sort((a, b) => a.issue.localeCompare(b.issue));
  }, [priceList, brandName, deviceModel]);

  const selectedPrice = useMemo(
    () => issueOptions.find((o) => o.id === priceListItemId),
    [issueOptions, priceListItemId],
  );

  useEffect(() => {
    if (!priceListItemId) return;
    if (!issueOptions.some((o) => o.id === priceListItemId)) {
      setPriceListItemId('');
    }
  }, [issueOptions, priceListItemId]);

  useEffect(() => {
    if (store?.repairTerms !== undefined) setRepairTerms(store.repairTerms ?? '');
  }, [store?.repairTerms]);

  const saveRepairTerms = useMutation({
    mutationFn: () => api.updateStoreRepairTerms(storeId!, repairTerms),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', storeId] }),
  });

  const create = useMutation({
    mutationFn: () => {
      const price = salePrice.trim() === '' ? undefined : Number(salePrice);
      return api.createWorkOrder({
        customerPhone: phone.trim(),
        customerName: customerName.trim() || undefined,
        deviceBrand: brandName || undefined,
        deviceModel: deviceModel.trim() || undefined,
        imeiSn: imeiSn.trim() || undefined,
        issueDescription: issueText.trim() || undefined,
        priceListItemId: priceListItemId || undefined,
        repairLocation: repairLocation.trim() || undefined,
        expectedCompletionAt: expectedDate || undefined,
        quotedPriceIncVat: price,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async (wo) => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      setPhone('');
      setCustomerName('');
      setBrandId('');
      setDeviceModel('');
      setImeiSn('');
      setPriceListItemId('');
      setIssueText('');
      setNotes('');
      setRepairLocation('');
      setExpectedDate('');
      setSalePrice('');
      try {
        await printBothReceipts(wo._id);
      } catch (e) {
        console.error(e);
      }
    },
  });

  const transition = useMutation({
    mutationFn: ({
      id,
      status,
      completionResult,
    }: {
      id: string;
      status: string;
      completionResult?: 'successful' | 'failed';
    }) => api.transitionWorkOrder(id, status, undefined, completionResult),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['work-orders-payable'] });
      setCompleteTarget(null);
    },
  });

  const filteredOrders = useMemo(
    () =>
      ((orders as WorkOrderRow[] | undefined) ?? []).filter((wo) =>
        matchesFilter(wo, orderFilter),
      ),
    [orders, orderFilter],
  );

  function nextStatus(flow: string, status: string): string | null {
    const map = flow === 'send_out' ? SEND_OUT_STEPS : IN_STORE_STEPS;
    return map[status] ?? null;
  }

  function onIssueSelect(id: string) {
    setPriceListItemId(id);
    const opt = issueOptions.find((o) => o.id === id);
    if (opt) {
      setIssueText(opt.issue);
      setSalePrice(String(opt.price));
    }
  }

  function resetForm() {
    setPhone('');
    setCustomerName('');
    setBrandId('');
    setDeviceModel('');
    setImeiSn('');
    setPriceListItemId('');
    setIssueText('');
    setNotes('');
    setRepairLocation('');
    setExpectedDate('');
    setSalePrice('');
  }

  const modelSuggestions = (brandModels as { name: string }[] | undefined)?.map((m) => m.name) ?? [];

  return (
    <div className="page-content">
      <PageHeader title={t('repairs.title')} />
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        {t('repairs.intakeSubtitle')}
      </p>

      <form
        className="section-card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!phone.trim()) return;
          create.mutate();
        }}
      >
        <h3>{t('repairs.intakeTitle')}</h3>

        <div className="form-row">
          <div className="form-field">
            <label>{t('repairs.customerPhone')} *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
            />
          </div>
          <div className="form-field">
            <label>{t('repairs.customerName')}</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="name"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>{t('repairs.brand')}</label>
            <select
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                setPriceListItemId('');
              }}
            >
              <option value="">{t('common.selectPlaceholder')}</option>
              {(brands as { _id: string; name: string }[] | undefined)?.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>{t('repairs.deviceModel')}</label>
            <input
              list="repair-model-suggestions"
              value={deviceModel}
              onChange={(e) => {
                setDeviceModel(e.target.value);
                setPriceListItemId('');
              }}
              placeholder={t('repairs.deviceModelHint')}
            />
            <datalist id="repair-model-suggestions">
              {modelSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>{t('repairs.imeiSn')}</label>
            <input
              value={imeiSn}
              onChange={(e) => setImeiSn(e.target.value)}
              placeholder={t('repairs.imeiSnHint')}
            />
          </div>
        </div>

        <div className="form-row form-row-align-start">
          <div className="form-field">
            <label>{t('repairs.issueFromList')}</label>
            <select
              value={priceListItemId}
              onChange={(e) => onIssueSelect(e.target.value)}
              disabled={!brandName}
            >
              <option value="">{t('repairs.issueFromListEmpty')}</option>
              {issueOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="form-hint-slot">
              {selectedPrice ? (
                <p className="form-hint">
                  {t('repairs.suggestedPrice')}: €{selectedPrice.price.toFixed(2)}
                </p>
              ) : null}
            </div>
          </div>
          <div className="form-field">
            <label>{t('repairs.issueDescription')}</label>
            <input
              value={issueText}
              onChange={(e) => {
                setIssueText(e.target.value);
                if (priceListItemId) {
                  const opt = issueOptions.find((o) => o.id === priceListItemId);
                  if (opt && e.target.value !== opt.issue) setPriceListItemId('');
                }
              }}
              placeholder={t('priceList.issuePlaceholder')}
            />
            <div className="form-hint-slot" aria-hidden="true" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>{t('repairs.repairLocation')}</label>
            <input
              value={repairLocation}
              onChange={(e) => setRepairLocation(e.target.value)}
              placeholder={t('repairs.repairLocationHint')}
            />
          </div>
          <div className="form-field">
            <label>{t('repairs.expectedCompletion')}</label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>{t('repairs.salePrice')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="form-field" style={{ flex: 2 }}>
            <label>{t('repairs.notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {t('repairs.submitIntake')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetForm}>
            {t('repairs.clearForm')}
          </button>
        </div>
        {create.error && (
          <p className="status-fail" style={{ marginTop: 8 }}>
            {(create.error as Error).message}
          </p>
        )}
      </form>

      <section className="section-card" style={{ marginTop: '1.5rem' }}>
        <h3>{t('repairs.openOrders')}</h3>
        <div className="form-inline" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'in_progress', 'awaiting_payment', 'completed'] as OrderFilter[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                className={orderFilter === f ? '' : 'btn btn-secondary'}
                style={{ fontSize: '0.8rem' }}
                onClick={() => setOrderFilter(f)}
              >
                {f === 'all'
                  ? t('repairs.filterAll')
                  : f === 'in_progress'
                    ? t('repairs.filterInProgress')
                    : f === 'awaiting_payment'
                      ? t('repairs.filterAwaitingPayment')
                      : t('repairs.filterCompleted')}
              </button>
            ),
          )}
        </div>
        <ul className="clean-list">
          {filteredOrders.map((wo) => {
            const next = nextStatus(wo.flowType, wo.status);
            const deviceLabel = [wo.deviceBrand, wo.deviceModel].filter(Boolean).join(' ');
            const sn = wo.imeiSn || wo.serialSn;
            return (
              <li key={wo._id} className="card" style={{ marginBottom: 8 }}>
                <div>
                  <strong>{wo.docNumber}</strong>
                  <span className="badge" style={{ marginLeft: 8 }}>
                    {t(`repairs.status.${wo.status}`, { defaultValue: wo.status })}
                  </span>
                  {wo.completionResult && (
                    <span className="badge" style={{ marginLeft: 4 }}>
                      {wo.completionResult === 'successful'
                        ? t('repairs.outcomeSuccessful')
                        : t('repairs.outcomeFailed')}
                    </span>
                  )}
                  {wo.flowType === 'send_out' && (
                    <span className="badge" style={{ marginLeft: 4 }}>
                      {t('repairs.sendOut')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', marginTop: 4 }}>
                  {wo.customerName || '—'} · {wo.customerPhone || '—'}
                  {deviceLabel && ` · ${deviceLabel}`}
                  {sn && ` · ${t('repairs.imeiSn')}: ${sn}`}
                </div>
                {wo.issueDescription && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {wo.issueDescription}
                  </div>
                )}
                {wo.repairLocation && (
                  <div style={{ fontSize: '0.8125rem' }}>
                    {t('repairs.repairLocation')}: {wo.repairLocation}
                  </div>
                )}
                {wo.expectedCompletionAt && (
                  <div style={{ fontSize: '0.8125rem' }}>
                    {t('repairs.expectedCompletion')}:{' '}
                    {new Date(wo.expectedCompletionAt).toLocaleDateString()}
                  </div>
                )}
                {wo.status === 'awaiting_payment' && (
                  <p className="form-hint" style={{ marginTop: 4 }}>
                    {t('repairs.payAtPos')}
                  </p>
                )}
                <div style={{ marginTop: 6 }}>
                  €{wo.quotedPriceIncVat.toFixed(2)}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginLeft: 8, fontSize: '0.75rem' }}
                    onClick={() => printCustomerReceipt(wo._id)}
                  >
                    {t('repairs.printCustomerReceipt')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginLeft: 8, fontSize: '0.75rem' }}
                    onClick={() => printRepairSlip(wo._id)}
                  >
                    {t('repairs.printRepairSlip')}
                  </button>
                  {needsCompleteAction(wo) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginLeft: 8, fontSize: '0.75rem' }}
                      onClick={() => setCompleteTarget(wo)}
                    >
                      {t('repairs.completeRepair')}
                    </button>
                  )}
                  {next && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginLeft: 8, fontSize: '0.75rem' }}
                      onClick={() => transition.mutate({ id: wo._id, status: next })}
                    >
                      → {t(`repairs.status.${next}`, { defaultValue: next })}
                    </button>
                  )}
                  {wo.status !== 'cancelled' && wo.status !== 'completed' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--danger, #b91c1c)' }}
                      onClick={() => transition.mutate({ id: wo._id, status: 'cancelled' })}
                    >
                      {t('repairs.cancel')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {filteredOrders.length === 0 && (
          <p className="empty-state">{t('repairs.noOrders')}</p>
        )}
      </section>

      {completeTarget && (
        <div
          className="pos-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setCompleteTarget(null)}
        >
          <div className="pos-modal section-card" onClick={(e) => e.stopPropagation()}>
            <h3>{t('repairs.completeRepairTitle')}</h3>
            <p style={{ fontSize: '0.875rem' }}>
              <strong>{completeTarget.docNumber}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={transition.isPending}
                onClick={() =>
                  transition.mutate({
                    id: completeTarget._id,
                    status: 'awaiting_payment',
                    completionResult: 'successful',
                  })
                }
              >
                {t('repairs.completeSuccessful')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={transition.isPending}
                onClick={() =>
                  transition.mutate({
                    id: completeTarget._id,
                    status: 'cancelled',
                    completionResult: 'failed',
                  })
                }
              >
                {t('repairs.completeFailed')}
              </button>
              <button type="button" onClick={() => setCompleteTarget(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {storeId && (
        <details className="section-card collapsible-section">
          <summary>{t('repairs.repairTermsTitle')}</summary>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {t('repairs.repairTermsHint')}
          </p>
          <div className="form-field">
            <textarea
              rows={4}
              value={repairTerms}
              onChange={(e) => setRepairTerms(e.target.value)}
              maxLength={4000}
              placeholder={t('repairs.repairTermsPlaceholder')}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saveRepairTerms.isPending}
            onClick={() => saveRepairTerms.mutate()}
          >
            {t('repairs.saveRepairTerms')}
          </button>
        </details>
      )}
    </div>
  );
}
