import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceivingHistoryPanel } from '../components/inventory/ReceivingHistoryPanel';
import { ReceivingPanel } from '../components/inventory/ReceivingPanel';
import { PageHeader } from '../components/ui/PageHeader';

type Tab = 'receive' | 'history';

export function InventoryPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('receive');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  return (
    <div className="page-content inventory-page">
      <PageHeader title={t('inventory.title')} />

      <div className="inventory-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'receive'}
          className={tab === 'receive' ? 'inventory-tabs__btn inventory-tabs__btn--active' : 'inventory-tabs__btn'}
          onClick={() => setTab('receive')}
        >
          {t('inventory.tabReceive')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={tab === 'history' ? 'inventory-tabs__btn inventory-tabs__btn--active' : 'inventory-tabs__btn'}
          onClick={() => setTab('history')}
        >
          {t('inventory.tabHistory')}
        </button>
      </div>

      {successMsg && <p className="status-ok">{successMsg}</p>}
      {errorMsg && <p className="status-fail">{errorMsg}</p>}

      {tab === 'receive' ? (
        <ReceivingPanel
          onSuccess={(msg) => {
            setErrorMsg(null);
            setSuccessMsg(msg);
            window.setTimeout(() => setSuccessMsg(null), 5000);
          }}
          onError={(msg) => {
            setSuccessMsg(null);
            setErrorMsg(msg);
          }}
        />
      ) : (
        <section className="section-card">
          <ReceivingHistoryPanel />
        </section>
      )}
    </div>
  );
}
