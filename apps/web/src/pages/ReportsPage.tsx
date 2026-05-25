import { taxSchemeReportLabel } from '@lz3c/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RepairTermsSection } from '../components/repairs/RepairTermsSection';
import { SalesTermsSection } from '../components/repairs/SalesTermsSection';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

type SalesReport = {
  from: string;
  to: string;
  receiptCount: number;
  itemsSold: number;
  turnoverIncVat: number;
  turnoverExVat: number;
  vatTotal: number;
  costTotal: number;
  grossProfit: number;
  profitMarginPct: number;
  payments: { cash: number; card: number; other: number; total: number };
  taxBreakdown: {
    scheme: string;
    label: string;
    revenueIncVat: number;
    vat: number;
    revenueExVat: number;
    cost: number;
    profit: number;
  }[];
  openWorkOrders: number;
  repairRevenueIncVat: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtEuro(n: number): string {
  return `€${n.toFixed(2)}`;
}

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 1000) / 10;
}

export function ReportsPage() {
  const { t } = useTranslation();
  const today = todayIso();
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sales-report', rangeFrom, rangeTo],
    queryFn: () => api.getSalesReport(rangeFrom, rangeTo) as Promise<SalesReport>,
    enabled: rangeFrom <= rangeTo,
  });

  const report = data;
  const paymentRows = useMemo(() => {
    if (!report) return [];
    const total = report.payments.total || 0;
    return [
      { key: 'cash', label: t('reports.cash'), amount: report.payments.cash },
      { key: 'card', label: t('reports.card'), amount: report.payments.card },
      { key: 'other', label: t('reports.other'), amount: report.payments.other },
    ].filter((r) => r.amount > 0 || total === 0);
  }, [report, t]);

  return (
    <div className="page-content reports-page">
      <PageHeader title={t('reports.title')} description={t('reports.subtitle')} />

      <section className="section-card reports-toolbar">
        <div className="reports-toolbar__dates">
          <label className="form-field">
            <span>{t('reports.from')}</span>
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          </label>
          <label className="form-field">
            <span>{t('reports.to')}</span>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
          </label>
        </div>
        <div className="reports-toolbar__presets">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setRangeFrom(today);
              setRangeTo(today);
            }}
          >
            {t('reports.presetToday')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 6);
              setRangeFrom(d.toISOString().slice(0, 10));
              setRangeTo(today);
            }}
          >
            {t('reports.preset7d')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const d = new Date();
              setRangeFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
              setRangeTo(today);
            }}
          >
            {t('reports.presetMonth')}
          </button>
        </div>
      </section>

      {rangeFrom > rangeTo && (
        <p className="status-fail">{t('reports.invalidRange')}</p>
      )}

      {isLoading && <p>{t('common.checking')}</p>}
      {isError && <p className="status-fail">{(error as Error).message}</p>}

      {report && (
        <>
          <div className="reports-kpi-grid">
            <article className="reports-kpi reports-kpi--primary">
              <span className="reports-kpi__label">{t('reports.turnoverIncVat')}</span>
              <strong className="reports-kpi__value">{fmtEuro(report.turnoverIncVat)}</strong>
              <span className="reports-kpi__hint">
                {report.receiptCount} {t('reports.receipts')} · {report.itemsSold}{' '}
                {t('reports.itemsSold')}
              </span>
            </article>
            <article className="reports-kpi">
              <span className="reports-kpi__label">{t('reports.turnoverExVat')}</span>
              <strong className="reports-kpi__value">{fmtEuro(report.turnoverExVat)}</strong>
            </article>
            <article className="reports-kpi">
              <span className="reports-kpi__label">{t('reports.vatPayable')}</span>
              <strong className="reports-kpi__value">{fmtEuro(report.vatTotal)}</strong>
            </article>
            <article className="reports-kpi">
              <span className="reports-kpi__label">{t('reports.costTotal')}</span>
              <strong className="reports-kpi__value">{fmtEuro(report.costTotal)}</strong>
            </article>
            <article className="reports-kpi reports-kpi--profit">
              <span className="reports-kpi__label">{t('reports.grossProfit')}</span>
              <strong className="reports-kpi__value">{fmtEuro(report.grossProfit)}</strong>
              <span className="reports-kpi__hint">
                {t('reports.profitMargin', { pct: report.profitMarginPct.toFixed(1) })}
              </span>
            </article>
            <article className="reports-kpi">
              <span className="reports-kpi__label">{t('reports.openWorkOrders')}</span>
              <strong className="reports-kpi__value">{report.openWorkOrders}</strong>
            </article>
            {report.repairRevenueIncVat > 0 && (
              <article className="reports-kpi">
                <span className="reports-kpi__label">{t('reports.repairRevenue')}</span>
                <strong className="reports-kpi__value">{fmtEuro(report.repairRevenueIncVat)}</strong>
              </article>
            )}
          </div>

          <div className="reports-panels">
            <section className="section-card reports-panel">
              <h3>{t('reports.paymentBreakdown')}</h3>
              {report.payments.total <= 0 ? (
                <p className="empty-state">{t('reports.noSalesInRange')}</p>
              ) : (
                <div className="reports-payment-list">
                  {paymentRows.map((row) => (
                    <div key={row.key} className="reports-payment-row">
                      <div className="reports-payment-row__head">
                        <span>{row.label}</span>
                        <strong>{fmtEuro(row.amount)}</strong>
                      </div>
                      <div className="reports-payment-bar">
                        <div
                          className={`reports-payment-bar__fill reports-payment-bar__fill--${row.key}`}
                          style={{ width: `${pct(row.amount, report.payments.total)}%` }}
                        />
                      </div>
                      <span className="reports-payment-row__pct">
                        {pct(row.amount, report.payments.total).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  <div className="reports-payment-total">
                    <span>{t('reports.paymentTotal')}</span>
                    <strong>{fmtEuro(report.payments.total)}</strong>
                  </div>
                </div>
              )}
            </section>

            <section className="section-card reports-panel">
              <h3>{t('reports.taxBreakdown')}</h3>
              {report.repairRevenueIncVat > 0 && (
                <p className="reports-kpi__hint">{t('reports.repairTaxNote')}</p>
              )}
              <div className="table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>{t('reports.taxCategory')}</th>
                        <th className="reports-table__num">{t('reports.colRevenueIncVat')}</th>
                        <th className="reports-table__num">{t('reports.colRevenueExVat')}</th>
                        <th className="reports-table__num">{t('reports.colVat')}</th>
                        <th className="reports-table__num">{t('reports.colCost')}</th>
                        <th className="reports-table__num">{t('reports.colProfit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.taxBreakdown.map((row) => (
                        <tr key={`${row.scheme}:${row.label}`}>
                          <td>
                          <span className="reports-table__tax-label">
                            {taxSchemeReportLabel(row.scheme)}
                          </span>
                        </td>
                          <td className="reports-table__num">{fmtEuro(row.revenueIncVat)}</td>
                          <td className="reports-table__num">{fmtEuro(row.revenueExVat)}</td>
                          <td className="reports-table__num">{fmtEuro(row.vat)}</td>
                          <td className="reports-table__num">{fmtEuro(row.cost)}</td>
                          <td className="reports-table__num">{fmtEuro(row.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>{t('reports.total')}</td>
                        <td className="reports-table__num">{fmtEuro(report.turnoverIncVat)}</td>
                        <td className="reports-table__num">{fmtEuro(report.turnoverExVat)}</td>
                        <td className="reports-table__num">{fmtEuro(report.vatTotal)}</td>
                        <td className="reports-table__num">{fmtEuro(report.costTotal)}</td>
                        <td className="reports-table__num">{fmtEuro(report.grossProfit)}</td>
                      </tr>
                    </tfoot>
                  </table>
              </div>
            </section>
          </div>
        </>
      )}

      <RepairTermsSection />
      <SalesTermsSection />
    </div>
  );
}
