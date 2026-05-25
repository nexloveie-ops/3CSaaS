import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useContextStore } from '../../stores/context';

export function RepairTermsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);
  const [repairTerms, setRepairTerms] = useState('');

  const { data: store } = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => api.getStore(storeId!),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (store?.repairTerms !== undefined) setRepairTerms(store.repairTerms ?? '');
  }, [store?.repairTerms]);

  const saveRepairTerms = useMutation({
    mutationFn: () => api.updateStoreRepairTerms(storeId!, repairTerms),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', storeId] }),
  });

  if (!storeId) return null;

  return (
    <details className="section-card collapsible-section reports-repair-terms">
      <summary>{t('reports.repairTermsTitle')}</summary>
      <p className="reports-repair-terms__hint">{t('reports.repairTermsHint')}</p>
      <div className="form-field">
        <textarea
          rows={4}
          value={repairTerms}
          onChange={(e) => setRepairTerms(e.target.value)}
          maxLength={4000}
          placeholder={t('reports.repairTermsPlaceholder')}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={saveRepairTerms.isPending}
        onClick={() => saveRepairTerms.mutate()}
      >
        {saveRepairTerms.isPending ? t('common.checking') : t('reports.saveRepairTerms')}
      </button>
    </details>
  );
}
