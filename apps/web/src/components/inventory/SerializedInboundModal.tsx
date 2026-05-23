import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  productName: string;
  onConfirm: (quantity: number, serialNumbers: string[]) => void;
  onClose: () => void;
  pending?: boolean;
};

export function SerializedInboundModal({
  productName,
  onConfirm,
  onClose,
  pending,
}: Props) {
  const { t } = useTranslation();
  const [sns, setSns] = useState('');

  const serialNumbers = sns
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="pos-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-header">
          <h3>{t('inventory.serialInboundTitle')}</h3>
          <p className="pos-modal-sub">{productName}</p>
          <button type="button" className="pos-modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pos-modal-body">
          <label className="form-field">
            {t('inventory.serialPlaceholder')}
            <textarea
              rows={6}
              value={sns}
              onChange={(e) => setSns(e.target.value)}
              placeholder={t('inventory.serialPlaceholder')}
              autoFocus
            />
          </label>
          <p className="pos-variant-selected-hint">
            {t('inventory.serialCount', { count: serialNumbers.length })}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={pending || serialNumbers.length === 0}
            onClick={() => onConfirm(serialNumbers.length, serialNumbers)}
          >
            {t('inventory.confirmInbound')}
          </button>
        </div>
      </div>
    </div>
  );
}
