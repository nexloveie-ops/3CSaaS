import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ProductSerialPanel } from './ProductSerialPanel';

export type ProductEditRow = {
  _id: string;
  name: string;
  nameEn?: string;
  productType: string;
  costPrice: number;
  retailPrice?: number;
  skuCode?: string;
  catalogCategoryId?: { _id: string; name: string } | string | null;
  taxCategoryId?: { _id: string; name: string } | string;
  variantDimensions?: { name: string; values: string[] }[];
};

type Props = {
  product: ProductEditRow;
  onClose: () => void;
  onManageVariants?: (product: ProductEditRow) => void;
};

function refId(value: { _id: string } | string | null | undefined): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value._id;
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

export function EditProductModal({ product, onClose, onManageVariants }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(product.name);
  const [nameEn, setNameEn] = useState(product.nameEn ?? '');
  const [catalogCategoryId, setCatalogCategoryId] = useState(refId(product.catalogCategoryId));
  const [taxCategoryId, setTaxCategoryId] = useState(refId(product.taxCategoryId));
  const [costPrice, setCostPrice] = useState(String(product.costPrice));
  const [retailPrice, setRetailPrice] = useState(
    product.retailPrice != null ? String(product.retailPrice) : '',
  );
  const [skuCode, setSkuCode] = useState(product.skuCode ?? '');

  const hasVariants =
    product.productType === 'simple' && !!product.variantDimensions?.length;

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories() as Promise<{ _id: string; name: string }[]>,
  });

  const { data: taxCats } = useQuery({
    queryKey: ['tax'],
    queryFn: () => api.listTaxCategories(),
  });

  useEffect(() => {
    setName(product.name);
    setNameEn(product.nameEn ?? '');
    setCatalogCategoryId(refId(product.catalogCategoryId));
    setTaxCategoryId(refId(product.taxCategoryId));
    setCostPrice(String(product.costPrice));
    setRetailPrice(product.retailPrice != null ? String(product.retailPrice) : '');
    setSkuCode(product.skuCode ?? '');
  }, [product]);

  const save = useMutation({
    mutationFn: () =>
      api.updateProduct(product._id, {
        name: name.trim(),
        nameEn: nameEn.trim() || undefined,
        catalogCategoryId: catalogCategoryId || null,
        taxCategoryId: taxCategoryId || undefined,
        costPrice: Number(costPrice),
        retailPrice: retailPrice ? Number(retailPrice) : undefined,
        ...(product.productType === 'sku' ? { skuCode: skuCode.trim() || undefined } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      if (product.productType !== 'serialized') {
        onClose();
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-create"
        role="dialog"
        aria-labelledby="edit-product-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="edit-product-modal-title">{t('products.editProduct')}</h3>
          <p className="pos-modal-sub">{product.name}</p>
          <button type="button" className="pos-modal-close" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>
        <form className="pos-modal-body preorder-create-form" onSubmit={onSubmit}>
          <label className="form-field preorder-form__full">
            <span>{t('products.productName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="form-field preorder-form__full">
            <span>{t('products.productNameEn')}</span>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder={t('products.productNameEnPlaceholder')}
              autoComplete="off"
            />
          </label>
          <label className="form-field preorder-form__full">
            <span>{t('products.productType')}</span>
            <input
              value={productTypeLabel(product.productType, t)}
              readOnly
              disabled
              className="input-readonly"
            />
          </label>
          {product.productType === 'sku' && (
            <label className="form-field preorder-form__full">
              <span>{t('inventory.skuCode')}</span>
              <input
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          <label className="form-field preorder-form__full">
            <span>{t('products.catalogCategory')}</span>
            <select
              value={catalogCategoryId}
              onChange={(e) => setCatalogCategoryId(e.target.value)}
            >
              <option value="">{t('products.uncategorized')}</option>
              {(categories ?? []).map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="preorder-form__row">
            <label className="form-field">
              <span>{t('products.costPreTax')}</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>{t('products.retailIncVat')}</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
              />
            </label>
          </div>
          <label className="form-field preorder-form__full">
            <span>{t('products.taxCategory')}</span>
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
          </label>
          {hasVariants && onManageVariants && (
            <div className="products-edit-modal__variants">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onManageVariants(product)}
              >
                {t('products.manageVariants')}
              </button>
            </div>
          )}
          {product.productType === 'serialized' && (
            <ProductSerialPanel productId={product._id} purchaseCost={Number(costPrice) || 0} />
          )}
          {save.error && <p className="status-fail">{(save.error as Error).message}</p>}
          <footer className="pos-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {t('products.saveProduct')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
