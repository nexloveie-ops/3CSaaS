import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

export function ReportsPage() {
  const { t } = useTranslation();
  const companyId = useContextStore((s) => s.companyId);
  const today = new Date().toISOString().slice(0, 10);
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);

  const { data: summary, refetch } = useQuery({
    queryKey: ['daily-report'],
    queryFn: () => api.getDailyReport(),
  });

  const { data: companyReport } = useQuery({
    queryKey: ['company-report', companyId],
    queryFn: () => api.getCompanyReport(),
    enabled: !!companyId,
  });

  const regen = useMutation({
    mutationFn: () => api.regenerateDailyReport(),
    onSuccess: () => refetch(),
  });

  const s = summary as
    | {
        businessDate: string;
        salesTotal: number;
        salesCount: number;
        cashTotal: number;
        cardTotal: number;
        otherTotal: number;
        openWorkOrders: number;
      }
    | undefined;

  return (
    <div className="page-content">
      <PageHeader title={t('reports.dailyTitle')} />
      <div className="form-inline" style={{ marginBottom: '1rem' }}>
      <button type="button" onClick={() => regen.mutate()}>
        {t('reports.regenerate')}
      </button>
      <button
        type="button"
        style={{ marginLeft: 8, background: '#1d4ed8' }}
        onClick={() => api.downloadDailyReportCsv().catch((e) => alert((e as Error).message))}
      >
        {t('reports.exportDailyCsv')}
      </button>
      </div>

      {s && (
        <div className="section-card">
          <p>
            {t('reports.date')}: {s.businessDate}
          </p>
          <p>
            {t('reports.sales')}: €{s.salesTotal.toFixed(2)} ({s.salesCount} {t('reports.receipts')})
          </p>
          <p>
            {t('reports.cash')}: €{s.cashTotal.toFixed(2)}
          </p>
          <p>
            {t('reports.card')}: €{s.cardTotal.toFixed(2)}
          </p>
          <p>
            {t('reports.other')}: €{s.otherTotal.toFixed(2)}
          </p>
          <p>
            {t('reports.openWorkOrders')}: {s.openWorkOrders}
          </p>
        </div>
      )}

      <div className="section-card" style={{ marginTop: '1rem' }}>
        <h3>{t('reports.rangeExport')}</h3>
        <label>
          {t('reports.from')}{' '}
          <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
        </label>
        <label style={{ marginLeft: 8 }}>
          {t('reports.to')}{' '}
          <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
        </label>
        <button
          type="button"
          style={{ marginLeft: 8, background: '#1d4ed8' }}
          onClick={() =>
            api.downloadRangeReportCsv(rangeFrom, rangeTo).catch((e) => alert((e as Error).message))
          }
        >
          {t('reports.exportRangeCsv')}
        </button>
      </div>

      {companyId && (
        <>
          <h3>{t('reports.companyRollup')}</h3>
          <button
            type="button"
            style={{ marginBottom: 8, background: '#1d4ed8' }}
            onClick={() => api.downloadCompanyReportCsv().catch((e) => alert((e as Error).message))}
          >
            {t('reports.exportCompanyCsv')}
          </button>
          {companyReport && (
            <div className="card">
              <p>
                {t('reports.sales')}: €
                {(companyReport as { salesTotal: number }).salesTotal.toFixed(2)} (
                {(companyReport as { salesCount: number }).salesCount} {t('reports.receipts')})
              </p>
              <p>
                {t('reports.margin')}: €
                {(companyReport as { marginEstimate: number }).marginEstimate.toFixed(2)}
              </p>
              <p>
                {t('reports.storesReporting')}: {(companyReport as { storeCount: number }).storeCount}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
