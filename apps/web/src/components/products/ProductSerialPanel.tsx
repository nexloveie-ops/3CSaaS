import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useContextStore } from '../../stores/context';

type Props = {
  productId: string;
  purchaseCost: number;
};

function parseSerialInput(raw: string): string[] {
  return [...new Set(raw.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean))];
}

function serialStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'in_stock':
      return t('products.serialStatusInStock');
    case 'sold':
      return t('products.serialStatusSold');
    case 'written_off':
      return t('products.serialStatusWrittenOff');
    default:
      return status;
  }
}

export function ProductSerialPanel({ productId, purchaseCost }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);
  const [sns, setSns] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const { data: serials, isLoading } = useQuery({
    queryKey: ['product-serials', productId, storeId],
    queryFn: () => api.listSerials({ productId }),
    enabled: !!storeId && !!productId,
  });

  const pendingSerials = parseSerialInput(sns);

  const addSerials = useMutation({
    mutationFn: async (serialNumbers: string[]) => {
      if (!storeId) throw new Error(t('products.noStoreForSerial'));
      for (const sn of serialNumbers) {
        await api.createSerial({
          productId,
          storeId,
          sn,
          purchaseCost,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-serials', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['store-catalog'] });
      setSns('');
      setAddError(null);
    },
    onError: (err: Error) => setAddError(err.message),
  });

  if (!storeId) {
    return (
      <div className="products-serial-panel">
        <p className="products-serial-panel__hint muted">{t('products.noStoreForSerial')}</p>
      </div>
    );
  }

  const list = serials ?? [];

  return (
    <div className="products-serial-panel">
      <h4 className="products-serial-panel__title">{t('products.serialNumbers')}</h4>
      <p className="products-serial-panel__hint muted">{t('products.serialNumbersHint')}</p>

      {isLoading && <p>{t('common.checking')}</p>}

      {!isLoading && list.length === 0 && (
        <p className="products-serial-panel__empty muted">{t('products.noSerialsYet')}</p>
      )}

      {list.length > 0 && (
        <ul className="products-serial-list">
          {list.map((unit) => (
            <li key={unit._id} className="products-serial-list__item">
              <span className="products-serial-list__sn">{unit.sn}</span>
              <span
                className={`badge products-serial-list__status products-serial-list__status--${unit.status}`}
              >
                {serialStatusLabel(unit.status, t)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label className="form-field preorder-form__full">
        <span>{t('inventory.serialPlaceholder')}</span>
        <textarea
          rows={4}
          value={sns}
          onChange={(e) => {
            setSns(e.target.value);
            setAddError(null);
          }}
          placeholder={t('pos.snPlaceholder')}
        />
      </label>
      <p className="products-serial-panel__count muted">
        {t('inventory.serialCount', { count: pendingSerials.length })}
      </p>
      {addError && <p className="status-fail">{addError}</p>}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={addSerials.isPending || pendingSerials.length === 0}
        onClick={() => addSerials.mutate(pendingSerials)}
      >
        {t('products.addSerialNumbers')}
      </button>
    </div>
  );
}
