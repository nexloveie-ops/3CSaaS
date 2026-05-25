import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { SerialPickModal, type PosProduct } from '../components/pos/SerialPickModal';
import { PosCartPanel, type CartLine } from '../components/pos/PosCartPanel';
import type { SalePaymentPayload } from '../components/pos/PosCheckout';
import { ReceiptDetailModal } from '../components/pos/ReceiptDetailModal';
import { TodayReceiptsPanel } from '../components/pos/TodayReceiptsPanel';
import { VariantPickModal } from '../components/pos/VariantPickModal';
import { QuickSaleModal } from '../components/pos/QuickSaleModal';
import { SalePrintPromptModal } from '../components/pos/SalePrintPromptModal';
import { api } from '../lib/api';

const REPAIR_SECTION_ID = '__repairs__';

type PayableWorkOrder = {
  _id: string;
  docNumber: string;
  customerPhone?: string;
  customerName?: string;
  deviceBrand?: string;
  deviceModel?: string;
  issueDescription?: string;
  quotedPriceIncVat: number;
};

type SerialSearchRow = {
  _id: string;
  sn: string;
  status: string;
  productId:
    | string
    | {
        _id: string;
        name: string;
        productType: string;
        retailPrice?: number;
        costPrice?: number;
        variantDimensions?: { name: string; values: string[] }[];
      };
};

