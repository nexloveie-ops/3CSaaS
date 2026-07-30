import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_VARIANT_DIMENSIONS, cartesianVariantValues } from '@lz3c/shared';
import { api } from '../../lib/api';

type Props = {
  categoryId: string;
  categoryName: string;
  onClose: () => void;
  onCreated?: (product: {
    _id: string;
    name: string;
    productType: string;
    costPrice: number;
    retailPrice?: number;
    catalogCategoryId: string;
  }) => void;
};

export function AddProductModal({ categoryId, categoryName, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [productType, setProductType] = useState('simple');
  const [costPrice, setCostPrice] = useState('0');
  const [retailPrice, setRetailPrice] = useState('');
  const [taxCategoryId, setTaxCategoryId] = useState('');
  const [hasVariants, setHasVariants] = useState(false);
  const [variantDims, setVariantDims] = useState([{ name: '', valuesText: '' }]);

  const { data: taxCats } = useQuery({
    queryKey: ['tax'],
    queryFn: () => api.listTaxCategories(),
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
        nameEn: nameEn.trim() || undefined,
        productType,
        catalogCategoryId: categoryId,
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
      return {
        _id: parent._id,
        name: name.trim(),
        productType,
        costPrice: Number(costPrice),
        retailPrice: retailPrice ? Number(retailPrice) : undefined,
        catalogCategoryId: categoryId,
      };
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      if (created.productType === 'serialized' && onCreated) {
        onCreated(created);
      } else {
        onClose();
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-create"
        role="dialog"
        aria-labelledby="add-product-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="add-product-modal-title">
            {t('products.addProductInCategory', { name: categoryName })}
          </h3>
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
            <select value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="serialized">{t('products.typeSerialized')}</option>
              <option value="sku">{t('products.typeSku')}</option>
              <option value="simple">{t('products.typeSimple')}</option>
              <option value="service">{t('products.typeService')}</option>
            </select>
          </label>
          {productType === 'serialized' && (
            <p className="products-serial-panel__hint muted">{t('products.serialAddAfterCreate')}</p>
          )}
          <div className="preorder-form__row">
            <label className="form-field">
              <span>{t('products.costPreTax')}</span>
              <input
                type="number"
                step="0.01"
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
          {productType === 'simple' && (
            <label className="form-field preorder-form__full">
              <span>
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={(e) => setHasVariants(e.target.checked)}
                />{' '}
                {t('products.hasVariants')}
              </span>
            </label>
          )}
          {productType === 'simple' && hasVariants && (
            <div className="products-add-modal__variants">
              <p className="products-add-modal__variants-title">{t('products.variantDimensions')}</p>
              {variantDims.map((dim, index) => (
                <div key={index} className="form-row" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                    <span>{t('products.dimensionName')}</span>
                    <input
                      value={dim.name}
                      onChange={(e) =>
                        setVariantDims((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                  <label className="form-field" style={{ flex: 2, marginBottom: 0 }}>
                    <span>{t('products.dimensionValues')}</span>
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
                  </label>
                </div>
              ))}
              {variantDims.length < MAX_VARIANT_DIMENSIONS && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setVariantDims((rows) => [...rows, { name: '', valuesText: '' }])
                  }
                >
                  {t('products.addDimension')}
                </button>
              )}
            </div>
          )}
          {create.error && <p className="status-fail">{(create.error as Error).message}</p>}
          <footer className="pos-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {t('products.addProduct')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
