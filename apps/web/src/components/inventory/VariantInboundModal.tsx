import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type CatalogProduct = {
  _id: string;
  name: string;
  variantDimensions?: { name: string; values: string[] }[];
};

type PositionRow = {
  productId:
    | string
    | {
        _id: string;
        name?: string;
      };
  quantity: number;
};

type Props = {
  product: CatalogProduct;
  positions: PositionRow[];
  onConfirm: (lines: { productId: string; quantity: number }[]) => void;
  onClose: () => void;
  pending?: boolean;
};

export function VariantInboundModal({
  product,
  positions,
  onConfirm,
  onClose,
  pending,
}: Props) {
  const { t } = useTranslation();
  const [addByVariantId, setAddByVariantId] = useState<Record<string, string>>({});
  const [bulkQty, setBulkQty] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['product-variants', product._id],
    queryFn: () => api.listProductVariants(product._id),
  });

  const variants = data?.variants ?? [];
  const dimensions = data?.parent.variantDimensions ?? product.variantDimensions ?? [];

  const onHandById = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of positions) {
      const pid =
        typeof row.productId === 'object' ? row.productId._id : String(row.productId);
      m.set(pid, row.quantity);
    }
    return m;
  }, [positions]);

  useEffect(() => {
    if (!variants.length) return;
    setAddByVariantId((prev) => {
      const next = { ...prev };
      for (const v of variants) {
        if (next[v._id] === undefined) next[v._id] = '';
      }
      return next;
    });
  }, [variants]);

  const linesToSubmit = useMemo(() => {
    return variants
      .map((v) => ({
        productId: v._id,
        quantity: Number(addByVariantId[v._id] ?? 0),
      }))
      .filter((l) => l.quantity > 0);
  }, [variants, addByVariantId]);

  function applyBulkQtyToAll() {
    const n = Number(bulkQty);
    if (!Number.isFinite(n) || n < 0) return;
    const value = n === 0 ? '' : String(Math.floor(n));
    setAddByVariantId((prev) => {
      const next = { ...prev };
      for (const v of variants) {
        next[v._id] = value;
      }
      return next;
    });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--variant-pick"
        style={{ maxWidth: 560 }}
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3>{t('inventory.variantInboundTitle')}</h3>
          <p className="pos-modal-sub">{product.name}</p>
          <button type="button" className="pos-modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pos-modal-body">
          {isLoading && <p>{t('common.checking')}</p>}
          {!isLoading && variants.length === 0 && (
            <p className="empty-state">{t('inventory.noVariantsConfigured')}</p>
          )}
          {!isLoading && variants.length > 0 && (
            <>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {t('inventory.variantInboundHint')}
              </p>
              {dimensions.map((dim) => (
                <div key={dim.name} className="pos-variant-dimension-label">
                  {dim.name}: {dim.values.join(', ')}
                </div>
              ))}
              <div
                className="inventory-bulk-qty-row"
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  marginTop: '0.75rem',
                }}
              >
                <label className="form-field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
                  {t('inventory.bulkAddQty')}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={bulkQty}
                    onChange={(e) => setBulkQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyBulkQtyToAll();
                      }
                    }}
                    placeholder="0"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!variants.length}
                  onClick={applyBulkQtyToAll}
                >
                  {t('inventory.applyQtyToAll')}
                </button>
              </div>
              <div style={{ maxHeight: 360, overflow: 'auto', marginTop: '0.75rem' }}>
                <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th align="left">{t('inventory.variantSku')}</th>
                      <th align="right">{t('inventory.currentQty')}</th>
                      <th align="right">{t('inventory.addQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => {
                      const label =
                        v.variantValues?.length > 0
                          ? v.variantValues.join(' · ')
                          : v.name;
                      return (
                        <tr key={v._id}>
                          <td style={{ padding: '0.35rem 0' }}>{label}</td>
                          <td align="right">{onHandById.get(v._id) ?? 0}</td>
                          <td align="right">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={addByVariantId[v._id] ?? ''}
                              onChange={(e) =>
                                setAddByVariantId((prev) => ({
                                  ...prev,
                                  [v._id]: e.target.value,
                                }))
                              }
                              style={{ width: 72 }}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="pos-variant-selected-hint" style={{ marginTop: '0.75rem' }}>
                {t('inventory.linesToAdd', { count: linesToSubmit.length })}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.5rem' }}
                disabled={pending || linesToSubmit.length === 0}
                onClick={() => onConfirm(linesToSubmit)}
              >
                {t('inventory.confirmInbound')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
