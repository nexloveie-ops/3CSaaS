import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  productName: string;
  onHand: number;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
};

export function AddBatchLineModal({ productName, onHand, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState('1');

  function setQty(n: number) {
    setQuantity(String(Math.max(1, n)));
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="pos-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-header">
          <h3>{t('inventory.batchAddTitle')}</h3>
          <p className="pos-modal-sub">{productName}</p>
          <button type="button" className="pos-modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pos-modal-body">
          <p className="pos-variant-selected-hint">
            {t('inventory.currentQty')}: {onHand}
          </p>
          <label className="form-field">
            {t('inventory.batchQtyLabel')}
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </label>
          <div className="receiving-qty-shortcuts">
            {[1, 5, 10, 20].map((n) => (
              <button key={n} type="button" className="btn btn-secondary btn-sm" onClick={() => setQty(n)}>
                +{n}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: '0.75rem' }}
            disabled={Number(quantity) < 1}
            onClick={() => onConfirm(Number(quantity))}
          >
            {t('inventory.addToBatch')}
          </button>
        </div>
      </div>
    </div>
  );
}
