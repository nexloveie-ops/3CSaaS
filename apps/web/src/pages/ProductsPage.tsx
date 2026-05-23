import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_VARIANT_DIMENSIONS, cartesianVariantValues } from '@lz3c/shared';
import { ProductVariantEditor } from '../components/products/ProductVariantEditor';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

type CatalogCategory = { _id: string; name: string; sortOrder: number };
type ProductRow = {
  _id: string;
  name: string;
  productType: string;
  costPrice: number;
  retailPrice?: number;
  catalogCategoryId?: { _id: string; name: string } | string | null;
  variantDimensions?: { name: string; values: string[] }[];
};

function categoryName(p: ProductRow, uncategorized: string): string {
  const c = p.catalogCategoryId;
  if (!c) return uncategorized;
  if (typeof c === 'object' && c?.name) return c.name;
  return uncategorized;
}

export function ProductsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
  });

  const [filterCategoryId, setFilterCategoryId] = useState<string>('');

  const { data: products } = useQuery({
    queryKey: ['products', filterCategoryId],
    queryFn: () =>
      api.listProducts(
        filterCategoryId ? { catalogCategoryId: filterCategoryId } : undefined,
      ),
  });

  const { data: taxCats } = useQuery({
    queryKey: ['tax'],
    queryFn: () => api.listTaxCategories(),
  });

  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [name, setName] = useState('');
  const [productType, setProductType] = useState('simple');
  const [catalogCategoryId, setCatalogCategoryId] = useState('');
  const [costPrice, setCostPrice] = useState('0');
  const [retailPrice, setRetailPrice] = useState('');
  const [taxCategoryId, setTaxCategoryId] = useState('');
  const [hasVariants, setHasVariants] = useState(false);
  const [variantDims, setVariantDims] = useState([{ name: '', valuesText: '' }]);
  const [variantEditor, setVariantEditor] = useState<{
    id: string;
    name: string;
    costPrice: number;
    retailPrice?: number;
  } | null>(null);

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
      if (filterCategoryId) setFilterCategoryId('');
      if (editingCategoryId) setEditingCategoryId(null);
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const taxId = taxCategoryId || (taxCats as { _id: string }[])?.[0]?._id;
      const parsedDims = hasVariants
        ? variantDims
            .map((d) => ({
              name: d.name.trim(),
              values: d.valuesText
                .split(/[,，]/)
                .map((v) => v.trim())
                .filter(Boolean),
            }))
            .filter((d) => d.name && d.values.length)
        : [];
      const parent = (await api.createProduct({
        name,
        productType,
        catalogCategoryId: catalogCategoryId || undefined,
        costPrice: Number(costPrice),
        retailPrice: retailPrice ? Number(retailPrice) : undefined,
        taxCategoryId: taxId,
        variantDimensions: parsedDims.length ? parsedDims : undefined,
      })) as { _id: string };
      if (parsedDims.length) {
        const combos = cartesianVariantValues(parsedDims);
        await api.syncProductVariants(parent._id, {
          dimensions: parsedDims,
          variants: combos.map((variantValues) => ({
            variantValues,
            costPrice: Number(costPrice) || 0,
            retailPrice: retailPrice ? Number(retailPrice) : undefined,
          })),
        });
      }
      return parent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setName('');
      setHasVariants(false);
      setVariantDims([{ name: '', valuesText: '' }]);
    },
  });

  const grouped = useMemo(() => {
    const list = (products as ProductRow[] | undefined) ?? [];
    const map = new Map<string, ProductRow[]>();
    for (const p of list) {
      const key = categoryName(p, t('products.uncategorized'));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products, t]);

  function onCategorySubmit(e: FormEvent) {
    e.preventDefault();
    createCategory.mutate();
  }

  function onProductSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const cats = (categories as CatalogCategory[] | undefined) ?? [];

  return (
    <div className="page-content">
      <PageHeader title={t('products.title')} />

      <details className="section-card collapsible-section">
        <summary>{t('products.categoriesTitle')}</summary>
        <p style={{ marginTop: '0.75rem', opacity: 0.85, fontSize: '0.875rem' }}>
          {t('products.categoryExamples')}
        </p>
        <form
          onSubmit={onCategorySubmit}
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

      <form className="section-card" onSubmit={onProductSubmit}>
        <h3>{t('products.addProduct')}</h3>
        <div className="form-field">
          <label>{t('products.productName')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-field">
          <label>{t('products.catalogCategory')}</label>
          <select
            value={catalogCategoryId}
            onChange={(e) => setCatalogCategoryId(e.target.value)}
          >
            <option value="">{t('products.uncategorized')}</option>
            {cats.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>{t('products.productType')}</label>
          <select value={productType} onChange={(e) => setProductType(e.target.value)}>
            <option value="serialized">{t('products.typeSerialized')}</option>
            <option value="sku">{t('products.typeSku')}</option>
            <option value="simple">{t('products.typeSimple')}</option>
            <option value="service">{t('products.typeService')}</option>
          </select>
        </div>
        <div className="form-field">
          <label>{t('products.costPreTax')}</label>
          <input
            type="number"
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label>{t('products.retailIncVat')}</label>
          <input
            type="number"
            step="0.01"
            value={retailPrice}
            onChange={(e) => setRetailPrice(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>{t('products.taxCategory')}</label>
          <select
            value={taxCategoryId}
            onChange={(e) => setTaxCategoryId(e.target.value)}
            required
          >
            <option value="">{t('products.taxCategory')}</option>
            {(taxCats as { _id: string; name: string }[] | undefined)?.map((tx) => (
              <option key={tx._id} value={tx._id}>
                {tx.name}
              </option>
            ))}
          </select>
        </div>
        {productType === 'simple' && (
          <div className="form-field">
            <label>
              <input
                type="checkbox"
                checked={hasVariants}
                onChange={(e) => setHasVariants(e.target.checked)}
              />{' '}
              {t('products.hasVariants')}
            </label>
          </div>
        )}
        {productType === 'simple' && hasVariants && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              {t('products.variantDimensions')}
            </p>
            {variantDims.map((dim, index) => (
              <div key={index} className="form-row" style={{ marginBottom: '0.5rem' }}>
                <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <label>{t('products.dimensionName')}</label>
                  <input
                    value={dim.name}
                    onChange={(e) =>
                      setVariantDims((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, name: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <div className="form-field" style={{ flex: 2, marginBottom: 0 }}>
                  <label>{t('products.dimensionValues')}</label>
                  <input
                    value={dim.valuesText}
                    onChange={(e) =>
                      setVariantDims((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, valuesText: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            {variantDims.length < MAX_VARIANT_DIMENSIONS && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setVariantDims((rows) => [...rows, { name: '', valuesText: '' }])
                }
              >
                {t('products.addDimension')}
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={create.isPending}>
          {t('products.addProduct')}
        </button>
        {create.error && <p className="status-fail">{(create.error as Error).message}</p>}
      </form>

      <section className="section-card">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{t('products.filterCategory')}:</span>
          <button
            type="button"
            className={filterCategoryId === '' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setFilterCategoryId('')}
          >
            {t('products.allCategories')}
          </button>
          {cats.map((c) => (
            <button
              key={c._id}
              type="button"
              className={
                filterCategoryId === c._id ? 'btn btn-primary' : 'btn btn-secondary'
              }
              onClick={() => setFilterCategoryId(c._id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        {filterCategoryId === '' ? (
          grouped.map(([group, items]) => (
            <details key={group} className="collapsible-section" style={{ marginTop: '0.75rem' }}>
              <summary>
                {group} ({items.length})
              </summary>
              <ul style={{ marginTop: '0.5rem' }}>
                {items.map((p) => (
                  <li key={p._id} style={{ marginBottom: '0.35rem' }}>
                    {p.name} ({p.productType}) — {p.costPrice}
                    {p.retailPrice != null ? ` / ${p.retailPrice}` : ''}
                    {p.productType === 'simple' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}
                        onClick={() =>
                          setVariantEditor({
                            id: p._id,
                            name: p.name,
                            costPrice: p.costPrice,
                            retailPrice: p.retailPrice,
                          })
                        }
                      >
                        {t('products.manageVariants')}
                        {p.variantDimensions?.length
                          ? ` (${p.variantDimensions.map((d) => d.name).join(', ')})`
                          : ''}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))
        ) : (
          <ul style={{ marginTop: '1rem' }}>
            {(products as ProductRow[] | undefined)?.map((p) => (
              <li key={p._id} style={{ marginBottom: '0.35rem' }}>
                {p.name} ({p.productType}) — {p.costPrice}
                {p.retailPrice != null ? ` / ${p.retailPrice}` : ''}
                {p.productType === 'simple' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}
                    onClick={() =>
                      setVariantEditor({
                        id: p._id,
                        name: p.name,
                        costPrice: p.costPrice,
                        retailPrice: p.retailPrice,
                      })
                    }
                  >
                    {t('products.manageVariants')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
