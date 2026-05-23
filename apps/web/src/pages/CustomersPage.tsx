import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

export function CustomersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.listCustomers(),
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const create = useMutation({
    mutationFn: () => api.createCustomer({ name, phone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setName('');
      setPhone('');
    },
  });

  return (
    <div className="page-content">
      <PageHeader title={t('customers.title')} description={t('customers.subtitle')} />
      <form
        className="section-card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button type="submit">Add customer</button>
      </form>
      <ul>
        {(customers as { _id: string; name?: string; phone?: string }[] | undefined)?.map((c) => (
          <li key={c._id}>
            {c.name ?? '—'} {c.phone ? `· ${c.phone}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
