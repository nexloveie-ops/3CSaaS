import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  B2bCustomerModal,
  type B2bCustomerFormValues,
} from '../components/b2b/B2bCustomerModal';
import { B2bCustomerOrdersPanel } from '../components/b2b/B2bCustomerOrdersPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

export type B2bCustomerRow = {
  _id: string;
  name: string;
  registrationNumber: string;
  address: string;
  email: string;
  phone: string;
  vatNumber?: string;
};

export function B2bCustomersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const companyId = useContextStore((s) => s.companyId);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<B2bCustomerRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['b2b-customers', companyId, debouncedSearch],
    queryFn: () =>
      api.listB2bCustomers(debouncedSearch || undefined) as Promise<B2bCustomerRow[]>,
    enabled: !!companyId,
  });

  const create = useMutation({
    mutationFn: (values: B2bCustomerFormValues) =>
      api.createB2bCustomer({
        name: values.name,
        registrationNumber: values.registrationNumber,
        address: values.address,
        email: values.email,
        phone: values.phone,
        vatNumber: values.vatNumber || undefined,
      }),
    onSuccess: () => {
      setFormError(null);
      setModalMode(null);
      qc.invalidateQueries({ queryKey: ['b2b-customers'] });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const update = useMutation({
    mutationFn: (values: B2bCustomerFormValues) =>
      api.updateB2bCustomer(editing!._id, {
        name: values.name,
        registrationNumber: values.registrationNumber,
        address: values.address,
        email: values.email,
        phone: values.phone,
        vatNumber: values.vatNumber,
      }),
    onSuccess: () => {
      setFormError(null);
      setModalMode(null);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['b2b-customers'] });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteB2bCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['b2b-customers'] }),
  });

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setModalMode('create');
  }

  function openEdit(row: B2bCustomerRow) {
    setEditing(row);
    setFormError(null);
    setModalMode('edit');
  }

  function onDelete(row: B2bCustomerRow) {
    if (!window.confirm(t('b2bCustomers.confirmDelete', { name: row.name }))) return;
    remove.mutate(row._id);
  }

  function onSubmit(values: B2bCustomerFormValues) {
    setFormError(null);
    if (modalMode === 'create') create.mutate(values);
    else if (modalMode === 'edit' && editing) update.mutate(values);
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  const list = customers ?? [];
  const pending = create.isPending || update.isPending;

  return (
    <div className="page-content">
      <PageHeader
        title={t('b2bCustomers.title')}
        description={t('b2bCustomers.subtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={!companyId}>
            {t('b2bCustomers.add')}
          </button>
        }
      />

      <section className="section-card">
        <div className="form-field" style={{ marginBottom: '1rem' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('b2bCustomers.searchPlaceholder')}
            disabled={!companyId}
          />
        </div>

        {isLoading ? (
          <p className="empty-state">{t('common.checking')}</p>
        ) : list.length === 0 ? (
          <p className="empty-state">
            {debouncedSearch ? t('b2bCustomers.searchNoResults') : t('b2bCustomers.empty')}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '2.5rem' }} aria-label={t('b2bCustomers.expand')} />
                  <th>{t('b2bCustomers.colName')}</th>
                  <th>{t('b2bCustomers.colRegistration')}</th>
                  <th>{t('b2bCustomers.colPhone')}</th>
                  <th>{t('b2bCustomers.colEmail')}</th>
                  <th>{t('b2bCustomers.colVat')}</th>
                  <th>{t('b2bCustomers.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const open = expandedId === row._id;
                  return (
                    <Fragment key={row._id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-expanded={open}
                            aria-label={open ? t('b2bCustomers.collapse') : t('b2bCustomers.expand')}
                            onClick={() => toggleExpand(row._id)}
                          >
                            {open ? '▾' : '▸'}
                          </button>
                        </td>
                        <td>
                          <div>{row.name}</div>
                          <div className="code" style={{ marginTop: '0.25rem' }}>
                            {row.address}
                          </div>
                        </td>
                        <td>{row.registrationNumber}</td>
                        <td>{row.phone}</td>
                        <td>{row.email}</td>
                        <td>{row.vatNumber || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEdit(row)}
                            >
                              {t('b2bCustomers.edit')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => onDelete(row)}
                              disabled={remove.isPending}
                            >
                              {t('b2bCustomers.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="b2b-customer-orders-row">
                          <td colSpan={7} style={{ background: 'var(--surface-muted, #f8fafc)', padding: '0.75rem 1rem' }}>
                            <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
                              {t('b2bCustomers.ordersTitle')}
                            </p>
                            <B2bCustomerOrdersPanel customerId={row._id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalMode && (
        <B2bCustomerModal
          mode={modalMode}
          initial={
            editing
              ? {
                  name: editing.name,
                  registrationNumber: editing.registrationNumber,
                  address: editing.address,
                  email: editing.email,
                  phone: editing.phone,
                  vatNumber: editing.vatNumber ?? '',
                }
              : undefined
          }
          pending={pending}
          error={formError}
          onSubmit={onSubmit}
          onClose={() => {
            if (pending) return;
            setModalMode(null);
            setEditing(null);
            setFormError(null);
          }}
        />
      )}
    </div>
  );
}
