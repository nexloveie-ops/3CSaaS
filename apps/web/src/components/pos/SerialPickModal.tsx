import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

export type PosProduct = {
  _id: string;
  name: string;
  productType: string;
  retailPrice?: number;
  costPrice: number;
  variantDimensions?: { name: string; values: string[] }[];
  variantPriceMin?: number;
  variantPriceMax?: number;
};

type SerialRow = {
  _id: string;
  sn: string;
  status: string;
};

type Props = {
  product: PosProduct;
  cartSerialIds: Set<string>;
  onSelect: (unit: { serialUnitId: string; sn: string }) => void;
  onClose: () => void;
};

export function SerialPickModal({ product, cartSerialIds, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');

  const { data: units, isLoading } = useQuery({
    queryKey: ['serials', product._id, 'in_stock'],
    queryFn: () => api.listSerials({ productId: product._id, status: 'in_stock' }),
  });

  const [pickError, setPickError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: (sn: string) => api.lookupSerial(sn),
    onSuccess: (unit) => {
      const pid =
        typeof unit.productId === 'object'
          ? String((unit.productId as { _id: string })._id)
          : String(unit.productId);
      if (pid !== product._id) {
        setPickError(t('pos.serialWrongProduct'));
        return;
      }
      if (unit.status !== 'in_stock') {
        setPickError(t('pos.serialNotInStock'));
        return;
      }
      if (cartSerialIds.has(unit._id)) {
        setPickError(t('pos.serialInCart'));
        return;
      }
      setPickError(null);
      onSelect({ serialUnitId: unit._id, sn: unit.sn });
    },
    onError: (e) => setPickError((e as Error).message),
  });

  const filtered = useMemo(() => {
    const list = (units as SerialRow[] | undefined) ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => u.sn.toLowerCase().includes(q));
  }, [units, filter]);

  function pickUnit(unit: SerialRow) {
    if (cartSerialIds.has(unit._id)) return;
    onSelect({ serialUnitId: unit._id, sn: unit.sn });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--serial-pick"
        role="dialog"
        aria-labelledby="serial-pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="serial-pick-title">{t('pos.pickSerialTitle')}</h3>
          <p className="pos-modal-sub">{product.name}</p>
          <button type="button" className="pos-modal-close" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>

        <div className="pos-modal-body">
          <label className="form-field">
            {t('pos.scanOrSearchSn')}
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filter.trim()) {
                  e.preventDefault();
                  lookup.mutate(filter.trim());
                }
              }}
              placeholder={t('pos.snPlaceholder')}
              autoFocus
            />
          </label>
          {pickError && <p className="status-fail">{pickError}</p>}

          {isLoading && <p>{t('common.checking')}</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="empty-state">{t('pos.noSerialInStock')}</p>
          )}

          <ul className="pos-serial-list">
            {filtered.map((u) => {
              const inCart = cartSerialIds.has(u._id);
              return (
                <li key={u._id}>
                  <button
                    type="button"
                    className="pos-serial-item"
                    disabled={inCart}
                    onClick={() => pickUnit(u)}
                  >
                    <span className="pos-serial-sn">{u.sn}</span>
                    {inCart && <span className="badge">{t('pos.serialInCart')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
