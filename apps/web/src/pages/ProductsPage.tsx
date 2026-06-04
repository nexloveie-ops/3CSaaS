import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddProductModal } from '../components/products/AddProductModal';
import { EditProductModal, type ProductEditRow } from '../components/products/EditProductModal';
import { ProductVariantEditor } from '../components/products/ProductVariantEditor';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

const ALL_PRODUCTS_ID = '__all__';
const UNCategorized_ID = '__uncategorized__';

type CatalogCategory = { _id: string; name: string; sortOrder: number };
type ProductRow = ProductEditRow;

function isUncategorized(p: ProductRow): boolean {
  const c = p.catalogCategoryId;
  if (!c) return true;
  if (typeof c === 'string' && !c) return true;
  return false;
}

function productTypeLabel(type: string, t: (key: string) => string): string {
  switch (type) {
    case 'serialized':
      return t('products.typeSerialized');
    case 'sku':
      return t('products.typeSku');
    case 'simple':
      return t('products.typeSimple');
    case 'service':
      return t('products.typeService');
    default:
      return type;
  }
}

function ProductCard({
  p,
  onEdit,
  t,
}: {
  p: ProductRow;
  onEdit: (p: ProductRow) => void;
  t: (key: string) => string;
}) {
  const hasVariants = p.productType === 'simple' && !!p.variantDimensions?.length;
  const priceLabel =
    p.retailPrice != null ? `€${p.retailPrice.toFixed(2)}` : `€${p.costPrice.toFixed(2)}`;

  return (
    <button type="button" className="pos-product-tile" onClick={() => onEdit(p)}>
      <span className="pos-product-name">{p.name}</span>
      <span className="pos-product-meta">{productTypeLabel(p.productType, t)}</span>
      {p.productType === 'serialized' && <span className="badge">{t('pos.serializedBadge')}</span>}
      {hasVariants && <span className="badge">{t('pos.variantBadge')}</span>}
      <span className="pos-product-price">{priceLabel}</span>
    </button>
  );
}

