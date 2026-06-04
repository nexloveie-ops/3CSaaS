import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

const ALL_PRODUCTS_ID = '__all__';
const UNCategorized_ID = '__uncategorized__';

type CatalogRow = {
  productId: string;
  name: string;
  parentName?: string;
  variantValues: string[];
  productType: string;
  skuCode?: string;
  category?: string;
  catalogCategoryId?: string | null;
  retailPrice?: number;
  wholesalePrice?: number;
  costPrice?: number;
  chainShareEnabled: boolean;
  quantity: number;
  quantityReadOnly: boolean;
};

function displayName(row: CatalogRow): string {
  if (row.parentName && row.variantValues.length) {
    return `${row.parentName} — ${row.variantValues.join(' / ')}`;
  }
  return row.name;
}

function hasWholesalePrice(row: CatalogRow): boolean {
  return row.wholesalePrice != null && row.wholesalePrice > 0;
}

export function StoreCatalogPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const companyId = useContextStore((s) => s.companyId);
  const storeId = useContextStore((s) => s.storeId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [wholesaleDraft, setWholesaleDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
    enabled: !!companyId,
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['store-catalog', storeId],
    queryFn: () => api.listStoreCatalog(),
    enabled: !!companyId && !!storeId,
  });

  const cats = (categories as { _id: string; name: string }[] | undefined) ?? [];
  const allRows = (rows as CatalogRow[] | undefined) ?? [];
  const searchActive = debouncedSearch.length >= 2;

  useEffect(() => {
    if (cats.length === 0 && selectedCategoryId == null && allRows.length > 0) {
      setSelectedCategoryId(ALL_PRODUCTS_ID);
    }
  }, [cats.length, selectedCategoryId, allRows.length]);

  const selectedCategory = cats.find((c) => c._id === selectedCategoryId);

  const visibleRows = useMemo(() => {
    if (searchActive) {
      const term = debouncedSearch.toLowerCase();
      return allRows.filter((r) => {
        const label = displayName(r).toLowerCase();
        return label.includes(term) || (r.skuCode?.toLowerCase().includes(term) ?? false);
      });
    }
    if (selectedCategoryId == null) return [];
    if (selectedCategoryId === ALL_PRODUCTS_ID) return allRows;
    if (selectedCategoryId === UNCategorized_ID) {
      return allRows.filter((r) => !r.catalogCategoryId);
    }
    return allRows.filter((r) => r.catalogCategoryId === selectedCategoryId);
  }, [allRows, searchActive, debouncedSearch, selectedCategoryId]);

  const saveQty = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api.setInventoryQuantity(productId, quantity),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-catalog'] });
      setMsg(t('storeCatalog.saved'));
      window.setTimeout(() => setMsg(null), 3000);
    },
  });

  const toggleChainShare = useMutation({
    mutationFn: ({ productId, chainShareEnabled }: { productId: string; chainShareEnabled: boolean }) =>
      api.updateStoreProductSetting(productId, { chainShareEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-catalog'] });
      setMsg(t('storeCatalog.saved'));
      window.setTimeout(() => setMsg(null), 3000);
    },
    onError: (err: Error) => {
      setMsg(err.message);
      window.setTimeout(() => setMsg(null), 4000);
    },
  });

  const saveWholesale = useMutation({
    mutationFn: ({ productId, wholesalePrice }: { productId: string; wholesalePrice: number }) =>
      api.updateProduct(productId, { wholesalePrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-catalog'] });
      setMsg(t('storeCatalog.saved'));
      window.setTimeout(() => setMsg(null), 3000);
    },
  });

  const showCatalogGrid = !searchActive && selectedCategoryId == null;
  const showProductList = searchActive || selectedCategoryId != null;
  const hasUncategorized = allRows.some((r) => !r.catalogCategoryId);

  if (!companyId || !storeId) {
    return (
      <div className="page-content">
        <PageHeader title={t('storeCatalog.title')} />
        <p className="status-fail">{t('warehouse.setContext')}</p>
      </div>
    );
  }

  return (
    <div className="page-content page-content--pos">
      <PageHeader title={t('storeCatalog.title')} />
      <p className="subtitle">{t('storeCatalog.subtitle')}</p>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        {t('storeCatalog.posSalableHint')}
      </p>
      {msg && (
        <p className={msg === t('storeCatalog.saved') ? 'status-ok' : 'status-fail'}>{msg}</p>
      )}

      <div className="pos-layout pos-layout--single">
        <div className="section-card pos-catalog-panel store-catalog-panel">
        <div className="pos-catalog-head">
          <div className="pos-catalog-head__main">
            <div className="pos-catalog-head__nav">
              {showProductList && selectedCategoryId != null && !searchActive && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm pos-catalog-back"
                  onClick={() => setSelectedCategoryId(null)}
                >
                  ← {t('storeCatalog.backToCatalogs')}
                </button>
              )}
              {showProductList && selectedCategoryId != null && !searchActive && (
                <h3 className="pos-catalog-head__title">
                  {selectedCategoryId === ALL_PRODUCTS_ID
                    ? t('storeCatalog.allProducts')
                    : selectedCategoryId === UNCategorized_ID
                      ? t('storeCatalog.uncategorized')
                      : selectedCategory?.name}
                </h3>
              )}
            </div>
            <div className="pos-catalog-search">
              <span className="pos-catalog-search__icon" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                className="pos-catalog-search__input"
                placeholder={t('pos.catalogSearchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearch('');
                }}
              />
              {search && (
                <button
                  type="button"
                  className="pos-catalog-search__clear"
                  aria-label={t('common.cancel')}
                  onClick={() => setSearch('')}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {search.trim().length > 0 && search.trim().length < 2 && (
          <p className="pos-catalog-search-hint">{t('pos.catalogSearchMinHint')}</p>
        )}

        {showCatalogGrid && (
          <>
            {cats.length === 0 && !hasUncategorized ? (
              <p className="empty-state">{t('storeCatalog.noCatalogCategories')}</p>
            ) : (
              <>
                <h4 className="receiving-browse__heading">{t('storeCatalog.selectCatalog')}</h4>
                <div className="pos-catalog-grid">
                  <button
                    type="button"
                    className="pos-catalog-tile pos-catalog-tile--all"
                    onClick={() => setSelectedCategoryId(ALL_PRODUCTS_ID)}
                  >
                    <span className="pos-catalog-tile-name">{t('storeCatalog.allProducts')}</span>
                  </button>
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
                  {hasUncategorized && (
                    <button
                      type="button"
                      className="pos-catalog-tile"
                      onClick={() => setSelectedCategoryId(UNCategorized_ID)}
                    >
                      <span className="pos-catalog-tile-name">{t('storeCatalog.uncategorized')}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {showProductList && isLoading && <p>{t('common.checking')}</p>}

        {showProductList && !isLoading && visibleRows.length === 0 && (
          <p className="empty-state">
            {searchActive ? t('storeCatalog.searchNoResults') : t('storeCatalog.noProductsInCatalog')}
          </p>
        )}

        {showProductList && !isLoading && visibleRows.length > 0 && (
          <div className="table-wrap store-catalog-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="store-catalog-table__cell-product">{t('storeCatalog.colProduct')}</th>
                  <th className="store-catalog-table__cell-num">{t('storeCatalog.colCost')}</th>
                  <th className="store-catalog-table__cell-num">{t('storeCatalog.colRetail')}</th>
                  <th className="store-catalog-table__cell-wholesale">{t('storeCatalog.colWholesale')}</th>
                  <th className="store-catalog-table__cell-stock">{t('storeCatalog.colStock')}</th>
                  <th className="store-catalog-table__cell-share">{t('storeCatalog.colChainShare')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const draft = qtyDraft[row.productId] ?? String(row.quantity);
                  const wholesaleVal =
                    wholesaleDraft[row.productId] ??
                    (row.wholesalePrice != null ? String(row.wholesalePrice) : '');
                  const canEnableShare = hasWholesalePrice(row);
                  return (
                    <tr key={row.productId}>
                      <td className="store-catalog-table__cell-product">
                        <strong>{displayName(row)}</strong>
                        {row.skuCode ? (
                          <div className="code store-catalog-table__sku">{row.skuCode}</div>
                        ) : null}
                      </td>
                      <td className="store-catalog-table__cell-num">
                        {row.costPrice != null ? row.costPrice.toFixed(2) : '—'}
                      </td>
                      <td className="store-catalog-table__cell-num">
                        {row.retailPrice != null ? row.retailPrice.toFixed(2) : '—'}
                      </td>
                      <td className="store-catalog-table__cell-wholesale">
                        <div className="store-catalog-table__controls">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="input-no-spinner store-catalog-table__input store-catalog-table__input--price"
                            placeholder="—"
                            value={wholesaleVal}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              setWholesaleDraft((prev) => ({
                                ...prev,
                                [row.productId]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn-secondary btn-sm store-catalog-table__btn"
                            disabled={saveWholesale.isPending}
                            onClick={() => {
                              const wholesalePrice = Math.max(
                                0,
                                parseFloat(wholesaleVal.replace(',', '.')) || 0,
                              );
                              saveWholesale.mutate({ productId: row.productId, wholesalePrice });
                            }}
                          >
                            {t('storeCatalog.saveWholesale')}
                          </button>
                        </div>
                      </td>
                      <td className="store-catalog-table__cell-stock">
                        {row.quantityReadOnly ? (
                          <span className="store-catalog-table__qty-readonly" title={t('storeCatalog.serialReadOnly')}>
                            {row.quantity}
                          </span>
                        ) : (
                          <div className="store-catalog-table__controls">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="input-no-spinner store-catalog-table__input store-catalog-table__input--qty"
                              value={draft}
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) =>
                                setQtyDraft((prev) => ({
                                  ...prev,
                                  [row.productId]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn-secondary btn-sm store-catalog-table__btn"
                              disabled={saveQty.isPending}
                              onClick={() => {
                                const quantity = Math.max(0, parseInt(draft, 10) || 0);
                                saveQty.mutate({ productId: row.productId, quantity });
                              }}
                            >
                              {t('storeCatalog.saveStock')}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="store-catalog-table__cell-share">
                        <button
                          type="button"
                          className={
                            row.chainShareEnabled
                              ? 'btn-sm store-catalog-table__btn store-catalog-table__btn--share-on'
                              : 'btn-secondary btn-sm store-catalog-table__btn'
                          }
                          disabled={
                            toggleChainShare.isPending ||
                            (!row.chainShareEnabled && !canEnableShare)
                          }
                          title={
                            !canEnableShare && !row.chainShareEnabled
                              ? t('storeCatalog.chainShareRequiresWholesale')
                              : undefined
                          }
                          onClick={() =>
                            toggleChainShare.mutate({
                              productId: row.productId,
                              chainShareEnabled: !row.chainShareEnabled,
                            })
                          }
                        >
                          {row.chainShareEnabled
                            ? t('storeCatalog.chainShareOn')
                            : t('storeCatalog.chainShareOff')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
