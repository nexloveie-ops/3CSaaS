import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { variantCombinationKey } from '@lz3c/shared';
import { api } from '../../lib/api';

export type VariantPickProduct = {
  _id: string;
  name: string;
  variantDimensions?: { name: string; values: string[] }[];
};

type VariantRow = {
  _id: string;
  name: string;
  variantValues: string[];
  costPrice: number;
  retailPrice?: number;
  quantity: number;
};

type Props = {
  product: VariantPickProduct;
  onSelect: (variant: VariantRow) => void;
  onClose: () => void;
};

export function VariantPickModal({ product, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['product-variants-in-stock', product._id],
    queryFn: () => api.listProductVariantsInStock(product._id),
  });

  const dimensions =
    data?.parent.variantDimensions ?? product.variantDimensions ?? [];
  const variants = (data?.variants ?? []) as VariantRow[];

  const variantByKey = useMemo(() => {
    const m = new Map<string, VariantRow>();
    for (const v of variants) {
      m.set(variantCombinationKey(v.variantValues), v);
    }
    return m;
  }, [variants]);

  const optionsForDimension = (dimIndex: number): string[] => {
    const dim = dimensions[dimIndex];
    if (!dim) return [];
    const prefix = selected.slice(0, dimIndex);
    const available = new Set<string>();
    for (const v of variants) {
      const vals = v.variantValues;
      if (prefix.length) {
        let ok = true;
        for (let i = 0; i < prefix.length; i++) {
          if (vals[i] !== prefix[i]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      const val = vals[dimIndex];
      if (val) available.add(val);
    }
    return dim.values.filter((x) => available.has(x));
  };

  const resolvedVariant = useMemo(() => {
    if (selected.length !== dimensions.length) return null;
    return variantByKey.get(variantCombinationKey(selected)) ?? null;
  }, [selected, dimensions.length, variantByKey]);

  const nextDimIndex = selected.length;

  function pickValue(dimIndex: number, value: string) {
    const next = [...selected.slice(0, dimIndex), value];
    setSelected(next);
    if (next.length === dimensions.length) {
      const v = variantByKey.get(variantCombinationKey(next));
      if (v) onSelect(v);
    }
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--variant-pick"
        role="dialog"
        aria-labelledby="variant-pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header pos-variant-modal-header">
          <div>
            <h3 id="variant-pick-title">{t('pos.pickVariantTitle')}</h3>
            <p className="pos-modal-sub">{product.name}</p>
          </div>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="pos-modal-body pos-variant-modal-body">
          {isLoading && <p className="pos-variant-loading">{t('common.checking')}</p>}
          {!isLoading && variants.length === 0 && (
            <p className="empty-state">{t('pos.noVariantInStock')}</p>
          )}
          {!isLoading && variants.length > 0 && (
            <div className="pos-variant-picker">
              {dimensions.map((dim, dimIndex) => {
                const opts = optionsForDimension(dimIndex);
                if (!opts.length) return null;
                const isCurrent = dimIndex === nextDimIndex;
                const isDone = dimIndex < selected.length;
                return (
                  <section
                    key={dim.name}
                    className={
                      isCurrent
                        ? 'pos-variant-step pos-variant-step--current'
                        : isDone
                          ? 'pos-variant-step pos-variant-step--done'
                          : 'pos-variant-step pos-variant-step--pending'
                    }
                  >
                    <div className="pos-variant-step__head">
                      <span className="pos-variant-step__badge">{dimIndex + 1}</span>
                      <div className="pos-variant-step__titles">
                        <h4 className="pos-variant-step__label">{dim.name}</h4>
                        {isDone && selected[dimIndex] && (
                          <span className="pos-variant-step__picked">{selected[dimIndex]}</span>
                        )}
                        {isCurrent && dimensions.length > 1 && (
                          <span className="pos-variant-step__meta">
                            {t('pos.pickVariantStep', {
                              current: dimIndex + 1,
                              total: dimensions.length,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="pos-variant-options"
                      role="group"
                      aria-label={dim.name}
                    >
                      {opts.map((value) => {
                        const active = selected[dimIndex] === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={
                              active
                                ? 'pos-variant-option pos-variant-option--active'
                                : 'pos-variant-option'
                            }
                            disabled={dimIndex > nextDimIndex}
                            onClick={() => pickValue(dimIndex, value)}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {!isLoading && variants.length > 0 && (
          <footer className="pos-variant-footer">
            {resolvedVariant ? (
              <div className="pos-variant-summary">
                <div className="pos-variant-summary__info">
                  <span className="pos-variant-summary__name">{resolvedVariant.name}</span>
                  <span className="pos-variant-summary__meta">
                    €{(resolvedVariant.retailPrice ?? resolvedVariant.costPrice).toFixed(2)}
                    {' · '}
                    {t('pos.variantQty', { count: resolvedVariant.quantity })}
                  </span>
                </div>
                <span className="pos-variant-summary__ok">{t('pos.variantAddedHint')}</span>
              </div>
            ) : (
              <p className="pos-variant-prompt">{t('pos.pickVariantPrompt')}</p>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