export function ProductsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [variantEditor, setVariantEditor] = useState<{
    id: string;
    name: string;
    costPrice: number;
    retailPrice?: number;
  } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const searchActive = debouncedSearch.length >= 2;
  const categoryFilter =
    selectedCategoryId &&
    selectedCategoryId !== ALL_PRODUCTS_ID &&
    selectedCategoryId !== UNCategorized_ID
      ? selectedCategoryId
      : undefined;

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedCategoryId, debouncedSearch],
    queryFn: async () => {
      if (searchActive) {
        return api.listProducts({
          q: debouncedSearch,
          catalogCategoryId: categoryFilter,
        }) as Promise<ProductRow[]>;
      }
      if (selectedCategoryId === ALL_PRODUCTS_ID) {
        return api.listProducts() as Promise<ProductRow[]>;
      }
      if (selectedCategoryId === UNCategorized_ID) {
        const list = (await api.listProducts()) as ProductRow[];
        return list.filter(isUncategorized);
      }
      if (selectedCategoryId) {
        return api.listProducts({ catalogCategoryId: selectedCategoryId }) as Promise<
          ProductRow[]
        >;
      }
      return [] as ProductRow[];
    },
    enabled: searchActive || selectedCategoryId != null,
  });

  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const createCategory = useMutation({
    mutationFn: () => api.createCatalogCategory(categoryNameInput.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-categories'] });
      setCategoryNameInput('');
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.updateCatalogCategory(id, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-categories'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditingCategoryId(null);
      setEditingCategoryName('');
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.deleteCatalogCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-categories'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      if (selectedCategoryId === id) setSelectedCategoryId(null);
      if (editingCategoryId) setEditingCategoryId(null);
    },
  });

  const cats = (categories as CatalogCategory[] | undefined) ?? [];
  const productList = (products as ProductRow[] | undefined) ?? [];
  const selectedCategory = cats.find((c) => c._id === selectedCategoryId);
  const isSpecificCatalog =
    selectedCategoryId != null &&
    selectedCategoryId !== ALL_PRODUCTS_ID &&
    selectedCategoryId !== UNCategorized_ID;
  const showCatalogGrid = !searchActive && selectedCategoryId == null;
  const showProductList = searchActive || selectedCategoryId != null;
  const showAddProductCard = isSpecificCatalog && !searchActive;
  const showProductGrid = showProductList && !productsLoading;

  useEffect(() => {
    setAddProductOpen(false);
    setEditingProduct(null);
  }, [selectedCategoryId]);

  function openVariantEditor(p: ProductRow) {
    setEditingProduct(null);
    setVariantEditor({
      id: p._id,
      name: p.name,
      costPrice: p.costPrice,
      retailPrice: p.retailPrice,
    });
  }

  return (
    <div className="page-content">
      <PageHeader title={t('products.title')} />

      <details className="section-card collapsible-section">
        <summary>{t('products.categoriesTitle')}</summary>
        <p style={{ marginTop: '0.75rem', opacity: 0.85, fontSize: '0.875rem' }}>
          {t('products.categoryExamples')}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createCategory.mutate();
          }}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div className="form-field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label>{t('products.categoryName')}</label>
            <input
              value={categoryNameInput}
              onChange={(e) => setCategoryNameInput(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={createCategory.isPending}>
            {t('products.addCategory')}
          </button>
        </form>
        {(createCategory.error || updateCategory.error) && (
          <p className="status-fail">
            {((createCategory.error ?? updateCategory.error) as Error).message}
          </p>
        )}
        {cats.length === 0 ? (
          <p style={{ marginTop: '1rem' }}>{t('products.noCategories')}</p>
        ) : (
          <ul style={{ marginTop: '1rem', listStyle: 'none', padding: 0 }}>
            {cats.map((c) => (
              <li
                key={c._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0',
                  flexWrap: 'wrap',
                }}
              >
                {editingCategoryId === c._id ? (
                  <>
                    <input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      style={{ flex: '1 1 160px', minWidth: 120 }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '0.75rem' }}
                      disabled={!editingCategoryName.trim() || updateCategory.isPending}
                      onClick={() =>
                        updateCategory.mutate({ id: c._id, name: editingCategoryName })
                      }
                    >
                      {t('products.saveCategory')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => {
                        setEditingCategoryId(null);
                        setEditingCategoryName('');
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="badge">{c.name}</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => {
                        setEditingCategoryId(c._id);
                        setEditingCategoryName(c.name);
                      }}
                    >
                      {t('products.renameCategory')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem' }}
                      disabled={deleteCategory.isPending}
                      onClick={() => deleteCategory.mutate(c._id)}
                    >
                      {t('products.deleteCategory')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="pos-layout pos-layout--single">
        <section className="section-card pos-catalog-panel store-catalog-panel products-browse-panel">
          <h3 style={{ marginTop: 0 }}>{t('products.filterCategory')}</h3>
          <div className="pos-catalog-head">
            <div className="pos-catalog-head__main">
              <div className="pos-catalog-head__nav">
                {showProductList && selectedCategoryId != null && !searchActive && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm pos-catalog-back"
                    onClick={() => setSelectedCategoryId(null)}
                  >
                    ← {t('pos.backToCatalogs')}
                  </button>
                )}
                {showProductList && selectedCategoryId != null && !searchActive && (
                  <h3 className="pos-catalog-head__title">
                    {selectedCategoryId === ALL_PRODUCTS_ID
                      ? t('products.allCategories')
                      : selectedCategoryId === UNCategorized_ID
                        ? t('products.uncategorized')
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
              {cats.length === 0 ? (
                <p className="empty-state">{t('products.noCategories')}</p>
              ) : (
                <>
                  <h4 className="receiving-browse__heading">{t('inventory.selectCatalog')}</h4>
                  <div className="pos-catalog-grid">
                    <button
                      type="button"
                      className="pos-catalog-tile pos-catalog-tile--all"
                      onClick={() => setSelectedCategoryId(ALL_PRODUCTS_ID)}
                    >
                      <span className="pos-catalog-tile-name">{t('products.allCategories')}</span>
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
                    <button
                      type="button"
                      className="pos-catalog-tile"
                      onClick={() => setSelectedCategoryId(UNCategorized_ID)}
                    >
                      <span className="pos-catalog-tile-name">{t('products.uncategorized')}</span>
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {showProductList && productsLoading && <p>{t('common.checking')}</p>}

          {showProductGrid &&
            productList.length === 0 &&
            !showAddProductCard &&
            (searchActive ? (
              <p className="empty-state">{t('pos.catalogSearchNoResults')}</p>
            ) : (
              <p className="empty-state">{t('pos.noProductsInCatalog')}</p>
            ))}

          {showProductGrid && (showAddProductCard || productList.length > 0) && (
            <div className="pos-product-grid products-catalog-grid">
              {showAddProductCard && (
                <button
                  type="button"
                  className="pos-product-tile pos-product-tile--add"
                  onClick={() => setAddProductOpen(true)}
                >
                  <span className="pos-product-tile-add-icon" aria-hidden>
                    +
                  </span>
                  <span className="pos-product-name">{t('products.addProduct')}</span>
                </button>
              )}
              {productList.map((p) => (
                <ProductCard key={p._id} p={p} onEdit={setEditingProduct} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>

      {addProductOpen && selectedCategory && selectedCategoryId && (
        <AddProductModal
          categoryId={selectedCategoryId}
          categoryName={selectedCategory.name}
          onClose={() => setAddProductOpen(false)}
          onCreated={(created) => {
            setAddProductOpen(false);
            setEditingProduct({
              _id: created._id,
              name: created.name,
              productType: created.productType,
              costPrice: created.costPrice,
              retailPrice: created.retailPrice,
              catalogCategoryId: created.catalogCategoryId,
            });
          }}
        />
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onManageVariants={openVariantEditor}
        />
      )}

      {variantEditor && (
        <ProductVariantEditor
          parentId={variantEditor.id}
          parentName={variantEditor.name}
          defaultCost={variantEditor.costPrice}
          defaultRetail={variantEditor.retailPrice}
          onClose={() => setVariantEditor(null)}
        />
      )}
    </div>
  );
}
