import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import type { InboundNewProductPayload } from './receivingTypes';

type ProductTypeOption = InboundNewProductPayload['productType'];

type Props = {
  defaultCategoryId?: string;
  onClose: () => void;
  onConfirm: (payload: InboundNewProductPayload) => void;
};

export function QuickNewProductModal({ defaultCategoryId, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [productType, setProductType] = useState<ProductTypeOption>('simple');
  const [skuCode, setSkuCode] = useState('');
  const [catalogCategoryId, setCatalogCategoryId] = useState(defaultCategoryId ?? '');
  const [costPrice, setCostPrice] = useState('0');
  const [retailPrice, setRetailPrice] = useState('');
  const [error, setError] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories() as Promise<{ _id: string; name: string }[]>,
  });
  const { data: taxCats } = useQuery({
    queryKey: ['tax-categories'],
    queryFn: () => api.listTaxCategories() as Promise<{ _id: string; name: string }[]>,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('inventory.newProductNameRequired'));
      return;
    }
    if (productType === 'sku' && !skuCode.trim()) {
      setError(t('inventory.newProductSkuRequired'));
      return;
    }
    const taxId = (taxCats as { _id: string }[] | undefined)?.[0]?._id;
    if (!taxId) {
      setError(t('inventory.newProductNoTax'));
      return;
    }
    setError('');
    onConfirm({
      productType,
      name: name.trim(),
      taxCategoryId: taxId,
      costPrice: Number(costPrice) || 0,
      catalogCategoryId: catalogCategoryId || undefined,
      retailPrice: retailPrice ? Number(retailPrice) : undefined,
      skuCode: productType === 'sku' ? skuCode.trim() : undefined,
    });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-create"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3>{t('inventory.newProductTitle')}</h3>
          <button type="button" className="pos-modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <form className="pos-modal-body preorder-create-form" onSubmit={onSubmit}>
          <label className="form-field preorder-form__full">
            <span>{t('products.productName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="form-field preorder-form__full">
            <span>{t('products.productType')}</span>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductTypeOption)}
            >
              <option value="simple">{t('products.typeSimple')}</option>
              <option value="sku">{t('products.typeSku')}</option>
              <option value="serialized">{t('products.typeSerialized')}</option>
            </select>
          </label>
          {productType === 'sku' && (
            <label className="form-field preorder-form__full">
              <span>{t('inventory.skuCode')} *</span>
              <input
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                required
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
              <option value="">{t('common.selectPlaceholder')}</option>
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
                min={0}
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>{t('products.retailIncVat')}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
              />
            </label>
          </div>
          {error && <p className="status-fail">{error}</p>}
          <footer className="pos-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('inventory.newProductContinue')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
