import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useContextStore } from '../../stores/context';
import { AddBatchLineModal } from './AddBatchLineModal';
import { QuickNewProductModal } from './QuickNewProductModal';
import { SerializedInboundModal } from './SerializedInboundModal';
import { VariantInboundModal } from './VariantInboundModal';
import {
  clearReceivingDraft,
  loadReceivingDraft,
  loadRecentSuppliers,
  rememberSupplier,
  saveReceivingDraft,
} from './receivingStorage';
import type {
  CatalogProduct,
  InboundNewProductPayload,
  PositionRow,
  ReceivingCartLine,
  ReceivingDraft,
} from './receivingTypes';
import { productIdOf } from './receivingTypes';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const ALL_PRODUCTS_ID = '__all__';

type Props = {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
};

export function ReceivingPanel({ onSuccess, onError }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);

  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayIso);
  const [lines, setLines] = useState<ReceivingCartLine[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [simpleTarget, setSimpleTarget] = useState<CatalogProduct | null>(null);
  const [serialTarget, setSerialTarget] = useState<
    (CatalogProduct & { newProduct?: InboundNewProductPayload }) | null
  >(null);
  const [variantTarget, setVariantTarget] = useState<CatalogProduct | null>(null);
  const [quickNewOpen, setQuickNewOpen] = useState(false);

  const recentSuppliers = useMemo(() => loadRecentSuppliers(storeId), [storeId]);

  useEffect(() => {
    const draft = loadReceivingDraft(storeId);
    if (draft) {
      setSupplier(draft.supplier);
      setNotes(draft.notes);
      setReceivedDate(draft.receivedDate || todayIso());
      setLines(draft.lines);
    }
  }, [storeId]);

  useEffect(() => {
    const draft: ReceivingDraft = { supplier, notes, receivedDate, lines };
    saveReceivingDraft(storeId, draft);
  }, [supplier, notes, receivedDate, lines, storeId]);

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
  });

  const cats = (categories as { _id: string; name: string }[] | undefined) ?? [];

  const { data: positions } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.listInventory(),
  });

  const searchTerm = search.trim();
  const { data: searchProducts, isLoading: searchLoading } = useQuery({
    queryKey: ['products-search', searchTerm],
    queryFn: () => api.listProducts({ q: searchTerm }) as Promise<CatalogProduct[]>,
    enabled: searchTerm.length >= 2,
  });

  const { data: categoryProducts, isLoading: categoryLoading } = useQuery({
    queryKey: ['products', selectedCategoryId],
    queryFn: () =>
      api.listProducts({ catalogCategoryId: selectedCategoryId! }) as Promise<CatalogProduct[]>,
    enabled:
      selectedCategoryId != null &&
      selectedCategoryId !== ALL_PRODUCTS_ID &&
      searchTerm.length < 2,
  });

  const browseAllProducts =
    selectedCategoryId === ALL_PRODUCTS_ID || (cats.length === 0 && searchTerm.length < 2);

  const { data: allProducts, isLoading: allLoading } = useQuery({
    queryKey: ['products-all-receiving'],
    queryFn: () => api.listProducts() as Promise<CatalogProduct[]>,
    enabled: browseAllProducts,
  });

  const positionRows = (positions as PositionRow[] | undefined) ?? [];
  const qtyByProductId = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of positionRows) {
      m.set(productIdOf(row), row.quantity);
    }
    return m;
  }, [positionRows]);

  const browseProducts = useMemo(() => {
    const list =
      searchTerm.length >= 2
        ? (searchProducts ?? [])
        : selectedCategoryId === ALL_PRODUCTS_ID || cats.length === 0
          ? (allProducts ?? [])
          : selectedCategoryId != null
            ? (categoryProducts ?? [])
            : [];
    return list.filter((p) => p.productType !== 'service');
  }, [searchTerm, searchProducts, selectedCategoryId, categoryProducts, allProducts, cats.length]);

  const browseLoading =
    searchTerm.length >= 2
      ? searchLoading
      : browseAllProducts
        ? allLoading
        : categoryLoading;

  const addLines = useCallback((incoming: ReceivingCartLine[]) => {
    setLines((prev) => {
      const next = [...prev];
      for (const line of incoming) {
        if (
          line.productId &&
          line.productType !== 'serialized' &&
          !line.serialNumbers?.length &&
          !line.isNew
        ) {
          const idx = next.findIndex(
            (l) =>
              l.productId === line.productId &&
              !l.serialNumbers?.length &&
              !l.isNew &&
              l.productType !== 'serialized',
          );
          if (idx >= 0) {
            next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
            continue;
          }
        }
        next.push(line);
      }
      return next;
    });
  }, []);

  function onProductClick(p: CatalogProduct) {
    if (p.productType === 'serialized') {
      setSerialTarget(p);
    } else if (p.variantDimensions?.length) {
      setVariantTarget(p);
    } else {
      setSimpleTarget(p);
    }
  }

  function afterNewProductDefined(np: InboundNewProductPayload) {
    setQuickNewOpen(false);
    if (np.productType === 'serialized') {
      setSerialTarget({
        _id: '',
        name: np.name,
        productType: 'serialized',
        costPrice: np.costPrice,
        newProduct: np,
      });
    } else {
      setSimpleTarget({
        _id: '',
        name: np.name,
        productType: np.productType,
        costPrice: np.costPrice,
        newProduct: np,
      } as CatalogProduct & { newProduct?: InboundNewProductPayload });
    }
  }

  const submit = useMutation({
    mutationFn: () => {
      if (!supplier.trim()) {
        throw new Error(t('inventory.supplierRequired'));
      }
      if (!lines.length) {
        throw new Error(t('inventory.batchEmpty'));
      }
      return api.createInbound({
        supplier: supplier.trim(),
        notes: notes.trim() || undefined,
        receivedAt: receivedDate,
        lines: lines.map((line) => {
          if (line.newProduct) {
            return {
              newProduct: line.newProduct,
              quantity: line.quantity,
              serialNumbers: line.serialNumbers,
              unitCost: line.unitCost ?? line.newProduct.costPrice,
            };
          }
          return {
            productId: line.productId,
            quantity: line.quantity,
            serialNumbers: line.serialNumbers,
            unitCost: line.unitCost,
            retailPrice: line.retailPrice,
            stockOnHand: line.stockOnHand,
          };
        }),
      });
    },
    onSuccess: () => {
      rememberSupplier(storeId, supplier);
      clearReceivingDraft(storeId);
      setSupplier('');
      setNotes('');
      setReceivedDate(todayIso());
      setLines([]);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inbound-receipts'] });
      onSuccess(t('inventory.batchSuccess'));
    },
    onError: (e: Error) => onError(e.message),
  });

  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="receiving-layout">
      <section className="section-card receiving-batch-meta">
        <div className="receiving-batch-meta__grid">
          <label className="form-field">
            <span>{t('inventory.supplier')} *</span>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              list="receiving-supplier-suggestions"
              placeholder={t('inventory.supplierPlaceholder')}
            />
            <datalist id="receiving-supplier-suggestions">
              {recentSuppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="form-field">
            <span>{t('inventory.batchNotes')}</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="form-field">
            <span>{t('inventory.receivedDate')}</span>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="receiving-workspace">
        <section className="section-card receiving-browse pos-catalog-panel">
          <div className="receiving-browse__search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('inventory.searchProducts')}
            />
            {searchTerm.length >= 2 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSearch('')}
              >
                {t('inventory.clearSearch')}
              </button>
            )}
          </div>

          {searchTerm.length < 2 && selectedCategoryId == null && cats.length > 0 && (
            <>
              <h4 className="receiving-browse__heading">{t('inventory.selectCatalog')}</h4>
              <div className="pos-catalog-grid">
                <button
                  type="button"
                  className="pos-catalog-tile pos-catalog-tile--all"
                  onClick={() => setSelectedCategoryId(ALL_PRODUCTS_ID)}
                >
                  <span className="pos-catalog-tile-name">{t('inventory.allProducts')}</span>
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
              </div>
            </>
          )}

          {searchTerm.length < 2 && cats.length === 0 && (
            <p className="empty-state receiving-browse__catalog-hint">
              {t('inventory.noCatalogCategories')}
            </p>
          )}

          {searchTerm.length < 2 &&
            selectedCategoryId != null &&
            selectedCategoryId !== ALL_PRODUCTS_ID && (
              <div className="pos-catalog-toolbar">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedCategoryId(null)}
                >
                  ← {t('inventory.backToCatalogs')}
                </button>
              </div>
            )}

          {searchTerm.length < 2 &&
            (selectedCategoryId === ALL_PRODUCTS_ID ||
              (cats.length === 0 && browseAllProducts)) && (
              <div className="pos-catalog-toolbar">
                {cats.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedCategoryId(null)}
                  >
                    ← {t('inventory.backToCatalogs')}
                  </button>
                )}
                <span className="receiving-browse__browse-label">{t('inventory.allProducts')}</span>
              </div>
            )}

          {browseLoading && searchTerm.length < 2 && <p>{t('common.checking')}</p>}

          {searchTerm.length >= 2 && searchLoading && <p>{t('common.checking')}</p>}
          {searchTerm.length >= 2 && !searchLoading && browseProducts.length === 0 && (
            <div className="receiving-browse__empty">
              <p className="empty-state">{t('inventory.searchNoResults')}</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setQuickNewOpen(true)}
              >
                {t('inventory.newProductAndReceive')}
              </button>
            </div>
          )}

          {browseProducts.length > 0 && (
            <div className="pos-product-grid receiving-product-grid">
              {browseProducts.map((p) => {
                const onHand = qtyByProductId.get(p._id) ?? 0;
                return (
                  <button
                    key={p._id}
                    type="button"
                    className="pos-product-tile"
                    onClick={() => onProductClick(p)}
                  >
                    <span className="pos-product-name">{p.name}</span>
                    <span className="pos-product-meta">
                      {t('inventory.currentQty')}: {onHand}
                    </span>
                    {p.productType === 'serialized' && (
                      <span className="badge">{t('pos.serializedBadge')}</span>
                    )}
                    {!!p.variantDimensions?.length && (
                      <span className="badge">{t('pos.variantBadge')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {(searchTerm.length >= 2 ||
            selectedCategoryId != null ||
            cats.length === 0) && (
            <div className="receiving-browse__footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuickNewOpen(true)}>
                + {t('inventory.newProductAndReceive')}
              </button>
            </div>
          )}
        </section>

        <aside className="section-card receiving-cart">
          <header className="receiving-cart__head">
            <h3>{t('inventory.batchCart')}</h3>
            <span className="receiving-cart__count">
              {t('inventory.batchCartCount', { lines: lines.length, units: totalUnits })}
            </span>
          </header>

          {lines.length === 0 ? (
            <p className="empty-state receiving-cart__empty">{t('inventory.batchCartEmpty')}</p>
          ) : (
            <ul className="receiving-cart__list">
              {lines.map((line) => (
                <li key={line.key} className="receiving-cart__line">
                  <div className="receiving-cart__line-main">
                    {line.isNew && (
                      <span className="badge receiving-cart__new">{t('inventory.newProductBadge')}</span>
                    )}
                    <span className="receiving-cart__name">{line.productName}</span>
                    <span className="receiving-cart__qty">×{line.quantity}</span>
                  </div>
                  {line.serialNumbers?.length ? (
                    <span className="receiving-cart__sn">
                      {t('inventory.serialCount', { count: line.serialNumbers.length })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm receiving-cart__remove"
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  >
                    {t('inventory.removeLine')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="receiving-cart__footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!lines.length}
              onClick={() => setLines([])}
            >
              {t('inventory.clearBatch')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submit.isPending || !lines.length}
              onClick={() => submit.mutate()}
            >
              {t('inventory.completeBatch')}
            </button>
          </footer>
        </aside>
      </div>

      {simpleTarget && (
        <AddBatchLineModal
          productName={simpleTarget.name}
          onHand={
            simpleTarget._id ? (qtyByProductId.get(simpleTarget._id) ?? 0) : 0
          }
          onClose={() => {
            setSimpleTarget(null);
          }}
          onConfirm={(quantity) => {
            const np = (simpleTarget as CatalogProduct & { newProduct?: InboundNewProductPayload })
              .newProduct;
            if (np) {
              addLines([
                {
                  key: newLineKey(),
                  productName: np.name,
                  productType: 'simple',
                  quantity,
                  isNew: true,
                  newProduct: np,
                  unitCost: np.costPrice,
                },
              ]);
            } else {
              addLines([
                {
                  key: newLineKey(),
                  productId: simpleTarget._id,
                  productName: simpleTarget.name,
                  productType: simpleTarget.productType,
                  quantity,
                },
              ]);
            }
            setSimpleTarget(null);
          }}
        />
      )}

      {serialTarget && (
        <SerializedInboundModal
          productName={serialTarget.name}
          pending={false}
          onClose={() => setSerialTarget(null)}
          onConfirm={(quantity, serialNumbers) => {
            const np = serialTarget.newProduct;
            if (np) {
              addLines([
                {
                  key: newLineKey(),
                  productName: np.name,
                  productType: 'serialized',
                  quantity,
                  serialNumbers,
                  isNew: true,
                  newProduct: np,
                  unitCost: np.costPrice,
                },
              ]);
            } else {
              addLines([
                {
                  key: newLineKey(),
                  productId: serialTarget._id,
                  productName: serialTarget.name,
                  productType: 'serialized',
                  quantity,
                  serialNumbers,
                },
              ]);
            }
            setSerialTarget(null);
          }}
        />
      )}

      {variantTarget && (
        <VariantInboundModal
          product={variantTarget}
          positions={positionRows}
          onClose={() => setVariantTarget(null)}
          onConfirm={(variantLines) => {
            const cached = qc.getQueryData([
              'product-variants',
              variantTarget._id,
            ]) as
              | {
                  variants: { _id: string; name: string; variantValues?: string[] }[];
                }
              | undefined;
            const mapped: ReceivingCartLine[] = variantLines.map((l) => {
              const v = cached?.variants.find((x) => x._id === l.productId);
              const label =
                v?.variantValues?.length ? v.variantValues.join(' · ') : v?.name ?? '';
              return {
                key: newLineKey(),
                productId: l.productId,
                productName: label ? `${variantTarget.name} · ${label}` : variantTarget.name,
                productType: 'simple',
                quantity: l.quantity,
                unitCost: l.unitCost,
                retailPrice: l.retailPrice,
                stockOnHand: l.stockOnHand,
              };
            });
            addLines(mapped);
            setVariantTarget(null);
          }}
        />
      )}

      {quickNewOpen && (
        <QuickNewProductModal
          defaultCategoryId={selectedCategoryId ?? undefined}
          onClose={() => setQuickNewOpen(false)}
          onConfirm={(np) => afterNewProductDefined(np)}
        />
      )}
    </div>
  );
}
