import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SerializedInboundModal } from '../components/inventory/SerializedInboundModal';
import { SimpleInboundModal } from '../components/inventory/SimpleInboundModal';
import { VariantInboundModal } from '../components/inventory/VariantInboundModal';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

type CatalogProduct = {
  _id: string;
  name: string;
  productType: string;
  retailPrice?: number;
  costPrice: number;
  variantDimensions?: { name: string; values: string[] }[];
};

type PositionRow = {
  productId:
    | string
    | {
        _id: string;
        name: string;
        productType: string;
        parentProductId?: string | { _id: string; name: string } | null;
        variantValues?: string[];
      };
  quantity: number;
};

function productIdOf(row: PositionRow): string {
  return typeof row.productId === 'object' ? row.productId._id : String(row.productId);
}

function productLabel(row: PositionRow): string {
  if (typeof row.productId !== 'object') return String(row.productId);
  const p = row.productId;
  if (p.variantValues?.length) {
    return p.variantValues.join(' · ');
  }
  const parent = p.parentProductId;
  if (parent && typeof parent === 'object' && parent.name) {
    return `${parent.name} · ${p.name}`;
  }
  return p.name;
}

function parentKey(row: PositionRow): string {
  if (typeof row.productId !== 'object') return productIdOf(row);
  const p = row.productId;
  const parent = p.parentProductId;
  if (parent && typeof parent === 'object') return parent._id;
  if (parent) return String(parent);
  return p._id;
}

function parentTitle(row: PositionRow): string {
  if (typeof row.productId !== 'object') return productLabel(row);
  const p = row.productId;
  const parent = p.parentProductId;
  if (parent && typeof parent === 'object') return parent.name;
  return p.name;
}

