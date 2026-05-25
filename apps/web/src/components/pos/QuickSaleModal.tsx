import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import type { CartLine } from './PosCartPanel';

type Props = {
  onAdd: (line: CartLine) => void;
  onClose: () => void;
};

export function QuickSaleModal({ onAdd, onClose }: Props) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [catalogCategoryId, setCatalogCategoryId] = useState('');
  const [taxCategoryId, setTaxCategoryId] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.listCatalogCategories(),
  });
  const { data: taxCategories } = useQuery({
    queryKey: ['tax-categories'],
    queryFn: () => api.listTaxCategories(),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    if (!taxCategoryId) {
      setError(t('products.taxCategory'));
      return;
    }
    const unitPrice = Number(price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError(t('pos.quickSalePrice'));
      return;
    }
    const costNum = cost.trim() ? Number(cost) : undefined;
    onAdd({
      adHoc: true,
      name: description.trim(),
      qty: 1,
      price: unitPrice,
      taxCategoryId,
      catalogCategoryId: catalogCategoryId || undefined,
      costPrice: costNum,
    });
    onClose();
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--quick-sale"
        role="dialog"
        aria-labelledby="quick-sale-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="quick-sale-title">{t('pos.quickSaleTitle')}</h3>
          <p className="pos-modal-sub">{t('pos.quickSaleHint')}</p>
          <button type="button" className="pos-modal-close" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>
        <form className="pos-modal-body" onSubmit={onSubmit}>
          <label className="form-field">
            <span>{t('pos.quickSaleDescription')}</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>{t('pos.quickSaleCategory')}</span>
            <select
              value={catalogCategoryId}
              onChange={(e) => setCatalogCategoryId(e.target.value)}
            >
              <option value="">{t('products.uncategorized')}</option>
              {(categories as { _id: string; name: string }[] | undefined)?.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>{t('pos.quickSaleTax')}</span>
            <select
              value={taxCategoryId}
              onChange={(e) => setTaxCategoryId(e.target.value)}
              required
            >
              <option value="">—</option>
              {(taxCategories as { _id: string; name: string }[] | undefined)?.map((tc) => (
                <option key={tc._id} value={tc._id}>
                  {tc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>{t('pos.quickSaleCost')}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>{t('pos.quickSalePrice')}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          {error && <p className="status-fail">{error}</p>}
          <footer className="pos-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('pos.quickSaleAdd')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
