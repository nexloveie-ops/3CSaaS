import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_VARIANT_DIMENSIONS,
  cartesianVariantValues,
  variantCombinationKey,
} from '@lz3c/shared';
import { api } from '../../lib/api';

type DimensionDraft = { name: string; valuesText: string };

type Props = {
  parentId: string;
  parentName: string;
  defaultCost: number;
  defaultRetail?: number;
  onClose: () => void;
};

export function ProductVariantEditor({
  parentId,
  parentName,
  defaultCost,
  defaultRetail,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['product-variants', parentId],
    queryFn: () => api.listProductVariants(parentId),
  });

  const [dimensions, setDimensions] = useState<DimensionDraft[]>([
    { name: '', valuesText: '' },
  ]);
  const [priceByKey, setPriceByKey] = useState<
    Record<string, { costPrice: string; retailPrice: string }>
  >({});

  useEffect(() => {
    const parent = data?.parent;
    const variants = data?.variants ?? [];
    if (!parent?.variantDimensions?.length && !variants.length) return;

    const dims =
      parent?.variantDimensions?.map((d) => ({
        name: d.name,
        valuesText: d.values.join(', '),
      })) ?? dimensions;

    setDimensions(dims.length ? dims : [{ name: '', valuesText: '' }]);

    const prices: Record<string, { costPrice: string; retailPrice: string }> = {};
    for (const v of variants) {
      const key = variantCombinationKey(v.variantValues);
      prices[key] = {
        costPrice: String(v.costPrice),
        retailPrice: v.retailPrice != null ? String(v.retailPrice) : '',
      };
    }
    setPriceByKey(prices);
  }, [data]);

  const parsedDimensions = useMemo(() => {
    return dimensions
      .map((d) => ({
        name: d.name.trim(),
        values: d.valuesText
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean),
      }))
      .filter((d) => d.name && d.values.length);
  }, [dimensions]);

  const combinations = useMemo(
    () => cartesianVariantValues(parsedDimensions),
    [parsedDimensions],
  );

  useEffect(() => {
    setPriceByKey((prev) => {
      const next = { ...prev };
      for (const combo of combinations) {
        const key = variantCombinationKey(combo);
        if (!next[key]) {
          next[key] = {
            costPrice: String(defaultCost),
            retailPrice: defaultRetail != null ? String(defaultRetail) : '',
          };
        }
      }
      return next;
    });
  }, [combinations, defaultCost, defaultRetail]);

  const sync = useMutation({
    mutationFn: () => {
      if (!parsedDimensions.length) {
        throw new Error(t('products.variantDimensions'));
      }
      return api.syncProductVariants(parentId, {
        dimensions: parsedDimensions,
        variants: combinations.map((variantValues) => {
          const key = variantCombinationKey(variantValues);
          const row = priceByKey[key] ?? {
            costPrice: String(defaultCost),
            retailPrice: defaultRetail != null ? String(defaultRetail) : '',
          };
          return {
            variantValues,
            costPrice: Number(row.costPrice) || 0,
            retailPrice: row.retailPrice ? Number(row.retailPrice) : undefined,
          };
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-variants', parentId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  function updateDimension(index: number, patch: Partial<DimensionDraft>) {
    setDimensions((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--variant-pick"
        style={{ maxWidth: 640 }}
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3>
            {t('products.manageVariants')} — {parentName}
          </h3>
          <button type="button" className="pos-modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pos-modal-body">
          {isLoading && <p>{t('common.checking')}</p>}
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {t('products.variantMatrixHint')}
          </p>

          {dimensions.map((dim, index) => (
            <div
              key={index}
              className="form-row"
              style={{ alignItems: 'flex-end', marginBottom: '0.75rem' }}
            >
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>{t('products.dimensionName')}</label>
                <input
                  value={dim.name}
                  onChange={(e) => updateDimension(index, { name: e.target.value })}
                  placeholder={index === 0 ? 'Model' : index === 1 ? 'Color' : 'Type'}
                />
              </div>
              <div className="form-field" style={{ flex: 2, marginBottom: 0 }}>
                <label>{t('products.dimensionValues')}</label>
                <input
                  value={dim.valuesText}
                  onChange={(e) =>
                    updateDimension(index, { valuesText: e.target.value })
                  }
                  placeholder="iPhone 13, iPhone 14, …"
                />
              </div>
              {dimensions.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setDimensions((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  {t('products.removeDimension')}
                </button>
              )}
            </div>
          ))}

          {dimensions.length < MAX_VARIANT_DIMENSIONS && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginBottom: '1rem' }}
              onClick={() =>
                setDimensions((rows) => [...rows, { name: '', valuesText: '' }])
              }
            >
              {t('products.addDimension')}
            </button>
          )}

          {combinations.length > 0 && (
            <>
              <p style={{ fontWeight: 600 }}>
                {t('products.variantCount', { count: combinations.length })}
              </p>
              <div style={{ maxHeight: 280, overflow: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>{t('products.variantCost')}</th>
                      <th>{t('products.variantRetail')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinations.map((combo) => {
                      const key = variantCombinationKey(combo);
                      const row = priceByKey[key] ?? {
                        costPrice: String(defaultCost),
                        retailPrice: '',
                      };
                      return (
                        <tr key={key}>
                          <td>{combo.join(' · ')}</td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={row.costPrice}
                              onChange={(e) =>
                                setPriceByKey((prev) => ({
                                  ...prev,
                                  [key]: { ...row, costPrice: e.target.value },
                                }))
                              }
                              style={{ width: 88 }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={row.retailPrice}
                              onChange={(e) =>
                                setPriceByKey((prev) => ({
                                  ...prev,
                                  [key]: { ...row, retailPrice: e.target.value },
                                }))
                              }
                              style={{ width: 88 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {sync.error && (
            <p className="status-fail">{(sync.error as Error).message}</p>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            disabled={!combinations.length || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {t('products.syncVariants')}
          </button>
        </div>
      </div>
    </div>
  );
}
