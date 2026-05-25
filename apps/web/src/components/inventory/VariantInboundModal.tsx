import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type CatalogProduct = {
  _id: string;
  name: string;
  variantDimensions?: { name: string; values: string[] }[];
};

type VariantSku = {
  _id: string;
  name: string;
  variantValues?: string[];
  costPrice: number;
  retailPrice?: number;
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

export type VariantInboundLine = {
  productId: string;
  quantity: number;
  unitCost?: number;
  retailPrice?: number;
  stockOnHand?: number;
};

type RowEdit = {
  addQty: string;
  cost: string;
  retail: string;
  onHand: string;
};

type Props = {
  product: CatalogProduct;
  positions: PositionRow[];
  onConfirm: (lines: VariantInboundLine[]) => void;
  onClose: () => void;
  pending?: boolean;
};

function parseMoney(value: string): number | undefined {
  const t = value.trim();
  if (t === '') return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseQty(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function VariantInboundModal({
  product,
  positions,
  onConfirm,
  onClose,
  pending,
}: Props) {
  const { t } = useTranslation();
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
  const [bulkQty, setBulkQty] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['product-variants', product._id],
    queryFn: () => api.listProductVariants(product._id),
  });

  const variants = (data?.variants ?? []) as VariantSku[];
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
    setRowEdits((prev) => {
      const next = { ...prev };
      for (const v of variants) {
        if (next[v._id]) continue;
        next[v._id] = {
          addQty: '',
          cost: String(v.costPrice ?? 0),
          retail: v.retailPrice != null ? String(v.retailPrice) : '',
          onHand: String(onHandById.get(v._id) ?? 0),
        };
      }
      return next;
    });
  }, [variants, onHandById]);

  const linesToSubmit = useMemo((): VariantInboundLine[] => {
    const lines: VariantInboundLine[] = [];
    for (const v of variants) {
      const edit = rowEdits[v._id];
      if (!edit) continue;
      const quantity = parseQty(edit.addQty);
      if (quantity <= 0) continue;
      const unitCost = parseMoney(edit.cost);
      const retailPrice = parseMoney(edit.retail);
      const stockOnHand = parseQty(edit.onHand);
      const baseline = onHandById.get(v._id) ?? 0;
      const line: VariantInboundLine = { productId: v._id, quantity };
      if (unitCost !== undefined) line.unitCost = unitCost;
      if (retailPrice !== undefined) line.retailPrice = retailPrice;
      if (stockOnHand !== baseline) line.stockOnHand = stockOnHand;
      lines.push(line);
    }
    return lines;
  }, [variants, rowEdits, onHandById]);

  function updateRow(id: string, patch: Partial<RowEdit>) {
    setRowEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, ...patch },
    }));
  }

  function applyBulkQtyToAll() {
    const n = Number(bulkQty);
    if (!Number.isFinite(n) || n < 0) return;
    const value = n === 0 ? '' : String(Math.floor(n));
    setRowEdits((prev) => {
      const next = { ...prev };
      for (const v of variants) {
        if (!next[v._id]) continue;
        next[v._id] = { ...next[v._id]!, addQty: value };
      }
      return next;
    });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--variant-pick pos-modal--variant-inbound"
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
              <p className="variant-inbound-hint">{t('inventory.variantInboundEditHint')}</p>
              {dimensions.map((dim) => (
                <div key={dim.name} className="pos-variant-dimension-label">
                  {dim.name}: {dim.values.join(', ')}
                </div>
              ))}
              <div className="inventory-bulk-qty-row inventory-bulk-qty-row--variant-inbound">
                <label className="form-field inventory-bulk-qty-row__field">
                  {t('inventory.bulkAddQty')}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="inventory-bulk-qty-row__input"
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
              <div className="variant-inbound-table-wrap">
                <table className="variant-inbound-table">
                  <colgroup>
                    <col className="variant-inbound-table__col-label" />
                    <col className="variant-inbound-table__col-num" span={4} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="variant-inbound-table__th-label">
                        {t('inventory.variantSku')}
                      </th>
                      <th className="variant-inbound-table__th-num">{t('inventory.currentQty')}</th>
                      <th className="variant-inbound-table__th-num">{t('inventory.colCost')}</th>
                      <th className="variant-inbound-table__th-num">{t('inventory.colRetail')}</th>
                      <th className="variant-inbound-table__th-num">{t('inventory.addQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => {
                      const variantLabel = v.variantValues?.filter(Boolean).join(' · ');
                      const label = variantLabel || v.name;
                      const edit = rowEdits[v._id] ?? {
                        addQty: '',
                        cost: '',
                        retail: '',
                        onHand: '0',
                      };
                      return (
                        <tr key={v._id}>
                          <td className="variant-inbound-table__label">{label}</td>
                          <td className="variant-inbound-table__num">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="variant-inbound-table__input"
                              value={edit.onHand}
                              onChange={(e) => updateRow(v._id, { onHand: e.target.value })}
                            />
                          </td>
                          <td className="variant-inbound-table__num">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="variant-inbound-table__input"
                              value={edit.cost}
                              onChange={(e) => updateRow(v._id, { cost: e.target.value })}
                            />
                          </td>
                          <td className="variant-inbound-table__num">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="variant-inbound-table__input"
                              value={edit.retail}
                              onChange={(e) => updateRow(v._id, { retail: e.target.value })}
                            />
                          </td>
                          <td className="variant-inbound-table__num">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="variant-inbound-table__input"
                              value={edit.addQty}
                              onChange={(e) => updateRow(v._id, { addQty: e.target.value })}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="pos-variant-selected-hint">
                {t('inventory.linesToAdd', { count: linesToSubmit.length })}
              </p>
              <button
                type="button"
                className="btn btn-primary variant-inbound-submit"
                disabled={pending || linesToSubmit.length === 0}
                onClick={() => onConfirm(linesToSubmit)}
              >
                {t('inventory.addToBatch')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
