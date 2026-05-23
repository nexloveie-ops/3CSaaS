import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  productName: string;
  currentQty: number;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
  pending?: boolean;
};

export function SimpleInboundModal({
  productName,
  currentQty,
  onConfirm,
  onClose,
  pending,
}: Props) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState('1');

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="pos-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-header">
          <h3>{t('inventory.inboundTitle')}</h3>
          <p className="pos-modal-sub">{productName}</p>
          <button type="button" className="pos-modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pos-modal-body">
          <p className="pos-variant-selected-hint">
            {t('inventory.currentQty')}: {currentQty}
          </p>
          <label className="form-field">
            {t('inventory.addQty')}
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={pending || Number(quantity) < 1}
            onClick={() => onConfirm(Number(quantity))}
          >
            {t('inventory.confirmInbound')}
          </button>
        </div>
      </div>
    </div>
  );
}
