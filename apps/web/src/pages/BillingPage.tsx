import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

export function BillingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const companyId = useContextStore((s) => s.companyId);

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.listPlans(),
  });

  const { data: billing } = useQuery({
    queryKey: ['billing', companyId],
    queryFn: () => api.getBilling(),
    enabled: !!companyId,
  });

  const activate = useMutation({
    mutationFn: (planId: string) => api.activateFreePlan(planId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });

  const checkout = useMutation({
    mutationFn: (planId: string) =>
      api.checkout(
        planId,
        `${window.location.origin}/dashboard/billing?success=1`,
        `${window.location.origin}/dashboard/billing?cancel=1`,
      ),
    onSuccess: (res: { url: string }) => {
      window.location.href = res.url;
    },
  });

  const b = billing as
    | {
        subscriptionStatus: string;
        enabledModules: string[];
        plan?: { name: string; slug: string };
        stripeEnabled: boolean;
      }
    | undefined;

  return (
    <div className="page-content">
      <PageHeader title={t('billing.title')} />
      {!companyId && <p className="status-fail">{t('billing.selectCompany')}</p>}
      {b && (
        <div className="card">
          <p>
            {t('billing.status')}: <strong>{b.subscriptionStatus}</strong>
          </p>
          <p>
            {t('billing.plan')}: {b.plan ? (b.plan as { name: string }).name : '—'}
          </p>
          <p>
            {t('billing.modules')}: {b.enabledModules?.join(', ')}
          </p>
          <p>
            {t('billing.stripe')}: {b.stripeEnabled ? t('billing.stripeOn') : t('billing.stripeDev')}
          </p>
        </div>
      )}

      <h3>{t('billing.plans')}</h3>
      <ul>
        {(
          plans as
            | {
                _id: string;
                name: string;
                slug: string;
                priceMonthlyCents: number;
                isFree: boolean;
                moduleIds: string[];
              }[]
            | undefined
        )?.map((p) => (
          <li key={p._id} className="card" style={{ listStyle: 'none' }}>
            <strong>{p.name}</strong> — €{(p.priceMonthlyCents / 100).toFixed(2)}
            {t('billing.perMonth')}
            <br />
            <small>{p.moduleIds.join(', ')}</small>
            <br />
            {p.isFree ? (
              <button
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => activate.mutate(p._id)}
                disabled={!companyId}
              >
                {t('billing.activateFree')}
              </button>
            ) : (
              <button
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => checkout.mutate(p._id)}
                disabled={!companyId}
              >
                {t('billing.subscribe')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
