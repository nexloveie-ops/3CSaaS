import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

export function WarehousePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const companyId = useContextStore((s) => s.companyId);
  const storeId = useContextStore((s) => s.storeId);

  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.listStores(),
    enabled: !!companyId,
  });

  const currentStore = (stores as { _id: string; name: string; warehouseEnabled?: boolean }[] | undefined)?.find(
    (s) => s._id === storeId,
  );
  const isWarehouse = !!currentStore?.warehouseEnabled;

  const warehouseStores = (stores as { _id: string; name: string; warehouseEnabled?: boolean }[] | undefined)?.filter(
    (s) => s.warehouseEnabled,
  );
  const retailStores = (
    stores as { _id: string; name: string; warehouseEnabled?: boolean }[] | undefined
  )?.filter((s) => !s.warehouseEnabled);

  const { data: scope } = useQuery({
    queryKey: ['warehouse-scope', storeId],
    queryFn: () => api.getWarehouseScope(),
    enabled: !!companyId && !!storeId && isWarehouse,
  });

  const [allowed, setAllowed] = useState<string[]>([]);

  useEffect(() => {
    if (scope?.allowedStoreIds) setAllowed(scope.allowedStoreIds);
  }, [scope?.allowedStoreIds]);
  const [warehousePick, setWarehousePick] = useState('');
  const [qty, setQty] = useState(1);

  const saveScope = useMutation({
    mutationFn: () => api.updateWarehouseScope(allowed),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse-scope'] }),
  });

  const { data: catalog } = useQuery({
    queryKey: ['warehouse-catalog', warehousePick, storeId],
    queryFn: () => api.getWarehouseCatalog(warehousePick),
    enabled: !!companyId && !!storeId && !!warehousePick && !isWarehouse,
  });

  const placeOrder = useMutation({
    mutationFn: (line: { productId: string; warehouseStoreId: string }) =>
      api.createB2bOrderAsSeller(
        { companyId: companyId!, storeId: line.warehouseStoreId },
        {
          buyerStoreId: storeId,
          lines: [{ productId: line.productId, quantity: qty }],
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['b2b-seller'] }),
  });

  const toggleAllowed = (id: string) => {
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="page-content">
      <PageHeader title={t('warehouse.title')} />
      {!companyId || !storeId ? (
        <p className="status-fail">{t('warehouse.setContext')}</p>
      ) : isWarehouse ? (
        <>
          <p>{t('warehouse.managing', { name: currentStore?.name ?? '' })}</p>
          <div className="card">
            <p>{t('warehouse.allowedRetail')}</p>
            {retailStores?.map((s) => {
              const checked = allowed.includes(s._id);
              return (
                <label key={s._id} style={{ display: 'block', marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAllowed(s._id)}
                  />{' '}
                  {s.name} ({s._id.slice(-6)})
                </label>
              );
            })}
            <button type="button" style={{ marginTop: 8 }} onClick={() => saveScope.mutate()}>
              {t('warehouse.saveScope')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{t('warehouse.buyerStore', { name: currentStore?.name ?? storeId })}</p>
          <div className="card">
            <label>
              {t('warehouse.title')}
              <select
                value={warehousePick}
                onChange={(e) => setWarehousePick(e.target.value)}
                style={{ display: 'block', marginTop: 4 }}
              >
                <option value="">{t('warehouse.selectWarehouse')}</option>
                {warehouseStores?.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ marginLeft: 12 }}>
              {t('common.qty')}
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 1)}
                style={{ width: 60, marginLeft: 4 }}
              />
            </label>
          </div>
          <table style={{ width: '100%', marginTop: 12 }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Qty</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {catalog?.map((row) => (
                <tr key={row.productId}>
                  <td>{row.skuCode ?? '—'}</td>
                  <td>{row.name}</td>
                  <td>{row.quantity}</td>
                  <td>
                    €{row.pricePreTax.toFixed(2)} ({row.priceLabel})
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        placeOrder.mutate({
                          productId: row.productId,
                          warehouseStoreId: warehousePick,
                        })
                      }
                      disabled={placeOrder.isPending}
                    >
                      {t('warehouse.b2bOrder')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!warehousePick && <p>{t('warehouse.selectWarehouseHint')}</p>}
          {warehousePick && catalog?.length === 0 && <p>{t('warehouse.noCatalog')}</p>}
        </>
      )}
    </div>
  );
}
