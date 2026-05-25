import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useContextStore } from '../../stores/context';

export function SalesTermsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);
  const [salesTerms, setSalesTerms] = useState('');

  const { data: store } = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => api.getStore(storeId!),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (store?.salesTerms !== undefined) setSalesTerms(store.salesTerms ?? '');
  }, [store?.salesTerms]);

  const saveSalesTerms = useMutation({
    mutationFn: () => api.updateStoreSalesTerms(storeId!, salesTerms),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', storeId] }),
  });

  if (!storeId) return null;

  return (
    <details className="section-card collapsible-section reports-repair-terms">
      <summary>{t('reports.salesTermsTitle')}</summary>
      <p className="reports-repair-terms__hint">{t('reports.salesTermsHint')}</p>
      <div className="form-field">
        <textarea
          rows={4}
          value={salesTerms}
          onChange={(e) => setSalesTerms(e.target.value)}
          maxLength={4000}
          placeholder={t('reports.salesTermsPlaceholder')}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={saveSalesTerms.isPending}
        onClick={() => saveSalesTerms.mutate()}
      >
        {saveSalesTerms.isPending ? t('common.checking') : t('reports.saveSalesTerms')}
      </button>
    </details>
  );
}
