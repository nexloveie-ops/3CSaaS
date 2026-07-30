import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

export type B2bCustomerOption = {
  _id: string;
  name: string;
  registrationNumber: string;
  phone: string;
  email: string;
  vatNumber?: string;
};

type Props = {
  onSelect: (customer: B2bCustomerOption) => void;
  onClose: () => void;
};

export function B2bCustomerPickModal({ onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['b2b-customers-pick', debounced],
    queryFn: () =>
      api.listB2bCustomers(debounced || undefined) as Promise<B2bCustomerOption[]>,
  });

  const list = customers ?? [];

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--serial-pick"
        role="dialog"
        aria-labelledby="b2b-pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="b2b-pick-title">{t('pos.b2bPickTitle')}</h3>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </header>

        <div className="pos-modal-body">
          <p className="pos-modal-sub">{t('pos.b2bPickHint')}</p>
          <div className="form-field">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('pos.b2bPickSearch')}
              autoFocus
            />
          </div>

          {isLoading ? (
            <p className="empty-state">{t('common.checking')}</p>
          ) : list.length === 0 ? (
            <p className="empty-state">
              {debounced ? t('pos.b2bPickNoResults') : t('pos.b2bPickEmpty')}
            </p>
          ) : (
            <ul className="pos-serial-list">
              {list.map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    className="pos-serial-item pos-b2b-pick-item"
                    onClick={() => onSelect(c)}
                  >
                    <span className="pos-b2b-pick-item__main">
                      <span className="pos-serial-sn">{c.name}</span>
                      <span className="pos-product-meta">
                        {[c.registrationNumber, c.phone, c.email]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