export function InventoryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
  });

  const { data: positions } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.listInventory(),
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [simpleTarget, setSimpleTarget] = useState<CatalogProduct | null>(null);
  const [serialTarget, setSerialTarget] = useState<CatalogProduct | null>(null);
  const [variantTarget, setVariantTarget] = useState<CatalogProduct | null>(null);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCategoryId],
    queryFn: () =>
      api.listProducts(
        selectedCategoryId ? { catalogCategoryId: selectedCategoryId } : undefined,
      ),
    enabled: selectedCategoryId != null,
  });

  const positionRows = (positions as PositionRow[] | undefined) ?? [];
  const qtyByProductId = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of positionRows) {
      m.set(productIdOf(row), row.quantity);
    }
    return m;
  }, [positionRows]);

  const stockGroups = useMemo(() => {
    const filtered = showZeroStock
      ? positionRows
      : positionRows.filter((r) => r.quantity > 0);
    const map = new Map<string, { title: string; rows: PositionRow[] }>();
    for (const row of filtered) {
      const key = parentKey(row);
      if (!map.has(key)) {
        map.set(key, { title: parentTitle(row), rows: [] });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [positionRows, showZeroStock]);

  const inbound = useMutation({
    mutationFn: (lines: Record<string, unknown>[]) =>
      api.createInbound({ lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setSimpleTarget(null);
      setSerialTarget(null);
      setVariantTarget(null);
      setSuccessMsg(t('inventory.inboundSuccess'));
      window.setTimeout(() => setSuccessMsg(null), 4000);
    },
  });

  const selectedCategory = (categories as { _id: string; name: string }[] | undefined)?.find(
    (c) => c._id === selectedCategoryId,
  );
  const productList = (products as CatalogProduct[] | undefined)?.filter(
    (p) => p.productType !== 'service',
  ) ?? [];
  const cats = (categories as { _id: string; name: string }[] | undefined) ?? [];

  function onProductClick(p: CatalogProduct) {
    if (p.productType === 'serialized') {
      setSerialTarget(p);
    } else if (p.variantDimensions?.length) {
      setVariantTarget(p);
    } else {
      setSimpleTarget(p);
    }
  }

  return (
    <div className="page-content">
      <PageHeader title={t('inventory.title')} />
      <div className="pos-layout">
        <div className="section-card pos-catalog-panel">
          {selectedCategoryId == null ? (
            <>
              <h3>{t('inventory.selectCatalog')}</h3>
              {cats.length === 0 ? (
                <p className="empty-state">{t('inventory.noCatalogCategories')}</p>
              ) : (
                <div className="pos-catalog-grid">
                  {cats.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      className="pos-catalog-tile"
                      onClick={() => setSelectedCategoryId(c._id)}
                    >
                      <span className="pos-catalog-tile-name">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="pos-catalog-toolbar">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedCategoryId(null)}
                >
                  ← {t('inventory.backToCatalogs')}
                </button>
                <h3 style={{ margin: 0 }}>{selectedCategory?.name}</h3>
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {t('inventory.pickProductHint')}
              </p>
              {productsLoading && <p>{t('common.checking')}</p>}
              {!productsLoading && productList.length === 0 && (
                <p className="empty-state">{t('inventory.noProductsInCatalog')}</p>
              )}
              <div className="pos-product-grid">
                {productList.map((p) => {
                  const onHand = qtyByProductId.get(p._id) ?? 0;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      className="pos-product-tile"
                      onClick={() => onProductClick(p)}
                    >
                      <span className="pos-product-name">{p.name}</span>
                      {p.productType === 'serialized' && (
                        <span className="badge">{t('pos.serializedBadge')}</span>
                      )}
                      {!!p.variantDimensions?.length && (
                        <span className="badge">{t('pos.variantBadge')}</span>
                      )}
                      {!p.variantDimensions?.length && p.productType !== 'serialized' && (
                        <span className="pos-product-meta">
                          {t('inventory.currentQty')}: {onHand}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="section-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '0.75rem',
            }}
          >
            <h3 style={{ margin: 0 }}>{t('inventory.stockOnHand')}</h3>
            <label style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={showZeroStock}
                onChange={(e) => setShowZeroStock(e.target.checked)}
              />
              {t('inventory.showZeroStock')}
            </label>
          </div>
          {successMsg && <p className="status-ok">{successMsg}</p>}
          {inbound.error && (
            <p className="status-fail">{(inbound.error as Error).message}</p>
          )}
          {stockGroups.length === 0 ? (
            <p className="empty-state">{t('inventory.noStock')}</p>
          ) : (
            <div className="inventory-stock-groups">
              {stockGroups.map((group) => (
                <details
                  key={group.title}
                  className="collapsible-section"
                  open={group.rows.length <= 6}
                >
                  <summary>
                    {group.title}
                    <span className="badge" style={{ marginLeft: '0.5rem' }}>
                      {group.rows.reduce((s, r) => s + r.quantity, 0)}
                    </span>
                  </summary>
                  <table style={{ width: '100%', marginTop: '0.5rem' }}>
                    <tbody>
                      {group.rows
                        .sort((a, b) => productLabel(a).localeCompare(productLabel(b)))
                        .map((row) => (
                          <tr key={productIdOf(row)}>
                            <td>{productLabel(row)}</td>
                            <td align="right">{row.quantity}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      {simpleTarget && (
        <SimpleInboundModal
          productName={simpleTarget.name}
          currentQty={qtyByProductId.get(simpleTarget._id) ?? 0}
          pending={inbound.isPending}
          onClose={() => setSimpleTarget(null)}
          onConfirm={(quantity) =>
            inbound.mutate([{ productId: simpleTarget._id, quantity }])
          }
        />
      )}

      {serialTarget && (
        <SerializedInboundModal
          productName={serialTarget.name}
          pending={inbound.isPending}
          onClose={() => setSerialTarget(null)}
          onConfirm={(quantity, serialNumbers) =>
            inbound.mutate([
              { productId: serialTarget._id, quantity, serialNumbers },
            ])
          }
        />
      )}

      {variantTarget && (
        <VariantInboundModal
          product={variantTarget}
          positions={positionRows}
          pending={inbound.isPending}
          onClose={() => setVariantTarget(null)}
          onConfirm={(lines) => inbound.mutate(lines)}
        />
      )}
    </div>
  );
}
