import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type B2bCustomerFormValues = {
  name: string;
  registrationNumber: string;
  address: string;
  email: string;
  phone: string;
  vatNumber: string;
};

type Props = {
  mode: 'create' | 'edit';
  initial?: B2bCustomerFormValues;
  pending?: boolean;
  error?: string | null;
  onSubmit: (values: B2bCustomerFormValues) => void;
  onClose: () => void;
};

const empty: B2bCustomerFormValues = {
  name: '',
  registrationNumber: '',
  address: '',
  email: '',
  phone: '',
  vatNumber: '',
};

export function B2bCustomerModal({
  mode,
  initial,
  pending,
  error,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<B2bCustomerFormValues>(initial ?? empty);

  useEffect(() => {
    setValues(initial ?? empty);
  }, [initial]);

  function setField<K extends keyof B2bCustomerFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !values.name.trim() ||
      !values.registrationNumber.trim() ||
      !values.address.trim() ||
      !values.email.trim() ||
      !values.phone.trim()
    ) {
      return;
    }
    onSubmit({
      name: values.name.trim(),
      registrationNumber: values.registrationNumber.trim(),
      address: values.address.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      vatNumber: values.vatNumber.trim(),
    });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal"
        role="dialog"
        aria-labelledby="b2b-customer-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="b2b-customer-modal-title">
            {mode === 'create' ? t('b2bCustomers.modalCreateTitle') : t('b2bCustomers.modalEditTitle')}
          </h3>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label={t('b2bCustomers.cancel')}
          >
            ×
          </button>
        </header>

        <form className="pos-modal-body" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="b2b-cust-name">{t('b2bCustomers.name')}</label>
            <input
              id="b2b-cust-name"
              value={values.name}
              onChange={(e) => setField('name', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-field">
            <label htmlFor="b2b-cust-reg">{t('b2bCustomers.registrationNumber')}</label>
            <input
              id="b2b-cust-reg"
              value={values.registrationNumber}
              onChange={(e) => setField('registrationNumber', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="b2b-cust-address">{t('b2bCustomers.address')}</label>
            <input
              id="b2b-cust-address"
              value={values.address}
              onChange={(e) => setField('address', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="b2b-cust-email">{t('b2bCustomers.email')}</label>
            <input
              id="b2b-cust-email"
              type="email"
              value={values.email}
              onChange={(e) => setField('email', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="b2b-cust-phone">{t('b2bCustomers.phone')}</label>
            <input
              id="b2b-cust-phone"
              value={values.phone}
              onChange={(e) => setField('phone', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="b2b-cust-vat">{t('b2bCustomers.vatNumber')}</label>
            <input
              id="b2b-cust-vat"
              value={values.vatNumber}
              onChange={(e) => setField('vatNumber', e.target.value)}
            />
          </div>

          {error && <p className="status-fail">{error}</p>}

          <div className="pos-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
              {t('b2bCustomers.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {t('b2bCustomers.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