async function openReceiptPrint(orderId: string) {
  const html = await api.fetchReceiptHtml(orderId);
  const w = window.open('', '_blank', 'width=320,height=600');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

async function downloadReceiptPdf(orderId: string, docNumber: string, hasPdf?: boolean) {
  if (!hasPdf) await api.generateReceiptPdf(orderId);
  const blob = await api.fetchReceiptPdf(orderId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${docNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PosPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
  });

  const { data: payableRepairs } = useQuery({
    queryKey: ['work-orders-payable'],
    queryFn: () => api.listPayableWorkOrders(),
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [serialPickProduct, setSerialPickProduct] = useState<PosProduct | null>(null);
  const [variantPickProduct, setVariantPickProduct] = useState<PosProduct | null>(null);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(catalogSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [catalogSearch]);

  const searchActive = debouncedSearch.length >= 2;
  const categoryFilter =
    selectedCategoryId && selectedCategoryId !== REPAIR_SECTION_ID
      ? selectedCategoryId
      : undefined;

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCategoryId],
    queryFn: () =>
      api.listProducts({ catalogCategoryId: selectedCategoryId! }),
    enabled:
      selectedCategoryId != null &&
      selectedCategoryId !== REPAIR_SECTION_ID &&
      !searchActive,
  });

  const { data: searchProducts, isLoading: searchProductsLoading } = useQuery({
    queryKey: ['products-search', debouncedSearch, categoryFilter],
    queryFn: () =>
      api.listProducts({ q: debouncedSearch, catalogCategoryId: categoryFilter }),
    enabled: searchActive,
  });

  const { data: searchSerials, isLoading: searchSerialsLoading } = useQuery({
    queryKey: ['serials-search', debouncedSearch],
    queryFn: () => api.listSerials({ status: 'in_stock', q: debouncedSearch }),
    enabled: searchActive,
  });

  const { data: orders } = useQuery({
    queryKey: ['orders-today'],
    queryFn: () => api.listTodayOrders(),
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [receiptDetailId, setReceiptDetailId] = useState<string | null>(null);
  const [printPromptOpen, setPrintPromptOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<SalePaymentPayload | null>(null);
  const printAfterSaleRef = useRef(false);

  const cartSerialIds = useMemo(
    () => new Set(cart.filter((c) => c.serialUnitId).map((c) => c.serialUnitId!)),
    [cart],
  );

  const cartWorkOrderIds = useMemo(
    () => new Set(cart.filter((c) => c.workOrderId).map((c) => c.workOrderId!)),
    [cart],
  );

  const repairProductId = payableRepairs?.repairProductId;
  const payableOrders = (payableRepairs?.orders ?? []) as PayableWorkOrder[];
  const showRepairSection = payableOrders.length > 0;

  const selectedCategory = (categories as { _id: string; name: string }[] | undefined)?.find(
    (c) => c._id === selectedCategoryId,
  );

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.price * l.qty, 0),
    [cart],
  );

  function requestCheckout(payment: SalePaymentPayload) {
    setPendingPayment(payment);
    setPrintPromptOpen(true);
  }

  function cancelCheckoutPrompt() {
    if (sale.isPending) return;
    setPrintPromptOpen(false);
    setPendingPayment(null);
  }

  function confirmCheckout(printReceipt: boolean) {
    if (!pendingPayment || sale.isPending) return;
    printAfterSaleRef.current = printReceipt;
    setPrintPromptOpen(false);
    sale.mutate(pendingPayment);
    setPendingPayment(null);
  }

  const sale = useMutation({
    mutationFn: (payment: SalePaymentPayload) =>
      api.createSale({
        ...payment,
        lines: cart.map((c) =>
          c.adHoc
            ? {
                adHocDescription: c.name,
                quantity: c.qty,
                unitPriceIncVat: c.price,
                taxCategoryId: c.taxCategoryId,
                catalogCategoryId: c.catalogCategoryId,
                costPreTax: c.costPrice,
              }
            : {
                productId: c.productId!,
                quantity: c.qty,
                unitPriceIncVat: c.price,
                serialUnitId: c.serialUnitId,
                sn: c.sn,
                workOrderId: c.workOrderId,
              },
        ),
        workOrderIds: cart.filter((c) => c.workOrderId).map((c) => c.workOrderId!),
      }),
    onError: () => {
      printAfterSaleRef.current = false;
    },
    onSuccess: (order) => {
      setCart([]);
      setLastOrderId(order._id);
      setSelectedCategoryId(null);
      if (printAfterSaleRef.current) {
        printAfterSaleRef.current = false;
        void openReceiptPrint(order._id);
      }
      qc.invalidateQueries({ queryKey: ['orders-today'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['serials'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['work-orders-payable'] });
      window.setTimeout(() => qc.invalidateQueries({ queryKey: ['orders-today'] }), 3000);
    },
  });

  function addToCart(
    product: PosProduct,
    extra?: { serialUnitId?: string; sn?: string; price?: number },
  ) {
    if (product.productType === 'serialized') {
      if (!extra?.serialUnitId || !extra?.sn) {
        setSerialPickProduct(product);
        return;
      }
      if (cartSerialIds.has(extra.serialUnitId)) return;
      setCart([
        ...cart,
        {
          productId: product._id,
          name: product.name,
          qty: 1,
          price: extra.price ?? product.retailPrice ?? product.costPrice,
          serialUnitId: extra.serialUnitId,
          sn: extra.sn,
        },
      ]);
      return;
    }

    const price = extra?.price ?? product.retailPrice ?? product.costPrice;
    const idx = cart.findIndex((c) => c.productId === product._id && !c.serialUnitId);
    if (idx >= 0) {
      const next = [...cart];
      next[idx] = { ...next[idx]!, qty: next[idx]!.qty + 1 };
      setCart(next);
    } else {
      setCart([
        ...cart,
        {
          productId: product._id,
          name: product.name,
          qty: 1,
          price,
        },
      ]);
    }
  }

  function onSerialSearchPick(unit: SerialSearchRow) {
    const p = unit.productId;
    if (typeof p !== 'object') return;
    if (unit.status !== 'in_stock' || cartSerialIds.has(unit._id)) return;
    if (p.productType !== 'serialized') return;
    const product: PosProduct = {
      _id: p._id,
      name: p.name,
      productType: p.productType,
      retailPrice: p.retailPrice,
      costPrice: p.costPrice ?? 0,
      variantDimensions: p.variantDimensions,
    };
    addToCart(product, { serialUnitId: unit._id, sn: unit.sn });
    setCatalogSearch('');
  }

  function onProductClick(p: PosProduct) {
    if (p.productType === 'serialized') {
      setSerialPickProduct(p);
    } else if (p.variantDimensions?.length) {
      setVariantPickProduct(p);
    } else {
      addToCart(p);
    }
  }

  function removeLine(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  function updateLineQty(index: number, delta: number) {
    const line = cart[index];
    if (!line || line.serialUnitId || line.workOrderId) return;
    const nextQty = line.qty + delta;
    if (nextQty <= 0) {
      removeLine(index);
      return;
    }
    const next = [...cart];
    next[index] = { ...line, qty: nextQty };
    setCart(next);
  }

  function updateLinePrice(index: number, price: number) {
    const line = cart[index];
    if (!line || line.workOrderId) return;
    const next = [...cart];
    next[index] = { ...line, price };
    setCart(next);
  }

  function addQuickSaleLine(line: CartLine) {
    setCart([...cart, line]);
  }

  function addWorkOrderToCart(wo: PayableWorkOrder) {
    if (!repairProductId || cartWorkOrderIds.has(wo._id)) return;
    const label = [wo.docNumber, wo.issueDescription].filter(Boolean).join(' — ');
    setCart([
      ...cart,
      {
        productId: repairProductId,
        name: label || wo.docNumber,
        qty: 1,
        price: wo.quotedPriceIncVat,
        workOrderId: wo._id,
      },
    ]);
  }

  const cats = (categories as { _id: string; name: string }[] | undefined) ?? [];
  const productList = (products as PosProduct[] | undefined) ?? [];
  const searchProductList = (searchProducts as PosProduct[] | undefined) ?? [];
  const searchSerialList = (searchSerials as SerialSearchRow[] | undefined) ?? [];
  const searchLoading = searchProductsLoading || searchSerialsLoading;

  function tilePriceLabel(p: PosProduct): string {
    if (p.variantDimensions?.length) {
      const min = p.variantPriceMin;
      const max = p.variantPriceMax;
      if (min != null && max != null) {
        if (min === max) return `€${min.toFixed(2)}`;
        return `€${min.toFixed(2)} – €${max.toFixed(2)}`;
      }
    }
    return `€${(p.retailPrice ?? p.costPrice).toFixed(2)}`;
  }

  return (
    <div className="page-content page-content--pos">
      <PageHeader title={t('pos.title')} />
      <div className="pos-layout">
        <div className="section-card pos-catalog-panel">
          <div className="pos-catalog-head">
            <div className="pos-catalog-head__main">
              <div className="pos-catalog-head__nav">
                {selectedCategoryId != null && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm pos-catalog-back"
                    onClick={() => setSelectedCategoryId(null)}
                  >
                    ← {t('pos.backToCatalogs')}
                  </button>
                )}
                {selectedCategoryId != null && (
                  <h3 className="pos-catalog-head__title">
                    {selectedCategoryId === REPAIR_SECTION_ID
                      ? t('pos.repairSection')
                      : selectedCategory?.name}
                  </h3>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm pos-quick-sale-btn"
                onClick={() => setQuickSaleOpen(true)}
              >
                {t('pos.quickSale')}
              </button>
              <div className="pos-catalog-search">
              <span className="pos-catalog-search__icon" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                className="pos-catalog-search__input"
                placeholder={t('pos.catalogSearchPlaceholder')}
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCatalogSearch('');
                }}
              />
              {catalogSearch && (
                <button
                  type="button"
                  className="pos-catalog-search__clear"
                  aria-label={t('common.cancel')}
                  onClick={() => setCatalogSearch('')}
                >
                  ×
                </button>
              )}
              </div>
            </div>
          </div>

          {catalogSearch.trim().length > 0 && catalogSearch.trim().length < 2 && (
            <p className="pos-catalog-search-hint">{t('pos.catalogSearchMinHint')}</p>
          )}

          {searchActive ? (
            <>
              {searchLoading && <p>{t('common.checking')}</p>}
              {!searchLoading &&
                searchProductList.length === 0 &&
                searchSerialList.length === 0 && (
                  <p className="empty-state">{t('pos.catalogSearchNoResults')}</p>
                )}
              {searchProductList.length > 0 && (
                <>
                  <h4 className="pos-catalog-results-label">{t('pos.catalogSearchProducts')}</h4>
                  <div className="pos-product-grid">
                    {searchProductList.map((p) => (
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
                        <span className="pos-product-price">{tilePriceLabel(p)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {searchSerialList.length > 0 && (
                <>
                  <h4 className="pos-catalog-results-label">{t('pos.catalogSearchSerials')}</h4>
                  <ul className="pos-catalog-serial-results">
                    {searchSerialList.map((unit) => {
                      const p = unit.productId;
                      const name = typeof p === 'object' ? p.name : '';
                      const inCart = cartSerialIds.has(unit._id);
                      return (
                        <li key={unit._id}>
                          <button
                            type="button"
                            className="pos-catalog-serial-hit"
                            disabled={inCart || unit.status !== 'in_stock'}
                            onClick={() => onSerialSearchPick(unit)}
                          >
                            <span className="pos-catalog-serial-hit__sn">{unit.sn}</span>
                            <span className="pos-catalog-serial-hit__name">{name}</span>
                            {inCart && (
                              <span className="badge">{t('pos.serialInCart')}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          ) : selectedCategoryId == null ? (
            cats.length === 0 && !showRepairSection ? (
              <p className="empty-state">{t('pos.noCatalogCategories')}</p>
            ) : (
              <div className="pos-catalog-grid">
                {showRepairSection && (
                  <button
                    type="button"
                    className="pos-catalog-tile pos-catalog-tile--repair"
                    onClick={() => setSelectedCategoryId(REPAIR_SECTION_ID)}
                  >
                    <span className="pos-catalog-tile-name">{t('pos.repairSection')}</span>
                  </button>
                )}
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
            )
          ) : selectedCategoryId === REPAIR_SECTION_ID ? (
            payableOrders.length === 0 ? (
              <p className="empty-state">{t('pos.repairSectionEmpty')}</p>
            ) : (
              <div className="pos-product-grid pos-product-grid--repair">
                {payableOrders.map((wo) => {
                  const inCart = cartWorkOrderIds.has(wo._id);
                  const device = [wo.deviceBrand, wo.deviceModel].filter(Boolean).join(' ');
                  return (
                    <button
                      key={wo._id}
                      type="button"
                      className="pos-product-tile pos-product-tile--repair"
                      disabled={inCart || !repairProductId}
                      onClick={() => addWorkOrderToCart(wo)}
                    >
                      <span className="pos-product-name">{wo.docNumber}</span>
                      <span className="pos-product-meta">
                        {wo.customerPhone}
                        {device ? ` · ${device}` : ''}
                      </span>
                      {wo.issueDescription && (
                        <span className="pos-product-meta">{wo.issueDescription}</span>
                      )}
                      <span className="pos-product-price">
                        €{wo.quotedPriceIncVat.toFixed(2)}
                      </span>
                      {inCart && <span className="badge">{t('pos.repairInCart')}</span>}
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <>
              {productsLoading && <p>{t('common.checking')}</p>}
              {!productsLoading && productList.length === 0 && (
                <p className="empty-state">{t('pos.noProductsInCatalog')}</p>
              )}
              <div className="pos-product-grid">
                {productList.map((p) => (
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
                    <span className="pos-product-price">{tilePriceLabel(p)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <PosCartPanel
          lines={cart}
          total={total}
          checkoutDisabled={!cart.length || printPromptOpen}
          checkoutPending={sale.isPending}
          onRemove={removeLine}
          onUpdateQty={updateLineQty}
          onUpdatePrice={updateLinePrice}
          onCheckout={requestCheckout}
        >
          {sale.error && (
            <p className="status-fail pos-cart-feedback">{(sale.error as Error).message}</p>
          )}
          {sale.isSuccess && (
            <div className="pos-cart-success">
              <p className="status-ok">{t('pos.saleRecorded')}</p>
              {lastOrderId && (
                <div className="pos-cart-success__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openReceiptPrint(lastOrderId)}
                  >
                    {t('pos.printReceipt')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const doc =
                        orders?.find((o) => o._id === lastOrderId)?.docNumber ?? 'receipt';
                      downloadReceiptPdf(lastOrderId, doc).catch((e) =>
                        alert((e as Error).message),
                      );
                    }}
                  >
                    {t('pos.downloadPdf')}
                  </button>
                </div>
              )}
            </div>
          )}
        </PosCartPanel>
      </div>

      {serialPickProduct && (
        <SerialPickModal
          product={serialPickProduct}
          cartSerialIds={cartSerialIds}
          onSelect={({ serialUnitId, sn }) => {
            addToCart(serialPickProduct, { serialUnitId, sn });
            setSerialPickProduct(null);
          }}
          onClose={() => setSerialPickProduct(null)}
        />
      )}

      {quickSaleOpen && (
        <QuickSaleModal
          onAdd={addQuickSaleLine}
          onClose={() => setQuickSaleOpen(false)}
        />
      )}

      {printPromptOpen && pendingPayment && (
        <SalePrintPromptModal
          total={total}
          pending={sale.isPending}
          onPrintAndComplete={() => confirmCheckout(true)}
          onCompleteWithoutPrint={() => confirmCheckout(false)}
          onCancel={cancelCheckoutPrompt}
        />
      )}

      {variantPickProduct && (
        <VariantPickModal
          product={variantPickProduct}
          onSelect={(variant) => {
            addToCart(
              {
                _id: variant._id,
                name: variant.name,
                productType: 'simple',
                costPrice: variant.costPrice,
                retailPrice: variant.retailPrice,
              },
              { price: variant.retailPrice ?? variant.costPrice },
            );
            setVariantPickProduct(null);
          }}
          onClose={() => setVariantPickProduct(null)}
        />
      )}

      <TodayReceiptsPanel
        orders={orders}
        onSelect={setReceiptDetailId}
        onPrint={openReceiptPrint}
      />

      {receiptDetailId && (
        <ReceiptDetailModal
          orderId={receiptDetailId}
          onClose={() => setReceiptDetailId(null)}
        />
      )}
    </div>
  );
}
