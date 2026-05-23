import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';
import { useContextStore } from '../stores/context';

export function ChainPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const storeId = useContextStore((s) => s.storeId);

  const { data: chains } = useQuery({
    queryKey: ['chains'],
    queryFn: () => api.listChains(),
  });

  const { data: memberStores } = useQuery({
    queryKey: ['chain-member-stores'],
    queryFn: () => api.listChainMemberStores(),
  });

  const [chainName, setChainName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectedChain, setSelectedChain] = useState('');
  const [editChainName, setEditChainName] = useState('');
  const [editMembers, setEditMembers] = useState<Set<string>>(new Set());
  const [ruleStore, setRuleStore] = useState('');
  const [ruleMode, setRuleMode] = useState<'percent' | 'quantity'>('percent');
  const [ruleValue, setRuleValue] = useState(50);

  useEffect(() => {
    if (storeId) {
      setSelectedMembers((prev) => new Set([...prev, storeId]));
    }
  }, [storeId]);

  useEffect(() => {
    const chain = chains?.find((c) => c._id === selectedChain);
    setEditChainName(chain?.name ?? '');
    if (chain?.members?.length) {
      setEditMembers(new Set(chain.members.map((m) => m.storeId)));
    } else if (chain?.memberStoreIds?.length) {
      setEditMembers(new Set(chain.memberStoreIds.map((id) => id.toString())));
    } else {
      setEditMembers(new Set());
    }
  }, [selectedChain, chains]);

  const createChain = useMutation({
    mutationFn: () => api.createChain(chainName, [...selectedMembers]),
    onSuccess: (c: { _id: string }) => {
      setChainName('');
      setSelectedChain(c._id);
      qc.invalidateQueries({ queryKey: ['chains'] });
    },
  });

  const updateMembers = useMutation({
    mutationFn: () => api.updateChainMembers(selectedChain, [...editMembers]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chains'] });
      qc.invalidateQueries({ queryKey: ['chain-stock', selectedChain] });
    },
  });

  const renameChain = useMutation({
    mutationFn: () => api.updateChain(selectedChain, { name: editChainName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chains'] }),
  });

  const addRule = useMutation({
    mutationFn: () =>
      api.addChainShareRule(selectedChain, {
        sourceStoreId: ruleStore,
        mode: ruleMode,
        value: ruleValue,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chain-stock', selectedChain] }),
  });

  const { data: sharedStock } = useQuery({
    queryKey: ['chain-stock', selectedChain, storeId],
    queryFn: () => api.getChainSharedStock(selectedChain, storeId!),
    enabled: !!selectedChain && !!storeId,
  });

  const placeFromChain = useMutation({
    mutationFn: (line: { productId: string; sourceStoreId: string; sourceCompanyId: string }) =>
      api.createB2bOrderAsSeller(
        { companyId: line.sourceCompanyId, storeId: line.sourceStoreId },
        {
          buyerStoreId: storeId,
          lines: [{ productId: line.productId, quantity: 1 }],
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['b2b-seller'] }),
  });

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEditMember = (id: string) => {
    setEditMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeMember = (id: string) => {
    setEditMembers((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const storeName = (id: string) =>
    memberStores?.find((s) => s._id === id)?.name ?? id.slice(-6);

  const storeCompanyId = (id: string) =>
    memberStores?.find((s) => s._id === id)?.companyId?.toString() ?? '';

  return (
    <div className="page-content">
      <PageHeader title={t('chain.title')} />
      {!storeId && <p className="status-fail">{t('chain.setViewerStore')}</p>}

      <div className="card">
        <h3>{t('chain.createTitle')}</h3>
        <input
          placeholder={t('chain.chainName')}
          value={chainName}
          onChange={(e) => setChainName(e.target.value)}
        />
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{t('chain.memberHint')}</p>
        <p>
          <strong>{t('chain.pickMembers')}</strong>
        </p>
        <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 8 }}>
          {memberStores?.map((s) => (
            <label key={s._id} style={{ display: 'block', marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={selectedMembers.has(s._id)}
                onChange={() => toggleMember(s._id)}
              />{' '}
              {s.name} — {s.companyName}
              {s.warehouseEnabled ? ' [WH]' : ''}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => createChain.mutate()}
          disabled={!chainName || selectedMembers.size < 2}
        >
          {t('chain.create')}
        </button>
        {selectedMembers.size < 2 && (
          <p style={{ fontSize: 12 }}>Select at least 2 stores for a chain.</p>
        )}
      </div>

      <div className="card">
        <h3>{t('chain.yourChains')}</h3>
        <select
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value)}
          style={{ display: 'block', marginBottom: 8, width: '100%' }}
        >
          <option value="">{t('chain.selectChain')}</option>
          {(chains ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name} ({c.members?.length ?? c.memberStoreIds.length} stores)
            </option>
          ))}
        </select>
        {selectedChain && (
          <>
            <h4>{t('chain.renameChain')}</h4>
            <input
              value={editChainName}
              onChange={(e) => setEditChainName(e.target.value)}
              style={{ display: 'block', marginBottom: 8, width: '100%' }}
            />
            <button
              type="button"
              disabled={!editChainName.trim() || renameChain.isPending}
              onClick={() => renameChain.mutate()}
            >
              {t('chain.saveName')}
            </button>
            {renameChain.isSuccess && (
              <p className="status-ok" style={{ marginTop: 8 }}>
                {t('chain.nameUpdated')}
              </p>
            )}

            <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>{t('chain.editMembers')}</p>
            <div style={{ maxHeight: 160, overflow: 'auto', marginBottom: 8 }}>
              {memberStores?.map((s) => (
                <div key={s._id} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={editMembers.has(s._id)}
                      onChange={() => toggleEditMember(s._id)}
                    />{' '}
                    {s.name} — {s.companyName}
                  </label>
                  {editMembers.has(s._id) && (
                    <button
                      type="button"
                      style={{ background: '#b91c1c', fontSize: 12, padding: '2px 8px' }}
                      onClick={() => removeMember(s._id)}
                      disabled={editMembers.size <= 2}
                    >
                      {t('chain.removeMember')}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={editMembers.size < 2 || updateMembers.isPending}
              onClick={() => updateMembers.mutate()}
            >
              {t('chain.saveMembers')}
            </button>
            {updateMembers.isSuccess && (
              <p className="status-ok" style={{ marginTop: 8 }}>
                {t('chain.membersUpdated')}
              </p>
            )}
            {updateMembers.error && (
              <p className="status-fail">{(updateMembers.error as Error).message}</p>
            )}
          </>
        )}

        {selectedChain && (
          <>
            <h4>{t('chain.shareRule')}</h4>
            <select value={ruleStore} onChange={(e) => setRuleStore(e.target.value)}>
              <option value="">{t('chain.sourceStore')}</option>
              {memberStores?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.companyName})
                </option>
              ))}
            </select>
            <select
              value={ruleMode}
              onChange={(e) => setRuleMode(e.target.value as 'percent' | 'quantity')}
              style={{ marginLeft: 8 }}
            >
              <option value="percent">{t('chain.modePercent')}</option>
              <option value="quantity">{t('chain.modeQuantity')}</option>
            </select>
            <input
              type="number"
              min={0}
              value={ruleValue}
              onChange={(e) => setRuleValue(Number(e.target.value))}
              style={{ width: 70, marginLeft: 8 }}
            />
            <button
              type="button"
              style={{ marginLeft: 8 }}
              onClick={() => addRule.mutate()}
              disabled={!ruleStore}
            >
              {t('chain.addRule')}
            </button>
          </>
        )}
      </div>

      {selectedChain && storeId && (
        <>
          <h3>{t('chain.sharedStock', { name: storeName(storeId) })}</h3>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>{t('chain.from')}</th>
                <th>{t('chain.product')}</th>
                <th>{t('chain.sharedQty')}</th>
                <th>{t('chain.price')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sharedStock?.map((row, i) => (
                <tr key={`${row.productId}-${row.sourceStoreId}-${i}`}>
                  <td>{storeName(row.sourceStoreId)}</td>
                  <td>
                    {row.name} {row.skuCode ? `(${row.skuCode})` : ''}
                  </td>
                  <td>{row.sharedQuantity}</td>
                  <td>
                    €{row.pricePreTax.toFixed(2)} ({row.priceLabel})
                  </td>
                  <td>
                    {row.sourceStoreId !== storeId && (
                      <button
                        type="button"
                        onClick={() =>
                          placeFromChain.mutate({
                            productId: row.productId,
                            sourceStoreId: row.sourceStoreId,
                            sourceCompanyId: storeCompanyId(row.sourceStoreId),
                          })
                        }
                      >
                        {t('chain.b2bOrder')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sharedStock?.length === 0 && <p>{t('chain.noShared')}</p>}
        </>
      )}
    </div>
  );
}
