import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type Props = {
  onClose: () => void;
};

export function PreorderCreateModal({ onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [productName, setProductName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [formError, setFormError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createPreorder({
        customerPhone: customerPhone.trim(),
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        expectedArrivalDate: expectedArrivalDate || undefined,
        lines: [
          {
            productName: productName.trim(),
            quantity: 1,
            estimatedPriceIncVat: estimatedPrice ? Number(estimatedPrice) : undefined,
          },
        ],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preorders'] });
      onClose();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productName.trim()) return;
    if (!customerPhone.trim()) {
      setFormError(t('preorders.customerPhoneRequired'));
      return;
    }
    setFormError('');
    create.mutate();
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-create"
        role="dialog"
        aria-labelledby="preorder-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="preorder-create-title">{t('preorders.newTitle')}</h3>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </header>
        <form className="pos-modal-body preorder-create-form" onSubmit={onSubmit}>
          <label className="form-field preorder-form__full">
            <span>{t('preorders.productName')}</span>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={t('preorders.productNamePlaceholder')}
              required
              autoFocus
            />
          </label>
          <label className="form-field preorder-form__full">
            <span>{t('preorders.customerPhone')}</span>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </label>
          <div className="preorder-form__row">
            <label className="form-field">
              <span>{t('preorders.customerName')}</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </label>
            <label className="form-field">
              <span>{t('preorders.customerEmail')}</span>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </label>
          </div>
          <div className="preorder-form__row">
            <label className="form-field">
              <span>{t('preorders.expectedArrival')}</span>
              <input
                type="date"
                value={expectedArrivalDate}
                onChange={(e) => setExpectedArrivalDate(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>{t('preorders.estimatedPrice')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
              />
            </label>
          </div>
          {formError && <p className="status-fail">{formError}</p>}
          <footer className="pos-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {t('preorders.create')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
