import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import {
  B2bInvoicePaymentModal,
  type B2bInvoicePaymentOrder,
} from './B2bInvoicePaymentModal';

type OrderRow = {
  _id: string;
  docNumber: string;
  businessDate?: string;
  totalIncVat: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: string;
  paidAmount: number;
  paidAt?: string;
  createdAt?: string;
};

type Props = {
  customerId: string;
};

function statusLabel(
  status: OrderRow['paymentStatus'],
  t: (key: string) => string,
): string {
  if (status === 'paid') return t('b2bCustomers.statusPaid');
  if (status === 'partial') return t('b2bCustomers.statusPartial');
  return t('b2bCustomers.statusUnpaid');
}

function methodLabel(method: string | undefined, t: (key: string) => string): string {
  switch (method) {
    case 'cash':
      return t('b2bCustomers.methodCash');
    case 'card':
      return t('b2bCustomers.methodCard');
    case 'bank_transfer':
      return t('b2bCustomers.methodBank');
    case 'other':
      return t('b2bCustomers.methodOther');
    default:
      return method || '—';
  }
}

export function B2bCustomerOrdersPanel({ customerId }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [paying, setPaying] = useState<B2bInvoicePaymentOrder | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['b2b-customer-orders', customerId],
    queryFn: () => api.listB2bCustomerOrders(customerId) as Promise<OrderRow[]>,
  });

  const pay = useMutation({
    mutationFn: (values: {
      paidAt: string;
      paymentMethod: string;
      amount: number;
    }) => api.recordB2bInvoicePayment(paying!._id, values),
    onSuccess: () => {
      setPayError(null);
      setPaying(null);
      qc.invalidateQueries({ queryKey: ['b2b-customer-orders', customerId] });
    },
    onError: (err: Error) => setPayError(err.message),
  });

  const list = orders ?? [];

  if (isLoading) {
    return <p className="empty-state" style={{ margin: '0.75rem 0' }}>{t('common.checking')}</p>;
  }

  if (list.length === 0) {
    return (
      <p className="empty-state" style={{ margin: '0.75rem 0' }}>
        {t('b2bCustomers.ordersEmpty')}
      </p>
    );
  }

  return (
    <div className="b2b-customer-orders">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('b2bCustomers.colDocNumber')}</th>
              <th>{t('b2bCustomers.colOrderDate')}</th>
              <th>{t('b2bCustomers.colTotal')}</th>
              <th>{t('b2bCustomers.colPayStatus')}</th>
              <th>{t('b2bCustomers.colPaidAmount')}</th>
              <th>{t('b2bCustomers.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const unpaid = o.paymentStatus !== 'paid';
              return (
                <tr key={o._id}>
                  <td>{o.docNumber}</td>
                  <td>{o.businessDate || (o.createdAt ? String(o.createdAt).slice(0, 10) : '—')}</td>
                  <td>€{Number(o.totalIncVat).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${unpaid ? '' : 'badge--ok'}`}>
                      {statusLabel(o.paymentStatus, t)}
                    </span>
                    {o.paymentStatus === 'paid' && o.paymentMethod && (
                      <div className="code" style={{ marginTop: '0.25rem' }}>
                        {methodLabel(o.paymentMethod, t)}
                        {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleString()}` : ''}
                      </div>
                    )}
                  </td>
                  <td>€{Number(o.paidAmount || 0).toFixed(2)}</td>
                  <td>
                    {unpaid && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setPayError(null);
                          setPaying({
                            _id: o._id,
                            docNumber: o.docNumber,
                            totalIncVat: o.totalIncVat,
                            paidAmount: o.paidAmount,
                          });
                        }}
                      >
                        {t('b2bCustomers.pay')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {paying && (
        <B2bInvoicePaymentModal
          order={paying}
          pending={pay.isPending}
          error={payError}
          onSubmit={(values) => pay.mutate(values)}
          onClose={() => {
            if (pay.isPending) return;
            setPaying(null);
            setPayError(null);
          }}
        />
      )}
    </div>
  );
}
